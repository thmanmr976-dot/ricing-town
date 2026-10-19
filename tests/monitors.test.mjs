import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,element,parse,serialize,validate} from '../dist/model.js';
import {hyprlandLua,hyprlandLegacy} from '../dist/hyprland.js';
import {buildFiles} from '../dist/exporter.js';

test('multiple displays and element targets round trip',()=>{const p=fresh();p.monitors.push({id:'external',name:'External',output:'DP-1',width:2560,height:1440,mode:'2560x1440@144',position:'1440x0',scale:1,primary:false});const e=element('clock');e.monitorId='external';p.elements.push(e);const q=parse(serialize(p));assert.equal(q.monitors[1].output,'DP-1');assert.equal(q.elements.at(-1).monitorId,'external');});
test('Hyprland and Quickshell exports target named outputs',()=>{const p=fresh();p.monitors[0].output='eDP-1';p.monitors.push({id:'external',name:'External',output:'DP-1',width:1920,height:1080,mode:'preferred',position:'1440x0',scale:1,primary:false});const e=element('widget');e.monitorId='external';p.elements.push(e);assert.match(hyprlandLua(p),/output = "DP-1"/);assert.match(hyprlandLegacy(p),/monitor = DP-1, preferred, 1440x0, 1/);const files=buildFiles(p,{widget:'Item {}',bridge:''});assert.match(files['shell.qml'],/monitorVisible/);assert.match(files['shell.qml'],/external/);});
test('display validation rejects dangling targets and duplicate ids',()=>{const p=fresh();p.elements[0].monitorId='missing';assert.throws(()=>validate(p));const q=fresh();q.monitors.push({...q.monitors[0]});assert.throws(()=>validate(q));});
