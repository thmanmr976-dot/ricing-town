"""Template library, import preview and layer actions for the main studio."""
from copy import deepcopy
from pathlib import Path

from PySide6.QtCore import QMimeData, QRectF, QSize, Qt
from PySide6.QtGui import QColor, QDrag, QIcon, QPainter
from PySide6.QtWidgets import (QDialog, QDialogButtonBox, QFileDialog, QHBoxLayout,
    QLabel, QLineEdit, QListWidget, QListWidgetItem, QMessageBox, QPushButton,
    QScrollArea, QTabWidget, QVBoxLayout, QWidget)

from .widget_editor import WidgetEditor, thumbnail
from .widgets import MAX_WIDGETS, blank, read_widgets, templates, validate_widget, write_widgets


class TemplateCard(QPushButton):
    def __init__(self,widget,index,values):
        super().__init__(); self.index=index; self.title=widget["name"]
        self.setAccessibleName(self.title); self.picture=thumbnail(widget,values,260,112)
        self.setIcon(QIcon(self.picture)); self.setIconSize(QSize(230,112))
        self.setMinimumSize(220,152); self.setToolTip("Click to preview / customize, or drag onto desktop")
        self.setStyleSheet("QPushButton { text-align:left; padding:8px; border-radius:12px; }")
    def sizeHint(self): return QSize(250,152)
    def paintEvent(self,event):
        p=QPainter(self); p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setPen(QColor("#a99bff" if self.underMouse() else "#343b4d")); p.setBrush(QColor("#202534")); p.drawRoundedRect(self.rect().adjusted(1,1,-1,-1),12,12)
        p.drawPixmap(self.rect().adjusted(8,8,-8,-34),self.picture)
        p.setPen(QColor("#e4e8f4")); p.drawText(self.rect().adjusted(14,self.height()-32,-14,-6),Qt.AlignmentFlag.AlignLeft|Qt.AlignmentFlag.AlignVCenter,self.title+"   ↗")
    def mousePressEvent(self,event): self.origin=event.position(); super().mousePressEvent(event)
    def mouseMoveEvent(self,event):
        if event.buttons() & Qt.MouseButton.LeftButton and (event.position()-self.origin).manhattanLength()>12:
            self.setDown(False); drag=QDrag(self); mime=QMimeData(); mime.setText(f"ricing-town:widget:{self.index}"); drag.setMimeData(mime)
            drag.setPixmap(self.icon().pixmap(180,90)); drag.exec(Qt.DropAction.CopyAction)


class WidgetPanel(QTabWidget):
    def __init__(self,owner,bar_panel):
        super().__init__(); self.owner=owner; self.catalog=templates(); self.library_dir=owner.store.path.parent/"library"
        self.cards=[]
        if self.library_dir.exists():
            for path in sorted(self.library_dir.glob("*.json"))[:100]:
                try: self.catalog.extend(read_widgets(path))
                except (ValueError,OSError): pass
        self.gallery=QWidget(); column=QVBoxLayout(self.gallery); top=QHBoxLayout()
        self.add_button(top,"＋ Create",self.create); self.add_button(top,"Import",self.import_file); column.addLayout(top)
        self.search=QLineEdit(); self.search.setPlaceholderText("Search widgets…"); self.search.textChanged.connect(self.filter); column.addWidget(self.search)
        hint=QLabel("Preview a template or drag it onto the desktop"); hint.setWordWrap(True); column.addWidget(hint)
        scroll=QScrollArea(); scroll.setWidgetResizable(True); body=QWidget(); self.card_layout=QVBoxLayout(body); scroll.setWidget(body); column.addWidget(scroll,1)
        self.addTab(self.gallery,"Widgets")
        layers_page=QWidget(); layer_box=QVBoxLayout(layers_page); layer_box.addWidget(QLabel("DESKTOP LAYERS"))
        self.layers=QListWidget(); self.layers.setMinimumHeight(100); self.layers.currentRowChanged.connect(self.select_layer); self.layers.itemDoubleClicked.connect(lambda item:self.edit_selected()); layer_box.addWidget(self.layers,1)
        self.info=QLabel("Select a widget to customize it."); self.info.setTextFormat(Qt.TextFormat.PlainText); self.info.setWordWrap(True); layer_box.addWidget(self.info)
        for title,callback in (("Edit design…",self.edit_selected),("Duplicate",self.duplicate),("Remove",self.remove),("Export widget…",self.export_selected)):
            self.add_button(layer_box,title,callback)
        from .rice_layers import RiceLayers
        self.rice_layers=RiceLayers(owner); layer_box.addWidget(self.rice_layers)
        layer_scroll=QScrollArea(); layer_scroll.setWidgetResizable(True); layer_scroll.setWidget(layers_page)
        self.addTab(layer_scroll,"Layers"); self.addTab(bar_panel,"Waybar")
        self.refresh_catalog(); self.refresh_layers()

    @staticmethod
    def add_button(layout,title,callback):
        button=QPushButton(title); button.clicked.connect(callback); layout.addWidget(button); return button
    def refresh_catalog(self):
        while self.card_layout.count():
            item=self.card_layout.takeAt(0)
            if item.widget(): item.widget().deleteLater()
        self.cards=[]
        for i,widget in enumerate(self.catalog):
            card=TemplateCard(widget,i,self.owner.canvas.sources.values)
            card.clicked.connect(lambda checked=False,index=i:self.add_template(str(index),80,80)); self.card_layout.addWidget(card); self.cards.append(card)
        self.card_layout.addStretch(); self.filter(self.search.text())
    def filter(self,text):
        for card,w in zip(self.cards,self.catalog): card.setVisible(text.casefold() in w["name"].casefold())
    def refresh_layers(self):
        self.layers.blockSignals(True); self.layers.clear()
        for w in self.owner.scene.widgets: self.layers.addItem(f"▧   {w['name']}\n     {w['width']} × {w['height']}  ·  {w['monitor'] or self.owner.scene.monitor}")
        self.layers.setCurrentRow(self.owner.canvas.selected_index); self.layers.blockSignals(False)
    def select_layer(self,index):
        self.owner.canvas.selected_index=index; self.owner.canvas.update()
        if 0<=index<len(self.owner.scene.widgets):
            w=self.owner.scene.widgets[index]; self.info.setText(f"{w['name']}\nPosition: {w['x']}, {w['y']}\nDrag the widget to move; drag its corner to resize.")
    def selection_changed(self,index):
        self.layers.setCurrentRow(index)
        if index>=0: self.setCurrentIndex(1)
    def append(self,widget):
        if len(self.owner.scene.widgets)>=MAX_WIDGETS: raise ValueError("Maximum 40 widgets on the desktop")
        self.owner.snapshot(); widget=validate_widget(widget,True); widget["monitor"]=self.owner.scene.monitor
        widget["x"]=min(widget["x"],max(0,self.owner.canvas.logical_width-widget["width"]))
        widget["y"]=min(widget["y"],max(0,self.owner.canvas.logical_height-widget["height"]))
        self.owner.scene.widgets.append(widget); self.owner.canvas.selected_index=len(self.owner.scene.widgets)-1
        self.owner.sync(); self.owner.message("Widget added to draft · Apply to display it on desktop")
    def remember(self,widget):
        self.library_dir.mkdir(parents=True,exist_ok=True,mode=0o700)
        write_widgets(self.library_dir/(widget["id"]+".json"),[widget]); self.catalog.append(deepcopy(widget)); self.refresh_catalog()
    def add_template(self,index,x,y):
        try: widget=deepcopy(self.catalog[int(index)])
        except (ValueError,IndexError): return
        widget.update(x=x,y=y); self.edit(widget,new=True,save_library=False)
    def create(self): self.edit(blank(),new=True,save_library=True)
    def edit(self,widget,new=False,save_library=False):
        dialog=WidgetEditor(widget,self.owner.canvas.sources.values,self.owner)
        dialog.save_library.setChecked(save_library)
        if dialog.exec():
            try:
                if new: self.append(dialog.widget)
                else:
                    self.owner.snapshot(); self.owner.scene.widgets[self.owner.canvas.selected_index]=dialog.widget; self.owner.sync()
                if dialog.save_library.isChecked(): self.remember(dialog.widget)
            except (OSError,ValueError) as exc: QMessageBox.warning(self,"Widget could not be saved",str(exc))
    def edit_selected(self):
        i=self.owner.canvas.selected_index
        if 0<=i<len(self.owner.scene.widgets): self.edit(self.owner.scene.widgets[i])
    def duplicate(self):
        i=self.owner.canvas.selected_index
        if 0<=i<len(self.owner.scene.widgets):
            widget=deepcopy(self.owner.scene.widgets[i]); widget["name"]+=" copy"; widget["x"]+=24; widget["y"]+=24
            try: self.append(widget)
            except ValueError as exc: QMessageBox.warning(self,"Cannot duplicate",str(exc))
    def remove(self):
        i=self.owner.canvas.selected_index
        if 0<=i<len(self.owner.scene.widgets): self.owner.snapshot(); self.owner.scene.widgets.pop(i); self.owner.canvas.selected_index=-1; self.owner.sync()
    def export_selected(self):
        i=self.owner.canvas.selected_index
        if not 0<=i<len(self.owner.scene.widgets): return
        path,_=QFileDialog.getSaveFileName(self,"Export widget","widget.rtwidget.json","Ricing Town widget (*.json)")
        if path:
            try: write_widgets(path,[self.owner.scene.widgets[i]]); self.owner.message("Widget exported")
            except (OSError,ValueError) as exc: QMessageBox.warning(self,"Export failed",str(exc))
    def import_file(self):
        path,_=QFileDialog.getOpenFileName(self,"Import widgets","","Ricing Town widgets (*.json)")
        if path:
            try: self.preview_import(read_widgets(path))
            except (OSError,ValueError) as exc: QMessageBox.warning(self,"Cannot import",str(exc))
    def preview_import(self,widgets):
        dialog=QDialog(self.owner); dialog.setWindowTitle("Import preview · select widgets"); dialog.resize(540,480)
        layout=QVBoxLayout(dialog); layout.addWidget(QLabel("Select the widgets to add. Nothing is applied until Apply.")); listing=QListWidget(); listing.setIconSize(QSize(180,100))
        for w in widgets:
            item=QListWidgetItem(QIcon(thumbnail(w,self.owner.canvas.sources.values,180,100)),w["name"]); item.setCheckState(Qt.CheckState.Checked); listing.addItem(item)
        layout.addWidget(listing); buttons=QDialogButtonBox(QDialogButtonBox.StandardButton.Ok|QDialogButtonBox.StandardButton.Cancel)
        buttons.button(QDialogButtonBox.StandardButton.Ok).setText("Import selected"); buttons.accepted.connect(dialog.accept); buttons.rejected.connect(dialog.reject); layout.addWidget(buttons)
        if dialog.exec():
            selected=[w for i,w in enumerate(widgets) if listing.item(i).checkState()==Qt.CheckState.Checked]
            if len(self.owner.scene.widgets)+len(selected)>MAX_WIDGETS: raise ValueError("Import would exceed 40 desktop widgets")
            if selected:
                self.owner.snapshot()
                for i,w in enumerate(selected):
                    w=validate_widget(w,True)
                    w.update(monitor=self.owner.scene.monitor,x=min(60+32*i,max(0,self.owner.canvas.logical_width-w["width"])),y=min(60+32*i,max(0,self.owner.canvas.logical_height-w["height"])))
                    self.owner.scene.widgets.append(w)
                self.owner.canvas.selected_index=len(self.owner.scene.widgets)-1; self.owner.sync(); self.owner.message(f"Imported {len(selected)} widgets into draft · Apply when ready")
