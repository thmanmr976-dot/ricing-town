import json
from pathlib import Path
import stat
import tempfile
import unittest
import zipfile

from ricing_town.island import render_island,validate_island
from ricing_town.rice import analyze,color_components,jsonc,load_source,manifest_components
from ricing_town.state import Scene
from ricing_town.widgets import blank


class RiceTests(unittest.TestCase):
    def test_generic_palette_qml_discovery_without_execution(self):
        text='''import QtQuick
import "../services"
QtObject { property var list: [{name: "My palette", colors: {background: "#112233", accent: "#abcdef"}}]
Component.onCompleted: evilCommand()
}'''
        package=analyze("example","local",{"shell/theme/Palettes.qml":text.encode(),"shell/DynamicIsland.qml":b'import QtQuick\nItem {}'})
        palette=next(c for c in package.components if c.kind=="palette")
        self.assertEqual(palette.payload,{"background":"#112233","accent":"#abcdef"})
        self.assertEqual(next(c for c in package.components if c.kind=="quickshell").status,"review")
        self.assertEqual(next(c for c in package.components if c.kind=="island").status,"adapted")

    def test_zip_traversal_and_symlinks(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"rice.zip"
            with zipfile.ZipFile(path,"w") as archive: archive.writestr("../outside","bad")
            with self.assertRaises(ValueError):load_source(str(path))
            with zipfile.ZipFile(path,"w") as archive:
                info=zipfile.ZipInfo("repo/link");info.create_system=3;info.external_attr=(stat.S_IFLNK|0o777)<<16;archive.writestr(info,"/etc/passwd")
                archive.writestr("repo/theme.css","--accent: #123456;")
            result=load_source(str(path))
            self.assertEqual(result.files,1);self.assertEqual(len(result.warnings),1)
            self.assertFalse((Path(d).parent/"outside").exists())

    def test_jsonc_and_waybar_strip_executable_commands(self):
        data='''{// a comment
"modules-left": ["hyprland/workspaces",], "modules-right": ["clock","custom/evil"],
"custom/evil": {"exec":"touch /tmp/never-execute"}, "url":"https://example.com/a//b", "height":44,}'''
        self.assertEqual(jsonc(data)["url"],"https://example.com/a//b")
        package=analyze("bar","local",{".config/waybar/config.jsonc":data.encode()})
        component=next(c for c in package.components if c.kind=="waybar")
        self.assertEqual(component.payload["bar_height"],44)
        self.assertNotIn("exec",json.dumps(component.payload))
        self.assertIn("custom/evil",component.dependencies)

    def test_portable_manifest_and_strict_island(self):
        raw={"format":"ricing-town-rice","version":1,"components":[
            {"name":"Note","kind":"widget","data":blank()},
            {"name":"Island","kind":"island","data":{"enabled":True}},
            {"name":"Palette","kind":"palette","data":{"accent":"#aabbcc"}}]}
        self.assertEqual(len(manifest_components(raw,"rice.json")),3)
        raw["components"][1]["data"]["exec"]="bad"
        with self.assertRaises(ValueError):manifest_components(raw,"rice.json")
        with self.assertRaises(ValueError):validate_island({"width":500,"expanded_width":320})
        with self.assertRaises(ValueError):validate_island({"background":"red; bad"})

    def test_no_qml_placeholder_replacement_in_user_strings(self):
        scene=Scene(island={"enabled":True},bar_apps=["app.desktop"])
        qml=render_island(scene,Path('/tmp/readings.json'),{"app.desktop":{"name":"CONFIG TOP \"quoted\""}})
        self.assertIn('CONFIG TOP \\"quoted\\"',qml)
        self.assertIn('"id": "app.desktop"',qml)
        self.assertNotIn('property var config: CONFIG',qml)

    def test_reject_non_github_network_sources_and_cancel(self):
        with self.assertRaises(ValueError):load_source("https://127.0.0.1/secret.zip")
        with tempfile.TemporaryDirectory() as d:
            (Path(d)/"file.css").write_text("color: #ffffff")
            with self.assertRaisesRegex(ValueError,"cancelled"):load_source(d,cancelled=lambda:True)
