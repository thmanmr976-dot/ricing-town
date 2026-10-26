import json
import unittest

from ricing_town.desktop import bar_files
from ricing_town.state import Scene


class BarTests(unittest.TestCase):
    def test_behavior_rounding_margin_and_no_mode_override(self):
        scene=Scene(bar_layer="bottom",bar_reserve=True,bar_radius=23,bar_margin=12)
        config,css=bar_files(scene,1366,{})
        config=json.loads(config)
        self.assertEqual(config["layer"],"bottom");self.assertFalse(config["exclusive"])
        self.assertEqual(config["margin-top"],12);self.assertNotIn("mode",config)
        self.assertIn("border-radius: 23px",css)
        with self.assertRaises(ValueError):bar_files(Scene(bar_radius=200),1366,{})
    def test_workspace_and_application_commands(self):
        scene = Scene(bar_enabled=True, bar_width=80, bar_apps=["org.example.App.desktop"])
        config, css = bar_files(scene, 1000, {"org.example.App.desktop": "Example"})
        config = json.loads(config)
        self.assertEqual(config["width"], 800)
        self.assertEqual(len(config["modules-left"]), 5)
        self.assertIn("--activate", config["custom/workspace1"]["on-click"])
        self.assertEqual(config["custom/app0"]["on-click"], "gtk-launch org.example.App.desktop")
        self.assertIn("#181825", css)

    def test_modes_and_minimum_width_match_preview(self):
        from ricing_town.bar import layout
        scene=Scene(bar_apps=["a","b"],bar_width=30,bar_app_overrides={"a":"icon","b":"both"})
        config,css=bar_files(scene,1000,{"a":"Alpha","b":"Beta"})
        config=json.loads(config); geometry=layout(scene,1000)
        self.assertEqual(geometry.app_widths,[40,172])
        self.assertEqual(config["width"],geometry.width)
        self.assertGreater(geometry.width,300)
        self.assertIn("min-width: 40px",css)
        with self.assertRaises(ValueError): layout(Scene(bar_apps=["a"]*20),1000)
        _,css=bar_files(Scene(bar_text="#112233",bar_active="#abcdef"),1000,{})
        self.assertIn("color: #112233",css);self.assertIn("background: #abcdef",css)

    def test_no_arbitrary_application_or_css(self):
        with self.assertRaises(ValueError):
            bar_files(Scene(bar_apps=["bad;command"]), 1366, {})
        with self.assertRaises(ValueError):
            bar_files(Scene(bar_color="red; @import url(bad)"), 1366, {})

    def test_empty_modules_and_invalid_dimensions(self):
        config, _ = bar_files(Scene(bar_workspaces=False), 1366, {})
        self.assertEqual(json.loads(config)["modules-left"], [])
        with self.assertRaises(ValueError):
            bar_files(Scene(bar_height=-1), 1366, {})
