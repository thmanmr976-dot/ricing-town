import test from 'node:test';
import assert from 'node:assert/strict';
import {ADVANCED_PRESETS} from '../dist/advanced-presets.js';
import {validate,serialize,parse} from '../dist/model.js';
import {hyprlandLua} from '../dist/hyprland.js';
import {buildFiles} from '../dist/exporter.js';

test('advanced rice designs are unique, valid, editable round-trips and exportable',()=>{
 assert.ok(ADVANCED_PRESETS.length>=6);
 const projects=ADVANCED_PRESETS.map(p=>validate(p.create()));
 assert.equal(new Set(projects.map(p=>p.name)).size,ADVANCED_PRESETS.length);
 for(const p of projects){
  const q=parse(serialize(p));
  assert.equal(q.elements.length,p.elements.length);
  assert.match(hyprlandLua(q),/hl\.config/);
  assert.ok(buildFiles(q,{widget:'Item {}',bridge:'',audioEngine:''})['shell.qml'].length>0);
 }
 // Each call returns an independent copy so editing one project never mutates the design.
 const a=ADVANCED_PRESETS[0].create(),b=ADVANCED_PRESETS[0].create();
 a.elements[0].fill='#000000';
 assert.notEqual(a.elements[0].id,b.elements[0].id);
 assert.notEqual(b.elements[0].fill,'#000000');
 assert.ok(projects.some(p=>p.elements.some(e=>e.reveal?.mode==='hot-edge')));
 assert.ok(projects.some(p=>p.elements.some(e=>e.type==='visualizer')));
 assert.ok(projects.some(p=>p.hyprland.borderGradient));
});
