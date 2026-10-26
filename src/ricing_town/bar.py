"""One layout and launcher artwork source for the Qt preview and Waybar."""
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
import json
from pathlib import Path
import re
import shlex
import sys

from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QColor, QFont, QIcon, QPainter, QPixmap

MODES=("name","icon","both")
WORKSPACE_WIDTH=32
CLOCK_WIDTH=64
RADIUS=10
INK="#cdd6f4"
ACTIVE="#585b70"


def app_mode(scene,app):
    mode=scene.bar_app_overrides.get(app,scene.bar_app_mode)
    if mode not in MODES: raise ValueError("Choose application names, icons, or both")
    return mode


def tile_width(mode): return {"name":144,"icon":40,"both":172}[mode]


def validate_behavior(scene):
    if scene.bar_layer not in ("top","bottom"):raise ValueError("Choose above or behind applications")
    if type(scene.bar_reserve) is not bool:raise ValueError("Invalid reserved space")
    for key,high in (("bar_radius",48),("bar_margin",80)):
        if type(getattr(scene,key)) is not int or not 0<=getattr(scene,key)<=high:raise ValueError("Invalid bar rounding/margin")


@lru_cache(maxsize=512)
def app_tile(name,icon_name,mode,text_color=INK):
    width=tile_width(mode)
    # 2× artwork is shared with GTK for crisp logical sizing at fractional/HiDPI scales.
    image=QPixmap(width*2,40); image.fill(Qt.GlobalColor.transparent)
    p=QPainter(image); p.scale(2,2); p.setRenderHint(QPainter.RenderHint.Antialiasing)
    if mode!="name":
        icon=QIcon(icon_name) if Path(icon_name).is_absolute() else QIcon.fromTheme(icon_name)
        x=10 if mode=="icon" else 12
        if not icon.isNull(): icon.paint(p,x,0,20,20)
        else:
            p.setPen(Qt.PenStyle.NoPen); p.setBrush(QColor("#7465a8")); p.drawRoundedRect(QRectF(x,0,20,20),5,5)
            p.setPen(QColor("#ffffff")); f=QFont("Sans"); f.setPixelSize(12); p.setFont(f)
            p.drawText(QRectF(x,0,20,20),Qt.AlignmentFlag.AlignCenter,name[:1].upper() or "?")
    if mode!="icon":
        font=QFont("Sans"); font.setPixelSize(13); p.setFont(font); p.setPen(QColor(text_color))
        area=QRectF(40 if mode=="both" else 10,0,width-(50 if mode=="both" else 20),20)
        text=p.fontMetrics().elidedText(name,Qt.TextElideMode.ElideRight,int(area.width()))
        p.drawText(area,Qt.AlignmentFlag.AlignVCenter|(Qt.AlignmentFlag.AlignLeft if mode=="both" else Qt.AlignmentFlag.AlignHCenter),text)
    p.end(); return image


@dataclass
class BarLayout:
    width: int
    height: int
    center_width: int
    app_widths: list[int]
    requested_width: int


def layout(scene,monitor_width):
    validate_behavior(scene)
    if scene.bar_position not in ("top","bottom") or not 24<=scene.bar_height<=96 or not 30<=scene.bar_width<=100:
        raise ValueError("Invalid bar dimensions")
    if not re.fullmatch(r"#[0-9a-fA-F]{6}",scene.bar_color): raise ValueError("Invalid bar color")
    for value in (scene.bar_text,scene.bar_active):
        if not re.fullmatch(r"#[0-9a-fA-F]{6}",value):raise ValueError("Invalid bar text/accent color")
    widths=[tile_width(app_mode(scene,app)) for app in scene.bar_apps]
    left=WORKSPACE_WIDTH*5 if scene.bar_workspaces else 0
    center=sum(widths)
    minimum=center+2*max(left,CLOCK_WIDTH)+(16 if center else 0)
    if minimum>monitor_width: raise ValueError("Too many launchers for this output: use icons or remove applications")
    requested=round(monitor_width*scene.bar_width/100)
    return BarLayout(max(requested,minimum),scene.bar_height,center,widths,requested)


def build_files(scene,monitor_width,installed,asset_dir):
    model=layout(scene,monitor_width)
    config={"name":"ricing-town","layer":scene.bar_layer,"position":scene.bar_position,
            "height":model.height,"width":model.width,"exclusive":scene.bar_reserve if scene.bar_layer=="top" else False,"spacing":0,
            "fixed-center":True,"margin-"+scene.bar_position:scene.bar_margin,"modules-left":[],"modules-center":[],"modules-right":["clock"],
            "clock":{"format":"{:%H:%M}","tooltip":False}}
    if scene.monitor: config["output"]=scene.monitor
    selectors=[]
    if scene.bar_workspaces:
        helper=shlex.join([sys.executable,str(Path(__file__).with_name("workspace_status.py"))])
        for number in range(1,6):
            module=f"custom/workspace{number}"; config["modules-left"].append(module)
            config[module]={"exec":f"{helper} {number}","return-type":"json","interval":2,"on-click":f"{helper} {number} --activate"}
            selectors.append(f"#custom-workspace{number}")
    launcher_css=[]
    for i,app in enumerate(scene.bar_apps):
        if app not in installed: raise ValueError(f"Application unavailable: {app}")
        # A CSS image on a fixed-size custom module avoids the image module's
        # startup/realization issue on Waybar 0.15, and keeps the entire cell clickable.
        module=f"custom/app{i}"; config["modules-center"].append(module)
        config[module]={"format":" ","tooltip":False,"on-click":"gtk-launch "+shlex.quote(app)}
        uri=(Path(asset_dir)/f"app{i}.png").resolve().as_uri()
        launcher_css.append(f'#custom-app{i} {{ min-width: {model.app_widths[i]}px; min-height: {model.height}px; background-image: url("{uri}"); background-size: {model.app_widths[i]}px 20px; background-repeat: no-repeat; background-position: center; }}')
    css=f'''* {{ font-family: "DejaVu Sans Mono"; font-size: 13px; min-height: 0; padding: 0; margin: 0; border: none; box-shadow: none; text-shadow: none; }}
window#waybar {{ background: {scene.bar_color}; color: {scene.bar_text}; border-radius: {scene.bar_radius}px; }}
#clock {{ min-width: {CLOCK_WIDTH}px; min-height: {model.height}px; }}
#image {{ min-height: 0; padding: 0; margin: 0; }}
'''
    if selectors:
        selector=", ".join(selectors)
        css+=f"{selector} {{ min-width: {WORKSPACE_WIDTH}px; min-height: {model.height}px; border-radius: 6px; }}\n"
        css+=", ".join(s+".active" for s in selectors)+f" {{ background: {scene.bar_active}; }}\n"
    return json.dumps(config,indent=2),css+"\n".join(launcher_css)


def write_assets(scene,details,directory):
    directory=Path(directory); directory.mkdir(parents=True,exist_ok=True,mode=0o700)
    for i,app in enumerate(scene.bar_apps):
        if app not in details: raise ValueError(f"Application unavailable: {app}")
        info=details[app]
        if not app_tile(info["name"],info["icon"],app_mode(scene,app),scene.bar_text).save(str(directory/f"app{i}.png")):
            raise OSError("Could not write launcher artwork")


def paint_bar(p,scene,monitor_width,monitor_height,details,active_workspace=1):
    model=layout(scene,monitor_width)
    x=(monitor_width-model.width)/2; y=scene.bar_margin if scene.bar_position=="top" else monitor_height-model.height-scene.bar_margin
    p.save(); p.translate(x,y); p.setRenderHint(QPainter.RenderHint.Antialiasing)
    p.setPen(Qt.PenStyle.NoPen); p.setBrush(QColor(scene.bar_color)); p.drawRoundedRect(QRectF(0,0,model.width,model.height),scene.bar_radius,scene.bar_radius)
    font=QFont("DejaVu Sans Mono"); font.setPixelSize(13); p.setFont(font)
    if scene.bar_workspaces:
        for number in range(1,6):
            box=QRectF((number-1)*WORKSPACE_WIDTH,0,WORKSPACE_WIDTH,model.height)
            if number==active_workspace:
                p.setBrush(QColor(scene.bar_active)); p.setPen(Qt.PenStyle.NoPen); p.drawRoundedRect(box,6,6)
            p.setPen(QColor(scene.bar_text)); p.drawText(box,Qt.AlignmentFlag.AlignCenter,str(number))
    offset=(model.width-model.center_width)/2
    for app,width in zip(scene.bar_apps,model.app_widths):
        info=details.get(app,{"name":Path(app).stem,"icon":""})
        p.drawPixmap(QRectF(offset,(model.height-20)/2,width,20).toRect(),app_tile(info["name"],info["icon"],app_mode(scene,app),scene.bar_text))
        offset+=width
    p.setPen(QColor(scene.bar_text)); p.drawText(QRectF(model.width-CLOCK_WIDTH,0,CLOCK_WIDTH,model.height),Qt.AlignmentFlag.AlignCenter,datetime.now().strftime("%H:%M"))
    p.restore(); return model
