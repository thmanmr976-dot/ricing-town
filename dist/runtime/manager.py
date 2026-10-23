#!/usr/bin/env python3
"""Local, package-scoped Ricing Town installer UI."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import html, json, os, re, secrets, shutil, signal, subprocess, sys, threading, time, webbrowser

ROOT = Path(__file__).resolve().parent
TOKEN = secrets.token_urlsafe(24)
PROCESS = None
SERVER = None
LOCK = threading.Lock()
def markers(cfg):
    prefix = "--" if cfg.suffix == ".lua" else "#"
    return f"{prefix} RICING TOWN BEGIN", f"{prefix} RICING TOWN END"

def manifest():
    return json.loads((ROOT / "manifest.json").read_text())

def project_name():
    try:
        rce = json.loads((ROOT / "project.rce").read_text())
        if isinstance(rce.get("name"), str) and rce["name"].strip():
            return rce["name"].strip()
    except Exception:
        pass
    return "Ricing Town Project"

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

def _find_temp_shell_pids(include_all_temp=False):
    my_pid = os.getpid()
    parent_pid = os.getppid()
    root_str = str(ROOT)
    pids = set()
    if shutil.which("qs"):
        try:
            out = subprocess.run(["qs", "list", "--all"], capture_output=True, text=True, timeout=4, check=False).stdout
            current_pid = None
            for line in out.splitlines():
                m = re.search(r"Process ID:\s*(\d+)", line)
                if m:
                    current_pid = int(m.group(1))
                elif "Config path:" in line and current_pid:
                    if root_str in line or (include_all_temp and "/ricing-town-" in line):
                        pids.add(current_pid)
        except Exception:
            pass
    proc = Path("/proc")
    if proc.is_dir():
        for entry in proc.iterdir():
            if not entry.name.isdigit():
                continue
            pid = int(entry.name)
            if pid in (my_pid, parent_pid):
                continue
            try:
                cmdline = (entry / "cmdline").read_bytes().replace(b"\x00", b" ").decode("utf-8", "ignore")
            except Exception:
                continue
            if not cmdline or "manager.py" in cmdline or "rce-manager.mjs" in cmdline:
                continue
            if root_str in cmdline or (include_all_temp and "/ricing-town-" in cmdline):
                pids.add(pid)
    return pids

def _is_temporary_running():
    if PROCESS is not None and PROCESS.poll() is None:
        return True
    return len(_find_temp_shell_pids(include_all_temp=False)) > 0

def _terminate_running_temp(include_all_temp=True):
    global PROCESS
    if PROCESS and PROCESS.poll() is None:
        try:
            os.killpg(os.getpgid(PROCESS.pid), signal.SIGTERM)
        except Exception:
            try:
                PROCESS.terminate()
            except Exception:
                pass
        try:
            PROCESS.wait(2)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(PROCESS.pid), signal.SIGKILL)
            except Exception:
                try:
                    PROCESS.kill()
                except Exception:
                    pass
    PROCESS = None
    pids = _find_temp_shell_pids(include_all_temp=include_all_temp)
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            pass
    if pids:
        time.sleep(0.35)
        for pid in _find_temp_shell_pids(include_all_temp=include_all_temp):
            try:
                os.kill(pid, signal.SIGKILL)
            except Exception:
                pass

def start_temporary():
    global PROCESS
    with LOCK:
        if _is_temporary_running():
            _terminate_running_temp(include_all_temp=True)
        else:
            _terminate_running_temp(include_all_temp=True)
        cmd = shell_command(False)
        if not shutil.which(cmd[0]):
            raise RuntimeError(f"Missing required program: {cmd[0]}")
        PROCESS = subprocess.Popen(cmd, cwd=ROOT, start_new_session=True)
        lua = ROOT / "config/hyprland/ricing-town.lua"
        if shutil.which("hyprctl") and lua.exists():
            subprocess.run(["hyprctl", "eval", f'dofile({json.dumps(str(lua))})'], timeout=8, check=False)
        return "Temporary rice started. Stop restores Hyprland settings by reloading your normal config."

def stop_temporary():
    with LOCK:
        _terminate_running_temp(include_all_temp=True)
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
        _terminate_running_temp(include_all_temp=True)
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

def quit_manager():
    stop_temporary()
    if SERVER is not None:
        threading.Thread(target=SERVER.shutdown, daemon=True).start()
    return "Temporary rice stopped and Ricing Town Manager was closed."

def page(message=""):
    rows = "".join(f"<li class={'ok' if ok else ('bad' if req else 'warn')}>{html.escape(name)} — {'ready' if ok else ('required' if req else 'optional')}</li>" for name,ok,req in dependency_status())
    running = _is_temporary_running()
    title_name = html.escape(project_name())
    return f"""<!doctype html><html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Ricing Town Manager</title>
<style>body{{font:16px system-ui;background:#11131a;color:#eee;margin:0}}main{{max-width:760px;margin:6vh auto;padding:28px}}.card{{background:#1d2029;border:1px solid #343947;border-radius:18px;padding:22px;margin:18px 0}}form{{display:inline-block}}button{{border:0;border-radius:10px;padding:12px 16px;margin:6px;background:#cba6f7;color:#18131d;font-weight:700;cursor:pointer}}button.secondary{{background:#343947;color:#eee}}button.danger{{background:#f38ba8;color:#18131d}}li{{margin:7px}}.ok{{color:#a6e3a1}}.bad{{color:#f38ba8}}.warn{{color:#f9e2af}}.msg{{color:#89dceb}}code{{color:#cba6f7}}</style>
<main><h1>Ricing Town Manager</h1><p>{title_name} · {'running temporarily' if running else 'not running temporarily'}</p>{f'<p class=msg>{html.escape(message)}</p>' if message else ''}
<section class=card><h2>Temporary session</h2><p>Applies the rice for this session. Stop terminates all temporary shell windows and reloads your normal Hyprland configuration.</p><form method=post action='/temporary/start'><input type=hidden name=token value='{TOKEN}'><button>Start temporarily</button></form><form method=post action='/temporary/stop'><input type=hidden name=token value='{TOKEN}'><button class=secondary>Stop temporary rice</button></form><form method=post action='/temporary/quit'><input type=hidden name=token value='{TOKEN}'><button class=danger>Stop &amp; close manager</button></form></section>
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
        actions={"/temporary/start":start_temporary,"/temporary/stop":stop_temporary,"/temporary/quit":quit_manager,"/install":install_permanent,"/restore":restore}
        try: message=actions[urlparse(self.path).path]()
        except KeyError: return self.send_error(404)
        except Exception as exc: message=f"Action failed: {exc}"
        self.send_page(message)

if __name__ == "__main__":
    SERVER=ThreadingHTTPServer(("127.0.0.1",0),Handler); url=f"http://127.0.0.1:{SERVER.server_port}/"
    def _handle_sig(_signum, _frame):
        stop_temporary()
        sys.exit(0)
    for _sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        try: signal.signal(_sig, _handle_sig)
        except Exception: pass
    print(f"Ricing Town Manager: {url}"); webbrowser.open(url)
    try: SERVER.serve_forever()
    except KeyboardInterrupt: pass
    finally: stop_temporary(); SERVER.server_close()
