from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

from PySide6.QtCore import QStandardPaths
from PySide6.QtNetwork import QLocalServer, QLocalSocket


VALID_COMMANDS = frozenset({"show", "hide", "toggle", "quit"})


def valid_command(command):
    if command in VALID_COMMANDS:
        return True
    if not command.startswith("rice ") or len(command) > 512 or "\n" in command or "\r" in command:
        return False
    try:
        url = urlparse(command[5:])
        return (url.scheme == "https" and url.hostname == "github.com"
                and not url.username and url.port is None and not url.query and not url.fragment
                and len(url.path.strip("/").split("/")) >= 2)
    except ValueError:
        return False


def socket_name() -> str:
    runtime = QStandardPaths.writableLocation(QStandardPaths.RuntimeLocation)
    if not runtime:
        runtime = f"/tmp/ricing-town-{os.getuid()}"
        Path(runtime).mkdir(mode=0o700, exist_ok=True)
    return str(Path(runtime) / "ricing-town-desktop.sock")


def send_command(command: str, timeout_ms: int = 800) -> bool:
    if not valid_command(command):
        raise ValueError(f"unsupported command: {command}")
    client = QLocalSocket()
    client.connectToServer(socket_name())
    if not client.waitForConnected(timeout_ms):
        return False
    client.write((command + "\n").encode())
    client.flush()
    if client.bytesToWrite() and not client.waitForBytesWritten(timeout_ms):
        return False
    client.waitForReadyRead(timeout_ms)
    return bytes(client.readAll()).strip() == b"ok"


class CommandServer(QLocalServer):
    def __init__(self, handler):
        super().__init__()
        self._handler = handler
        self.newConnection.connect(self._accept)

    def start(self) -> bool:
        name = socket_name()
        if self.listen(name):
            self._secure_socket(name)
            return True
        probe = QLocalSocket()
        probe.connectToServer(name)
        if probe.waitForConnected(200):
            return False
        QLocalServer.removeServer(name)
        ok = self.listen(name)
        if ok:
            self._secure_socket(name)
        return ok

    @staticmethod
    def _secure_socket(name: str) -> None:
        try:
            os.chmod(name, 0o600)
        except OSError:
            pass

    def _accept(self):
        while self.hasPendingConnections():
            conn = self.nextPendingConnection()
            if conn is None:
                return
            if not conn.waitForReadyRead(500):
                conn.disconnectFromServer()
                continue
            command = bytes(conn.readAll()).decode(errors="replace").strip()
            if valid_command(command):
                self._handler(command)
                conn.write(b"ok\n")
            else:
                conn.write(b"error\n")
            conn.flush()
            conn.waitForBytesWritten(300)
            conn.disconnectFromServer()
