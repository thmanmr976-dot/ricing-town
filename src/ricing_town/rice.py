"""Read-only Rice discovery and data adapters. Never evaluates imported code."""
from copy import deepcopy
from dataclasses import dataclass, field
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import time
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen
import zipfile

from .widgets import FORMAT, MAX_WIDGETS, validate_widget

MAX_ARCHIVE=256*1024*1024
MAX_TOTAL=512*1024*1024
MAX_FILE=32*1024*1024
MAX_TEXT=2*1024*1024
MAX_FILES=5000
DEFAULT_COLORS={"background":"#141721","surface":"#222735","text":"#e4e8f4","accent":"#a99bff"}


def color(value):
    if not isinstance(value,str) or not re.fullmatch(r"#[0-9a-fA-F]{6}",value):
        raise ValueError("Use a six-digit hex color, e.g. #a99bff")
    return value.lower()


def palette(raw):
    if not isinstance(raw,dict) or not raw or len(raw)>128: raise ValueError("Invalid color palette")
    return {str(k)[:80]:color(v) for k,v in raw.items()}


@dataclass
class Component:
    kind: str
    name: str
    source: str
    status: str
    detail: str
    payload: object = None
    dependencies: list[str] = field(default_factory=list)


@dataclass
class Package:
    name: str
    source: str
    digest: str
    components: list[Component]
    warnings: list[str]
    files: int
    licenses: list[str]
    entries: dict[str,bytes] = field(default_factory=dict,repr=False)


def safe_name(name):
    path=PurePosixPath(name)
    if not name or len(name)>2048 or "\\" in name or path.is_absolute() or ".." in path.parts or any(ord(c)<32 for c in name) or ":" in name:
        raise ValueError("Unsafe path in Rice package")
    return str(path)


def load_source(source,progress=lambda _:None,cancelled=lambda:False):
    """GitHub repository URL, local folder, or ZIP. No checkout or extraction."""
    warnings=[]; files={}; total=0
    def add(name,data):
        nonlocal total
        if cancelled(): raise ValueError("Import cancelled")
        name=safe_name(name)
        if name in files: raise ValueError("Duplicate archive path")
        total+=len(data)
        if len(files)>=MAX_FILES or total>MAX_TOTAL: raise ValueError("Rice package exceeds limits")
        files[name]=data
    if source.startswith("https://"):
        parsed=urlparse(source); parts=parsed.path.strip("/").split("/")
        if parsed.hostname!="github.com" or parsed.username or parsed.port or parsed.query or parsed.fragment or len(parts)<2:
            raise ValueError("Use a GitHub repository URL, or download a ZIP and import it locally")
        owner,repo=parts[:2]; repo=repo.removesuffix(".git")
        if not all(re.fullmatch(r"[A-Za-z0-9_.-]+",s) for s in (owner,repo)): raise ValueError("Invalid GitHub repository")
        if len(parts)>2 and (parts[2]!="tree" or len(parts)<4): raise ValueError("Use a repository or /tree/branch URL")
        ref="/".join(parts[3:]) if len(parts)>2 else "HEAD"
        url=f"https://codeload.github.com/{owner}/{repo}/zip/{quote(ref,safe='')}"
        progress("Downloading read-only ZIP from GitHub…")
        chunks=[]; size=0; started=time.monotonic()
        with urlopen(Request(url,headers={"User-Agent":"Ricing-Town/0.3"}),timeout=15) as response:
            while True:
                if cancelled(): raise ValueError("Import cancelled")
                if time.monotonic()-started>180: raise ValueError("Download timed out; try a local ZIP")
                chunk=response.read(1024*1024)
                if not chunk: break
                size+=len(chunk)
                if size>MAX_ARCHIVE: raise ValueError("Download exceeds 256 MB")
                chunks.append(chunk); progress(f"Downloading Rice · {size//(1024*1024)} MB")
        archive=io.BytesIO(b"".join(chunks)); name=repo
        chunks.clear()
    else:
        path=Path(source).expanduser()
        name=path.stem
        if path.is_dir():
            progress("Inspecting local Rice folder…")
            seen=0
            for root,dirs,names in os.walk(path,followlinks=False):
                dirs[:]=[d for d in dirs if d not in (".git","node_modules",".venv") and not (Path(root)/d).is_symlink()]
                for filename in sorted(names):
                    seen+=1
                    if seen>MAX_FILES: raise ValueError("Rice folder exceeds 5,000 files")
                    file=Path(root)/filename
                    if file.is_symlink() or not file.is_file(): warnings.append(f"Skipped link/special file: {file.name}"); continue
                    if file.stat().st_size>MAX_FILE: warnings.append(f"Skipped file over 32 MB: {file.name}"); continue
                    with file.open("rb") as stream: data=stream.read(MAX_FILE+1)
                    if len(data)>MAX_FILE: raise ValueError("File grew beyond size limit")
                    add(file.relative_to(path).as_posix(),data)
            return analyze(name,source,files,warnings,progress,cancelled)
        if not path.is_file() or path.stat().st_size>MAX_ARCHIVE: raise ValueError("Choose a Rice folder or ZIP under 256 MB")
        archive=path
    progress("Inspecting archive without running or extracting files…")
    with zipfile.ZipFile(archive) as bundle:
        entries=bundle.infolist()
        if len(entries)>MAX_FILES: raise ValueError("Archive exceeds 5,000 entries")
        if sum(item.file_size for item in entries)>MAX_TOTAL: raise ValueError("Expanded archive exceeds 512 MB")
        for item in entries:
            safe_name(item.filename)
            mode=item.external_attr>>16
            if stat.S_ISLNK(mode): warnings.append(f"Skipped symlink: {item.filename}"); continue
            if item.is_dir(): continue
            if item.file_size>MAX_FILE: warnings.append(f"Skipped file over 32 MB: {item.filename}"); continue
            if item.flag_bits&1: raise ValueError("Encrypted Rice archives are not supported")
            add(item.filename,bundle.read(item))
    return analyze(name,source,files,warnings,progress,cancelled)


def jsonc(text):
    # Tokenize comments while preserving quoted strings (URLs may contain //).
    token=re.compile(r'"(?:\\.|[^"\\])*"|//[^\n]*|/\*[\s\S]*?\*/')
    text=token.sub(lambda m:m[0] if m[0].startswith('"') else " ",text)
    text=re.sub(r'("(?:\\.|[^"\\])*"|,\s*(?=[}\]]))',lambda m:"" if m[0].startswith(",") else m[0],text)
    return json.loads(text)


def color_components(path,text):
    result=[]
    # Declarative JS/QML palette objects, common in Quickshell shells. No JS evaluation.
    pattern=r'\bname\s*:\s*"([^"\n]{1,80})"[^{}]{0,600}\bcolors\s*:\s*\{([^{}]{1,10000})\}'
    pairs=r'["\']?([A-Za-z_][\w-]*)["\']?\s*[:=]\s*["\'](#[0-9a-fA-F]{6})["\']'
    for match in re.finditer(pattern,text):
        colors=dict(re.findall(pairs,match[2]))
        if colors: result.append(Component("palette",match[1],path,"supported","Literal color tokens; editable independently.",palette(colors)))
    if not result:
        colors=dict(re.findall(pairs,text))
        if not colors:
            # CSS variables, GTK @define-color, terminal INI colors.
            colors=dict(re.findall(r'(?:--|@define-color\s+)?([A-Za-z_][\w-]*)\s*[:=\s]\s*(#[0-9a-fA-F]{6})(?![0-9a-fA-F])',text))
        if colors:
            result.append(Component("palette",PurePosixPath(path).name+" colors",path,"supported","Literal colors only; computed colors are not evaluated.",palette(dict(list(colors.items())[:128]))))
    return result


def waybar_component(path,text):
    raw=jsonc(text); configs=raw if isinstance(raw,list) else [raw]; result=[]
    for index,cfg in enumerate(configs[:20]):
        if not isinstance(cfg,dict) or not any(k.startswith("modules-") for k in cfg): continue
        modules=[m for key in ("modules-left","modules-center","modules-right") for m in cfg.get(key,[]) if isinstance(m,str)]
        data={"bar_enabled":True,"bar_workspaces":any("workspaces" in m for m in modules)}
        if cfg.get("position") in ("top","bottom"): data["bar_position"]=cfg["position"]
        if type(cfg.get("height")) is int: data["bar_height"]=max(24,min(96,cfg["height"]))
        unsupported=[m for m in modules if m not in ("clock","hyprland/workspaces","sway/workspaces")]
        result.append(Component("waybar",f"Waybar layout {index+1}",path,"adapted",
            "Imports position, height and workspace visibility into managed Waybar. Original CSS, widths, module order, scripts and click commands are not executed. Unsupported modules: "+(", ".join(unsupported) or "none"),data,unsupported))
    return result


def analyze(name,source,files,warnings=None,progress=lambda _:None,cancelled=lambda:False):
    components=[]; warnings=list(warnings or []); licenses=[]; digest=hashlib.sha256()
    for path,data in sorted(files.items()):
        if cancelled(): raise ValueError("Import cancelled")
        digest.update(path.encode()); digest.update(b"\0"); digest.update(data)
        p=PurePosixPath(path); lower=path.lower()
        if p.name.lower().startswith(("license","copying","notice")):
            licenses.append(path+"\n"+data[:MAX_TEXT].decode("utf-8",errors="replace"))
            if len(data)>MAX_TEXT:warnings.append(f"License excerpt truncated at 2 MB: {path}")
        if p.suffix.lower() in (".png",".jpg",".jpeg",".webp"):
            kind="wallpaper" if any(t in lower for t in ("wallpaper","background")) else "image"
            components.append(Component(kind,p.name,path,"supported","Static image; can be used as an app-owned wallpaper. Source configuration is unchanged.",data)); continue
        if len(data)>MAX_TEXT: continue
        try: text=data.decode("utf-8")
        except UnicodeError: continue
        if "\x00" in text: continue
        try:
            if p.suffix.lower() in (".json",".jsonc"):
                raw=jsonc(text)
                if isinstance(raw,dict) and raw.get("format")==FORMAT:
                    if raw.get("version")!=1 or not isinstance(raw.get("widgets"),list) or not 1<=len(raw["widgets"])<=MAX_WIDGETS: raise ValueError("Invalid native widget collection")
                    for w in raw["widgets"]:
                        w=validate_widget(w,True); components.append(Component("widget",w["name"],path,"supported","Native editable widget.",w))
                    continue
                if isinstance(raw,dict) and raw.get("format")=="ricing-town-rice":
                    components.extend(manifest_components(raw,path)); continue
            if "waybar" in lower and p.name in ("config","config.json","config.jsonc"):
                found=waybar_component(path,text)
                if found: components.extend(found); continue
        except (ValueError,TypeError,RecursionError,AttributeError) as exc:
            warnings.append(f"{path}: {exc}")
        if p.suffix.lower() in (".qml",".json",".jsonc",".css",".scss",".conf",".ini",".toml",".yaml",".yml",".lua"):
            components.extend(color_components(path,text))
        if p.suffix.lower()==".qml":
            deps=re.findall(r'^\s*import\s+([^\n;]+)',text,re.M)[:40]
            components.append(Component("quickshell",p.stem,path,"review","QML is executable and may depend on shared services. Source is catalogued, not run. A dedicated adapter is required for its original behavior.",text[:16000],deps))
            if re.search(r'dynamic.?island',p.stem,re.I):
                components.append(Component("island",p.stem+" · native alternative",path,"adapted",
                    "Adds Ricing Town's own animated clock/media/stats/launcher island. This is not a conversion of the source's services, games, notifications or panels.",{}))
        elif any(t in lower for t in ("hypr/","eww/","ags/","sddm/","system/")) or p.suffix in (".sh",".py") or p.name=="setup":
            components.append(Component("external",p.name,path,"review","External configuration or executable: inventory only. No system files, services, packages or keybindings are changed.",text[:16000]))
    unsupported = set()
    for path in files:
        parts = {part.lower() for part in PurePosixPath(path).parts}
        filename = PurePosixPath(path).name.lower()
        if "eww" in parts or filename in ("eww.yuck", "eww.scss"):
            unsupported.add("Eww")
        if "ags" in parts or filename in ("ags.config.js", "ags.config.ts"):
            unsupported.add("AGS")
    for engine in sorted(unsupported):
        warnings.append(f"Compatibility: {engine} detected; original {engine} interfaces cannot run "
                        "or be edited here. Static palettes and wallpapers may still be imported. "
                        "No dependencies or setup scripts will be installed or run.")
    components.extend(discover_experiences(files))
    progress(f"Found {len(components)} components in {len(files)} files")
    return Package(name,source,digest.hexdigest(),components,warnings,len(files),licenses,files)


FEATURES={
    "clock":("Clock","clock"),"calendar":("Calendar","x-office-calendar"),
    "battery":("Battery","battery"),"media":("Media player","multimedia-player"),
    "notes":("Notes","accessories-text-editor"),"tasks":("Tasks","view-task"),
    "weather":("Weather","weather-clear"),"notifications":("Notifications","preferences-system-notifications"),
    "launcher":("App launcher","view-app-grid"),"dynamicisland":("Dynamic Island","view-pim-summary"),
    "stats":("System stats","utilities-system-monitor"),"network":("Network","network-wireless"),
    "bluetooth":("Bluetooth","bluetooth"),"volume":("Volume","audio-volume-high"),
    "brightness":("Brightness","display-brightness"),"games":("Games","applications-games"),
    "dock":("Dock","preferences-desktop"),"clipboard":("Clipboard","edit-paste"),
}


def discover_experiences(files):
    """Identify launch roots and group source modules into user-facing capabilities."""
    result=[]; roots=[]
    for path,data in sorted(files.items()):
        p=PurePosixPath(path)
        if p.name in ("shell.qml","main.qml") and b"import Quickshell" in data:
            roots.append(path)
            result.append(Component("runtime","Original desktop shell",path,"run",
                "Runs the original Quickshell interface and its connected widgets/services. Dependencies must already be installed. No installer is run.",
                {"engine":"quickshell","entry":path},["quickshell"]))
        elif "waybar" in path.lower() and p.name in ("config","config.json","config.jsonc"):
            try:
                if waybar_component(path,data.decode()):
                    result.append(Component("runtime","Original Waybar",path,"run",
                        "Runs this bar's original modules, style and commands. Review/trust is required, independently of importing its safe layout.",
                        {"engine":"waybar","entry":path},["waybar"]))
            except (ValueError,TypeError,AttributeError,UnicodeError):pass
    for entry in roots:
        parent=str(PurePosixPath(entry).parent);prefix="" if parent=="." else parent+"/"
        for token,(name,icon) in FEATURES.items():
            matches=[p for p in files if p.startswith(prefix) and p.endswith(".qml") and token in PurePosixPath(p).stem.lower().replace("_","").replace("-","")]
            if matches:
                result.append(Component("feature",name,entry,"run",
                    "Detected in the original interface. Runs with that shell; it is not an independently converted widget.",
                    {"icon":icon,"entry":entry,"engine":"quickshell","sources":matches},["quickshell"]))
    return result


def manifest_components(raw,path):
    """Portable, versioned contract for arbitrary Rice authors, not repo-name adapters."""
    if raw.get("version")!=1 or set(raw)-{"format","version","name","components"}: raise ValueError("Unsupported Rice manifest")
    entries=raw.get("components")
    if not isinstance(entries,list) or len(entries)>200: raise ValueError("Manifest supports up to 200 components")
    result=[]
    for item in entries:
        if not isinstance(item,dict) or set(item)!={"kind","name","data"}: raise ValueError("Invalid manifest component")
        kind,name,data=item["kind"],item["name"],item["data"]
        if not isinstance(name,str) or not 1<=len(name)<=100: raise ValueError("Invalid component name")
        if kind=="palette": data=palette(data)
        elif kind=="widget": data=validate_widget(data,True)
        elif kind=="island":
            from .island import validate_island
            data=validate_island(data)
        else: raise ValueError(f"Unsupported manifest component: {kind}")
        result.append(Component(kind,name,path,"supported","Native portable Rice component.",data))
    return result
