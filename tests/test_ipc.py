import unittest
from ricing_town.ipc import VALID_COMMANDS, valid_command
from ricing_town.app import parser


class IpcTests(unittest.TestCase):
    def test_commands_are_explicit(self): self.assertEqual(VALID_COMMANDS, {"show", "hide", "toggle", "quit"})
    def test_cli(self): self.assertEqual(parser().parse_args(["--toggle"]).command, "toggle")
    def test_online_rice_command_is_github_only(self):
        self.assertEqual(parser().parse_args(["--rice-run","https://github.com/andreumassanet/impasto"]).rice_run,
                         "https://github.com/andreumassanet/impasto")
        self.assertTrue(valid_command("rice https://github.com/andreumassanet/impasto"))
        self.assertFalse(valid_command("rice https://127.0.0.1/secret"))
        self.assertFalse(valid_command("rice https://github.com/user/repo\nquit"))


if __name__ == "__main__": unittest.main()
