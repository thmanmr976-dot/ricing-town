"""Native composition editor and shared Qt preview renderer."""
from copy import deepcopy

from PySide6.QtCore import QPointF, QRectF, QSize, Qt, QTimer, Signal
from PySide6.QtGui import QColor, QFont, QIcon, QPainter, QPen, QPixmap, QShortcut, QKeySequence
from PySide6.QtWidgets import (QCheckBox, QColorDialog, QComboBox, QDialog,
    QDialogButtonBox, QFormLayout, QHBoxLayout, QLabel, QLineEdit, QListWidget,
    QMessageBox, QPlainTextEdit, QPushButton, QScrollArea, QSpinBox, QSplitter,
    QVBoxLayout, QWidget)

from .widgets import SOURCES, DataSources, element, validate_widget


def paint_widget(painter, widget, values):
    painter.save(); painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    painter.setClipRect(QRectF(0,0,widget["width"],widget["height"]))
    painter.setPen(Qt.PenStyle.NoPen); painter.setBrush(QColor(widget["background"]))
    painter.drawRoundedRect(QRectF(0,0,widget["width"],widget["height"]),widget["radius"],widget["radius"])
    for e in widget["elements"]:
        painter.save(); rect=QRectF(e["x"],e["y"],e["width"],e["height"]); painter.setClipRect(rect,Qt.ClipOperation.IntersectClip)
        data=values.get(e["source"],dict(text="Unavailable",value=0))
        painter.setPen(Qt.PenStyle.NoPen); painter.setBrush(QColor(e["color"]))
        if e["kind"]=="shape": painter.drawRoundedRect(rect,e["radius"],e["radius"])
        elif e["kind"]=="progress":
            painter.setBrush(QColor("#454957")); painter.drawRoundedRect(rect,4,4)
            painter.setBrush(QColor(e["color"])); fill=QRectF(rect); fill.setWidth(rect.width()*max(0,min(100,data["value"]))/100); painter.drawRoundedRect(fill,4,4)
        else:
            font=QFont("Monospace" if e["source"]=="calendar" else "Sans"); font.setPixelSize(e["size"]); painter.setFont(font); painter.setPen(QColor(e["color"]))
            text=e["text"] if e["source"]=="text" else data["text"]
            painter.drawText(rect,Qt.AlignmentFlag.AlignLeft|Qt.AlignmentFlag.AlignTop|Qt.TextFlag.TextWordWrap,text)
        painter.restore()
    painter.restore()


def thumbnail(widget,values,width=260,height=130):
    image=QPixmap(width,height); image.fill(QColor("#12151e")); painter=QPainter(image)
    scale=min((width-20)/widget["width"],(height-16)/widget["height"])
    painter.translate((width-widget["width"]*scale)/2,(height-widget["height"]*scale)/2); painter.scale(scale,scale)
    paint_widget(painter,widget,values); painter.end(); return image


class CompositionCanvas(QWidget):
    selected=Signal(int)
    changed=Signal()
    editStarted=Signal()

    def __init__(self,widget,values):
        super().__init__(); self.widget=widget; self.values=values; self.index=-1; self.drag=None
        self.setMinimumSize(360,300)
        self.zoom=1.0; self.snap=False
        self.pan=QPointF(); self.pan_start=None; self.setMouseTracking(True)
        self.setToolTip("Drag to move · handles to resize · arrows: 1px · Shift+arrows: 10px · middle-drag to pan")
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)

    def transform(self):
        scale=min((self.width()-60)/self.widget["width"],(self.height()-60)/self.widget["height"])*self.zoom
        return QPointF((self.width()-self.widget["width"]*scale)/2,(self.height()-self.widget["height"]*scale)/2)+self.pan,scale

    def paintEvent(self,event):
        p=QPainter(self); p.fillRect(self.rect(),QColor("#10131c")); p.setPen(QColor("#242938"))
        for x in range(0,self.width(),20):
            for y in range(0,self.height(),20): p.drawPoint(x,y)
        origin,scale=self.transform(); p.translate(origin); p.scale(scale,scale); paint_widget(p,self.widget,self.values)
        if 0<=self.index<len(self.widget["elements"]):
            e=self.widget["elements"][self.index]; r=QRectF(e["x"],e["y"],e["width"],e["height"])
            p.setPen(QPen(QColor("#a99bff"),1.5/scale)); p.setBrush(Qt.BrushStyle.NoBrush); p.drawRect(r)
            for point in self.handles(e).values():
                p.fillRect(QRectF(point.x()-4/scale,point.y()-4/scale,8/scale,8/scale),QColor("#a99bff"))

    def handles(self,e):
        x,y,w,h=e["x"],e["y"],e["width"],e["height"]
        return {"nw":QPointF(x,y),"n":QPointF(x+w/2,y),"ne":QPointF(x+w,y),
                "w":QPointF(x,y+h/2),"e":QPointF(x+w,y+h/2),
                "sw":QPointF(x,y+h),"s":QPointF(x+w/2,y+h),"se":QPointF(x+w,y+h)}

    def point(self,event):
        origin,scale=self.transform(); return (event.position()-origin)/scale

    def mousePressEvent(self,event):
        if event.button()==Qt.MouseButton.MiddleButton:
            self.pan_start=(event.position(),QPointF(self.pan)); return
        if event.button()!=Qt.MouseButton.LeftButton: return
        self.setFocus()
        point=self.point(event); self.drag=None
        if 0<=self.index<len(self.widget["elements"]):
            e=self.widget["elements"][self.index]
            for handle,pos in self.handles(e).items():
                if (point-pos).manhattanLength()<12/self.transform()[1]:
                    self.editStarted.emit(); self.drag=(handle,point,deepcopy(e)); return
        self.index=next((i for i in reversed(range(len(self.widget["elements"]))) if QRectF(self.widget["elements"][i]["x"],self.widget["elements"][i]["y"],self.widget["elements"][i]["width"],self.widget["elements"][i]["height"]).contains(point)),-1)
        self.selected.emit(self.index); self.update()
        if self.index>=0:
            self.editStarted.emit(); self.drag=("move",point,deepcopy(self.widget["elements"][self.index]))

    def mouseMoveEvent(self,event):
        if self.pan_start:
            self.pan=self.pan_start[1]+event.position()-self.pan_start[0]; self.update(); return
        cursors={"nw":Qt.CursorShape.SizeFDiagCursor,"se":Qt.CursorShape.SizeFDiagCursor,
                 "ne":Qt.CursorShape.SizeBDiagCursor,"sw":Qt.CursorShape.SizeBDiagCursor,
                 "n":Qt.CursorShape.SizeVerCursor,"s":Qt.CursorShape.SizeVerCursor,
                 "e":Qt.CursorShape.SizeHorCursor,"w":Qt.CursorShape.SizeHorCursor}
        cursor=Qt.CursorShape.ArrowCursor
        if self.index>=0:
            for handle,pos in self.handles(self.widget["elements"][self.index]).items():
                if (self.point(event)-pos).manhattanLength()<12/self.transform()[1]: cursor=cursors[handle]; break
        self.setCursor(cursor)
        if not self.drag or self.index<0: return
        action,start,old=self.drag; delta=self.point(event)-start; e=self.widget["elements"][self.index]
        step=4 if self.snap else 1
        dx=round(delta.x()/step)*step; dy=round(delta.y()/step)*step
        if action=="move":
            e["x"]=max(0,min(self.widget["width"]-1,old["x"]+dx))
            e["y"]=max(0,min(self.widget["height"]-1,old["y"]+dy))
        else:
            if "e" in action: e["width"]=max(8,min(1600,old["width"]+dx))
            if "s" in action: e["height"]=max(8,min(1600,old["height"]+dy))
            if "w" in action:
                e["x"]=max(0,old["x"]+old["width"]-1600,min(old["x"]+old["width"]-8,old["x"]+dx)); e["width"]=old["x"]+old["width"]-e["x"]
            if "n" in action:
                e["y"]=max(0,old["y"]+old["height"]-1600,min(old["y"]+old["height"]-8,old["y"]+dy)); e["height"]=old["y"]+old["height"]-e["y"]
        self.changed.emit(); self.update()

    def mouseReleaseEvent(self,event): self.drag=None; self.pan_start=None

    def keyPressEvent(self,event):
        directions={Qt.Key.Key_Left:(-1,0),Qt.Key.Key_Right:(1,0),Qt.Key.Key_Up:(0,-1),Qt.Key.Key_Down:(0,1)}
        if event.key() not in directions or self.index<0: return super().keyPressEvent(event)
        self.editStarted.emit(); dx,dy=directions[event.key()]; step=10 if event.modifiers() & Qt.KeyboardModifier.ShiftModifier else 1
        e=self.widget["elements"][self.index]
        e["x"]=max(0,min(self.widget["width"]-1,e["x"]+dx*step)); e["y"]=max(0,min(self.widget["height"]-1,e["y"]+dy*step))
        self.changed.emit(); self.update()


class WidgetEditor(QDialog):
    def __init__(self,widget,values,parent=None):
        super().__init__(parent); self.widget=deepcopy(widget); self.values=values; self.loading=False
        self.history=[]; self.future=[]; self.group=None
        self.setWindowTitle("Widget Studio · Create & customize"); self.resize(1000,650); self.setMinimumSize(780,520)
        layout=QVBoxLayout(self); heading=QHBoxLayout(); heading.addWidget(QLabel("WIDGET STUDIO   /   Compose your own")); heading.addStretch()
        for title,callback,shortcut in (("Undo",self.undo,"Ctrl+Z"),("Redo",self.redo,"Ctrl+Shift+Z")):
            button=QPushButton(title); button.clicked.connect(callback); heading.addWidget(button)
            QShortcut(QKeySequence(shortcut),self,activated=callback)
        layout.addLayout(heading); split=QSplitter(); layout.addWidget(split,1)
        left=QWidget(); left.setMaximumWidth(180); lb=QVBoxLayout(left)
        lb.addWidget(QLabel("ADD ELEMENT"))
        for kind,label in (("text","T   Text / live data"),("shape","▢   Shape"),("progress","━   Progress")):
            button=QPushButton(label); button.clicked.connect(lambda checked=False,k=kind:self.add_element(k)); lb.addWidget(button)
        lb.addWidget(QLabel("LAYERS")); self.layers=QListWidget(); self.layers.currentRowChanged.connect(self.select); lb.addWidget(self.layers,1)
        for label,callback in (("Move up",lambda:self.reorder(1)),("Move down",lambda:self.reorder(-1)),("Delete element",self.remove)):
            button=QPushButton(label); button.clicked.connect(callback); lb.addWidget(button)
        split.addWidget(left); self.canvas=CompositionCanvas(self.widget,values); split.addWidget(self.canvas)
        self.canvas.selected.connect(self.layers.setCurrentRow); self.canvas.changed.connect(self.refresh_geometry)
        self.canvas.editStarted.connect(self.checkpoint)
        snap=QCheckBox("Snap 4px"); snap.toggled.connect(lambda v:setattr(self.canvas,"snap",v)); heading.addWidget(snap)
        zoom=QComboBox(); zoom.addItems(["Fit","125%","150%","200%"])
        zoom.currentIndexChanged.connect(lambda i:self.set_zoom([1,1.25,1.5,2][i])); heading.addWidget(zoom)
        scroll=QScrollArea(); scroll.setWidgetResizable(True); scroll.setMinimumWidth(230); scroll.setMaximumWidth(280)
        panel=QWidget(); form=QFormLayout(panel); scroll.setWidget(panel); split.addWidget(scroll)
        self.name=QLineEdit(self.widget["name"]); self.name.textEdited.connect(lambda s:self.change_widget("name",s)); form.addRow("Widget name",self.name)
        self.widget_fields={}
        for key,low,high in (("width",80,1600),("height",80,1600),("radius",0,800)):
            spin=QSpinBox(); spin.setRange(low,high); spin.setValue(self.widget[key]); spin.valueChanged.connect(lambda v,k=key:self.change_widget(k,v)); form.addRow(key.title(),spin)
            self.widget_fields[key]=spin
        bg=QPushButton("Choose fill"); bg.clicked.connect(self.background); form.addRow("Background",bg)
        form.addRow(QLabel("SELECTED ELEMENT")); self.source=QComboBox(); self.source.addItems(SOURCES); self.source.currentTextChanged.connect(lambda v:self.change_element("source",v)); form.addRow("Data source",self.source)
        self.text=QPlainTextEdit(); self.text.setMaximumHeight(90); self.text.textChanged.connect(lambda:self.change_element("text",self.text.toPlainText())); form.addRow("Text",self.text)
        self.fields={}
        for key,low,high in (("x",0,1600),("y",0,1600),("width",1,1600),("height",1,1600),("size",8,160),("radius",0,800)):
            spin=QSpinBox(); spin.setRange(low,high); spin.valueChanged.connect(lambda v,k=key:self.change_element(k,v)); self.fields[key]=spin; form.addRow(key.title(),spin)
        self.color=QPushButton("Choose color"); self.color.clicked.connect(self.element_color); form.addRow("Color",self.color)
        split.setSizes([160,540,250]); foot=QHBoxLayout(); self.save_library=QCheckBox("Save a reusable copy in My widgets"); self.save_library.setChecked(True); foot.addWidget(self.save_library)
        foot.addStretch(); buttons=QDialogButtonBox(QDialogButtonBox.StandardButton.Save|QDialogButtonBox.StandardButton.Cancel)
        buttons.accepted.connect(self.finish); buttons.rejected.connect(self.reject); foot.addWidget(buttons); layout.addLayout(foot)
        self.rebuild_layers()
        self.data_sources=DataSources(); self.refresh_timer=QTimer(self); self.refresh_timer.timeout.connect(self.refresh_preview); self.refresh_timer.start(1000)

    def refresh_preview(self): self.canvas.values=self.data_sources.sample(); self.canvas.update()

    def set_zoom(self,value):
        self.canvas.zoom=value
        if value==1: self.canvas.pan=QPointF()
        self.canvas.update()
    def checkpoint(self,key=None):
        if self.loading: return
        if key is None or self.group!=key:
            self.history.append(deepcopy(self.widget)); self.history=self.history[-100:]
        self.group=key; self.future.clear()
    def restore(self,value):
        self.widget.clear(); self.widget.update(deepcopy(value)); self.loading=True
        self.name.setText(self.widget["name"])
        for key,spin in self.widget_fields.items(): spin.setValue(self.widget[key])
        self.loading=False; self.canvas.index=min(self.canvas.index,len(self.widget["elements"])-1); self.group=None; self.rebuild_layers()
    def undo(self):
        if self.history: self.future.append(deepcopy(self.widget)); self.restore(self.history.pop())
    def redo(self):
        if self.future: self.history.append(deepcopy(self.widget)); self.restore(self.future.pop())
    def refresh_geometry(self):
        self.loading=True
        if self.canvas.index>=0:
            for key,spin in self.fields.items(): spin.setValue(self.widget["elements"][self.canvas.index][key])
        self.loading=False

    def rebuild_layers(self):
        current=self.canvas.index; self.layers.blockSignals(True); self.layers.clear()
        for e in self.widget["elements"]: self.layers.addItem(f"{e['kind']} · {e['source'] if e['source']!='text' else e['text'][:18]}")
        self.layers.setCurrentRow(current); self.layers.blockSignals(False); self.refresh_fields(); self.canvas.update()
    def select(self,index): self.group=None; self.canvas.index=index; self.refresh_fields(); self.canvas.update()
    def refresh_fields(self):
        self.loading=True; index=self.canvas.index; enabled=0<=index<len(self.widget["elements"])
        for control in [self.source,self.text,self.color,*self.fields.values()]: control.setEnabled(enabled)
        if enabled:
            e=self.widget["elements"][index]; self.source.setCurrentText(e["source"]); self.text.setPlainText(e["text"])
            for key,spin in self.fields.items(): spin.setValue(e[key])
        self.loading=False
    def change_widget(self,key,value):
        if self.loading: return
        self.checkpoint(("widget",key)); self.widget[key]=value; self.canvas.update()
    def change_element(self,key,value):
        if self.loading or self.canvas.index<0: return
        self.checkpoint((self.canvas.index,key))
        e=self.widget["elements"][self.canvas.index]; e[key]=value
        item=self.layers.item(self.canvas.index)
        if item: item.setText(f"{e['kind']} · {e['source'] if e['source']!='text' else e['text'][:18]}")
        self.canvas.update()
    def add_element(self,kind):
        if len(self.widget["elements"])>=32: return
        self.checkpoint()
        self.widget["elements"].append(element(kind=kind,source="battery" if kind=="progress" else "text",width=min(260,self.widget["width"]-40),height=12 if kind=="progress" else 48))
        self.canvas.index=len(self.widget["elements"])-1; self.rebuild_layers()
    def remove(self):
        self.checkpoint()
        if self.canvas.index>=0: self.widget["elements"].pop(self.canvas.index); self.canvas.index=-1; self.rebuild_layers()
    def reorder(self,delta):
        i=self.canvas.index; j=i+delta
        if 0<=i<len(self.widget["elements"]) and 0<=j<len(self.widget["elements"]):
            self.checkpoint()
            self.widget["elements"][i],self.widget["elements"][j]=self.widget["elements"][j],self.widget["elements"][i]; self.canvas.index=j; self.rebuild_layers()
    def background(self):
        color=QColorDialog.getColor(QColor(self.widget["background"]),self,"Widget fill")
        if color.isValid(): self.change_widget("background",color.name())
    def element_color(self):
        if self.canvas.index<0: return
        color=QColorDialog.getColor(QColor(self.widget["elements"][self.canvas.index]["color"]),self,"Element color")
        if color.isValid(): self.change_element("color",color.name())
    def finish(self):
        try: self.widget=validate_widget(self.widget)
        except ValueError as exc: QMessageBox.warning(self,"Widget needs attention",str(exc)); return
        self.accept()
