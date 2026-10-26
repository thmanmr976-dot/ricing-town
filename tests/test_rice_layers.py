from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock

from PySide6.QtWidgets import QApplication

from ricing_town.rice import analyze
from ricing_town.rice_layers import RiceLayers
from ricing_town.rice_layout import load_offsets
from ricing_town.rice_runner import cache_package, verify_cache


class RiceLayerFlowTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication(["tests", "-platform", "offscreen"])

    def test_shared_component_save_reload_reset_without_execution(self):
        with TemporaryDirectory() as directory:
            base = Path(directory)
            package = analyze("Rice", "local", {
                "shell.qml": b'import Quickshell\nShellRoot { Clock {} Clock {} }',
                "Clock.qml": b'import QtQuick\nItem {}'})
            cache = cache_package(package, base / "rice-packages")
            owner = SimpleNamespace(store=SimpleNamespace(path=base / "scene.json"),
                                    canvas=Mock(), rice_runner=Mock())
            panel = RiceLayers(owner)
            self.assertEqual(panel.items.count(), 1)
            self.assertIn("all instances", panel.items.item(0).text())
            panel.fields["x"].setValue(80); panel.fields["y"].setValue(-20)
            panel.fields["scale"].setValue(125)
            self.assertIn("Unsaved", panel.status.text())
            panel.save(); panel.reload()
            self.assertEqual(panel.fields["x"].value(), 80)
            self.assertEqual(panel.fields["scale"].value(), 125)
            panel.reset(); panel.save()
            self.assertEqual(load_offsets(panel.path, panel.components), {})
            verify_cache(cache)
            owner.rice_runner.start.assert_not_called()
            panel.deleteLater()

    def test_unsupported_engines_are_reported_without_runtimes(self):
        package = analyze("Mixed", "local", {
            ".config/eww/eww.yuck": b'(defwidget clock [] (label :text "time"))',
            ".config/ags/config.ts": b'print("never execute")'})
        self.assertFalse(any(c.kind == "runtime" for c in package.components))
        self.assertTrue(any("Eww" in warning for warning in package.warnings))
        self.assertTrue(any("AGS" in warning for warning in package.warnings))
