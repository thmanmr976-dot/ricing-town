from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from ricing_town.rice import analyze
from ricing_town.rice_runner import cache_package,verify_cache,prepare_workspace,runtime_command
from ricing_town.rice_layout import apply_offsets,layout_file,load_offsets,save_offsets,visual_components


class RuntimeTests(unittest.TestCase):
    def test_app_worker_reuses_verified_online_package(self):
        from ricing_town.rice_ui import RiceWorker
        url="https://github.com/example/rice"
        package=analyze("Example",url,{"home/.config/quickshell/shell.qml":b'import Quickshell\nShellRoot {}'})
        with TemporaryDirectory() as d:
            cache=Path(d)/"cache"
            cache_package(package,cache)
            worker=RiceWorker(url,None,cache)
            loaded=[];failed=[];worker.loaded.connect(loaded.append);worker.failed.connect(failed.append)
            worker.run()
            self.assertFalse(failed)
            self.assertEqual(len(loaded),1)
            self.assertEqual(loaded[0].source,url)
            self.assertEqual(loaded[0].name,"Example")
            self.assertEqual(loaded[0].digest,package.digest)
    def package(self):
        return analyze("Example","test",{
            "repo/home/.config/quickshell/shell.qml":b'import Quickshell\nShellRoot {}',
            "repo/home/.config/quickshell/ClockWidget.qml":b'import QtQuick\nItem {}',
            "repo/home/.config/quickshell/scripts/helper.sh":b'#!/bin/sh\necho hello',
            "repo/home/.local/share/wallpapers/sample.txt":b'asset',
            "repo/setup":b'#!/bin/sh\necho NEVER RUN'})
    def test_discovery_and_cache_preserve_sources(self):
        p=self.package()
        self.assertEqual(len([c for c in p.components if c.kind=="runtime"]),1)
        self.assertEqual([c.name for c in p.components if c.kind=="feature"],["Clock"])
        with TemporaryDirectory() as d:
            cache=cache_package(p,Path(d)/"cache");meta=verify_cache(cache)
            self.assertEqual(meta["digest"],p.digest)
            self.assertEqual(len(meta["inventory"]),len(p.entries))
            self.assertEqual(cache_package(p,Path(d)/"cache"),cache)
            self.assertNotIn("setup",str(meta["runtimes"]))
    def test_private_home_keeps_relative_dependencies_and_state(self):
        p=self.package()
        with TemporaryDirectory() as d:
            cache=cache_package(p,Path(d)/"cache");runtime=verify_cache(cache)["runtimes"][0]
            home,entry=prepare_workspace(cache,runtime,Path(d)/"run")
            self.assertEqual(entry,home/".config/quickshell/shell.qml")
            self.assertTrue((entry.parent/"ClockWidget.qml").exists())
            self.assertTrue((home/".local/share/wallpapers/sample.txt").exists())
            self.assertTrue((entry.parent/"scripts/helper.sh").stat().st_mode & 0o100)
            (home/"setting").write_text("retained")
            prepare_workspace(cache,runtime,Path(d)/"run")
            self.assertEqual((home/"setting").read_text(),"retained")
            self.assertEqual(runtime_command(runtime,entry),["quickshell","-p",str(entry)])
    def test_layout_moves_private_qml_and_can_reset_it(self):
        with TemporaryDirectory() as d:
            package=self.package();cache=cache_package(package,Path(d)/"cache")
            runtime=verify_cache(cache)["runtimes"][0]
            components=visual_components(cache,runtime)
            name="repo/home/.config/quickshell/ClockWidget.qml"
            self.assertIn(name,components)
            home,_=prepare_workspace(cache,runtime,Path(d)/"run")
            target=home/".config/quickshell/ClockWidget.qml"
            original=target.read_text()
            saved=layout_file(d,cache,runtime)
            save_offsets(saved,{name:{"x":40,"y":-20}},components)
            apply_offsets(cache,runtime,Path(d)/"run",load_offsets(saved,components))
            self.assertIn("transform: Translate { x: 40; y: -20 }",target.read_text())
            self.assertEqual((cache/"source"/name).read_text(),original)
            with self.assertRaises(ValueError):save_offsets(saved,{name:{"x":True,"y":0}},components)
            save_offsets(saved,{name:{"x":0,"y":0,"scale":125}},components)
            apply_offsets(cache,runtime,Path(d)/"run",load_offsets(saved,components))
            self.assertIn("Scale { xScale: 1.25; yScale: 1.25 }",target.read_text())
            apply_offsets(cache,runtime,Path(d)/"run",{})
            self.assertEqual(target.read_text(),original)
    def test_tampered_or_linked_cache_rejected(self):
        with TemporaryDirectory() as d:
            cache=cache_package(self.package(),Path(d)/"cache")
            path=cache/"source/repo/home/.config/quickshell/shell.qml";path.chmod(0o600);path.write_text("changed")
            with self.assertRaisesRegex(ValueError,"changed"):verify_cache(cache)
        with TemporaryDirectory() as d:
            cache=cache_package(self.package(),Path(d)/"cache");(cache/"source/extra").symlink_to("/etc/passwd")
            with self.assertRaises(ValueError):verify_cache(cache)
    def test_unknown_runtime_and_unsafe_package_paths_rejected(self):
        with TemporaryDirectory() as d:
            p=self.package();cache=cache_package(p,Path(d)/"cache")
            with self.assertRaises(ValueError):prepare_workspace(cache,{"engine":"sh","entry":"repo/setup"},Path(d)/"run")
            with self.assertRaises(ValueError):runtime_command({"engine":"sh"},Path("setup"))
            from ricing_town.rice_runner import package_hash
            p.entries={"../escape":b"bad"};p.digest=package_hash(p.entries)
            with self.assertRaises(ValueError):cache_package(p,Path(d)/"cache")
            self.assertFalse((Path(d)/"escape").exists())
