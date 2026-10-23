import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,serialize,parse} from '../dist/model.js';
import {hyprlandLua,hyprlandLegacy,fullRiceReport,computeTilingLayout} from '../dist/hyprland.js';
import {buildFiles} from '../dist/exporter.js';
import {readFileSync} from 'node:fs';

test('full rice settings survive an rce round trip',()=>{const p=fresh();p.hyprland.gapsOut=24;p.hyprland.layout='master';p.integrations.shell='waybar';const q=parse(serialize(p));assert.equal(q.hyprland.gapsOut,24);assert.equal(q.hyprland.layout,'master');assert.equal(q.integrations.shell,'waybar');});
test('Hyprland exports contain selected visual settings',()=>{const p=fresh();p.hyprland.rounding=18;p.hyprland.activeBorder='#7aa2f7';const lua=hyprlandLua(p),legacy=hyprlandLegacy(p);assert.match(lua,/rounding = 18/);assert.match(lua,/0xff7aa2f7/);assert.match(legacy,/rounding = 18/);assert.ok(fullRiceReport(p).some(x=>x.includes('Hyprland appearance')));});
test('visual shortcuts and rules export without arbitrary commands',()=>{const p=fresh();p.automation.keybindings.push({id:'key-1',keys:'SUPER + RETURN',actionId:'terminal'});p.automation.windowRules.push({id:'window-1',class:'firefox',float:true,center:true,workspace:'2'});p.automation.workspaceRules.push({id:'workspace-1',workspace:'2',monitor:'DP-1',persistent:true});const lua=hyprlandLua(p);assert.match(lua,/SUPER \+ RETURN/);assert.match(lua,/hl\.window_rule/);assert.match(lua,/hl\.workspace_rule/);assert.doesNotMatch(lua,/eval|bash -c/);});
test('tiling preview layout computes dwindle, master and scrolling geometries with bar insets and window rules',()=>{
 const p=fresh();
 p.hyprland.gapsIn=8;p.hyprland.gapsOut=16;p.hyprland.windowCount=3;p.hyprland.focusedWindow=1;
 const dwindle=computeTilingLayout(p);
 assert.equal(dwindle.insets.top,84);
 assert.equal(dwindle.usable.y,100);
 assert.equal(dwindle.windows.length,3);
 assert.equal(dwindle.windows[1].focused,true);
 assert.ok(dwindle.windows[0].x<dwindle.windows[1].x);
 assert.ok(dwindle.windows[1].y<dwindle.windows[2].y);

 p.hyprland.layout='master';p.hyprland.splitRatio=0.6;
 const master=computeTilingLayout(p);
 assert.equal(master.windows[0].height,master.usable.height);
 assert.equal(master.windows[1].x,master.windows[2].x);

 p.hyprland.layout='scrolling';
 const scrolling=computeTilingLayout(p);
 assert.equal(scrolling.windows.length,3);

 p.automation.windowRules.push({id:'r1',class:'nvim',float:true,center:true,workspace:'3'});
 const withRule=computeTilingLayout(p);
 const editor=withRule.windows.find(w=>w.class==='nvim');
 assert.equal(editor.floating,true);
 assert.equal(editor.centered,true);
 assert.equal(editor.ruleWorkspace,'3');
});
test('gradient active border and tiling preview settings round-trip and export',()=>{
 const p=fresh();
 p.hyprland.windowPreview=true;p.hyprland.windowCount=4;p.hyprland.focusedWindow=2;
 p.hyprland.borderGradient=true;p.hyprland.activeBorder='#7aa2f7';p.hyprland.activeBorderEnd='#bb9af7';p.hyprland.borderAngle=60;
 const q=parse(serialize(p));
 assert.equal(q.hyprland.windowPreview,true);
 assert.equal(q.hyprland.borderGradient,true);
 assert.equal(q.hyprland.activeBorderEnd,'#bb9af7');
 assert.equal(q.hyprland.borderAngle,60);
 assert.match(hyprlandLua(q),/0xff7aa2f7 0xffbb9af7 60deg/);
 assert.match(hyprlandLegacy(q),/rgb\(7aa2f7\) rgb\(bb9af7\) 60deg/);
});
test('temporary session launcher and manager terminate shell_pid and process groups on stop',()=>{
 const p=fresh();
 const files=buildFiles(p,{widget:'Item {}',bridge:'python',audioEngine:'python'});
 assert.match(files['start.sh'],/kill -TERM "\$shell_pid"/);
 assert.match(files['start.sh'],/trap 'cleanup; exit 0' INT TERM HUP/);
 const managerPy=readFileSync(new URL('../dist/runtime/manager.py',import.meta.url),'utf8');
 assert.match(managerPy,/os\.killpg\(os\.getpgid\(PROCESS\.pid\), signal\.SIGTERM\)/);
 assert.match(managerPy,/_terminate_running_temp/);
});
