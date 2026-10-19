import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,serialize,parse} from '../dist/model.js';
import {hyprlandLua,hyprlandLegacy,fullRiceReport} from '../dist/hyprland.js';

test('full rice settings survive an rce round trip',()=>{const p=fresh();p.hyprland.gapsOut=24;p.hyprland.layout='master';p.integrations.shell='waybar';const q=parse(serialize(p));assert.equal(q.hyprland.gapsOut,24);assert.equal(q.hyprland.layout,'master');assert.equal(q.integrations.shell,'waybar');});
test('Hyprland exports contain selected visual settings',()=>{const p=fresh();p.hyprland.rounding=18;p.hyprland.activeBorder='#7aa2f7';const lua=hyprlandLua(p),legacy=hyprlandLegacy(p);assert.match(lua,/rounding = 18/);assert.match(lua,/0xff7aa2f7/);assert.match(legacy,/rounding = 18/);assert.ok(fullRiceReport(p).some(x=>x.includes('Hyprland appearance')));});
test('visual shortcuts and rules export without arbitrary commands',()=>{const p=fresh();p.automation.keybindings.push({id:'key-1',keys:'SUPER + RETURN',actionId:'terminal'});p.automation.windowRules.push({id:'window-1',class:'firefox',float:true,center:true,workspace:'2'});p.automation.workspaceRules.push({id:'workspace-1',workspace:'2',monitor:'DP-1',persistent:true});const lua=hyprlandLua(p);assert.match(lua,/SUPER \+ RETURN/);assert.match(lua,/hl\.window_rule/);assert.match(lua,/hl\.workspace_rule/);assert.doesNotMatch(lua,/eval|bash -c/);});
