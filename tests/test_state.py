from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from ricing_town.state import Scene, StateStore


class StateTests(unittest.TestCase):
    def test_round_trip_and_permissions(self):
        with TemporaryDirectory() as temp:
            path = Path(temp) / "scene.json"; store = StateStore(path)
            expected = Scene(True, "#112233", 50, 12, 34); store.save(expected)
            self.assertEqual(store.load(), expected)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_invalid_state_falls_back(self):
        with TemporaryDirectory() as temp:
            path = Path(temp) / "scene.json"; path.write_text('{"clock_size": 999}')
            self.assertEqual(StateStore(path).load(), Scene())


if __name__ == "__main__": unittest.main()

