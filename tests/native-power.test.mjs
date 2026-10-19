import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildFiles} from '../dist/exporter.js';
import {fresh,element} from '../dist/model.js';

const project=fresh();
project.elements.push(element('power'));
const files=buildFiles(project,{widget:'Item {}',bridge:'mock'});
const shell=files['shell.qml'];
function state() {
  const context=vm.createContext({powerVisible:false,powerBusy:false,powerError:'',pendingPower:'',lastError:'',panelType:'',panelConfig:{},utility:{visible:false},powerActions:{command:[],running:false},Qt:{resolvedUrl:()=>({toString:()=> 'file:///test/bridge.py'})}});
  for(const name of ['openPanel','choosePower','cancelPower','finishPower']){
    const line=shell.split('\n').find(line=>line.startsWith(` function ${name}(`));
    assert.ok(line,`Missing ${name}`);vm.runInContext(line,context);
  }
  return context;
}
test('power widget exports a fullscreen layer menu on every screen with safe view-only IPC',()=>{
  assert.match(shell,/PowerMenu \{ required property var modelData; screen:modelData; runtime:root/);
  assert.match(files['PowerMenu.qml'],/anchors \{ left: true; right: true; top: true; bottom: true \}/);
  assert.match(files['PowerMenu.qml'],/WlrLayershell\.layer: WlrLayer\.Overlay/);
  assert.match(files['PowerMenu.qml'],/WlrKeyboardFocus\.Exclusive/);
  assert.match(files['PowerMenu.qml'],/Keys\.onEscapePressed/);
  const ipc=shell.split('\n').find(line=>line.includes('target:"powerMenu"'));
  assert.match(ipc,/function open\(\)/);assert.match(ipc,/function close\(\)/);assert.match(ipc,/function status\(\)/);
  assert.doesNotMatch(ipc,/choosePower|powerActions|root\.act\(/);
  assert.doesNotMatch(shell,/model:root\.panelType==="power"/);
});
test('Sleep Restart and Shut down each require confirmation and reject repeated busy clicks',()=>{
  for(const command of ['suspend','reboot','shutdown']){
    const s=state();s.openPanel('power',{});
    assert.equal(s.powerVisible,true);assert.equal(s.utility.visible,false);
    s.choosePower(command);assert.equal(s.pendingPower,command);assert.equal(s.powerActions.running,false);
    s.cancelPower();assert.equal(s.pendingPower,'');assert.equal(s.powerVisible,true);assert.equal(s.powerActions.running,false);
    s.choosePower(command);s.choosePower(command);
    assert.deepEqual(Array.from(s.powerActions.command),['python3','/test/bridge.py',command,'']);assert.equal(s.powerBusy,true);
    s.choosePower('lock');assert.equal(s.powerActions.command[2],command);
    s.cancelPower(true);assert.equal(s.powerVisible,true,'Cannot claim cancellation after command was sent');
    s.finishPower(0,'{"ok":true}','');assert.equal(s.powerBusy,false);assert.equal(s.powerVisible,false);
  }
});
test('Back Close Lock and failures preserve accurate menu state',()=>{
  const s=state();s.openPanel('power',{});s.choosePower('reboot');s.cancelPower(true);
  assert.equal(s.powerVisible,false);assert.equal(s.powerActions.running,false);
  s.openPanel('power',{});s.choosePower('lock');assert.equal(s.powerBusy,true);assert.equal(s.powerActions.command[2],'lock');
  s.finishPower(0,'{"ok":false,"error":"Missing application: hyprlock"}','');
  assert.equal(s.powerVisible,true);assert.equal(s.powerBusy,false);assert.equal(s.powerError,'Missing application: hyprlock');
  s.choosePower('exec');assert.equal(s.powerError,'Unsupported power action');
  s.finishPower(1,'','python3: not found');assert.equal(s.powerError,'python3: not found');assert.equal(s.powerVisible,true);
  s.finishPower(0,'null','');assert.equal(s.powerError,'The system rejected this action.');
  s.cancelPower(true);assert.equal(s.powerVisible,false);
});
