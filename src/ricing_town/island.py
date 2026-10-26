"""App-owned interactive island, independent of executable Rice imports."""
import json
from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QColor, QFont

DEFAULT={"enabled":False,"width":240,"expanded_width":440,"height":44,"expanded_height":240,
         "top":8,"radius":24,"background":"#141721","text":"#e4e8f4","accent":"#a99bff"}


def validate_island(raw):
    if not isinstance(raw,dict) or set(raw)-set(DEFAULT): raise ValueError("Unsupported island fields")
    data={**DEFAULT,**raw}
    if type(data["enabled"]) is not bool: raise ValueError("Invalid island enabled flag")
    for key,low,high in (("width",160,600),("expanded_width",320,900),("height",36,96),
                         ("expanded_height",220,480),("top",0,600),("radius",0,80)):
        if type(data[key]) is not int or not low<=data[key]<=high: raise ValueError(f"Island {key}: {low}–{high}")
    if data["expanded_width"]<data["width"]: raise ValueError("Expanded width must be at least the compact width")
    from .rice import color
    for key in ("background","text","accent"): data[key]=color(data[key])
    return data


def paint_island(p,scene,width,values,expanded=False):
    cfg=validate_island(scene.island)
    if not cfg["enabled"]: return QRectF()
    w=cfg["expanded_width"] if expanded else cfg["width"]; h=cfg["expanded_height"] if expanded else cfg["height"]
    top=cfg["top"]+(scene.bar_height+scene.bar_margin if scene.bar_enabled and scene.bar_position=="top" else 0)
    rect=QRectF((width-w)/2,top,w,h); p.save(); p.setPen(Qt.PenStyle.NoPen); p.setBrush(QColor(cfg["background"]))
    p.drawRoundedRect(rect,cfg["radius"],cfg["radius"]); p.setPen(QColor(cfg["text"]))
    font=QFont("Sans"); font.setPixelSize(16); p.setFont(font)
    p.drawText(QRectF(rect.x(),top,w,cfg["height"]),Qt.AlignmentFlag.AlignCenter,values.get("time",{}).get("text","--:--")+"  ·  "+("⌃" if expanded else "⌄"))
    if expanded:
        p.setPen(QColor(cfg["accent"])); p.drawText(QRectF(rect.x()+20,top+56,w-40,30),Qt.AlignmentFlag.AlignLeft,"Stats     Media     Apps")
        p.setPen(QColor(cfg["text"])); font.setPixelSize(14);p.setFont(font)
        text="\n".join(k.upper()+"   "+values.get(k,{}).get("text","Unavailable") for k in ("cpu","memory","battery"))
        p.drawText(QRectF(rect.x()+20,top+100,w-40,h-100),Qt.TextFlag.TextWordWrap,text)
    p.restore(); return rect


TEMPLATE='''import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Io
PanelWindow {
    id: panel
    property var config: CONFIG
    property var readings: ({})
    property var applications: APPLICATIONS
    property bool expanded: false
    property string page: "Stats"
    function reading(key) { return readings[key] ? readings[key].text : "Unavailable" }
    anchors.top: true
    margins.top: TOP
    screen: Quickshell.screens.find(s => s.name === MONITOR) ?? Quickshell.screens[0]
    implicitWidth: expanded ? config.expanded_width : config.width
    implicitHeight: expanded ? config.expanded_height : config.height
    Behavior on implicitWidth { NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }
    Behavior on implicitHeight { NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }
    color: "transparent"
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.layer: WlrLayer.Top
    WlrLayershell.namespace: "ricing-town-island"
    IpcHandler {
        target: "island"
        function toggle(): void { panel.expanded = !panel.expanded }
        function openPage(name: string): void {
            if (["Stats","Media","Apps"].indexOf(name) !== -1) { panel.page=name; panel.expanded=true }
        }
        function collapse(): void { panel.expanded=false }
    }
    FileView {
        path: READINGS
        watchChanges: true
        onFileChanged: reload()
        onLoaded: { try { panel.readings = JSON.parse(text()) } catch (e) {} }
    }
    Rectangle {
        anchors.fill: parent; color: panel.config.background; radius: panel.config.radius; clip: true
        Text {
            width: parent.width; height: panel.config.height
            horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter
            text: panel.reading("time") + (panel.expanded ? "  ·  ⌃" : "  ·  ⌄")
            color: panel.config.text; font.pixelSize: 16; textFormat: Text.PlainText
            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: panel.expanded = !panel.expanded }
        }
        Item {
            x: 18; y: panel.config.height+10; width: parent.width-36; height: parent.height-y-14
            visible: panel.expanded
            Row {
                spacing: 8
                Repeater {
                    model: ["Stats", "Media", "Apps"]
                    Rectangle {
                        required property string modelData
                        width: 82; height: 30; radius: 10
                        color: panel.page === modelData ? panel.config.accent : "#343b4d"
                        Text { anchors.centerIn: parent; text: parent.modelData; color: panel.page === parent.modelData ? panel.config.background : panel.config.text; font.pixelSize: 13 }
                        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: panel.page = parent.modelData }
                    }
                }
            }
            Column {
                y: 46; spacing: 12; visible: panel.page === "Stats"
                Repeater {
                    model: ["cpu","memory","battery"]
                    Text { required property string modelData; text: modelData.toUpperCase()+"   "+panel.reading(modelData); textFormat: Text.PlainText; color: panel.config.text; font.pixelSize: 14 }
                }
            }
            Column {
                y: 46; width: parent.width; spacing: 14; visible: panel.page === "Media"
                Text { width: parent.width; text: panel.reading("media"); textFormat: Text.PlainText; color: panel.config.text; font.pixelSize: 14; elide: Text.ElideRight }
                Row {
                    id: mediaButtons
                    spacing: 12
                    Repeater {
                        model: [{label:"Previous",action:"previous"},{label:"Play / pause",action:"play-pause"},{label:"Next",action:"next"}]
                        Rectangle {
                            required property var modelData
                            width: (mediaButtons.parent.width-24)/3; height: 36; radius: 10; color: "#343b4d"
                            Text { anchors.centerIn: parent; text: parent.modelData.label; color: panel.config.text; font.pixelSize: 12 }
                            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: Quickshell.execDetached(["playerctl",parent.modelData.action]) }
                        }
                    }
                }
            }
            Flickable {
                y: 42; width: parent.width; height: parent.height-42; clip: true
                contentHeight: appColumn.height; visible: panel.page === "Apps"
                Column {
                    id: appColumn; width: parent.width; spacing: 5
                    Repeater {
                        model: panel.applications
                        Rectangle {
                            required property var modelData
                            width: appColumn.width; height: 32; radius: 8; color: "#343b4d"
                            Text { anchors.fill: parent; anchors.margins: 6; text: parent.modelData.name; textFormat: Text.PlainText; color: panel.config.text; font.pixelSize: 13; elide: Text.ElideRight }
                            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: { Quickshell.execDetached(["gtk-launch",parent.modelData.id]); panel.expanded=false } }
                        }
                    }
                    Text { visible: panel.applications.length === 0; text: "Choose applications in the Waybar tab"; color: panel.config.text; font.pixelSize: 12 }
                }
            }
        }
    }
}
'''


def render_island(scene,readings,installed):
    cfg=validate_island(scene.island)
    apps=[{"id":app,"name":installed[app]["name"]} for app in scene.bar_apps if app in installed]
    top=cfg["top"]+(scene.bar_height+scene.bar_margin if scene.bar_enabled and scene.bar_position=="top" else 0)
    # One-pass replacement: user strings containing placeholder words remain literal.
    import re
    values={"CONFIG":cfg,"APPLICATIONS":apps,"TOP":top,"MONITOR":scene.monitor,"READINGS":str(readings)}
    return re.sub(r'\b(CONFIG|APPLICATIONS|TOP|MONITOR|READINGS)\b',lambda m:json.dumps(values[m[0]],ensure_ascii=True),TEMPLATE)


def render_wallpaper(path,monitor):
    return '''import QtQuick
import Quickshell
import Quickshell.Wayland
PanelWindow {
    anchors { top: true; bottom: true; left: true; right: true }
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.layer: WlrLayer.Background
    WlrLayershell.namespace: "ricing-town-wallpaper"
    screen: Quickshell.screens.find(s => s.name === %s) ?? Quickshell.screens[0]
    color: "#10131c"
    Image { anchors.fill: parent; source: %s; fillMode: Image.PreserveAspectCrop }
}
''' % (json.dumps(monitor),json.dumps(path.resolve().as_uri()))
