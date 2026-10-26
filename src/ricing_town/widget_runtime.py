"""Trusted Quickshell renderer. Imports only validated data, never imported QML."""
import json
from .widgets import validate_widget

TEMPLATE = '''import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Io
ShellRoot {
    id: root
    property var readings: ({})
    FileView {
        id: readingsFile
        path: READINGS_PATH
        watchChanges: true
        onFileChanged: reload()
        onLoaded: { try { root.readings = JSON.parse(text()) } catch (e) {} }
    }
    Variants {
        model: DEFINITIONS
        PanelWindow {
            id: panel
            required property var modelData
            anchors { top: true; left: true }
            margins { left: modelData.x; top: modelData.y }
            screen: Quickshell.screens.find(s => s.name === modelData.monitor) ?? Quickshell.screens[0]
            implicitWidth: modelData.width
            implicitHeight: modelData.height
            color: "transparent"
            exclusionMode: ExclusionMode.Ignore
            WlrLayershell.layer: WlrLayer.Bottom
            WlrLayershell.namespace: "ricing-town-widget-" + modelData.id
            Rectangle {
                anchors.fill: parent
                color: panel.modelData.background
                radius: panel.modelData.radius
                clip: true
                Repeater {
                    model: panel.modelData.elements
                    Item {
                        id: part
                        required property var modelData
                        property var reading: root.readings[modelData.source] ?? ({text:"Unavailable", value:0})
                        x: modelData.x; y: modelData.y
                        width: modelData.width; height: modelData.height
                        clip: true
                        Rectangle {
                            anchors.fill: parent
                            visible: part.modelData.kind !== "text"
                            color: part.modelData.kind === "progress" ? "#454957" : part.modelData.color
                            radius: part.modelData.kind === "progress" ? 4 : part.modelData.radius
                        }
                        Rectangle {
                            visible: part.modelData.kind === "progress"
                            width: parent.width * Math.max(0, Math.min(100, part.reading.value)) / 100
                            height: parent.height
                            radius: 4
                            color: part.modelData.color
                        }
                        Text {
                            anchors.fill: parent
                            visible: part.modelData.kind === "text"
                            text: part.modelData.source === "text" ? part.modelData.text : part.reading.text
                            textFormat: Text.PlainText
                            wrapMode: Text.WordWrap
                            color: part.modelData.color
                            font.pixelSize: part.modelData.size
                            font.family: part.modelData.source === "calendar" ? "Monospace" : "Sans"
                        }
                    }
                }
            }
        }
    }
}
'''


def render_qml(widgets, readings_path, monitor=""):
    validated=[validate_widget(w) for w in widgets]
    for w in validated:
        if not w["monitor"]: w["monitor"]=monitor
    # Replace definitions last so literal user text can never be rewritten as code.
    return TEMPLATE.replace("READINGS_PATH",json.dumps(str(readings_path))).replace("DEFINITIONS",json.dumps(validated,ensure_ascii=True))
