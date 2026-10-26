from __future__ import annotations

import argparse
import sys

from PySide6.QtCore import QTimer
from PySide6.QtGui import QGuiApplication
from PySide6.QtWidgets import QApplication

from .ipc import CommandServer, send_command
from .state import StateStore
from .ui import Palette


def parser():
    p = argparse.ArgumentParser(prog="ricing-town")
    group = p.add_mutually_exclusive_group()
    group.add_argument("--show", action="store_const", dest="command", const="show")
    group.add_argument("--hide", action="store_const", dest="command", const="hide")
    group.add_argument("--toggle", action="store_const", dest="command", const="toggle")
    group.add_argument("--quit", action="store_const", dest="command", const="quit")
    group.add_argument("--rice-run", metavar="GITHUB_URL", help="Inspect, cache and run a GitHub Rice in isolated mode")
    return p


def main(argv=None):
    args = parser().parse_args(argv)
    QApplication.setApplicationName("Ricing Town")
    QApplication.setDesktopFileName("io.ricingtown.Desktop")
    app = QApplication(sys.argv[:1]); app.setQuitOnLastWindowClosed(False)
    command = "rice " + args.rice_run if args.rice_run else args.command or "show"
    if send_command(command):
        return 0
    if command in {"hide", "quit"}:
        print("Ricing Town is not running", file=sys.stderr); return 1
    window = Palette(StateStore())
    def handle(cmd):
        if cmd == "show": window.show_studio()
        elif cmd == "hide": window.minimize_to_launcher()
        elif cmd == "toggle": window.minimize_to_launcher() if window.isVisible() else handle("show")
        elif cmd == "quit": window.quit_app()
        elif cmd.startswith("rice "):
            window.show_studio()
            window.rice_panel.run_online(cmd[5:])
    server = CommandServer(handle)
    if not server.start():
        print("Unable to create the local controller socket", file=sys.stderr); return 2
    QTimer.singleShot(0, lambda: handle(command))
    return app.exec()


if __name__ == "__main__": raise SystemExit(main())
