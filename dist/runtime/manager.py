#!/usr/bin/env python3
"""Local, package-scoped Ricing Town installer UI."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import html, json, os, secrets, shutil, subprocess, threading, time, webbrowser

ROOT = Path(__file__).resolve().parent
TOKEN = secrets.token_urlsafe(24)
PROCESS = None
LOCK = threading.Lock()
def markers(cfg):
    prefix = "--" if cfg.suffix == ".lua" else "#"
    return f"{prefix} RICING TOWN BEGIN", f"{prefix} RICING TOWN END"

def manifest():
    return json.loads((ROOT / "manifest.json").read_text())

def config_root():
    return Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))

def hypr_config():
    base = config_root() / "hypr"
    lua, legacy = base / "hyprland.lua", base / "hyprland.conf"
    return lua if lua.exists() or not legacy.exists() else legacy

def shell_command(installed=False):
    base = (config_root() / "ricing-town") if installed else ROOT
    kind = manifest().get("integrations", {}).get("shell", "quickshell")
    if kind == "waybar":
        return ["waybar", "-c", str(base / "config/waybar/config.jsonc"), "-s", str(base / "config/waybar/style.css")]
    return ["sh", str(base / f"config/{'hybrid' if kind == 'hybrid' else 'quickshell'}/start.sh")]

def dependency_status():
    required = ["Hyprland", "hyprctl", "python3"]
    shell = manifest().get("integrations", {}).get("shell", "quickshell")
    required += ["waybar"] if shell == "waybar" else ["qs"]
    optional = ["wpctl", "playerctl", "nmcli", "bluetoothctl", "swaync-client", "hyprlock", "nvidia-smi"]
    return [(name, bool(shutil.which(name)), name in required) for name in required + optional]

def start_temporary():
    global PROCESS
    with LOCK:
        if PROCESS and PROCESS.poll() is None:
            return "The temporary rice is already running."
        cmd = shell_command(False)
        if not shutil.which(cmd[0]):
            raise RuntimeError(f"Missing required program: {cmd[0]}")
        PROCESS = subprocess.Popen(cmd, cwd=ROOT, start_new_session=True)
        lua = ROOT / "config/hyprland/ricing-town.lua"
        if shutil.which("hyprctl") and lua.exists():
            subprocess.run(["hyprctl", "eval", f'dofile({json.dumps(str(lua))})'], timeout=8, check=False)
        return "Temporary rice started. Stop restores Hyprland settings by reloading your normal config."

def stop_temporary():
    global PROCESS
    with LOCK:
        if PROCESS and PROCESS.poll() is None:
            PROCESS.terminate()
            try: PROCESS.wait(4)
            except subprocess.TimeoutExpired: PROCESS.kill()
        PROCESS = None
    if shutil.which("hyprctl"):
        subprocess.run(["hyprctl", "reload"], timeout=8, check=False)
    return "Temporary rice stopped and the normal Hyprland config was reloaded."

def install_permanent():
    target = config_root() / "ricing-town"
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        target.rename(target.with_name(f"ricing-town.backup-{time.strftime('%Y%m%d-%H%M%S')}"))
    target.mkdir()
    for name in ("config", "assets"):
        shutil.copytree(ROOT / name, target / name)
    for name in ("project.rce", "manifest.json"):
        shutil.copy2(ROOT / name, target / name)
    cfg = hypr_config(); cfg.parent.mkdir(parents=True, exist_ok=True)
    text = cfg.read_text() if cfg.exists() else ""
    mark_begin, mark_end = markers(cfg)
    if mark_begin not in text:
        if cfg.suffix == ".lua":
            line = 'dofile(os.getenv("HOME") .. "/.config/ricing-town/config/hyprland/ricing-town.lua")'
        else:
            line = "source = ~/.config/ricing-town/config/hyprland/ricing-town.conf"
        cfg.write_text(text.rstrip() + f"\n\n{mark_begin}\n{line}\n{mark_end}\n")
    if shutil.which("hyprctl"):
        subprocess.run(["hyprctl", "reload"], timeout=8, check=False)
    start_installed()
    return f"Installed to {target} and enabled from {cfg}."

def start_installed():
    global PROCESS
    with LOCK:
        if PROCESS and PROCESS.poll() is None: PROCESS.terminate()
        cmd = shell_command(True)
        if shutil.which(cmd[0]): PROCESS = subprocess.Popen(cmd, start_new_session=True)

def restore():
    stop_temporary()
    target = config_root() / "ricing-town"
    backups = sorted(target.parent.glob("ricing-town.backup-*"))
    cfg = hypr_config()
    if cfg.exists() and not backups:
        mark_begin, mark_end = markers(cfg)
        text = cfg.read_text(); start = text.find(mark_begin); end = text.find(mark_end)
        if start >= 0 and end >= start:
            cfg.write_text((text[:start] + text[end + len(mark_end):]).strip() + "\n")
    if target.exists(): shutil.rmtree(target)
    if backups:
        backups[-1].rename(target)
        start_installed()
    if shutil.which("hyprctl"): subprocess.run(["hyprctl", "reload"], timeout=8, check=False)
    return "The newest package backup was restored." if backups else "Ricing Town integration was removed."

def page(message=""):
    rows = "".join(f"<li class={'ok' if ok else ('bad' if req else 'warn')}>{html.escape(name)} — {'ready' if ok else ('required' if req else 'optional')}</li>" for name,ok,req in dependency_status())
    running = PROCESS is not None and PROCESS.poll() is None
    return f"""<!doctype html><html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Ricing Town Manager</title>
<style>body{{font:16px system-ui;background:#11131a;color:#eee;margin:0}}main{{max-width:760px;margin:6vh auto;padding:28px}}.card{{background:#1d2029;border:1px solid #343947;border-radius:18px;padding:22px;margin:18px 0}}button{{border:0;border-radius:10px;padding:12px 16px;margin:6px;background:#cba6f7;color:#18131d;font-weight:700}}button.secondary{{background:#343947;color:#eee}}button.danger{{background:#f38ba8}}li{{margin:7px}}.ok{{color:#a6e3a1}}.bad{{color:#f38ba8}}.warn{{color:#f9e2af}}.msg{{color:#89dceb}}code{{color:#cba6f7}}</style>
<main><h1>Ricing Town Manager</h1><p>Paper Calm · {'running temporarily' if running else 'not running temporarily'}</p>{f'<p class=msg>{html.escape(message)}</p>' if message else ''}
<section class=card><h2>Temporary session</h2><p>Applies the rice for this session. Stop reloads your normal Hyprland configuration.</p><form method=post action='/temporary/start'><input type=hidden name=token value='{TOKEN}'><button>Start temporarily</button></form><form method=post action='/temporary/stop'><input type=hidden name=token value='{TOKEN}'><button class=secondary>Stop temporary rice</button></form></section>
<section class=card><h2>Permanent installation</h2><p>Creates a timestamped backup, installs into <code>~/.config/ricing-town</code>, adds a marked include block, then reloads Hyprland.</p><form method=post action='/install' onsubmit="return confirm('Install and enable this rice permanently?')"><input type=hidden name=token value='{TOKEN}'><button>Install permanently</button></form><form method=post action='/restore' onsubmit="return confirm('Remove the integration and restore the newest package backup?')"><input type=hidden name=token value='{TOKEN}'><button class=danger>Restore previous rice</button></form></section>
<section class=card><h2>Compatibility check</h2><ul>{rows}</ul><p>Optional services remain visibly unavailable when missing; they are never replaced with demo data.</p></section></main></html>"""

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def send_page(self, message="", status=200):
        body=page(message).encode(); self.send_response(status); self.send_header("Content-Type","text/html; charset=utf-8"); self.send_header("Content-Length",str(len(body))); self.send_header("Cache-Control","no-store"); self.send_header("Content-Security-Policy","default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'"); self.end_headers(); self.wfile.write(body)
    def do_GET(self): self.send_page() if urlparse(self.path).path=="/" else self.send_error(404)
    def do_POST(self):
        length=min(int(self.headers.get("Content-Length","0")),4096); data=parse_qs(self.rfile.read(length).decode())
        if not secrets.compare_digest(data.get("token",[""])[0],TOKEN): return self.send_page("Invalid session token.",403)
        actions={"/temporary/start":start_temporary,"/temporary/stop":stop_temporary,"/install":install_permanent,"/restore":restore}
        try: message=actions[urlparse(self.path).path]()
        except KeyError: return self.send_error(404)
        except Exception as exc: message=f"Action failed: {exc}"
        self.send_page(message)

if __name__ == "__main__":
    server=ThreadingHTTPServer(("127.0.0.1",0),Handler); url=f"http://127.0.0.1:{server.server_port}/"
    print(f"Ricing Town Manager: {url}"); webbrowser.open(url)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: stop_temporary(); server.server_close()
