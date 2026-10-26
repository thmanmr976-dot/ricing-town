from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
import time

from PySide6.QtCore import QCoreApplication, QMimeData, QProcess, QRectF, QSettings, Qt, QThread, QTimer, Signal
from PySide6.QtGui import QColor, QDrag, QIcon, QKeySequence, QPainter, QPixmap, QShortcut
from PySide6.QtWidgets import (QApplication, QCheckBox, QColorDialog, QComboBox,
    QDialog, QDialogButtonBox, QFormLayout, QHBoxLayout, QLabel, QListWidget,
    QListWidgetItem, QMainWindow, QMenu, QPushButton, QScrollArea,
    QSizeGrip, QSlider, QSplitter, QSystemTrayIcon, QVBoxLayout, QWidget)

from .desktop import DesktopProcesses, application_details, float_palette, focus_workspace, hypr, monitors
from .bar import paint_bar, app_tile, app_mode
from .widgets import DataSources, templates, validate_widget
from .widget_editor import paint_widget
from .widget_panel import WidgetPanel
from .island import paint_island
from .rice import DEFAULT_COLORS

STYLE = """
QWidget { background: #141721; color: #e4e8f4; font: 10pt Sans; }
QPushButton, QComboBox { background: #222735; border: 1px solid #343b4d; border-radius: 7px; padding: 7px; }
QPushButton:hover { background: #34344e; border-color:#a99bff; } QPushButton:disabled { color: #6c7086; }
QLabel { background: transparent; } QSplitter::handle { background: #303648; width: 5px; }
QScrollArea, QTabWidget::pane { border: 0; } QListWidget { border: 1px solid #343b4d; border-radius:8px; }
QLineEdit, QSpinBox, QPlainTextEdit { background:#1b202d; border:1px solid #343b4d; border-radius:5px; padding:5px; }
QTabBar::tab { background:#1b202d; padding:10px; border-bottom:2px solid #1b202d; }
QTabBar::tab:selected { color:#c0b5ff; border-bottom:2px solid #a99bff; }
QListWidget::item { padding:8px; } QListWidget::item:selected { background:#383351; }
"""


class Title(QLabel):
    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.window().windowHandle().startSystemMove()


class LauncherButton(QPushButton):
    """The whole launcher is a click target and a drag handle."""

    def __init__(self, text, parent):
        super().__init__(text, parent)
        self._press_position = None
        self._window_position = None
        self._dragging = False

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self._press_position = event.position()
            self._window_position = self.window().pos()
            self._dragging = False
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._press_position is not None and event.buttons() & Qt.MouseButton.LeftButton:
            distance = (event.position() - self._press_position).manhattanLength()
            if not self._dragging and distance >= QApplication.startDragDistance():
                self._dragging = True
                self.setDown(False)
                handle = self.window().windowHandle()
                if not handle or not handle.startSystemMove():
                    self.window().move(self._window_position + (event.position() - self._press_position).toPoint())
            elif self._dragging:
                event.accept()
                return
            if self._dragging:
                event.accept()
                return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if self._dragging:
            self._dragging = False
            self._press_position = None
            self.setDown(False)
            event.accept()
            return
        self._press_position = None
        super().mouseReleaseEvent(event)


class Launcher(QWidget):
    """A small movable handle that restores the studio without ending its controller."""
    openRequested = Signal()

    def __init__(self, settings, parent=None):
        super().__init__(parent)
        self.settings = settings
        self.setWindowTitle("Ricing Town Launcher")
        self.setWindowFlags(Qt.WindowType.Window | Qt.WindowType.FramelessWindowHint | Qt.WindowType.Tool)
        self.setFixedSize(64, 64)
        self.setToolTip("Ricing Town\nClick to reopen · drag the icon to move")
        self.open_button = LauncherButton("✦", self)
        self.open_button.setToolTip("Click to open · drag to move")
        self.open_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.open_button.setStyleSheet("""
            QPushButton { background: #1e1e2e; border: 2px solid #89b4fa;
                          border-radius: 18px; color: #cdd6f4; font-size: 24px;
                          font-weight: bold; padding: 0; }
            QPushButton:hover { background: #313244; border-color: #cba6f7; }
            QPushButton:pressed { background: #45475a; }
        """)
        self.open_button.clicked.connect(self.openRequested)

    def resizeEvent(self, event):
        self.open_button.setGeometry(self.rect().adjusted(3, 3, -3, -3))
        super().resizeEvent(event)

    def showEvent(self, event):
        super().showEvent(event)
        saved = self.settings.value("launcherPosition")
        if saved:
            self.move(saved)
        for delay in (80, 250, 600):
            QTimer.singleShot(delay, lambda: float_palette(64, 64, self.windowTitle()) if self.isVisible() else None)

    def hideEvent(self, event):
        self.settings.setValue("launcherPosition", self.pos())
        super().hideEvent(event)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.windowHandle().startSystemMove()


class Capture(QThread):
    captured = Signal(bytes)
    failed = Signal(str)

    def __init__(self, monitor, parent=None):
        super().__init__(parent); self.monitor = monitor

    def run(self):
        original = None
        temporary = f"ricing-town-capture-{os.getpid()}"
        try:
            original = json.loads(hypr("activeworkspace", "-j"))["id"]
            target_monitor = next((m for m in monitors() if m["name"] == self.monitor), None)
            if not target_monitor or not target_monitor.get("focused"):
                raise RuntimeError("Focus the selected output before refreshing its desktop")
            focus_workspace("name:" + temporary)
            time.sleep(0.45)
            result = subprocess.run(["grim", "-o", self.monitor, "-"], capture_output=True, timeout=4)
            if result.returncode: raise RuntimeError(result.stderr.decode(errors="replace"))
            self.captured.emit(result.stdout)
        except Exception as exc:
            self.failed.emit(str(exc))
        finally:
            if original is not None:
                try:
                    active = json.loads(hypr("activeworkspace", "-j"))
                    if active.get("name") == temporary: focus_workspace(original)
                except Exception: pass


class DesktopCanvas(QWidget):
    addRequested = Signal(str, int, int)
    moving = Signal()
    selected = Signal(int)
    editRequested = Signal()
    layoutChanged = Signal()

    def __init__(self, scene):
        super().__init__(); self.scene = scene; self.background = QPixmap()
        self.managed_background=QPixmap(); self.island_expanded=False; self.island_rect=QRectF()
        self.logical_width = 1366; self.logical_height = 768; self.dragging = False
        self.selected_index=-1; self.widget_drag=None; self.sources=DataSources()
        self.app_details=application_details()
        self.active_workspace=0; self.workspace_query=QProcess(self)
        self.workspace_query.finished.connect(self.workspace_updated)
        self.workspace_timeout=QTimer(self); self.workspace_timeout.setSingleShot(True)
        self.workspace_timeout.timeout.connect(self.workspace_query.kill)
        self.setMinimumSize(350, 250); self.setAcceptDrops(True)
        self.timer = QTimer(self); self.timer.timeout.connect(self.tick); self.timer.start(1000)

    def tick(self):
        self.sources.sample(); self.update()
        if self.scene.bar_enabled and self.workspace_query.state()==QProcess.ProcessState.NotRunning:
            self.workspace_query.start("hyprctl",["activeworkspace","-j"]); self.workspace_timeout.start(1500)

    def workspace_updated(self):
        self.workspace_timeout.stop()
        try: self.active_workspace=json.loads(bytes(self.workspace_query.readAllStandardOutput()))["id"]
        except (ValueError,KeyError): self.active_workspace=0
        self.update()

    def viewport(self):
        scale = min(self.width()/self.logical_width, self.height()/self.logical_height)
        return QRectF((self.width()-self.logical_width*scale)/2, (self.height()-self.logical_height*scale)/2,
                      self.logical_width*scale, self.logical_height*scale), scale

    def paintEvent(self, event):
        p = QPainter(self); p.fillRect(self.rect(), QColor("#10111a")); area, scale = self.viewport()
        if not self.managed_background.isNull():
            p.save();p.setClipRect(area)
            picture=self.managed_background.scaled(area.size().toSize(),Qt.AspectRatioMode.KeepAspectRatioByExpanding,Qt.TransformationMode.SmoothTransformation)
            p.drawPixmap(int(area.center().x()-picture.width()/2),int(area.center().y()-picture.height()/2),picture);p.restore()
        elif not self.background.isNull(): p.drawPixmap(area.toRect(), self.background)
        else:
            p.setPen(QColor("#a6adc8")); p.drawText(area, Qt.AlignmentFlag.AlignCenter,
                "Refresh desktop to capture the current background\nWindows will be hidden briefly during capture")
        p.save(); p.translate(area.topLeft()); p.scale(scale, scale)
        for i,widget in enumerate(self.scene.widgets):
            if widget["monitor"] and widget["monitor"]!=self.scene.monitor: continue
            p.save(); p.translate(widget["x"],widget["y"]); paint_widget(p,widget,self.sources.values); p.restore()
            if i==self.selected_index:
                p.setPen(QColor("#a99bff")); p.setBrush(Qt.BrushStyle.NoBrush)
                p.drawRect(QRectF(widget["x"],widget["y"],widget["width"],widget["height"]))
                p.fillRect(QRectF(widget["x"]+widget["width"]-6/scale,widget["y"]+widget["height"]-6/scale,12/scale,12/scale),QColor("#a99bff"))
        if self.scene.bar_enabled:
            try: paint_bar(p,self.scene,self.logical_width,self.logical_height,self.app_details,self.active_workspace)
            except ValueError as exc:
                p.setPen(QColor("#ffb4a9")); p.drawText(QRectF(10,10,self.logical_width-20,80),str(exc))
        self.island_rect=paint_island(p,self.scene,self.logical_width,self.sources.values,self.island_expanded)
        p.restore()

    def desktop_point(self, pos):
        area, scale = self.viewport(); p = (pos-area.topLeft())/scale
        return int(max(0, min(p.x(), self.logical_width))), int(max(0, min(p.y(), self.logical_height)))

    def mousePressEvent(self, event):
        x, y = self.desktop_point(event.position())
        self.widget_drag=None
        if event.button()!=Qt.MouseButton.LeftButton: return
        if self.island_rect.contains(x,y):self.island_expanded=not self.island_expanded;self.update();return
        if 0<=self.selected_index<len(self.scene.widgets):
            w=self.scene.widgets[self.selected_index]
            if abs(x-w["x"]-w["width"])+abs(y-w["y"]-w["height"])<28:
                self.moving.emit(); self.widget_drag=("resize",x,y,deepcopy(w)); return
        for i in reversed(range(len(self.scene.widgets))):
            w=self.scene.widgets[i]
            if w["monitor"] and w["monitor"]!=self.scene.monitor: continue
            if QRectF(w["x"],w["y"],w["width"],w["height"]).contains(x,y):
                self.selected_index=i; self.selected.emit(i); self.moving.emit(); self.widget_drag=("move",x,y,deepcopy(w)); self.update(); return
        self.selected_index=-1; self.selected.emit(-1); self.update()

    def mouseMoveEvent(self, event):
        if self.widget_drag and 0<=self.selected_index<len(self.scene.widgets):
            action,x,y,old=self.widget_drag; px,py=self.desktop_point(event.position()); w=self.scene.widgets[self.selected_index]
            if action=="move":
                w["x"]=max(0,min(max(0,self.logical_width-w["width"]),old["x"]+px-x)); w["y"]=max(0,min(max(0,self.logical_height-w["height"]),old["y"]+py-y))
            else:
                w["width"]=max(80,min(1600,old["width"]+px-x)); w["height"]=max(80,min(1600,old["height"]+py-y))
                for e,original in zip(w["elements"],old["elements"]):
                    for key,axis in (("x","width"),("y","height"),("width","width"),("height","height")):
                        e[key]=min(1600,max(0 if key in ("x","y") else 1,round(original[key]*w[axis]/old[axis])))
                    e["size"]=max(8,min(160,round(original["size"]*min(w["width"]/old["width"],w["height"]/old["height"]))))
            self.update(); return

    def mouseReleaseEvent(self, event):
        self.dragging = False
        if self.widget_drag: self.layoutChanged.emit()
        self.widget_drag=None
    def mouseDoubleClickEvent(self,event):
        if self.selected_index>=0: self.editRequested.emit()
    def dragEnterEvent(self, event):
        if event.mimeData().text().startswith("ricing-town:widget:"): event.acceptProposedAction()
    def dropEvent(self, event):
        if event.mimeData().text().startswith("ricing-town:widget:"):
            self.addRequested.emit(event.mimeData().text().split(":")[-1],*self.desktop_point(event.position())); event.acceptProposedAction()


class Palette(QMainWindow):
    def __init__(self, store):
        super().__init__(); self.store = store; self.scene = store.load(); self.saved = deepcopy(self.scene)
        if self.scene.clock_enabled:
            legacy=templates()[0]; legacy.update(x=self.scene.clock_x,y=self.scene.clock_y,monitor=self.scene.monitor)
            legacy["elements"][0].update(size=self.scene.clock_size,color=self.scene.clock_color)
            self.scene.widgets.append(legacy); self.scene.clock_enabled=False; self.saved=deepcopy(self.scene)
        self.history = []; self.capture_worker = None
        self.settings = QSettings("RicingTown", "Desktop")
        self.setWindowTitle("Ricing Town"); self.setWindowFlags(Qt.WindowType.Window | Qt.WindowType.FramelessWindowHint)
        self.setMinimumSize(760, 500)
        self.resize(int(self.settings.value("studioWidth",1100)),int(self.settings.value("studioHeight",650))); self.setStyleSheet(STYLE)
        self.desktop = DesktopProcesses(store.path.parent / "managed", self); self.desktop.status.connect(self.message)
        from .rice_runner import RiceRunner
        self.rice_runner=RiceRunner(store.path.parent/"rice-runs",self)
        # Keep this as a separate native top-level window. Parenting it to the
        # studio lets Qt hide it with the studio on some Wayland backends.
        self.launcher = Launcher(self.settings)
        self.launcher.openRequested.connect(self.show_studio)
        self.screens = monitors(); self._build(); self._tray()
        QShortcut(QKeySequence("Escape"), self, activated=self.minimize_to_launcher)
        QShortcut(QKeySequence("Ctrl+Z"), self, activated=self.undo)
        if QApplication.platformName() == "wayland": QTimer.singleShot(1000,self.capture_desktop)

    def button(self, text, callback, layout):
        b = QPushButton(text); b.clicked.connect(callback); layout.addWidget(b); return b

    def _build(self):
        root = QWidget(); box = QVBoxLayout(root); box.setContentsMargins(12, 10, 12, 8)
        top = QHBoxLayout(); top.addWidget(Title("✦  RICING TOWN    /    Desktop Studio"), 1)
        self.button("—  Hide", self.minimize_to_launcher, top); self.button("Quit", self.quit_app, top); box.addLayout(top)
        toolbar = QHBoxLayout(); self.button("＋ Add Widget", self.toggle_drawer, toolbar)
        self.button("Create",lambda:self.widget_panel.create(),toolbar)
        import_button=self.button("Import",lambda:None,toolbar);import_menu=QMenu(import_button)
        import_menu.addAction("Widget JSON…",lambda:self.widget_panel.import_file())
        import_menu.addAction("Rice from GitHub / ZIP / folder…",lambda:self.rice_panel.open())
        import_button.setMenu(import_menu)
        self.button("＋ Waybar", self.add_bar, toolbar); self.button("Refresh desktop", self.capture_desktop, toolbar)
        self.button("Undo", self.undo, toolbar); self.button("Apply / Save", self.apply, toolbar); box.addLayout(toolbar)
        self.splitter = QSplitter(); self.canvas = DesktopCanvas(self.scene)
        self.canvas.moving.connect(self.snapshot); self.splitter.addWidget(self.canvas)
        self.drawer = QScrollArea(); self.drawer.setWidgetResizable(True); content = QWidget(); side = QVBoxLayout(content)
        side.addWidget(QLabel("WAYBAR")); self.bar_enabled = QCheckBox("Show managed Waybar"); self.bar_enabled.setChecked(self.scene.bar_enabled)
        self.bar_enabled.toggled.connect(lambda v: self.change("bar_enabled", v)); side.addWidget(self.bar_enabled)
        form = QFormLayout(); self.position = QComboBox(); self.position.addItems(["top", "bottom"]); self.position.setCurrentText(self.scene.bar_position)
        self.position.currentTextChanged.connect(lambda v: self.change("bar_position", v)); form.addRow("Position", self.position)
        self.height_slider = self.slider(24,96,self.scene.bar_height,"bar_height"); form.addRow("Height", self.height_slider)
        self.width_slider = self.slider(30,100,self.scene.bar_width,"bar_width"); form.addRow("Width %", self.width_slider)
        self.bar_layer=QComboBox();self.bar_layer.addItem("Above applications","top");self.bar_layer.addItem("Behind applications","bottom")
        self.bar_layer.currentIndexChanged.connect(lambda _:self.change("bar_layer",self.bar_layer.currentData()));form.addRow("Visibility",self.bar_layer)
        self.bar_reserve=QCheckBox("Reserve screen space (above only)");self.bar_reserve.toggled.connect(lambda v:self.change("bar_reserve",v));form.addRow(self.bar_reserve)
        self.bar_radius=self.slider(0,48,self.scene.bar_radius,"bar_radius");form.addRow("Round corners",self.bar_radius)
        self.bar_margin=self.slider(0,80,self.scene.bar_margin,"bar_margin");form.addRow("Edge gap",self.bar_margin)
        side.addLayout(form); self.workspaces = QCheckBox("Workspace buttons"); self.workspaces.setChecked(self.scene.bar_workspaces)
        self.workspaces.toggled.connect(lambda v: self.change("bar_workspaces", v)); side.addWidget(self.workspaces)
        self.button("Bar color", self.choose_bar_color, side); self.button("Choose applications…", self.choose_apps, side)
        self.button("Remove Waybar now",self.remove_bar,side)
        hint=QLabel("Behind applications lets windows cover the bar. This canvas shows the desktop without application windows.");hint.setWordWrap(True);side.addWidget(hint)
        self.app_summary = QLabel(); self.app_summary.setWordWrap(True); side.addWidget(self.app_summary)
        self.monitor_box = QComboBox()
        for monitor in self.screens: self.monitor_box.addItem(monitor["name"])
        if self.scene.monitor: self.monitor_box.setCurrentText(self.scene.monitor)
        self.monitor_box.currentTextChanged.connect(self.select_monitor); side.addWidget(QLabel("Output")); side.addWidget(self.monitor_box)
        side.addStretch(); self.drawer.setWidget(content)
        self.widget_panel=WidgetPanel(self,self.drawer); self.widget_panel.setMinimumWidth(300); self.widget_panel.setMaximumWidth(390); self.splitter.addWidget(self.widget_panel)
        from .rice_ui import RicePanel, ColorsPanel, IslandPanel
        self.rice_panel=RicePanel(self);self.colors_panel=ColorsPanel(self);self.island_panel=IslandPanel(self)
        for panel,title in ((self.rice_panel,"Rice"),(self.colors_panel,"Colors"),(self.island_panel,"Island")):
            scroll=QScrollArea();scroll.setWidgetResizable(True);scroll.setWidget(panel);self.widget_panel.addTab(scroll,title)
        self.widget_panel.setUsesScrollButtons(True)
        self.canvas.addRequested.connect(self.widget_panel.add_template); self.canvas.selected.connect(self.widget_panel.selection_changed)
        self.canvas.editRequested.connect(self.widget_panel.edit_selected); self.canvas.layoutChanged.connect(self.widget_panel.refresh_layers)
        self.splitter.setSizes([760,300]); box.addWidget(self.splitter, 1)
        bottom = QHBoxLayout(); self.status = QLabel("Desktop snapshot · edits previewed until Apply"); self.status.setWordWrap(True)
        bottom.addWidget(self.status, 1); bottom.addWidget(QSizeGrip(self)); box.addLayout(bottom)
        self.setCentralWidget(root); self.select_monitor(self.monitor_box.currentText()); self.sync()

    def slider(self, low, high, value, key):
        slider = QSlider(Qt.Orientation.Horizontal); slider.setRange(low,high); slider.setValue(value)
        slider.sliderPressed.connect(self.snapshot); slider.valueChanged.connect(lambda v: self.change(key,v,False)); return slider

    def _tray(self):
        self.tray = QSystemTrayIcon(QIcon.fromTheme("preferences-desktop-theme"), self)
        menu = QMenu(self); menu.addAction("Show Ricing Town", self.show_studio); menu.addAction("Show icon", self.minimize_to_launcher); menu.addAction("Quit", self.quit_app)
        self.tray.setContextMenu(menu); self.tray.setToolTip("Ricing Town — show/hide")
        self.tray.activated.connect(lambda reason: self.minimize_to_launcher() if self.isVisible() else self.show_studio()); self.tray.show()

    def showEvent(self, event):
        super().showEvent(event); wanted = (self.width(), self.height())
        for delay in (80,250,600): QTimer.singleShot(delay, lambda: float_palette(*wanted) if self.isVisible() else None)
    def minimize_to_launcher(self):
        self._hidden_dialogs = [dialog for dialog in self.findChildren(QDialog)
                                if dialog.isWindow() and dialog.isVisible()]
        for dialog in self._hidden_dialogs:
            dialog.hide()
        self.hide()
        if not self.launcher.isVisible():
            center = self.geometry().center()
            self.launcher.move(center.x() - self.launcher.width() // 2, center.y() - self.launcher.height() // 2)
            self.launcher.show()
            self.launcher.raise_()
    def show_studio(self):
        self.launcher.hide()
        self.show()
        self.raise_()
        self.activateWindow()
        for dialog in getattr(self, "_hidden_dialogs", []):
            try:
                dialog.show()
                dialog.raise_()
            except RuntimeError:
                pass
        self._hidden_dialogs = []
    def message(self, text): self.status.setText(text)
    def snapshot(self): self.history.append(deepcopy(self.scene)); self.history = self.history[-40:]
    def change(self, key, value, record=True):
        if getattr(self.scene,key) == value: return
        if record: self.snapshot()
        setattr(self.scene,key,value); self.canvas.update(); self.message("Unsaved changes — Apply to update desktop")
    def sync(self):
        import re
        colors={**DEFAULT_COLORS,**self.scene.colors}
        substitutions={DEFAULT_COLORS[k]:colors[k] for k in DEFAULT_COLORS}
        self.setStyleSheet(re.sub("|".join(map(re.escape,substitutions)),lambda m:substitutions[m[0]],STYLE))
        wallpaper=Path(self.scene.wallpaper) if self.scene.wallpaper else None
        self.canvas.managed_background=QPixmap(str(wallpaper)) if wallpaper and wallpaper.resolve().parent==(self.store.path.parent/"assets").resolve() else QPixmap()
        for widget,value,method in [(self.bar_enabled,self.scene.bar_enabled,"setChecked"),(self.workspaces,self.scene.bar_workspaces,"setChecked"),
            (self.position,self.scene.bar_position,"setCurrentText"),
            (self.bar_layer,0 if self.scene.bar_layer=="top" else 1,"setCurrentIndex"),(self.bar_reserve,self.scene.bar_reserve,"setChecked"),
            (self.bar_radius,self.scene.bar_radius,"setValue"),(self.bar_margin,self.scene.bar_margin,"setValue"),
            (self.width_slider,self.scene.bar_width,"setValue"),(self.height_slider,self.scene.bar_height,"setValue")]:
            widget.blockSignals(True); getattr(widget,method)(value); widget.blockSignals(False)
        self.app_summary.setText("Applications: " + (", ".join(Path(x).stem for x in self.scene.bar_apps) or "none")); self.canvas.update()
        if self.canvas.selected_index>=len(self.scene.widgets): self.canvas.selected_index=-1
        self.widget_panel.refresh_layers()
        self.colors_panel.sync();self.island_panel.sync()
    def undo(self):
        if self.history: self.scene.__dict__.update(self.history.pop().__dict__); self.sync()
    def toggle_drawer(self):
        if self.widget_panel.isVisible() and self.widget_panel.currentIndex()==0: self.widget_panel.hide()
        else: self.widget_panel.show(); self.widget_panel.setCurrentIndex(0)
    def add_bar(self): self.change("bar_enabled",True); self.widget_panel.show(); self.widget_panel.setCurrentIndex(2); self.sync()
    def remove_bar(self):
        self.change("bar_enabled",False);self.desktop.stop("waybar")
        # Persist only the removal, without saving unrelated draft edits.
        saved=deepcopy(self.saved);saved.bar_enabled=False
        try:self.store.save(saved);self.saved=saved
        except OSError as exc:self.message(f"Bar stopped, but removal could not be saved: {exc}");self.sync();return
        self.sync();self.message("Managed Waybar removed · settings retained · Add Waybar + Apply restores it")
    def select_monitor(self,name):
        self.scene.monitor = name; m = next((m for m in self.screens if m["name"]==name),{})
        self.canvas.logical_width = int(m.get("width",1366)/m.get("scale",1)); self.canvas.logical_height = int(m.get("height",768)/m.get("scale",1)); self.canvas.update()
    def choose_bar_color(self):
        color=QColorDialog.getColor(QColor(self.scene.bar_color),self,"Bar color")
        if color.isValid(): self.change("bar_color",color.name())
    def choose_apps(self):
        dialog=QDialog(self); dialog.setWindowTitle("Waybar applications · Name / Icon / Both"); dialog.resize(540,480); layout=QVBoxLayout(dialog)
        layout.addWidget(QLabel("Choose applications and how each appears on the bar."))
        scroll=QScrollArea(); scroll.setWidgetResizable(True); body=QWidget(); rows=QVBoxLayout(body); choices=[]
        details=application_details(); self.canvas.app_details=details
        for app,info in sorted(details.items(),key=lambda pair:pair[1]["name"].lower()):
            row=QHBoxLayout(); check=QCheckBox(info["name"]); check.setChecked(app in self.scene.bar_apps)
            check.setIcon(QIcon(app_tile(info["name"],info["icon"],"icon")))
            mode=QComboBox(); mode.addItems(["name","icon","both"]); mode.setCurrentText(app_mode(self.scene,app))
            row.addWidget(check,1); row.addWidget(mode); rows.addLayout(row); choices.append((app,check,mode))
        rows.addStretch(); scroll.setWidget(body); layout.addWidget(scroll)
        layout.addWidget(QLabel("Bar width expands if needed to keep launchers centered."))
        buttons=QDialogButtonBox(QDialogButtonBox.StandardButton.Ok|QDialogButtonBox.StandardButton.Cancel)
        buttons.accepted.connect(dialog.accept); buttons.rejected.connect(dialog.reject); layout.addWidget(buttons)
        if dialog.exec():
            self.snapshot()
            self.change("bar_app_overrides",{app:mode.currentText() for app,check,mode in choices if check.isChecked()},False)
            self.change("bar_apps",[app for app,check,mode in choices if check.isChecked()],False); self.sync()
    def capture_desktop(self):
        if self.capture_worker and self.capture_worker.isRunning(): return
        if not self.scene.monitor: self.message("Desktop capture requires Hyprland and grim"); return
        self.message("Capturing background — briefly showing an empty workspace…")
        self.desktop.close()
        self.capture_worker=Capture(self.scene.monitor,self); self.capture_worker.captured.connect(self.set_background); self.capture_worker.failed.connect(self.message)
        self.capture_worker.finished.connect(self.restore_components); self.capture_worker.start()
    def restore_components(self):
        try: self.desktop.apply(self.saved,self.canvas.logical_width)
        except Exception as exc: self.message(f"Could not restore desktop components: {exc}")
    def set_background(self,data):
        image=QPixmap(); image.loadFromData(data); self.canvas.background=image; self.canvas.update(); self.message("Current desktop background captured · Refresh to update")
    def apply(self):
        try: self.desktop.apply(self.scene,self.canvas.logical_width); self.store.save(self.scene); self.saved=deepcopy(self.scene); self.message("Saved — starting managed desktop components…")
        except Exception as exc: self.message(f"Apply failed: {exc}")
    def hideEvent(self,event):
        self.settings.setValue("studioWidth",self.width()); self.settings.setValue("studioHeight",self.height()); super().hideEvent(event)
    def closeEvent(self,event): self.minimize_to_launcher(); event.ignore()
    def quit_app(self):
        from .rice_ui import RiceWorker
        active=[worker for worker in self.findChildren(RiceWorker) if worker.isRunning()]
        if active:
            self.message("Cancelling Rice download before exit…")
            for worker in active:worker.requestInterruption();worker.finished.connect(self.quit_app)
            return
        if self.capture_worker and self.capture_worker.isRunning(): self.message("Finishing capture before exit…"); self.capture_worker.finished.connect(self.quit_app); return
        self.launcher.hide()
        self.desktop.close()
        self.rice_runner.stop()
        QCoreApplication.exit(0)
