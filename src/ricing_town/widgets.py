"""Versioned, data-only widgets. No evaluated expressions, URLs or executable imports."""
from copy import deepcopy
from datetime import datetime
import calendar
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import uuid

FORMAT = "ricing-town-widget"
SOURCES = ("text", "time", "date", "day", "calendar", "battery", "memory", "cpu", "disk", "media")
MAX_WIDGETS = 40


def element(kind="text", source="text", text="Your text", x=20, y=20, width=260, height=48,
            size=24, color="#eff1f5", radius=8):
    return dict(id=uuid.uuid4().hex, kind=kind, source=source, text=text, x=x, y=y,
                width=width, height=height, size=size, color=color, radius=radius)


def blank(name="Untitled widget"):
    return dict(id=uuid.uuid4().hex, name=name, x=80, y=80, width=320, height=180,
                background="#202331", radius=24, monitor="", elements=[])


def templates():
    result = []
    clock = blank("Pill clock"); clock.update(height=138, radius=60, background="#171922")
    clock["elements"] = [element(source="time", text="", x=28,y=22,width=270,height=58,size=46),
                         element(source="date", text="", x=30,y=88,width=270,height=26,size=16,color="#aab4d5")]
    result.append(clock)
    date = blank("Calendar"); date.update(height=300, background="#efe8dd")
    date["elements"] = [element(source="date", text="", width=280,height=30,size=18,color="#433e39"),
                        element(source="calendar",text="",y=66,width=285,height=220,size=18,color="#433e39")]
    result.append(date)
    note = blank("Sticky note"); note.update(background="#eee49b",height=215)
    note["elements"] = [element(text="TODAY / FOCUS",size=14,color="#655d32",height=28),
                        element(text="Make room for\nsomething good.",y=64,height=130,size=27,color="#373321")]
    result.append(note)
    for name,source,color in [("Battery","battery","#a6e3a1"),("Memory","memory","#89b4fa"),
                              ("CPU","cpu","#f5c2e7"),("Disk","disk","#fab387")]:
        item=blank(name); item.update(height=152)
        item["elements"]=[element(text=name.upper(),size=13,height=24,color="#aab4d5"),
                          element(source=source,text="",y=54,height=46,size=25,color=color),
                          element(kind="progress",source=source,text="",y=119,width=280,height=8,color=color)]
        result.append(item)
    media=blank("Now playing"); media.update(width=380,height=170,background="#25223b")
    media["elements"]=[element(text="NOW PLAYING",size=13,color="#b9acf5",height=24),
                       element(source="media",text="",y=56,width=340,height=100,size=22)]
    result.append(media)
    return result


def _int(data,key,low,high):
    value=data.get(key)
    if type(value) is not int or not low <= value <= high: raise ValueError(f"{key} must be {low}–{high}")


def _string(data,key,limit):
    if not isinstance(data.get(key),str) or len(data[key]) > limit: raise ValueError(f"Invalid {key}")


def _color(value):
    if not isinstance(value,str) or not re.fullmatch(r"#[0-9a-fA-F]{6}",value): raise ValueError("Colors must be #RRGGBB")


def validate_widget(raw, fresh_id=False):
    if not isinstance(raw,dict): raise ValueError("Widget must be an object")
    required=set(blank())
    if set(raw) != required: raise ValueError("Unsupported widget fields; use a Ricing Town widget export")
    item=deepcopy(raw)
    for key,limit in (("id",64),("name",100),("monitor",128)): _string(item,key,limit)
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}",item["id"]): raise ValueError("Invalid widget id")
    if not item["name"].strip(): raise ValueError("Give the widget a name")
    for key in ("x","y"): _int(item,key,0,32768)
    for key in ("width","height"): _int(item,key,80,1600)
    _int(item,"radius",0,800); _color(item["background"])
    if not isinstance(item["elements"],list) or len(item["elements"])>32: raise ValueError("Maximum 32 elements per widget")
    ids=set()
    for e in item["elements"]:
        if not isinstance(e,dict) or set(e)!=set(element()): raise ValueError("Unsupported element fields")
        _string(e,"id",64)
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}",e["id"]) or e["id"] in ids: raise ValueError("Invalid or duplicate element id")
        ids.add(e["id"])
        if e["kind"] not in ("text","shape","progress") or e["source"] not in SOURCES: raise ValueError("Unsupported element or data source")
        _string(e,"text",2000); _color(e["color"])
        for key in ("x","y"): _int(e,key,0,1600)
        for key in ("width","height"): _int(e,key,1,1600)
        _int(e,"size",8,160); _int(e,"radius",0,800)
    if fresh_id:
        item["id"]=uuid.uuid4().hex
        for e in item["elements"]: e["id"]=uuid.uuid4().hex
    return item


def read_widgets(path):
    path=Path(path)
    if path.stat().st_size>1024*1024: raise ValueError("Widget import exceeds 1 MB")
    try: data=json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeError,json.JSONDecodeError,RecursionError) as exc: raise ValueError("Import a Ricing Town .json widget file") from exc
    if not isinstance(data,dict) or data.get("format")!=FORMAT or data.get("version")!=1:
        raise ValueError("Unsupported format. Import a Ricing Town widget JSON (v1). Delta/HTML/QML are not directly compatible.")
    if set(data)!={"format","version","widgets"}: raise ValueError("Unknown import fields")
    if not isinstance(data["widgets"],list) or not 1<=len(data["widgets"])<=MAX_WIDGETS: raise ValueError("Import 1–40 widgets")
    return [validate_widget(w,True) for w in data["widgets"]]


def write_widgets(path, widgets):
    if not 1<=len(widgets)<=MAX_WIDGETS: raise ValueError("Export 1–40 widgets")
    data={"format":FORMAT,"version":1,"widgets":[validate_widget(w) for w in widgets]}
    atomic_json(Path(path),data)


def atomic_json(path,data):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    fd,tmp=tempfile.mkstemp(prefix=".ricing-",dir=path.parent)
    try:
        with os.fdopen(fd,"w",encoding="utf-8") as stream: json.dump(data,stream,ensure_ascii=True)
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)


class DataSources:
    def __init__(self): self.previous_cpu=None; self.values={}; self.sample()

    def sample(self):
        now=datetime.now()
        self.values={"time":dict(text=now.strftime("%H:%M"),value=0),"date":dict(text=now.strftime("%a, %d %b %Y"),value=0),
                     "day":dict(text=now.strftime("%A"),value=0),"calendar":dict(text=calendar.TextCalendar().formatmonth(now.year,now.month),value=0)}
        for key in ("battery","memory","cpu","disk","media"): self.values[key]=dict(text="Unavailable",value=0)
        try:
            for power in Path("/sys/class/power_supply").glob("*"):
                if (power/"type").read_text().strip()=="Battery":
                    percent=int((power/"capacity").read_text()); status=(power/"status").read_text().strip()
                    self.values["battery"]=dict(text=f"{percent}% · {status}",value=percent); break
        except (OSError,ValueError): pass
        try:
            info={line.split(":")[0]:int(line.split()[1]) for line in Path("/proc/meminfo").read_text().splitlines()}
            used=info["MemTotal"]-info["MemAvailable"]; total=info["MemTotal"]
            self.values["memory"]=dict(text=f"{used/1048576:.1f} / {total/1048576:.1f} GiB",value=100*used/total)
            times=list(map(int,Path("/proc/stat").read_text().splitlines()[0].split()[1:9])); current=(sum(times),times[3]+times[4])
            if self.previous_cpu and current[0]>self.previous_cpu[0]:
                percent=max(0,min(100,100*(1-(current[1]-self.previous_cpu[1])/(current[0]-self.previous_cpu[0]))))
                self.values["cpu"]=dict(text=f"{percent:.0f}% utilization",value=percent)
            else: self.values["cpu"]=dict(text="Measuring…",value=0)
            self.previous_cpu=current
            total,used,_=shutil.disk_usage(Path.home()); self.values["disk"]=dict(text=f"{used/2**30:.0f} / {total/2**30:.0f} GiB",value=100*used/total)
        except (OSError,KeyError,ValueError,ZeroDivisionError): pass
        if shutil.which("playerctl"):
            try:
                result=subprocess.run(["playerctl","metadata","--format","{{title}}\n{{artist}}"],capture_output=True,text=True,timeout=.3)
                self.values["media"]=dict(text=result.stdout.strip()[:500] if result.returncode==0 else "No player active",value=0)
            except (OSError,subprocess.SubprocessError): pass
        else: self.values["media"]=dict(text="Install playerctl",value=0)
        return self.values
