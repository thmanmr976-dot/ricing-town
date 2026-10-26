"""Explicit, opt-in execution of cached Rice entrypoints. Never runs installers."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import subprocess
import tempfile

from PySide6.QtCore import QObject, QTimer, Signal

from .rice import MAX_FILES, MAX_TOTAL, discover_experiences, safe_name
from .widgets import atomic_json


def package_hash(entries):
    digest=hashlib.sha256()
    for path,data in sorted(entries.items()):digest.update(path.encode());digest.update(b"\0");digest.update(data)
    return digest.hexdigest()


def cache_package(package,base):
    """Keep complete source in an owned cache, without interpreting anything."""
    if not package.entries or len(package.entries)>MAX_FILES or sum(map(len,package.entries.values()))>MAX_TOTAL:raise ValueError("Invalid package contents")
    if not re.fullmatch(r"[a-f0-9]{64}",package.digest) or package_hash(package.entries)!=package.digest:raise ValueError("Package checksum mismatch")
    base=Path(base);base.mkdir(parents=True,exist_ok=True,mode=0o700);target=base/package.digest
    if target.exists():verify_cache(target);return target
    temporary=Path(tempfile.mkdtemp(prefix="staging-",dir=base))
    try:
        inventory={}
        for name,data in package.entries.items():
            name=safe_name(name);path=temporary/"source"/name;path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            path.write_bytes(data);path.chmod(0o400)
            inventory[name]=hashlib.sha256(data).hexdigest()
        runtimes=[c.payload for c in discover_experiences(package.entries) if c.kind=="runtime"]
        atomic_json(temporary/"package.json",{"name":package.name,"source":package.source,"digest":package.digest,"inventory":inventory,"runtimes":runtimes,"licenses":package.licenses,"warnings":package.warnings})
        temporary.rename(target)
    except Exception:
        # Only the exact fresh staging directory created above is discarded.
        shutil.rmtree(temporary)
        raise
    return target


def verify_cache(root):
    root=Path(root)
    if root.is_symlink() or (root/"package.json").is_symlink():raise ValueError("Cache must not contain links")
    meta=json.loads((root/"package.json").read_text())
    if not isinstance(meta.get("inventory"),dict) or len(meta["inventory"])>MAX_FILES:raise ValueError("Invalid cache inventory")
    digest=hashlib.sha256()
    for name,expected in sorted(meta["inventory"].items()):
        name=safe_name(name);file=root/"source"/name
        if file.is_symlink() or not file.resolve().is_relative_to((root/"source").resolve()):raise ValueError("Unsafe cached file")
        # Never follow intermediate symlinks, including ones pointing inside the cache.
        if any(part.is_symlink() for part in [file,*file.parents] if part!=root.parent):raise ValueError("Cache contains symlinks")
        data=file.read_bytes()
        if hashlib.sha256(data).hexdigest()!=expected:raise ValueError("Cached source changed; inspect and download again")
        digest.update(name.encode());digest.update(b"\0");digest.update(data)
    if digest.hexdigest()!=meta.get("digest") or root.name!=meta["digest"]:raise ValueError("Cache checksum mismatch")
    allowed=set(meta["inventory"])
    for path in (root/"source").rglob("*"):
        if path.is_symlink() or (path.is_file() and path.relative_to(root/"source").as_posix() not in allowed):raise ValueError("Unexpected cached source")
    for runtime in meta.get("runtimes",[]):
        if runtime.get("engine") not in ("quickshell","waybar") or runtime.get("entry") not in allowed:raise ValueError("Invalid runtime entry")
    return meta


def prepare_workspace(cache,runtime,run_root):
    meta=verify_cache(cache)
    if runtime not in meta["runtimes"]:raise ValueError("Choose a discovered runtime")
    run_root=Path(run_root);home=run_root/"home";payload=run_root/"payload"
    if not (run_root/"ready.json").exists():
        if run_root.exists():raise ValueError("Incomplete workspace; choose a new package or inspect its runtime directory")
        run_root.mkdir(parents=True,mode=0o700);home.mkdir(mode=0o700)
        # Preserve repository paths and imports in a writable per-package runtime copy.
        for name in meta["inventory"]:
            src=Path(cache)/"source"/name;dst=payload/name;dst.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            data=src.read_bytes();dst.write_bytes(data);dst.chmod(0o700 if data.startswith(b"#!") else 0o600)
        parts=PurePosixPath(runtime["entry"]).parts
        prefix=PurePosixPath(*parts[:parts.index(".config")]) if ".config" in parts else None
        if prefix is not None:
            source_home=payload/str(prefix)
            # Move this subtree into the private home so ~ paths and relative imports agree.
            for child in list(source_home.iterdir()):shutil.move(str(child),str(home/child.name))
        atomic_json(run_root/"ready.json",{"prefix":str(prefix) if prefix is not None else None})
    prefix=json.loads((run_root/"ready.json").read_text())["prefix"]
    entry=PurePosixPath(runtime["entry"])
    path=home/str(entry.relative_to(PurePosixPath(prefix))) if prefix is not None and entry.is_relative_to(PurePosixPath(prefix)) else payload/str(entry)
    if not path.is_file() or path.is_symlink():raise ValueError("Runtime entry was removed or replaced; inspect runtime workspace")
    return home,path


def runtime_command(runtime,entry):
    if runtime["engine"]=="quickshell":return ["quickshell","-p",str(entry)]
    if runtime["engine"]=="waybar":
        args=["waybar","-c",str(entry)]
        if (entry.parent/"style.css").is_file():args.extend(["-s",str(entry.parent/"style.css")])
        return args
    raise ValueError("Unsupported runtime")


def isolated_command(command,run_root,home,entry):
    """Private HOME + namespaces, only the Wayland socket shared; no host D-Bus."""
    if not shutil.which("bwrap"):raise RuntimeError("Bubblewrap is required for isolated mode; no automatic unsandboxed fallback")
    runtime_dir=os.environ.get("XDG_RUNTIME_DIR",f"/run/user/{os.getuid()}")
    display=os.environ.get("WAYLAND_DISPLAY","")
    socket=Path(display) if Path(display).is_absolute() else Path(runtime_dir)/display
    if not display or not socket.is_socket():raise RuntimeError("A Wayland session is required")
    mapped_home="/workspace/home";mapped_entry="/workspace/"+entry.relative_to(run_root).as_posix()
    inner=[mapped_entry if arg==str(entry) else "/workspace/"+Path(arg).relative_to(run_root).as_posix() if arg.startswith(str(run_root)+"/") else arg for arg in command]
    args=["bwrap","--die-with-parent","--new-session","--unshare-all","--cap-drop","ALL","--clearenv",
          "--ro-bind","/usr","/usr","--ro-bind","/etc","/etc","--symlink","usr/bin","/bin",
          "--symlink","usr/lib","/lib","--symlink","usr/lib","/lib64","--proc","/proc","--dev","/dev",
          "--tmpfs","/tmp","--dir","/run/user/1000","--bind",str(run_root),"/workspace",
          "--ro-bind",str(socket),"/run/user/1000/wayland-0",
          "--setenv","PATH","/usr/bin","--setenv","HOME",mapped_home,
          "--setenv","XDG_RUNTIME_DIR","/run/user/1000","--setenv","WAYLAND_DISPLAY","wayland-0",
          "--setenv","QT_QPA_PLATFORM","wayland","--setenv","GDK_BACKEND","wayland",
          "--setenv","QT_QUICK_BACKEND","software","--setenv","XDG_CONFIG_HOME",mapped_home+"/.config",
          "--setenv","XDG_DATA_HOME",mapped_home+"/.local/share","--setenv","XDG_STATE_HOME",mapped_home+"/.local/state",
          "--setenv","XDG_CACHE_HOME",mapped_home+"/.cache","--chdir",str(PurePosixPath(mapped_entry).parent),"--",*inner]
    return args


class RiceRunner(QObject):
    changed=Signal(str)
    def __init__(self,base,parent=None):
        super().__init__(parent);self.base=Path(base);self.process=None;self.log=None;self.current="";self.log_path=None
        self.current_cache=None;self.current_runtime=None;self.current_mode=None
        self.timer=QTimer(self);self.timer.setInterval(500);self.timer.timeout.connect(self.poll)
    def start(self,cache,runtime,mode):
        if mode not in ("isolated","session"):raise ValueError("Choose an execution mode")
        if not shutil.which(runtime["engine"]):raise RuntimeError(runtime["engine"]+" is not installed")
        self.stop()
        identity=hashlib.sha256(json.dumps(runtime,sort_keys=True).encode()).hexdigest()[:16]
        root=self.base/Path(cache).name/(identity+"-"+mode)
        home,entry=prepare_workspace(cache,runtime,root)
        if runtime["engine"]=="quickshell":
            from .rice_layout import apply_offsets, layout_file, load_offsets, visual_components
            components=visual_components(cache,runtime)
            offsets=load_offsets(layout_file(self.base.parent,cache,runtime),components)
            apply_offsets(cache,runtime,root,offsets)
        command=runtime_command(runtime,entry)
        environment=dict(os.environ)
        environment.update(HOME=str(home),XDG_CONFIG_HOME=str(home/".config"),XDG_DATA_HOME=str(home/".local/share"),XDG_STATE_HOME=str(home/".local/state"),XDG_CACHE_HOME=str(home/".cache"),GDK_BACKEND="wayland",QT_QPA_PLATFORM="wayland")
        if mode=="isolated":command=isolated_command(command,root,home,entry)
        self.log_path=root/"runtime.log";self.log=self.log_path.open("wb")
        try:self.process=subprocess.Popen(command,cwd=entry.parent,env=environment,stdin=subprocess.DEVNULL,stdout=self.log,stderr=subprocess.STDOUT,start_new_session=True)
        except Exception:self.log.close();self.log=None;raise
        self.current_cache=Path(cache);self.current_runtime=runtime;self.current_mode=mode
        self.current=f"{runtime['engine']} · {mode}";self.timer.start();self.changed.emit("Starting "+self.current)
    def poll(self):
        if self.process is None:return
        code=self.process.poll()
        if code is not None:
            self.stop()
            self.changed.emit(f"Runtime exited ({code}) · Open log for details")
        else:self.changed.emit("Running "+self.current+" · Stop ends its managed process group")
    def stop(self):
        self.timer.stop()
        if self.process:
            try:os.killpg(self.process.pid,signal.SIGTERM)
            except ProcessLookupError:pass
            try:self.process.wait(timeout=1.5)
            except subprocess.TimeoutExpired:
                try:os.killpg(self.process.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                self.process.wait(timeout=1)
            # A shell may spawn background children; don't orphan the owned group.
            try:os.killpg(self.process.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            self.process=None
        if self.log:self.log.close();self.log=None
        self.current_cache=None;self.current_runtime=None;self.current_mode=None
        self.changed.emit("Runtime stopped")
    def log_tail(self):
        if not self.log_path or not self.log_path.exists():return "No runtime log yet."
        with self.log_path.open("rb") as stream:
            stream.seek(max(0,self.log_path.stat().st_size-65536));return re.sub(r'\x1b\[[0-9;]*m','',stream.read(65536).decode(errors="replace"))
