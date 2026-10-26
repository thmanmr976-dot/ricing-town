from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PySide6.QtCore import QPointF, QTimer, Qt
from PySide6.QtGui import QMouseEvent
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication, QDialog, QDialogButtonBox, QListWidget

from ricing_town.state import StateStore
from ricing_town.ui import Palette
from ricing_town.widget_editor import WidgetEditor
from ricing_town.widgets import blank, read_widgets, templates, write_widgets


class Settings:
    def value(self, key, default=None): return default
    def setValue(self, *args): pass


class EditorFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app=QApplication.instance() or QApplication(["tests","-platform","offscreen"])
        cls.app.setQuitOnLastWindowClosed(False)

    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.settings=patch("ricing_town.ui.QSettings",return_value=Settings()); self.settings.start()
        self.window=Palette(StateStore(Path(self.directory.name)/"scene.json"))

    def tearDown(self):
        self.window.rice_runner.stop()
        self.window.desktop.close(); self.window.hide(); self.window.launcher.hide(); self.window.deleteLater()
        self.app.processEvents(); self.settings.stop(); self.directory.cleanup()

    def test_create_edit_save_template_and_undo_desktop(self):
        editor=WidgetEditor(blank(),self.window.canvas.sources.values,self.window)
        editor.add_element("text"); editor.name.setText("My personal widget"); editor.widget["name"]="My personal widget"
        editor.text.setPlainText("A custom caption"); editor.fields["x"].setValue(36)
        editor.source.setCurrentText("date"); editor.finish()
        self.assertEqual(editor.widget["elements"][0]["source"],"date")
        self.assertEqual(editor.widget["elements"][0]["x"],36)
        panel=self.window.widget_panel; panel.append(editor.widget); panel.remember(editor.widget)
        self.assertEqual(len(self.window.scene.widgets),1)
        library=list(panel.library_dir.glob("*.json")); self.assertEqual(len(library),1)
        self.assertEqual(read_widgets(library[0])[0]["name"],"My personal widget")
        self.window.undo(); self.assertEqual(self.window.scene.widgets,[])

    def test_cancel_import_and_selective_confirm(self):
        widgets=templates()[:2]; panel=self.window.widget_panel
        QTimer.singleShot(0,lambda:self.app.activeModalWidget().reject())
        panel.preview_import(widgets)
        self.assertEqual(self.window.scene.widgets,[])
        def accept_one():
            dialog=self.app.activeModalWidget(); dialog.findChild(QListWidget).item(1).setCheckState(Qt.CheckState.Unchecked)
            QTest.mouseClick(dialog.findChild(QDialogButtonBox).button(QDialogButtonBox.StandardButton.Ok),Qt.MouseButton.LeftButton)
        QTimer.singleShot(0,accept_one); panel.preview_import(widgets)
        self.assertEqual(len(self.window.scene.widgets),1)
        path=Path(self.directory.name)/"roundtrip.json"; write_widgets(path,self.window.scene.widgets)
        self.assertEqual(read_widgets(path)[0]["name"],widgets[0]["name"])

    def test_click_star_restores_studio_and_draft(self):
        self.window.scene.widgets=[templates()[0]]; self.window.show(); self.app.processEvents()
        self.window.minimize_to_launcher(); self.app.processEvents()
        QTest.mouseClick(self.window.launcher.open_button,Qt.MouseButton.LeftButton)
        self.assertTrue(self.window.isVisible()); self.assertFalse(self.window.launcher.isVisible())
        self.assertEqual(len(self.window.scene.widgets),1)

    def test_hide_icon_drags_from_center_without_reopening(self):
        self.window.show();self.app.processEvents();self.window.minimize_to_launcher();self.app.processEvents()
        launcher=self.window.launcher;button=launcher.open_button
        before=launcher.pos();start=QPointF(18,18);end=QPointF(38,28)
        QTest.mousePress(button,Qt.MouseButton.LeftButton,pos=start.toPoint())
        move=QMouseEvent(QMouseEvent.Type.MouseMove,end,button.mapToGlobal(end.toPoint()).toPointF(),
                         Qt.MouseButton.NoButton,Qt.MouseButton.LeftButton,Qt.KeyboardModifier.NoModifier)
        self.app.sendEvent(button,move)
        QTest.mouseRelease(button,Qt.MouseButton.LeftButton,pos=end.toPoint())
        self.app.processEvents()
        self.assertFalse(self.window.isVisible());self.assertTrue(launcher.isVisible())
        self.assertNotEqual(launcher.pos(),before)
        QTest.mouseClick(button,Qt.MouseButton.LeftButton)
        self.assertTrue(self.window.isVisible())

    def test_hide_moves_owned_dialog_away_from_launcher(self):
        self.window.show(); dialog=QDialog(self.window); dialog.show(); self.app.processEvents()
        self.window.minimize_to_launcher(); self.app.processEvents()
        self.assertFalse(dialog.isVisible())
        self.assertTrue(self.window.launcher.isVisible())
        QTest.mouseClick(self.window.launcher.open_button,Qt.MouseButton.LeftButton)
        self.assertTrue(dialog.isVisible())
        dialog.close()

    def test_rice_layout_editor_saves_position_through_app(self):
        from ricing_town.rice import analyze
        from ricing_town.rice_runner import cache_package, verify_cache
        from ricing_town.rice_ui import RiceLayoutEditor
        from ricing_town.rice_layout import layout_file, load_offsets, visual_components
        package=analyze("Example","local",{
            "home/.config/quickshell/shell.qml":b"import Quickshell\nShellRoot {}",
            "home/.config/quickshell/Island.qml":b"import QtQuick\nRectangle { id: root }"})
        cache=cache_package(package,Path(self.directory.name)/"rice-packages")
        runtime=verify_cache(cache)["runtimes"][0]
        editor=RiceLayoutEditor(self.window,cache,runtime)
        self.assertEqual(editor.items.count(),1)
        editor.x.setValue(36);editor.y.setValue(-12);editor.scale.setValue(125)
        with patch.object(self.window.rice_runner,"start") as started, patch("ricing_town.rice_ui.confirm_run",return_value=False):
            editor.apply_and_run()
            started.assert_not_called()
            self.assertFalse(layout_file(self.directory.name,cache,runtime).exists())
        with patch.object(self.window.rice_runner,"start") as started, patch("ricing_town.rice_ui.confirm_run",return_value=True):
            editor.apply_and_run()
        started.assert_called_once_with(cache,runtime,"isolated")
        saved=load_offsets(layout_file(self.directory.name,cache,runtime),visual_components(cache,runtime))
        self.assertEqual(next(iter(saved.values())),{"x":36,"y":-12,"scale":125})

    def test_editor_nudge_resize_undo_and_redo(self):
        editor=WidgetEditor(blank(),self.window.canvas.sources.values,self.window)
        editor.add_element("shape"); editor.show(); self.app.processEvents()
        canvas=editor.canvas; e=editor.widget["elements"][0]; old_x=e["x"]
        QTest.keyClick(canvas,Qt.Key.Key_Right)
        self.assertEqual(e["x"],old_x+1)
        editor.undo(); self.assertEqual(editor.widget["elements"][0]["x"],old_x)
        editor.redo(); e=editor.widget["elements"][0]; self.assertEqual(e["x"],old_x+1)
        origin,scale=canvas.transform(); old_width=e["width"]
        start=(origin+QPointF(e["x"]+e["width"],e["y"]+e["height"]/2)*scale).toPoint()
        QTest.mousePress(canvas,Qt.MouseButton.LeftButton,pos=start)
        QTest.mouseMove(canvas,start+QPointF(20*scale,0).toPoint())
        QTest.mouseRelease(canvas,Qt.MouseButton.LeftButton,pos=start+QPointF(20*scale,0).toPoint())
        self.assertAlmostEqual(e["width"],old_width+20,delta=1)
        editor.undo(); self.assertEqual(editor.widget["elements"][0]["width"],old_width)
        editor.fields["radius"].setValue(22); editor.fields["radius"].setValue(24)
        editor.undo(); self.assertNotEqual(editor.widget["elements"][0]["radius"],22)
        editor.close()

    def test_bar_artwork_and_modes_round_trip(self):
        from ricing_town.bar import app_tile,write_assets
        scene=self.window.scene; scene.bar_apps=["example.desktop"]
        scene.bar_app_overrides={"example.desktop":"icon"}
        folder=Path(self.directory.name)/"assets"
        write_assets(scene,{"example.desktop":{"name":"Example","icon":"missing-icon"}},folder)
        self.assertTrue((folder/"app0.png").exists())
        self.assertEqual(app_tile("Example","missing-icon","icon").width(),80)
        store=StateStore(Path(self.directory.name)/"test.json"); store.save(scene)
        self.assertEqual(store.load().bar_app_overrides,scene.bar_app_overrides)

    def test_rice_selective_import_colors_and_undo(self):
        import json
        from ricing_town.rice import analyze
        from ricing_town.rice_ui import import_selected,RiceBrowser
        raw={"format":"ricing-town-rice","version":1,"components":[
            {"kind":"widget","name":"Custom","data":blank()},
            {"kind":"palette","name":"Palette","data":{"background":"#223344","accent":"#aabbcc"}},
            {"kind":"island","name":"Island","data":{"enabled":True}}]}
        package=analyze("test","local",{"rice.json":json.dumps(raw).encode(),"shell.qml":b'import QtQuick\nItem{}'})
        browser=RiceBrowser(self.window);browser.loaded(package);browser.reject()
        self.assertEqual(self.window.scene.widgets,[])
        chosen=[c for c in package.components if c.kind in ("widget","palette","island")]
        import_selected(self.window,package,chosen)
        self.assertEqual(len(self.window.scene.widgets),1);self.assertTrue(self.window.scene.island["enabled"])
        self.assertEqual(len(list((self.window.store.path.parent/"palettes").glob("*.json"))),1)
        self.window.undo();self.assertEqual(self.window.scene.widgets,[])
        self.window.colors_panel.fields["background"].setText("#123456")
        self.window.colors_panel.apply_colors();self.assertEqual(self.window.scene.colors["background"],"#123456")
        self.window.undo();self.assertEqual(self.window.scene.colors,{})
        with self.assertRaises(ValueError):import_selected(self.window,package,[c for c in package.components if c.kind=="quickshell"])

    def test_rice_wallpaper_is_normalized_and_selection_is_atomic(self):
        from PySide6.QtCore import QBuffer,QIODevice
        from PySide6.QtGui import QImage,QColor
        from ricing_town.rice import analyze
        from ricing_town.rice_ui import import_selected
        image=QImage(32,32,QImage.Format.Format_RGB32);image.fill(QColor("#123456"))
        buffer=QBuffer();buffer.open(QIODevice.OpenModeFlag.WriteOnly);image.save(buffer,"PNG")
        package=analyze("images","local",{"wallpapers/a.png":bytes(buffer.data()),"wallpapers/b.png":bytes(buffer.data())})
        with self.assertRaises(ValueError):import_selected(self.window,package,package.components)
        self.assertEqual(self.window.scene.wallpaper,"")
        import_selected(self.window,package,package.components[:1])
        self.assertTrue(Path(self.window.scene.wallpaper).is_file())
        self.assertEqual(Path(self.window.scene.wallpaper).parent,self.window.store.path.parent/"assets")
        self.assertFalse(self.window.canvas.managed_background.isNull())
        self.window.undo();self.assertEqual(self.window.scene.wallpaper,"")

    def test_rice_background_worker_local_source(self):
        from ricing_town.rice_ui import RiceWorker
        path=Path(self.directory.name)/"rice";path.mkdir();(path/"theme.css").write_text("--accent: #aabbcc;")
        worker=RiceWorker(str(path),self.window);results=[];worker.loaded.connect(results.append);worker.start()
        self.assertTrue(worker.wait(5000));self.app.processEvents()
        self.assertEqual(len(results),1);self.assertEqual(results[0].components[0].payload["accent"],"#aabbcc")

    def test_rice_gallery_checkboxes_and_diagnostics(self):
        from ricing_town.rice import analyze
        from ricing_town.rice_ui import RiceBrowser
        p=analyze("Test","local",{"theme.css":b'--accent: #aabbcc;',"shell.qml":b'import Quickshell\nShellRoot {}',"ClockWidget.qml":b'import QtQuick\nItem {}'})
        browser=RiceBrowser(self.window);browser.loaded(p)
        self.assertEqual(browser.views.currentWidget(),browser.gallery)
        self.assertLess(browser.gallery.count(),browser.tree.topLevelItemCount())
        index=next(i for i,c in enumerate(p.components) if c.kind=="palette")
        browser.cards[index].setCheckState(Qt.CheckState.Checked)
        self.assertEqual(browser.tree.topLevelItem(index).checkState(0),Qt.CheckState.Checked)
        browser.clear_selection();self.assertEqual(browser.cards[index].checkState(),Qt.CheckState.Unchecked)
        browser.advanced.setChecked(True);self.assertEqual(browser.views.currentWidget(),browser.tree)
        self.assertTrue(browser.run_button.isEnabled());browser.reject()

    def test_import_can_save_runnable_shell_without_data_selection(self):
        from ricing_town.rice import analyze
        from ricing_town.rice_ui import import_selected,RiceBrowser
        package=analyze("Shell","local",{"home/.config/quickshell/shell.qml":b'import Quickshell\nShellRoot {}'})
        browser=RiceBrowser(self.window);browser.loaded(package)
        self.assertTrue(browser.keep_original.isChecked());browser.reject()
        import_selected(self.window,package,[],keep_runtime=True)
        self.assertEqual(self.window.rice_panel.runtimes.count(),1)
        self.assertEqual(self.window.scene.widgets,[])
        self.assertTrue((self.window.store.path.parent/"rice-packages"/package.digest/"package.json").is_file())

    def test_remove_bar_does_not_save_other_drafts(self):
        self.window.saved.bar_enabled=True;self.window.scene.bar_enabled=True
        self.window.scene.bar_height=70
        self.window.remove_bar()
        self.assertFalse(self.window.scene.bar_enabled)
        saved=self.window.store.load();self.assertFalse(saved.bar_enabled);self.assertNotEqual(saved.bar_height,70)
        self.window.undo();self.assertTrue(self.window.scene.bar_enabled)
