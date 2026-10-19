import importlib.util,pathlib,tempfile,unittest
from unittest.mock import patch
path=pathlib.Path(__file__).resolve().parents[1]/'dist/runtime/bridge.py'
spec=importlib.util.spec_from_file_location('bridge',path);bridge=importlib.util.module_from_spec(spec);spec.loader.exec_module(bridge)
class BridgeTests(unittest.TestCase):
 def test_no_arbitrary_commands(self):
  with patch.object(bridge,'run') as run:
   self.assertFalse(bridge.action('exec','touch /tmp/unsafe')['ok']);self.assertFalse(bridge.action('volume','101')['ok']);self.assertFalse(bridge.action('workspace','1;rm')['ok']);run.assert_not_called()
 def test_actions_are_allowlisted(self):
  with patch.object(bridge,'run',return_value='') as run:
   self.assertTrue(bridge.action('next')['ok']);run.assert_called_with(['playerctl','next'])
   self.assertTrue(bridge.action('volume','72')['ok']);run.assert_called_with(['wpctl','set-volume','@DEFAULT_AUDIO_SINK@','72%'])
 def test_music_reports_failure(self):
  with patch.object(bridge,'run',return_value=None):self.assertFalse(bridge.action('music')['ok'])
 def test_power_buttons_map_to_their_commands_without_running_them(self):
  with patch.object(bridge,'run',return_value='') as run:
   for action,command in [('suspend','suspend'),('reboot','reboot'),('shutdown','poweroff')]:
    self.assertTrue(bridge.action(action)['ok']);run.assert_called_with(['systemctl',command])
  with patch.object(bridge,'run',return_value=None):
   for action in ['suspend','reboot','shutdown']:self.assertFalse(bridge.action(action)['ok'])
 def test_lock_launch_and_missing_dependency_without_locking_session(self):
  with patch.object(bridge.shutil,'which',return_value='/usr/bin/hyprlock'),patch.object(bridge.subprocess,'Popen') as popen:
   self.assertTrue(bridge.action('lock')['ok']);self.assertEqual(popen.call_args.args[0],['hyprlock'])
  with patch.object(bridge.shutil,'which',return_value=None),patch.object(bridge.subprocess,'Popen') as popen:
   result=bridge.action('lock');self.assertFalse(result['ok']);self.assertIn('hyprlock',result['error']);popen.assert_not_called()
 def test_hyprland_version_dispatch(self):
  for version,expected in [('0.54.3',['hyprctl','dispatch','workspace','2']),('0.55.1',['hyprctl','dispatch','hl.dsp.focus({ workspace = "2" })'])]:
   with patch.object(bridge,'run',side_effect=[version,'']) as run:self.assertTrue(bridge.action('workspace','2')['ok']);self.assertEqual(run.call_args.args[0],expected)
 def test_workspace_snapshot_command_does_not_shadow_action(self):
  with patch.object(bridge,'run',side_effect=['0.54.3','']) as run:
   self.assertTrue(bridge.action('workspace','3')['ok']);self.assertEqual(run.call_args.args[0],['hyprctl','dispatch','workspace','3'])
 def test_mpv_null_data_is_success(self):
  client=unittest.mock.MagicMock();client.recv.return_value=b'{"data":null,"error":"success"}\n'
  with tempfile.TemporaryDirectory() as folder,patch.object(bridge,'__file__',str(pathlib.Path(folder)/'bridge.py')),patch.object(pathlib.Path,'exists',return_value=True),patch.object(bridge.socket,'socket',return_value=client):
   self.assertIs(bridge.mpv_ipc(['cycle','pause']),True)
 def test_running_local_player_toggles_without_spawning(self):
  with patch.object(bridge,'local_player_pid',return_value=123),patch.object(bridge,'mpv_ipc',side_effect=[False,True]),patch.object(bridge.subprocess,'Popen') as popen,patch.object(bridge.shutil,'which',return_value='/usr/bin/mpv'),tempfile.TemporaryDirectory() as folder:
   root=pathlib.Path(folder);(root/'audio').mkdir();(root/'audio/0.mp3').write_bytes(b'audio')
   with patch.object(bridge,'__file__',str(root/'bridge.py')):self.assertEqual(bridge.start_local_track('audio/0.mp3')['message'],'Local playback toggled')
   popen.assert_not_called()
 def test_local_track_is_confined_to_export_audio_directory(self):
  with tempfile.TemporaryDirectory() as folder:
   root=pathlib.Path(folder);(root/'audio').mkdir();(root/'audio/0.mp3').write_bytes(b'audio')
   with patch.object(bridge,'__file__',str(root/'bridge.py')),patch.object(bridge.shutil,'which',return_value='/usr/bin/mpv'),patch.object(bridge.subprocess,'Popen') as popen:
    self.assertTrue(bridge.action('local-track','audio/0.mp3')['ok']);self.assertIn(str(root/'audio/0.mp3'),popen.call_args.args[0])
    self.assertFalse(bridge.action('local-track','../secret.mp3')['ok'])
if __name__=='__main__':unittest.main()
