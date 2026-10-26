from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from ricing_town.state import Scene, StateStore
from ricing_town.widgets import blank, element, read_widgets, templates, validate_widget, write_widgets
from ricing_town.widget_runtime import render_qml


class WidgetTests(unittest.TestCase):
    def test_all_templates_round_trip_and_unique_ids(self):
        widgets=templates()
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"widgets.json"; write_widgets(path,widgets); imported=read_widgets(path)
            self.assertEqual([w["name"] for w in widgets],[w["name"] for w in imported])
            self.assertNotEqual(imported[0]["id"],widgets[0]["id"])
            self.assertEqual(path.stat().st_mode&0o777,0o600)
            scene=Scene(widgets=imported); store=StateStore(Path(d)/"scene.json"); store.save(scene); self.assertEqual(store.load(),scene)

    def test_import_rejects_code_paths_and_oversized_geometry(self):
        for key,value in (("script","rm anything"),("url","https://example.com"),("width",999999),("id","../../escape")):
            widget=blank(); widget[key]=value
            with self.assertRaises(ValueError): validate_widget(widget)
        widget=blank(); widget["elements"]=[element(source="eval")]
        with self.assertRaises(ValueError): validate_widget(widget)

    def test_foreign_format_rejected_without_execution(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"widget.json"; path.write_text('{"html":"<script>bad()</script>"}')
            with self.assertRaisesRegex(ValueError,"Unsupported format"): read_widgets(path)

    def test_text_is_encoded_not_interpreted_as_qml(self):
        widget=blank(); text='"; Component.onCompleted: evil(); //\nDEFINITIONS READINGS_PATH'
        widget["elements"]=[element(text=text)]
        qml=render_qml([widget],"/tmp/readings.json")
        self.assertIn(json.dumps(text),qml)
        self.assertIn("Text.PlainText",qml)

    def test_invalid_data_types_are_rejected(self):
        for field,value in (("width",True),("height",float('nan')),("elements",{}),("background","url(x)")):
            widget=blank(); widget[field]=value
            with self.assertRaises(ValueError): validate_widget(widget)
