"""Narrow, app-owned desktop integration. No user configuration edits."""
import configparser
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

from PySide6.QtCore import QObject, QProcess, QProcessEnvironment, QTimer, Signal
from .widgets import DataSources, atomic_json
from .widget_runtime import render_qml


def hypr(*args):
    result = subprocess.run(["hyprctl", *args], capture_output=True, text=True, timeout=2)
    if result.returncode or result.stdout.startswith("error:"):
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout


def focus_workspace(workspace):
    try:
        return hypr("dispatch", "hl.dsp.focus({workspace=" + json.dumps(workspace) + "})")
    except RuntimeError:
        return hypr("dispatch", "workspace", str(workspace))


def monitors():
    try:
        return json.loads(hypr("monitors", "-j"))
    except (OSError, ValueError, subprocess.TimeoutExpired, RuntimeError):
        return []


def float_palette(width, height, title="Ricing Town"):
    """Address only this process's Ricing Town window; never an arbitrary window."""
    try:
        clients = json.loads(hypr("clients", "-j"))
        for client in clients:
            if client.get("pid") == os.getpid() and client.get("title") == title:
                target = "address:" + client["address"]
                try:
                    hypr("dispatch", 'hl.dsp.window.float({window=' + json.dumps(target) + ', action="on"})')
                    hypr("dispatch", 'hl.dsp.window.resize({window=' + json.dumps(target) + f', x={width}, y={height}, relative=false' + '})')
                    if not client.get("floating"):
                        monitor = next((m for m in monitors() if m["id"] == client.get("monitor")), None)
                        if monitor:
                            x = monitor["x"] + max(0, int((monitor["width"]/monitor["scale"]-width)/2))
                            y = monitor["y"] + max(0, int((monitor["height"]/monitor["scale"]-height)/2))
                            hypr("dispatch", 'hl.dsp.window.move({window=' + json.dumps(target) + f', x={x}, y={y}, relative=false' + '})')
                except RuntimeError:
                    hypr("dispatch", "setfloating", target)
                    hypr("dispatch", "resizewindowpixel", f"exact {width} {height},{target}")
                return True
    except (OSError, ValueError, subprocess.TimeoutExpired, RuntimeError):
        pass
    return False


def application_details():
    result = {}
    roots = [Path(os.environ.get("XDG_DATA_HOME", Path.home()/".local/share"))]
    roots += [Path(p) for p in os.environ.get("XDG_DATA_DIRS", "/usr/local/share:/usr/share").split(":")]
    for root in roots:
        for file in sorted((root / "applications").glob("*.desktop")):
            if file.name in result:
                continue
            try:
                parser = configparser.ConfigParser(interpolation=None, strict=False)
                parser.read(file, encoding="utf-8")
                entry = parser["Desktop Entry"]
                if entry.get("Type") != "Application" or entry.get("NoDisplay") == "true" or entry.get("Hidden") == "true":
                    continue
                result[file.name] = {"name": entry.get("Name", file.stem), "icon": entry.get("Icon", "")}
            except (OSError, configparser.Error, KeyError):
                continue
    return result


def applications():
    return {key: value["name"] for key, value in application_details().items()}


def bar_files(scene, monitor_width, installed):
    from .bar import build_files
    return build_files(scene, monitor_width, installed, Path.cwd() / "bar-assets")




class DesktopProcesses(QObject):
    status = Signal(str)

    def __init__(self, directory, parent=None):
        super().__init__(parent)
        self.directory = directory
        self.processes = {}
        self.sources = DataSources()
        self.readings_timer = QTimer(self)
        self.readings_timer.setInterval(1000)
        self.readings_timer.timeout.connect(self.update_readings)

    def update_readings(self):
        try: atomic_json(self.directory / "readings.json", self.sources.sample())
        except OSError as exc: self.status.emit(f"Widget data update failed: {exc}")

    def stop(self, key):
        proc = self.processes.pop(key, None)
        if proc:
            proc.terminate()
            if not proc.waitForFinished(1200):
                proc.kill(); proc.waitForFinished(500)

    def start(self, key, command, args):
        if not shutil.which(command):
            raise RuntimeError(f"{command} is not installed")
        self.stop(key)
        proc = QProcess(self)
        environment = QProcessEnvironment.systemEnvironment()
        environment.insert("GDK_BACKEND", "wayland")
        proc.setProcessEnvironment(environment)
        proc.setStandardErrorFile(str(self.directory / f"{key}.log"))
        proc.setStandardOutputFile(str(self.directory / f"{key}.log"), QProcess.OpenModeFlag.Append)
        proc.start(command, args)
        if not proc.waitForStarted(1500):
            raise RuntimeError(proc.errorString())
        self.processes[key] = proc
        proc.finished.connect(lambda code, _status: self.status.emit(f"{key} stopped (exit {code}); see {self.directory / (key + '.log')}") if code else None)
        QTimer.singleShot(1200, lambda: self.status.emit(f"{key} running on desktop") if proc.state() == QProcess.ProcessState.Running else None)

    def apply(self, scene, monitor_width):
        from .island import validate_island, render_island, render_wallpaper
        island=validate_island(scene.island)
        wallpaper=None
        if scene.wallpaper:
            wallpaper=Path(scene.wallpaper).resolve()
            if wallpaper.parent!=(self.directory.parent/"assets").resolve() or not wallpaper.is_file():
                raise ValueError("Wallpaper must be an imported app-owned asset")
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        widget_qml = render_qml(scene.widgets, self.directory / "readings.json", scene.monitor)
        if scene.bar_enabled:
            from .bar import build_files, write_assets
            details = application_details()
            assets = self.directory / "bar-assets"
            config, css = build_files(scene, monitor_width, details, assets)
            write_assets(scene, details, assets)
            (self.directory / "waybar.json").write_text(config)
            (self.directory / "waybar.css").write_text(css)
            self.start("waybar", "waybar", ["-c", str(self.directory / "waybar.json"), "-s", str(self.directory / "waybar.css")])
        else:
            self.stop("waybar")
        if scene.clock_enabled:
            if not re.fullmatch(r"#[0-9a-fA-F]{6}", scene.clock_color):
                raise ValueError("Invalid clock color")
            qml = '''import QtQuick
import Quickshell
import Quickshell.Wayland
PanelWindow {
    anchors { top: true; left: true }
    WlrLayershell.layer: WlrLayer.Bottom
    WlrLayershell.namespace: "ricing-town-clock"
    exclusionMode: ExclusionMode.Ignore
    color: "transparent"
    implicitWidth: clock.implicitWidth + 20
    implicitHeight: clock.implicitHeight + 20
    margins { top: CLOCK_Y; left: CLOCK_X }
    screen: Quickshell.screens.find(s => s.name === MONITOR) ?? Quickshell.screens[0]
    Text {
        id: clock
        anchors.centerIn: parent
        color: CLOCK_COLOR
        font.pixelSize: CLOCK_SIZE
        text: Qt.formatDateTime(new Date(), "hh:mm\\nddd, dd MMM")
        Timer { interval: 1000; running: true; repeat: true; onTriggered: clock.text = Qt.formatDateTime(new Date(), "hh:mm\\nddd, dd MMM") }
    }
}
'''
            for token, value in {"CLOCK_X": max(0, scene.clock_x), "CLOCK_Y": max(0, scene.clock_y),
                                 "CLOCK_COLOR": scene.clock_color, "CLOCK_SIZE": scene.clock_size, "MONITOR": scene.monitor}.items():
                qml = qml.replace(token, json.dumps(value))
            path = self.directory / "clock.qml"
            path.write_text(qml)
            self.start("clock", "quickshell", ["-p", str(path)])
        else:
            self.stop("clock")
        if scene.widgets:
            self.update_readings()
            path=self.directory / "widgets.qml"
            path.write_text(widget_qml,encoding="utf-8")
            self.start("widgets", "quickshell", ["-p",str(path)])
        else:
            self.stop("widgets")
        if island["enabled"]:
            self.update_readings()
            path=self.directory/"island.qml"
            path.write_text(render_island(scene,self.directory/"readings.json",application_details()),encoding="utf-8")
            self.start("island","quickshell",["-p",str(path)])
        else: self.stop("island")
        if wallpaper:
            path=self.directory/"wallpaper.qml";path.write_text(render_wallpaper(wallpaper,scene.monitor),encoding="utf-8")
            self.start("wallpaper","quickshell",["-p",str(path)])
        else: self.stop("wallpaper")
        if scene.widgets or island["enabled"]: self.readings_timer.start()
        else: self.readings_timer.stop()

    def close(self):
        self.readings_timer.stop()
        for key in list(self.processes):
            self.stop(key)
