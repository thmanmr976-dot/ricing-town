from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path


@dataclass
class Scene:
    clock_enabled: bool = False
    clock_color: str = "#cba6f7"
    clock_size: int = 42
    clock_x: int = 80
    clock_y: int = 80
    bar_enabled: bool = False
    bar_position: str = "top"
    bar_height: int = 36
    bar_width: int = 100
    bar_workspaces: bool = True
    bar_apps: list[str] = field(default_factory=list)
    bar_color: str = "#181825"
    monitor: str = ""
    widgets: list[dict] = field(default_factory=list)
    bar_app_mode: str = "name"
    bar_app_overrides: dict[str,str] = field(default_factory=dict)
    colors: dict[str,str] = field(default_factory=dict)
    island: dict = field(default_factory=dict)
    wallpaper: str = ""
    bar_text: str = "#cdd6f4"
    bar_active: str = "#585b70"
    bar_layer: str = "top"
    bar_reserve: bool = False
    bar_radius: int = 10
    bar_margin: int = 0


class StateStore:
    def __init__(self, path: Path | None = None):
        base = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local/state"))
        self.path = path or base / "ricing-town" / "scene.json"

    def load(self) -> Scene:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            allowed = {k: raw[k] for k in Scene.__annotations__ if k in raw}
            scene = Scene(**allowed)
            from .island import validate_island
            from .rice import palette, color
            validate_island(scene.island)
            if not isinstance(scene.colors,dict):raise ValueError("Invalid palette")
            if scene.colors: scene.colors=palette(scene.colors)
            for value in (scene.bar_color,scene.bar_text,scene.bar_active):color(value)
            from .bar import validate_behavior
            validate_behavior(scene)
            if not isinstance(scene.wallpaper,str): raise ValueError("Invalid wallpaper")
            if scene.bar_app_mode not in ("name","icon","both") or not isinstance(scene.bar_app_overrides,dict):
                raise ValueError("Invalid application display mode")
            if any(v not in ("name","icon","both") for v in scene.bar_app_overrides.values()):
                raise ValueError("Invalid application display override")
            from .widgets import MAX_WIDGETS, validate_widget
            if not isinstance(scene.widgets,list) or len(scene.widgets)>MAX_WIDGETS:
                raise ValueError("Invalid widgets")
            scene.widgets=[validate_widget(w) for w in scene.widgets]
            if not scene.clock_color.startswith("#") or not 12 <= scene.clock_size <= 120:
                raise ValueError("invalid scene values")
            return scene
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            return Scene()

    def save(self, scene: Scene) -> None:
        from .bar import validate_behavior
        validate_behavior(scene)
        from .island import validate_island
        from .rice import palette
        validate_island(scene.island)
        if scene.colors: palette(scene.colors)
        from .widgets import MAX_WIDGETS, validate_widget
        if len(scene.widgets)>MAX_WIDGETS: raise ValueError("Too many widgets")
        for widget in scene.widgets: validate_widget(widget)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temp = self.path.with_suffix(".tmp")
        temp.write_text(json.dumps(asdict(scene), indent=2) + "\n", encoding="utf-8")
        os.chmod(temp, 0o600)
        os.replace(temp, self.path)
