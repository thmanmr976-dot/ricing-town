"""Rice inspection, selective import, color workbench and island controls."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path

from PySide6.QtCore import QBuffer, QByteArray, QIODevice, QSize, Qt, QThread, QTimer, Signal, Slot
from PySide6.QtGui import QColor, QIcon, QImageReader, QPixmap, QPainter, QPen, QPolygonF
from PySide6.QtCore import QPointF, QRectF
from PySide6.QtWidgets import (QApplication, QCheckBox, QColorDialog, QComboBox, QDialog,
    QDialogButtonBox, QFileDialog, QFormLayout, QHBoxLayout, QLabel, QLineEdit,
    QMessageBox, QPlainTextEdit, QPushButton, QScrollArea, QSpinBox, QSplitter,
    QTreeWidget, QTreeWidgetItem, QVBoxLayout, QWidget, QListWidget, QListWidgetItem, QStackedWidget)

from .island import DEFAULT as ISLAND_DEFAULT, validate_island
from .rice import DEFAULT_COLORS, color, load_source, palette
from .widget_editor import thumbnail
from .widgets import MAX_WIDGETS, atomic_json, validate_widget, write_widgets
from .rice_layout import layout_file, load_offsets, save_offsets, visual_components


def button(layout,title,callback):
    widget=QPushButton(title); widget.clicked.connect(callback); layout.addWidget(widget); return widget


def confirm_run(parent,name,mode):
    message=QMessageBox(parent);message.setWindowTitle("Run downloaded code?");message.setTextFormat(Qt.TextFormat.PlainText)
    warning=("Isolated mode uses a private home and no network, host D-Bus or Hyprland control socket. It shares the Wayland display: the interface can still draw windows on your desktop. Some services will not work."
             if mode=="isolated" else "DESKTOP SESSION MODE IS NOT SANDBOXED. The original code can access your files, network and desktop services, change settings, or launch commands. A private HOME is supplied for compatibility, but it is NOT a security boundary.")
    message.setText(f"Run {name}?\n\n{warning}\n\nOnly continue if you trust this source. No installer or dependency installation is performed. Runtime changes are kept in its private workspace. Stop/Quit ends the managed process group.")
    message.setStandardButtons(QMessageBox.StandardButton.Yes|QMessageBox.StandardButton.No);message.setDefaultButton(QMessageBox.StandardButton.No)
    return message.exec()==QMessageBox.StandardButton.Yes


def show_runtime_log(owner):
    dialog=QDialog(owner);dialog.setWindowTitle("Rice runtime log");dialog.resize(800,500);layout=QVBoxLayout(dialog)
    text=QPlainTextEdit();text.setReadOnly(True);layout.addWidget(text)
    refresh=lambda:text.setPlainText(owner.rice_runner.log_tail())
    refresh();timer=QTimer(dialog);timer.timeout.connect(refresh);timer.start(1000)
    button(layout,"Close",dialog.accept);dialog.exec()


def image_from_bytes(data,preview=False):
    buffer=QBuffer(); buffer.setData(QByteArray(data)); buffer.open(QIODevice.OpenModeFlag.ReadOnly)
    reader=QImageReader(buffer); reader.setAutoTransform(True)
    size=reader.size()
    if not size.isValid() or size.width()*size.height()>40_000_000: raise ValueError("Image exceeds 40 megapixels or is invalid")
    if bytes(reader.format()).lower() not in (b"png",b"jpeg",b"jpg",b"webp"): raise ValueError("Only static PNG/JPEG/WebP images are supported")
    if preview:reader.setScaledSize(size.scaled(390,180,Qt.AspectRatioMode.KeepAspectRatio))
    image=reader.read()
    if image.isNull(): raise ValueError("Cannot decode this image")
    return image


class RiceWorker(QThread):
    progress=Signal(str); loaded=Signal(object); failed=Signal(str)
    def __init__(self,source,parent,cache_base=None): super().__init__(parent); self.source=source;self.cache_base=cache_base
    def run(self):
        try:
            source_path=self.source;cached_name=None
            if self.cache_base and self.source.startswith("https://"):
                from .rice_runner import verify_cache
                for record in self.cache_base.glob("*/package.json") if self.cache_base.exists() else ():
                    try:
                        metadata=json.loads(record.read_text())
                        if metadata.get("source")==self.source:
                            verify_cache(record.parent)
                            source_path=str(record.parent/"source")
                            cached_name=metadata.get("name")
                            self.progress.emit("Inspecting Ricing Town's verified offline copy…")
                            break
                    except (OSError,ValueError,KeyError):
                        continue
            package=load_source(source_path,self.progress.emit,self.isInterruptionRequested)
            package.source=self.source
            if cached_name:package.name=cached_name
            if self.cache_base:
                from .rice_runner import cache_package
                self.progress.emit("Saving the original interface in Ricing Town…")
                cache_package(package,self.cache_base)
            self.loaded.emit(package)
        except Exception as exc: self.failed.emit(str(exc))


def import_selected(owner,package,components,keep_runtime=False):
    """Validate the complete selection before changing the scene; do not run any code."""
    if not components and not keep_runtime:raise ValueError("Select an item or keep the original interface")
    scene=deepcopy(owner.scene); widgets=[]; palettes=[]; wallpaper=None
    if any(c.status not in ("supported","adapted") for c in components): raise ValueError("Review-only components cannot be applied")
    images=[c for c in components if c.kind in ("image","wallpaper")]
    if len(images)>1: raise ValueError("Choose one wallpaper at a time")
    if images: wallpaper=image_from_bytes(images[0].payload)
    for c in components:
        if c.kind=="widget":
            w=validate_widget(c.payload,True); w["monitor"]=scene.monitor
            w["x"]=min(w["x"],max(0,owner.canvas.logical_width-w["width"]))
            w["y"]=min(w["y"],max(0,owner.canvas.logical_height-w["height"]))
            widgets.append(w)
        elif c.kind=="palette": palettes.append((c.name,palette(c.payload)))
        elif c.kind=="island": scene.island=validate_island({**c.payload,"enabled":True})
        elif c.kind=="waybar":
            for key,value in c.payload.items(): setattr(scene,key,value)
    if len(scene.widgets)+len(widgets)>MAX_WIDGETS: raise ValueError("Selection exceeds 40 desktop widgets")
    scene.widgets.extend(widgets)
    base=owner.store.path.parent; library=base/"rice-library"/package.digest
    if keep_runtime:
        from .rice_runner import cache_package
        cache_package(package,base/"rice-packages")
    report={"name":package.name,"source":package.source,"sha256":package.digest,"files":package.files,
            "warnings":package.warnings,"licenses":package.licenses,
            "selected":[{"name":c.name,"kind":c.kind,"source":c.source,"status":c.status,"detail":c.detail} for c in components],
            "inventory":[{"name":c.name,"kind":c.kind,"source":c.source,"status":c.status,"dependencies":c.dependencies} for c in package.components]}
    if wallpaper is not None:
        assets=base/"assets"; assets.mkdir(parents=True,exist_ok=True,mode=0o700)
        asset=assets/(hashlib.sha256(images[0].payload).hexdigest()+".png")
        if not wallpaper.save(str(asset),"PNG"): raise OSError("Cannot save wallpaper")
        scene.wallpaper=str(asset.resolve())
    for name,colors in palettes:
        key=hashlib.sha256((package.digest+name+json.dumps(colors,sort_keys=True)).encode()).hexdigest()
        atomic_json(base/"palettes"/(key+".json"),{"name":name,"colors":colors,"source":package.source})
    for w in widgets: write_widgets(owner.widget_panel.library_dir/(w["id"]+".json"),[w])
    atomic_json(library/"provenance.json",report)
    owner.snapshot(); owner.scene.__dict__.update(scene.__dict__)
    owner.widget_panel.catalog.extend(deepcopy(widgets)); owner.widget_panel.refresh_catalog()
    owner.sync(); owner.colors_panel.reload_palettes(); owner.rice_panel.refresh_library();owner.rice_panel.refresh_runtimes()
    owner.message(f"Imported {len(components)} components · original interface {'saved for Run' if keep_runtime else 'not saved'} · Apply to use draft on desktop")


class RiceBrowser(QDialog):
    def __init__(self,owner,source=""):
        super().__init__(owner); self.owner=owner; self.package=None; self.worker=None; self.closing=False; self.cache_base=None
        self.setWindowTitle("Rice Explorer · inspect, mix and import"); self.resize(1040,690)
        layout=QVBoxLayout(self); line=QHBoxLayout(); self.source=QLineEdit(source)
        self.source.setPlaceholderText("https://github.com/owner/repository or local folder / ZIP")
        line.addWidget(self.source,1); self.inspect_button=button(line,"Inspect",self.inspect)
        button(line,"Folder",self.folder); button(line,"ZIP",self.archive); layout.addLayout(line)
        self.status=QLabel("Read-only analysis. Imported scripts, installers and QML are never executed."); self.status.setWordWrap(True);layout.addWidget(self.status)
        self.status.setTextFormat(Qt.TextFormat.PlainText)
        self.status.setText("Browse features, widgets, palettes and wallpapers. Import data or explicitly launch an original interface.")
        self.compatibility=QLabel();self.compatibility.setWordWrap(True)
        self.compatibility.setTextFormat(Qt.TextFormat.PlainText);layout.addWidget(self.compatibility)
        categories=QHBoxLayout();self.category=QComboBox()
        for title,key in (("All features","all"),("Widgets & capabilities","widgets"),("Wallpapers","wallpaper"),("Colors","palette"),("Original interfaces","runtime"),("Other images","image")):self.category.addItem(title,key)
        self.category.currentIndexChanged.connect(lambda _:self.filter(self.search.text()));categories.addWidget(self.category)
        self.advanced=QCheckBox("Technical files / diagnostics");self.advanced.toggled.connect(self.toggle_advanced);categories.addWidget(self.advanced);layout.addLayout(categories)
        filter_row=QHBoxLayout(); self.search=QLineEdit();self.search.setPlaceholderText("Filter components or source paths…")
        self.search.textChanged.connect(self.filter);filter_row.addWidget(self.search)
        button(filter_row,"Select palettes",lambda:self.select_kind("palette"))
        button(filter_row,"Select widgets",lambda:self.select_kind("widget"));button(filter_row,"Clear",self.clear_selection);layout.addLayout(filter_row)
        split=QSplitter();self.views=QStackedWidget();self.gallery=QListWidget()
        self.gallery.setViewMode(QListWidget.ViewMode.IconMode);self.gallery.setResizeMode(QListWidget.ResizeMode.Adjust)
        self.gallery.setMovement(QListWidget.Movement.Static);self.gallery.setIconSize(QSize(184,100));self.gallery.setGridSize(QSize(216,168));self.gallery.setWordWrap(True);self.gallery.setSpacing(8)
        self.gallery.currentItemChanged.connect(lambda item,old:self.tree.setCurrentItem(self.tree.topLevelItem(item.data(Qt.ItemDataRole.UserRole))) if item else None)
        self.gallery.itemChanged.connect(self.gallery_checked);self.views.addWidget(self.gallery)
        self.gallery.itemDoubleClicked.connect(self.activate_card)
        self.tree=QTreeWidget();self.tree.setHeaderLabels(["Component","Type","Support"])
        self.tree.setColumnWidth(0,245);self.tree.setColumnWidth(1,95);self.tree.currentItemChanged.connect(self.preview);self.tree.itemChanged.connect(self.tree_checked)
        self.views.addWidget(self.tree);split.addWidget(self.views)
        pane=QWidget();pv=QVBoxLayout(pane);self.picture=QLabel("Select a component to inspect it");self.picture.setAlignment(Qt.AlignmentFlag.AlignCenter);self.picture.setMinimumHeight(150);pv.addWidget(self.picture)
        self.details=QPlainTextEdit();self.details.setReadOnly(True);pv.addWidget(self.details,1);split.addWidget(pane);split.setSizes([530,450]);layout.addWidget(split,1)
        runtime_row=QHBoxLayout();self.runtime_mode=QComboBox();self.runtime_mode.addItem("Isolated preview","isolated");self.runtime_mode.addItem("Desktop session (trusted code)","session");runtime_row.addWidget(self.runtime_mode)
        self.run_button=button(runtime_row,"Run original interface…",self.run_selected);self.run_button.setEnabled(False)
        button(runtime_row,"Edit Rice layout…",lambda:owner.rice_panel.edit_layout())
        button(runtime_row,"Stop running Rice",owner.rice_runner.stop);button(runtime_row,"Runtime log",lambda:show_runtime_log(owner));layout.addLayout(runtime_row)
        self.keep_original=QCheckBox("Keep original interface for offline Run");self.keep_original.setEnabled(False);layout.addWidget(self.keep_original)
        self.buttons=QDialogButtonBox(QDialogButtonBox.StandardButton.Ok|QDialogButtonBox.StandardButton.Cancel)
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setText("Import selected into draft")
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setEnabled(False)
        self.buttons.accepted.connect(self.commit);self.buttons.rejected.connect(self.reject);layout.addWidget(self.buttons)
    def showEvent(self,event):
        super().showEvent(event)
        from .desktop import float_palette
        wanted=(self.width(),self.height())
        for delay in (80,250,600):
            QTimer.singleShot(delay,lambda:float_palette(*wanted,self.windowTitle()) if self.isVisible() else None)
    def folder(self):
        path=QFileDialog.getExistingDirectory(self,"Inspect Rice folder")
        if path:self.source.setText(path);self.inspect()
    def archive(self):
        path,_=QFileDialog.getOpenFileName(self,"Inspect Rice archive","","ZIP archives (*.zip)")
        if path:self.source.setText(path);self.inspect()
    def inspect(self):
        if self.worker and self.worker.isRunning(): return
        source=self.source.text().strip()
        if not source:return
        self.package=None;self.tree.clear();self.gallery.clear();self.inspect_button.setEnabled(False);self.run_button.setEnabled(False)
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setEnabled(False)
        self.worker=RiceWorker(source,self,self.cache_base);self.worker.progress.connect(self.status.setText)
        self.worker.loaded.connect(self.loaded);self.worker.failed.connect(self.status.setText);self.worker.finished.connect(self.finished_loading)
        self.worker.start()
    def finished_loading(self):
        self.inspect_button.setEnabled(True)
        if self.closing: super().reject()
    def loaded(self,package):
        if self.closing:return
        self.package=package
        self.tree.clear();self.gallery.clear();self.cards={}
        for index,c in enumerate(package.components):
            item=QTreeWidgetItem([c.name,c.kind,c.status]);item.setData(0,Qt.ItemDataRole.UserRole,index)
            if c.status in ("supported","adapted"): item.setCheckState(0,Qt.CheckState.Unchecked)
            else:
                item.setForeground(0,QColor("#9399aa"));item.setFlags(item.flags() & ~Qt.ItemFlag.ItemIsUserCheckable)
            self.tree.addTopLevelItem(item)
            if c.kind not in ("quickshell","external"):
                badge={"supported":"Ready to import","adapted":"Adapted version","run":"Runs with original interface"}.get(c.status,c.status)
                name=Path(c.name).stem.replace("_"," ").replace("-"," ").title() if c.kind in ("wallpaper","image") else "Color palette" if c.kind=="palette" and "." in c.name else c.name
                card=QListWidgetItem(self.card_icon(c),name+"\n"+badge);card.setData(Qt.ItemDataRole.UserRole,index);card.setSizeHint(QSize(208,160))
                card.setToolTip(c.detail)
                if c.status in ("supported","adapted"):card.setCheckState(Qt.CheckState.Unchecked)
                else:card.setFlags(card.flags() & ~Qt.ItemFlag.ItemIsUserCheckable)
                self.gallery.addItem(card);self.cards[index]=card
        supported=sum(c.status=="supported" for c in package.components); adapted=sum(c.status=="adapted" for c in package.components)
        features=sum(c.kind=="feature" for c in package.components);runtimes=sum(c.kind=="runtime" for c in package.components)
        self.status.setText(f"{package.name} · {supported} importable items · {features} detected capabilities · {runtimes} runnable interfaces · {adapted} alternatives · {len(package.warnings)} warnings")
        self.compatibility.setText("\n".join(w for w in package.warnings if w.startswith("Compatibility:")))
        self.package_info="Source: "+package.source+"\nSHA-256: "+package.digest+"\n\n"+"\n".join(package.warnings)+"\n\nLicenses:\n"+"\n\n".join(package.licenses)
        self.details.setPlainText("Select a card to preview it. Check widgets, colors or a wallpaper to import.\n\nOriginal interface cards can be launched with Run. Connected capabilities run as part of that interface, not as separate converted widgets. Icons identify capabilities; they are not screenshots of their original design.\n\nTechnical source details are available in the diagnostics view.")
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setEnabled(True);self.filter(self.search.text())
        self.run_button.setEnabled(any(c.kind=="runtime" for c in package.components))
        self.keep_original.setEnabled(bool(runtimes));self.keep_original.setChecked(bool(runtimes))
    def toggle_advanced(self,enabled):
        self.views.setCurrentIndex(1 if enabled else 0)
        self.filter(self.search.text())
        if self.tree.currentItem():self.preview(self.tree.currentItem())
        elif enabled and self.package:self.details.setPlainText(self.package_info)
    def activate_card(self,item):
        c=self.package.components[item.data(Qt.ItemDataRole.UserRole)]
        if c.status=="run":self.run_selected()
        else:item.setCheckState(Qt.CheckState.Unchecked if item.checkState()==Qt.CheckState.Checked else Qt.CheckState.Checked)
    def gallery_checked(self,item):
        node=self.tree.topLevelItem(item.data(Qt.ItemDataRole.UserRole))
        if node:node.setCheckState(0,item.checkState())
    def tree_checked(self,item,column):
        card=getattr(self,"cards",{}).get(item.data(0,Qt.ItemDataRole.UserRole))
        if card:
            self.gallery.blockSignals(True);card.setCheckState(item.checkState(0));self.gallery.blockSignals(False)
    def card_icon(self,c):
        try:
            if c.kind in ("wallpaper","image"):return QIcon(QPixmap.fromImage(image_from_bytes(c.payload,True)))
            if c.kind=="widget":return QIcon(thumbnail(c.payload,self.owner.canvas.sources.values,184,100))
        except ValueError:pass
        pix=QPixmap(184,100);pix.fill(QColor("#202534"));p=QPainter(pix)
        if c.kind=="palette":
            values=list(c.payload.values())[:8]
            for i,v in enumerate(values):p.fillRect(i*184//len(values),0,184//len(values)+1,100,QColor(v))
        else:
            theme=c.payload.get("icon","") if isinstance(c.payload,dict) else ""
            icon=QIcon.fromTheme(theme or {"runtime":"preferences-desktop","island":"view-pim-summary","waybar":"preferences-desktop-display"}.get(c.kind,"applications-utilities"))
            if not icon.isNull():icon.paint(p,64,18,56,56)
            else:
                p.setRenderHint(QPainter.RenderHint.Antialiasing);p.setPen(QPen(QColor("#a99bff"),3));p.setBrush(Qt.BrushStyle.NoBrush)
                if c.name=="Clock":
                    p.drawEllipse(QRectF(67,22,50,50));p.drawLine(92,47,92,30);p.drawLine(92,47,105,54)
                elif c.name in ("Calendar","Tasks","Notes"):
                    p.drawRoundedRect(QRectF(64,22,56,56),6,6);p.drawLine(64,38,120,38)
                    for y in (49,62):
                        for x in (76,92,108):p.drawPoint(x,y)
                elif c.name in ("Media player","App launcher") or c.kind=="runtime":
                    p.setBrush(QColor("#a99bff"));p.drawPolygon(QPolygonF([QPointF(78,25),QPointF(78,75),QPointF(118,50)]))
                elif c.name=="Battery":
                    p.drawRoundedRect(QRectF(62,32,60,34),4,4);p.fillRect(68,38,34,22,QColor("#a99bff"));p.drawLine(127,42,127,56)
                else:
                    font=p.font();font.setPixelSize(36);p.setFont(font);p.drawText(pix.rect(),Qt.AlignmentFlag.AlignCenter,{"island":"●","waybar":"━"}.get(c.kind,c.name[:2].upper()))
        p.end();return QIcon(pix)
    def filter(self,text):
        if not self.package:return
        category=self.category.currentData()
        for i,c in enumerate(self.package.components):
            match=text.casefold() in (c.name+" "+c.kind+(" "+c.source if self.advanced.isChecked() else "")).casefold()
            visible=match and (category=="all" or c.kind==category or category=="widgets" and c.kind in ("widget","feature","island","waybar"))
            self.tree.topLevelItem(i).setHidden(not visible)
            if i in self.cards:self.cards[i].setHidden(not visible or category=="all" and c.kind=="image")
    def clear_selection(self):
        for i in range(self.tree.topLevelItemCount()):
            item=self.tree.topLevelItem(i)
            if item.flags() & Qt.ItemFlag.ItemIsUserCheckable: item.setCheckState(0,Qt.CheckState.Unchecked)
    def select_kind(self,kind):
        if not self.package:return
        for i,c in enumerate(self.package.components):
            if c.kind==kind and c.status=="supported" and not self.tree.topLevelItem(i).isHidden():self.tree.topLevelItem(i).setCheckState(0,Qt.CheckState.Checked)
    def preview(self,item,previous=None):
        if not item or not self.package:return
        c=self.package.components[item.data(0,Qt.ItemDataRole.UserRole)];self.picture.clear()
        text=f"{c.name}\n\n{c.detail}"
        if self.advanced.isChecked():text+=f"\n\nSource: {c.source}\nSupport: {c.status}\nDependencies: "+(", ".join(c.dependencies) or "none declared")
        try:
            if c.kind in ("wallpaper","image"):
                pix=QPixmap.fromImage(image_from_bytes(c.payload,True));self.picture.setPixmap(pix)
            elif c.kind=="widget":self.picture.setPixmap(thumbnail(c.payload,self.owner.canvas.sources.values,390,180))
            elif c.kind=="palette":
                from PySide6.QtGui import QPainter
                pix=QPixmap(390,100);pix.fill(QColor("#141721"));p=QPainter(pix)
                for i,value in enumerate(list(c.payload.values())[:20]):p.fillRect((i%10)*39,(i//10)*50,39,50,QColor(value))
                p.end();self.picture.setPixmap(pix);text+="\n\n"+json.dumps(c.payload,indent=2)
            else:self.picture.setPixmap(self.card_icon(c).pixmap(184,100))
        except ValueError as exc:self.picture.setText(str(exc))
        if self.advanced.isChecked() and isinstance(c.payload,str):text+="\n\nSource excerpt (not executed):\n"+c.payload
        self.details.setPlainText(text)
    def run_selected(self):
        if not self.package:return
        runtimes=[c for c in self.package.components if c.kind=="runtime"]
        if not runtimes:return
        current=self.tree.currentItem();selected=self.package.components[current.data(0,Qt.ItemDataRole.UserRole)] if current else None
        preferred=selected.payload.get("entry") if selected and isinstance(selected.payload,dict) else None
        choices=[c for c in runtimes if c.source==preferred] or runtimes
        chosen=choices[0]
        if len(choices)>1:
            from PySide6.QtWidgets import QInputDialog
            labels=[f"{i+1}. {c.name} ({c.payload['engine']})" for i,c in enumerate(choices)]
            label,ok=QInputDialog.getItem(self,"Run interface","Choose an original interface",labels,0,False)
            if not ok:return
            chosen=choices[labels.index(label)]
        if not confirm_run(self,self.package.name,self.runtime_mode.currentData()):return
        try:
            from .rice_runner import cache_package
            cache=cache_package(self.package,self.owner.store.path.parent/"rice-packages")
            self.owner.rice_runner.start(cache,chosen.payload,self.runtime_mode.currentData());self.owner.rice_panel.refresh_runtimes()
            self.status.setText("Starting original interface · use Stop or Runtime log below")
        except (OSError,ValueError,RuntimeError) as exc:QMessageBox.warning(self,"Runtime could not start",str(exc))
    def commit(self):
        if not self.package:return
        selected=[c for i,c in enumerate(self.package.components) if self.tree.topLevelItem(i).checkState(0)==Qt.CheckState.Checked]
        if not selected and not self.keep_original.isChecked():self.status.setText("Select an item or keep the original interface.");return
        try:import_selected(self.owner,self.package,selected,self.keep_original.isChecked())
        except (ValueError,OSError) as exc:QMessageBox.warning(self,"Import not applied",str(exc));return
        self.accept()
    def reject(self):
        if self.worker and self.worker.isRunning():
            self.closing=True;self.worker.requestInterruption();self.status.setText("Cancelling import…");return
        super().reject()
    def closeEvent(self,event):
        if self.worker and self.worker.isRunning():self.reject();event.ignore()
        else:super().closeEvent(event)


class RicePanel(QWidget):
    def __init__(self,owner):
        super().__init__();self.owner=owner;box=QVBoxLayout(self)
        label=QLabel("RICE EXPLORER\nMix components from GitHub, ZIP archives or local dotfiles.");label.setWordWrap(True);box.addWidget(label)
        button(box,"Import / inspect Rice…",self.open)
        self.library=QComboBox();box.addWidget(self.library);button(box,"Inspect saved source",self.reopen)
        box.addWidget(QLabel("SAVED ORIGINAL INTERFACES"));self.runtimes=QComboBox();box.addWidget(self.runtimes)
        self.mode=QComboBox();self.mode.addItem("Isolated preview","isolated");self.mode.addItem("Desktop session (trusted)","session");box.addWidget(self.mode)
        button(box,"Run saved interface…",self.run_saved);button(box,"Edit Rice components…",self.edit_layout)
        button(box,"Browse cached components",self.browse_cached)
        button(box,"Stop running Rice",owner.rice_runner.stop);button(box,"Open runtime log",lambda:show_runtime_log(owner))
        self.runtime_status=QLabel("No original interface running");self.runtime_status.setWordWrap(True);self.runtime_status.setTextFormat(Qt.TextFormat.PlainText);box.addWidget(self.runtime_status)
        owner.rice_runner.changed.connect(self.runtime_status.setText)
        hint=QLabel("Original Quickshell and Waybar interfaces can run after confirmation. Isolated mode may lack desktop services. Independent extraction of connected shell features is not guaranteed. Installers never run automatically.")
        hint.setWordWrap(True);box.addWidget(hint);box.addStretch();self.refresh_library();self.refresh_runtimes()
    def open(self,checked=False,source=""):
        dialog=RiceBrowser(self.owner,source or "https://github.com/andreumassanet/impasto");dialog.exec()
    def run_online(self,source):
        """App command: inspect and cache a GitHub Rice, then launch it in isolation."""
        if getattr(self,"online_browser",None) and self.online_browser.worker and self.online_browser.worker.isRunning():
            self.online_browser.status.setText("A Rice package is already being inspected")
            self.online_browser.show()
            return
        browser=RiceBrowser(self.owner,source)
        browser.cache_base=self.owner.store.path.parent/"rice-packages"
        self.online_browser=browser
        browser.show()
        browser.inspect()
        browser.worker.loaded.connect(self.start_online_cached)
    @Slot(object)
    def start_online_cached(self,package):
        from shutil import which
        browser=self.online_browser
        if browser.package is not package:return
        runtimes=[c.payload for c in package.components if c.kind=="runtime" and which(c.payload["engine"])]
        runtimes.sort(key=lambda r:r["engine"]!="quickshell")
        if not runtimes:
            browser.status.setText("Imported and cached, but no supported Quickshell or Waybar runtime is installed.")
            return
        try:
            self.owner.rice_runner.start(browser.cache_base/package.digest,runtimes[0],"isolated")
            self.refresh_runtimes()
            browser.status.setText("Imported and launched in isolated mode · Stop running Rice ends it")
        except (OSError,ValueError,RuntimeError) as exc:
            browser.status.setText("Imported, but isolated launch failed: "+str(exc))
    def refresh_library(self):
        self.library.clear()
        for path in sorted((self.owner.store.path.parent/"rice-library").glob("*/provenance.json")):
            try:
                data=json.loads(path.read_text());self.library.addItem(data["name"],data["source"])
            except (OSError,ValueError,KeyError):pass
    def reopen(self):
        if self.library.currentData():self.open(source=self.library.currentData())
    def refresh_runtimes(self):
        if hasattr(self.owner.widget_panel,"rice_layers"):
            self.owner.widget_panel.rice_layers.reload()
        self.runtimes.clear()
        for path in sorted((self.owner.store.path.parent/"rice-packages").glob("*/package.json")):
            try:
                data=json.loads(path.read_text())
                for runtime in data["runtimes"]:self.runtimes.addItem(data["name"]+" · "+runtime["engine"],{"cache":str(path.parent),"runtime":runtime,"name":data["name"]})
            except (OSError,ValueError,KeyError):pass
    def run_saved(self):
        item=self.runtimes.currentData()
        if not item:return
        if not confirm_run(self,item["name"],self.mode.currentData()):return
        try:self.owner.rice_runner.start(Path(item["cache"]),item["runtime"],self.mode.currentData())
        except (OSError,ValueError,RuntimeError) as exc:QMessageBox.warning(self,"Cannot start Rice",str(exc))
    def browse_cached(self):
        item=self.runtimes.currentData()
        if item:self.open(source=str(Path(item["cache"])/"source"))

    def edit_layout(self):
        runner=self.owner.rice_runner
        item=self.runtimes.currentData()
        if runner.current_cache and runner.current_runtime and runner.current_runtime["engine"]=="quickshell":
            item={"cache":str(runner.current_cache),"runtime":runner.current_runtime}
        if not item:return
        try:
            editor=RiceLayoutEditor(self.owner,item["cache"],item["runtime"])
        except (OSError,ValueError) as exc:
            QMessageBox.warning(self,"Cannot edit Rice",str(exc));return
        editor.exec()


class RiceLayoutEditor(QDialog):
    """Move visual QML components without changing the downloaded source."""

    def __init__(self,owner,cache,runtime):
        super().__init__(owner)
        self.owner=owner;self.cache=Path(cache);self.runtime=runtime
        self.components=visual_components(cache,runtime)
        self.layout_path=layout_file(owner.store.path.parent,cache,runtime)
        self.offsets=load_offsets(self.layout_path,self.components)
        self.setWindowTitle("Edit original Rice components")
        self.resize(1080,650)
        outer=QVBoxLayout(self)
        intro=QLabel("Move components of the original interface. Changes apply to Ricing Town's private copy and appear after Run.")
        intro.setWordWrap(True);outer.addWidget(intro)
        self.search=QLineEdit();self.search.setPlaceholderText("Search island, dock, workspace, widget…")
        self.search.textChanged.connect(self.filter_items);outer.addWidget(self.search)
        row=QHBoxLayout();self.items=QListWidget();row.addWidget(self.items,2)
        preview_side=QVBoxLayout()
        self.preview=RicePlacementPreview(owner.canvas.background,owner.canvas.logical_width)
        self.preview.moved.connect(self.nudge);preview_side.addWidget(self.preview,1)
        button(preview_side,"Refresh live Rice picture",self.refresh_picture)
        guide=QLabel("Click the component in the picture to place its handle, then drag the handle to move it. The picture refreshes after Run.")
        guide.setWordWrap(True);preview_side.addWidget(guide);row.addLayout(preview_side,4)
        controls=QWidget();side=QVBoxLayout(controls)
        self.title=QLabel("Select a component");self.title.setWordWrap(True);side.addWidget(self.title)
        form=QFormLayout();self.x=QSpinBox();self.y=QSpinBox();self.scale=QSpinBox()
        for field in (self.x,self.y):field.setRange(-2000,2000)
        self.scale.setRange(50,200);self.scale.setSuffix(" %")
        for field in (self.x,self.y,self.scale):field.valueChanged.connect(self.update_offset)
        form.addRow("Horizontal offset",self.x);form.addRow("Vertical offset",self.y)
        form.addRow("Size",self.scale);side.addLayout(form)
        arrows=QHBoxLayout()
        for label,dx,dy in (("←",-10,0),("→",10,0),("↑",0,-10),("↓",0,10)):
            button(arrows,label,lambda checked=False,a=dx,b=dy:self.nudge(a,b))
        side.addLayout(arrows)
        button(side,"Reset selected",self.reset_selected)
        note=QLabel("Offsets move every instance of the selected QML component. Native screen surfaces and elements controlled by runtime state are listed separately in the original Rice; their internal placement may need an adapter.")
        note.setWordWrap(True);side.addWidget(note);side.addStretch()
        row.addWidget(controls,1);outer.addLayout(row,1)
        self.status=QLabel(f"{len(self.components)} editable visual components found")
        outer.addWidget(self.status)
        actions=QHBoxLayout();button(actions,"Save & run Rice",self.apply_and_run)
        button(actions,"Cancel",self.reject);outer.addLayout(actions)
        for name,info in sorted(self.components.items(),key=lambda pair:(pair[1]["group"],pair[1]["name"])):
            item=QListWidgetItem(f"{info['name']}   ·   {info['group']}")
            item.setData(Qt.ItemDataRole.UserRole,name);self.items.addItem(item)
        self.items.currentItemChanged.connect(self.select_item)
        if self.items.count():self.items.setCurrentRow(0)

    def showEvent(self,event):
        super().showEvent(event)
        from .desktop import float_palette
        wanted=(self.width(),self.height())
        for delay in (80,250,600):
            QTimer.singleShot(delay,lambda:float_palette(*wanted,self.windowTitle()) if self.isVisible() else None)

    def filter_items(self,value):
        needle=value.casefold()
        for index in range(self.items.count()):
            item=self.items.item(index);item.setHidden(needle not in item.text().casefold())

    def select_item(self,item,previous=None):
        enabled=item is not None
        for field in (self.x,self.y,self.scale):field.setEnabled(enabled);field.blockSignals(True)
        name=item.data(Qt.ItemDataRole.UserRole) if item else None
        offset=self.offsets.get(name,{"x":0,"y":0})
        self.x.setValue(offset["x"]);self.y.setValue(offset["y"]);self.scale.setValue(offset.get("scale",100))
        for field in (self.x,self.y,self.scale):field.blockSignals(False)
        self.title.setText(name.rsplit("/",1)[-1] if name else "Select a component")
        self.preview.select(name)

    def refresh_picture(self):
        self.owner.capture_desktop()
        worker=self.owner.capture_worker
        if worker:
            worker.captured.connect(self.preview.load_bytes)

    def update_offset(self):
        item=self.items.currentItem()
        if not item:return
        name=item.data(Qt.ItemDataRole.UserRole)
        value={"x":self.x.value(),"y":self.y.value()}
        if self.scale.value()!=100:value["scale"]=self.scale.value()
        if value["x"] or value["y"] or "scale" in value:self.offsets[name]=value
        else:self.offsets.pop(name,None)
        self.status.setText(f"{len(self.offsets)} components moved · Save & run to see them on desktop")

    def nudge(self,dx,dy):
        self.x.setValue(self.x.value()+dx);self.y.setValue(self.y.value()+dy)

    def reset_selected(self):
        self.x.setValue(0);self.y.setValue(0);self.scale.setValue(100)

    def apply_and_run(self):
        runner=self.owner.rice_runner
        same=runner.current_cache==self.cache and runner.current_runtime==self.runtime
        mode=runner.current_mode if same else "isolated"
        if not confirm_run(self,self.runtime["entry"],mode):return
        try:
            save_offsets(self.layout_path,self.offsets,self.components)
            runner=self.owner.rice_runner
            same=runner.current_cache==self.cache and runner.current_runtime==self.runtime
            runner.start(self.cache,self.runtime,runner.current_mode if same else "isolated")
        except (OSError,ValueError,RuntimeError) as exc:
            self.status.setText("Could not apply layout: "+str(exc));return
        self.owner.message(f"Rice layout applied · {len(self.offsets)} components moved")
        self.accept()


class RicePlacementPreview(QWidget):
    """Desktop snapshot with a draggable placement handle for the selected item."""
    moved=Signal(int,int)

    def __init__(self,picture,screen_width):
        super().__init__();self.picture=QPixmap(picture);self.screen_width=screen_width
        self.setMinimumSize(300,250);self.anchor=QPointF(0.5,0.5);self.drag_last=None

    def load_bytes(self,data):
        picture=QPixmap();picture.loadFromData(data)
        if not picture.isNull():self.picture=picture;self.update()

    def select(self,name):
        category=(name or "").casefold()
        if "island" in category:self.anchor=QPointF(0.5,0.08)
        elif "workspace" in category:self.anchor=QPointF(0.16,0.08)
        elif "dock" in category:self.anchor=QPointF(0.5,0.9)
        else:self.anchor=QPointF(0.5,0.5)
        self.update()

    def picture_rect(self):
        if self.picture.isNull():return QRectF(self.rect())
        size=self.picture.size().scaled(self.size(),Qt.AspectRatioMode.KeepAspectRatio)
        return QRectF((self.width()-size.width())/2,(self.height()-size.height())/2,size.width(),size.height())

    def paintEvent(self,event):
        p=QPainter(self);p.fillRect(self.rect(),QColor("#111521"));area=self.picture_rect()
        if self.picture.isNull():
            p.setPen(QColor("#e4e8f4"));p.drawText(area,Qt.AlignmentFlag.AlignCenter,"Refresh to show the running Rice")
        else:p.drawPixmap(area.toRect(),self.picture)
        x=area.x()+self.anchor.x()*area.width();y=area.y()+self.anchor.y()*area.height()
        p.setPen(QPen(QColor("#ffffff"),3));p.setBrush(QColor("#825fff"));p.drawEllipse(QPointF(x,y),12,12)
        p.setPen(QPen(QColor("#2a174e"),2));p.drawLine(QPointF(x-6,y),QPointF(x+6,y));p.drawLine(QPointF(x,y-6),QPointF(x,y+6))
        p.end()

    def mousePressEvent(self,event):
        if event.button()!=Qt.MouseButton.LeftButton:return
        area=self.picture_rect();point=event.position()
        if not area.contains(point):return
        self.anchor=QPointF((point.x()-area.x())/area.width(),(point.y()-area.y())/area.height())
        self.drag_last=point;self.update()

    def mouseMoveEvent(self,event):
        if self.drag_last is None or not event.buttons() & Qt.MouseButton.LeftButton:return
        area=self.picture_rect();point=event.position();delta=point-self.drag_last
        self.anchor=QPointF(max(0,min(1,self.anchor.x()+delta.x()/area.width())),
                            max(0,min(1,self.anchor.y()+delta.y()/area.height())))
        width=self.picture.width() if not self.picture.isNull() else self.screen_width
        self.moved.emit(round(delta.x()*width/area.width()),round(delta.y()*width/area.width()))
        self.drag_last=point;self.update()

    def mouseReleaseEvent(self,event):
        self.drag_last=None


class ColorsPanel(QWidget):
    def __init__(self,owner):
        super().__init__();self.owner=owner;box=QVBoxLayout(self);box.addWidget(QLabel("COLOR WORKBENCH"))
        self.palettes=QComboBox();box.addWidget(self.palettes);button(box,"Load palette into workbench",self.load_palette)
        self.tokens=QComboBox();box.addWidget(self.tokens)
        button(box,"Use token as…",self.assign_token)
        self.fields={};form=QFormLayout()
        for key in DEFAULT_COLORS:
            row=QWidget();line=QHBoxLayout(row);line.setContentsMargins(0,0,0,0)
            edit=QLineEdit();edit.setMaxLength(7);line.addWidget(edit);self.fields[key]=edit
            swatch=button(line,"●",lambda checked=False,k=key:self.pick(k))
            edit.textChanged.connect(lambda value,b=swatch:self.paint_swatch(b,value));form.addRow(key.title(),row)
        box.addLayout(form);self.targets={}
        for key,title in (("studio","Studio UI"),("widgets","All draft widgets"),("bar","Waybar"),("island","Dynamic island")):
            check=QCheckBox(title);check.setChecked(key in ("studio","island"));self.targets[key]=check;box.addWidget(check)
        button(box,"Apply colors to draft",self.apply_colors);button(box,"Save custom palette",self.save_palette)
        button(box,"Remove managed wallpaper",lambda:(owner.change("wallpaper",""),owner.sync()))
        box.addStretch();self.reload_palettes();self.sync()
    def reload_palettes(self):
        self.palettes.clear();self.palettes.addItem("Ricing Town",DEFAULT_COLORS)
        for path in sorted((self.owner.store.path.parent/"palettes").glob("*.json"))[:500]:
            try:
                data=json.loads(path.read_text());self.palettes.addItem(data["name"],palette(data["colors"]))
            except (OSError,ValueError,KeyError):pass
    def sync(self):
        for key,value in {**DEFAULT_COLORS,**self.owner.scene.colors}.items():
            if key in self.fields:self.fields[key].setText(value)
    def load_palette(self):
        values=self.palettes.currentData() or DEFAULT_COLORS;self.tokens.clear()
        for key,value in values.items():self.tokens.addItem(f"{key} · {value}",value)
        aliases={"background":("background","bg","base"),"surface":("surface","mantle","color0"),"text":("text","foreground","fg"),"accent":("accent","blue","color4")}
        for key,names in aliases.items():
            for name in names:
                if name in values:self.fields[key].setText(values[name]);break
    def assign_token(self):
        if not self.tokens.currentData():return
        from PySide6.QtWidgets import QInputDialog
        key,ok=QInputDialog.getItem(self,"Assign color token","Role",list(DEFAULT_COLORS),0,False)
        if ok:self.fields[key].setText(self.tokens.currentData())
    def pick(self,key):
        value=QColorDialog.getColor(QColor(self.fields[key].text()),self,"Choose "+key)
        if value.isValid():self.fields[key].setText(value.name())
    def values(self):return {key:color(edit.text()) for key,edit in self.fields.items()}
    def paint_swatch(self,button,value):
        try:value=color(value)
        except ValueError:return
        button.setStyleSheet(f"background: {value}; color: {value}; border: 1px solid #9399aa;")
    def apply_colors(self):
        try:values=self.values()
        except ValueError as exc:QMessageBox.warning(self,"Invalid color",str(exc));return
        self.owner.snapshot();scene=self.owner.scene
        if self.targets["studio"].isChecked():scene.colors=values
        if self.targets["bar"].isChecked():scene.bar_color=values["background"];scene.bar_text=values["text"];scene.bar_active=values["accent"]
        if self.targets["island"].isChecked():scene.island={**validate_island(scene.island),**{k:values[k] for k in ("background","text","accent")}}
        if self.targets["widgets"].isChecked():
            for w in scene.widgets:
                w["background"]=values["surface"]
                for e in w["elements"]:e["color"]=values["text"] if e["kind"]=="text" else values["accent"]
        self.owner.sync();self.owner.message("Colors updated in draft · Undo restores previous colors · Apply updates desktop")
    def save_palette(self):
        from PySide6.QtWidgets import QInputDialog
        name,ok=QInputDialog.getText(self,"Save palette","Palette name")
        if not ok or not name.strip():return
        try:
            values=self.values();key=hashlib.sha256((name+json.dumps(values)).encode()).hexdigest()
            atomic_json(self.owner.store.path.parent/"palettes"/(key+".json"),{"name":name[:100],"colors":values,"source":"custom"});self.reload_palettes()
        except (ValueError,OSError) as exc:QMessageBox.warning(self,"Cannot save",str(exc))


class IslandPanel(QWidget):
    def __init__(self,owner):
        super().__init__();self.owner=owner;self.loading=False;box=QVBoxLayout(self)
        self.enabled=QCheckBox("Show native Dynamic Island");self.enabled.toggled.connect(lambda v:self.change("enabled",v));box.addWidget(self.enabled)
        hint=QLabel("Click the capsule to expand/collapse. Tabs: live stats, media controls and application launchers. Apps are selected in Waybar. Media controls require playerctl.");hint.setWordWrap(True);box.addWidget(hint)
        form=QFormLayout();self.fields={}
        for key,low,high in (("width",160,600),("expanded_width",320,900),("height",36,96),("expanded_height",220,480),("top",0,600),("radius",0,80)):
            spin=QSpinBox();spin.setRange(low,high);spin.valueChanged.connect(lambda v,k=key:self.change(k,v));self.fields[key]=spin;form.addRow(key.replace("_"," ").title(),spin)
        box.addLayout(form)
        for key in ("background","text","accent"):button(box,key.title()+" color",lambda checked=False,k=key:self.pick(k))
        button(box,"Expand / collapse preview",self.toggle_preview);box.addStretch();self.sync()
    def sync(self):
        self.loading=True;cfg=validate_island(self.owner.scene.island);self.enabled.setChecked(cfg["enabled"])
        for key,spin in self.fields.items():spin.setValue(cfg[key])
        self.loading=False
    def change(self,key,value):
        if self.loading:return
        cfg=validate_island(self.owner.scene.island);cfg[key]=value
        if key=="width":cfg["expanded_width"]=max(cfg["width"],cfg["expanded_width"])
        if key=="expanded_width":cfg["width"]=min(cfg["width"],cfg["expanded_width"])
        self.owner.change("island",validate_island(cfg));self.sync()
    def pick(self,key):
        value=QColorDialog.getColor(QColor(validate_island(self.owner.scene.island)[key]),self,"Island "+key)
        if value.isValid():self.change(key,value.name())
    def toggle_preview(self):self.owner.canvas.island_expanded=not self.owner.canvas.island_expanded;self.owner.canvas.update()
