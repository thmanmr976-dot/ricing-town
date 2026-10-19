// Shared export source: kept separate from shell generation so every export path
// includes the same native menu without fetching another runtime template.
export const powerMenuQml = `import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Wayland

PanelWindow {
    id: menu
    required property var runtime
    visible: runtime.powerVisible
    color: "transparent"
    anchors { left: true; right: true; top: true; bottom: true }
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.namespace: "ricing-town-power"
    WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
    onVisibleChanged: if (visible) surface.forceActiveFocus()

    Rectangle {
        id: surface
        anchors.fill: parent
        focus: true
        gradient: Gradient {
            GradientStop { position: 0; color: "#f7eee9df" }
            GradientStop { position: 1; color: "#f2d9d0c2" }
        }
        Keys.onEscapePressed: event => { menu.runtime.cancelPower(true); event.accepted = true }

        Item {
            anchors { top: parent.top; topMargin: Math.max(24, parent.height * .05); horizontalCenter: parent.horizontalCenter }
            width: Math.min(620, parent.width - 44)
            height: 40
            Text {
                anchors { left: parent.left; verticalCenter: parent.verticalCenter }
                text: "PAPER CALM · SESSION"
                font { pixelSize: 10; family: "monospace"; letterSpacing: 2.4; bold: true }
                color: "#8b5e3c"
            }
            Button {
                id: closeButton
                anchors { right: parent.right; verticalCenter: parent.verticalCenter }
                width: 40; height: 40
                text: "×"
                Accessible.name: "Close power menu"
                enabled: !menu.runtime.powerBusy
                onClicked: menu.runtime.cancelPower(true)
                background: Rectangle { color: closeButton.hovered || closeButton.activeFocus ? "#25a78d76" : "transparent"; radius: 8 }
                contentItem: Text { text: closeButton.text; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter; color: "#5f554b"; font.pixelSize: 27 }
            }
        }
        Column {
            id: content
            anchors.centerIn: parent
            width: Math.min(620, parent.width - 44)
            spacing: 12
            Text {
                width: parent.width
                text: menu.runtime.pendingPower ? "Are you sure?" : "Take a quiet pause."
                color: "#34312d"
                font { family: "serif"; pixelSize: menu.width < 650 ? 31 : 42 }
                wrapMode: Text.Wrap
            }
            Text {
                width: parent.width
                text: menu.runtime.powerBusy ? "Requesting the session action…" : menu.runtime.pendingPower ? "Press the selected action again to confirm. Save any work first." : "Choose what happens to this session."
                color: "#756b61"; font.pixelSize: 13
                wrapMode: Text.Wrap
            }
            Item { width: 1; height: 6 }
            Grid {
                id: choices
                width: parent.width
                columns: menu.width < 650 ? 2 : 4
                spacing: 12
                Repeater {
                    model: [
                        { symbol: "◇", label: "Lock", command: "lock" },
                        { symbol: "☾", label: "Sleep", command: "suspend" },
                        { symbol: "↻", label: "Restart", command: "reboot" },
                        { symbol: "⏻", label: "Shut down", command: "shutdown" }
                    ]
                    Button {
                        id: choice
                        required property var modelData
                        property bool selected: menu.runtime.pendingPower === modelData.command
                        width: (choices.width - choices.spacing * (choices.columns - 1)) / choices.columns
                        height: menu.height < 700 ? 110 : 150
                        enabled: !menu.runtime.powerBusy
                        Accessible.name: modelData.label
                        onClicked: menu.runtime.choosePower(modelData.command)
                        background: Rectangle {
                            radius: 16
                            color: choice.selected ? "#8b5e3c" : choice.hovered || choice.activeFocus ? "#fffaf0" : "#80f8f4ec"
                            border { width: choice.activeFocus ? 2 : 1; color: choice.selected ? "#8b5e3c" : "#80a78d76" }
                            Behavior on color { ColorAnimation { duration: 150 } }
                        }
                        contentItem: Column {
                            spacing: 13
                            topPadding: Math.max(12, (choice.height - 72) / 2)
                            Text { width: parent.width; horizontalAlignment: Text.AlignHCenter; text: choice.modelData.symbol; color: choice.selected ? "#fff8ef" : "#8b5e3c"; font.pixelSize: 31 }
                            Text { width: parent.width; horizontalAlignment: Text.AlignHCenter; text: (choice.selected ? "Confirm " : "") + choice.modelData.label; color: choice.selected ? "#fff8ef" : "#51483f"; font.pixelSize: 12 }
                        }
                    }
                }
            }
            Text {
                width: parent.width
                visible: text.length > 0
                text: menu.runtime.powerError
                color: "#9d3530"; font.pixelSize: 13
                wrapMode: Text.Wrap
                Accessible.role: Accessible.AlertMessage
                Accessible.name: text
            }
            Button {
                id: cancelButton
                anchors.horizontalCenter: parent.horizontalCenter
                width: 150; height: 42
                text: menu.runtime.pendingPower ? "Go back" : "Cancel"
                Accessible.name: "Cancel power action"
                enabled: !menu.runtime.powerBusy
                onClicked: menu.runtime.cancelPower()
                background: Rectangle { color: cancelButton.hovered || cancelButton.activeFocus ? "#25a78d76" : "transparent"; radius: 8 }
                contentItem: Text { text: cancelButton.text; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter; color: "#74685e"; font.pixelSize: 13 }
            }
        }
    }
}
`;
