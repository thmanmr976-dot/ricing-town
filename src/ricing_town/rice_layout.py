"""Editable placement of visual QML components in an owned Rice workspace."""

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tempfile

from .rice_runner import verify_cache
from .widgets import atomic_json


ROOT = re.compile(r"(?m)^([A-Za-z][A-Za-z0-9_.]*)\s*\{")
VISUAL = {"Item", "Rectangle", "Text", "Image", "Row", "Column", "Grid",
          "RowLayout", "ColumnLayout", "GridLayout", "Shape", "Control",
          "Button", "MouseArea", "Flickable", "ListView", "Canvas", "FocusScope"}
LIMIT = 2000


def layout_key(runtime):
    return hashlib.sha256(json.dumps(runtime, sort_keys=True).encode()).hexdigest()[:16]


def layout_file(state_dir, cache, runtime):
    return Path(state_dir) / "rice-layouts" / Path(cache).name / (layout_key(runtime) + ".json")


def visual_components(cache, runtime):
    meta = verify_cache(cache)
    if runtime not in meta["runtimes"] or runtime["engine"] != "quickshell":
        raise ValueError("Choose a saved Quickshell interface")
    parent = PurePosixPath(runtime["entry"]).parent
    result = {}
    for name in meta["inventory"]:
        path = PurePosixPath(name)
        if path.suffix != ".qml" or not path.is_relative_to(parent):
            continue
        source = (Path(cache) / "source" / name).read_text(errors="replace")
        root = ROOT.search(source)
        if not root or root.group(1).split(".")[-1] not in VISUAL:
            continue
        if "import QtQuick" not in source or re.search(r"(?m)^    transform\s*:", source):
            continue
        result[name] = {"name": path.stem, "group": str(path.parent.relative_to(parent)),
                        "type": root.group(1)}
    return result


def validate_offsets(offsets, components):
    if not isinstance(offsets, dict) or len(offsets) > len(components):
        raise ValueError("Invalid Rice layout")
    result = {}
    for name, value in offsets.items():
        if name not in components or not isinstance(value, dict):
            raise ValueError("Unknown Rice component")
        x, y, scale = value.get("x"), value.get("y"), value.get("scale", 100)
        if type(x) is not int or type(y) is not int or max(abs(x), abs(y)) > LIMIT:
            raise ValueError("Rice placement must be within 2000 pixels")
        if type(scale) is not int or not 50 <= scale <= 200:
            raise ValueError("Rice component size must be 50–200 percent")
        if x or y or scale != 100:
            result[name] = {"x": x, "y": y}
            if scale != 100:result[name]["scale"] = scale
    return result


def load_offsets(path, components):
    if not Path(path).exists():
        return {}
    return validate_offsets(json.loads(Path(path).read_text()), components)


def save_offsets(path, offsets, components):
    clean = validate_offsets(offsets, components)
    atomic_json(Path(path), clean)
    return clean


def patched_source(source, x, y, scale=100):
    root = ROOT.search(source)
    if not root or root.group(1).split(".")[-1] not in VISUAL:
        raise ValueError("This QML root is not a movable visual item")
    transform = (f"Translate {{ x: {x}; y: {y} }}" if scale == 100 else
                 f"[Translate {{ x: {x}; y: {y} }}, Scale {{ xScale: {scale/100}; yScale: {scale/100} }}]")
    insert = f"\n    // Ricing Town placement in the private runtime copy.\n    transform: {transform}"
    return source[:root.end()] + insert + source[root.end():]


def apply_offsets(cache, runtime, run_root, offsets):
    """Regenerate changed QML from the immutable cache, never the user's dotfiles."""
    components = visual_components(cache, runtime)
    clean = validate_offsets(offsets, components)
    run_root = Path(run_root)
    marker = run_root / "layout-applied.json"
    old = json.loads(marker.read_text()) if marker.exists() else {}
    old = validate_offsets(old, components)
    ready = json.loads((run_root / "ready.json").read_text())
    prefix = PurePosixPath(ready["prefix"]) if ready["prefix"] else None
    for name in set(old) | set(clean):
        source = (Path(cache) / "source" / name).read_text()
        if name in clean:
            source = patched_source(source, **clean[name])
        path = PurePosixPath(name)
        target = (run_root / "home" / str(path.relative_to(prefix))
                  if prefix and path.is_relative_to(prefix) else run_root / "payload" / name)
        if not target.is_file() or target.is_symlink():
            raise ValueError("Rice runtime component is missing")
        fd, temporary = tempfile.mkstemp(prefix=".layout-", dir=target.parent)
        try:
            with os.fdopen(fd, "w") as stream:
                stream.write(source)
            os.chmod(temporary, 0o600)
            os.replace(temporary, target)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    atomic_json(marker, clean)
