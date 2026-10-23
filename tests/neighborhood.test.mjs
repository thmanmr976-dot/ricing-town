import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fresh,element,serialize,parse,validate} from '../dist/model.js';
import {buildFiles} from '../dist/exporter.js';
import {formatCustomValue,STUDIO_BLUEPRINTS} from '../dist/neighborhood-studio.js';
import {meterRatio} from '../dist/widget-spec.js';

test('custom widget content, shape and animation survive save and load',()=>{const p=fresh(),e=element('widget');e.custom={text:'CPU {{value}} at {{time}}',dataSource:'cpu',shape:'pill'};e.animation={kind:'pulse',duration:1800,delay:100,easing:'ease-in-out',enabled:true,iteration:'infinite'};p.elements.push(e);const q=parse(serialize(p)),saved=q.elements.at(-1);assert.deepEqual(saved.custom,e.custom);assert.deepEqual(saved.animation,e.animation);});
test('custom widget validation rejects script data and unbounded animation',()=>{const p=fresh(),e=element('text');p.elements.push(e);e.custom.dataSource='script';assert.throws(()=>validate(p));e.custom.dataSource='time';e.animation.duration=999999;assert.throws(()=>validate(p));});
test('studio meters, gradients, hover micro-interactions, bounce/shake animations and multi-trigger actions survive round-trip and export to Quickshell',()=>{
 const p=fresh();
 for(const bp of STUDIO_BLUEPRINTS){
  const nodes=bp.make();
  p.elements.push(...nodes);
 }
 const custom=element('widget',140,140);
 custom.custom={text:'TEMP {{number}}° · {{value}}',dataSource:'temperature',shape:'rectangle'};
 custom.animation={kind:'bounce',duration:1400,delay:50,easing:'ease-in-out',enabled:true,iteration:'infinite'};
 custom.meter={style:'ring',source:'temperature',min:20,max:100,color:'#f7768e',track:'#ffffff',thickness:10};
 custom.hover={enabled:true,scale:1.08,lift:6};
 custom.appearance={opacity:.85,blur:14,shadow:20,borderWidth:1,borderColor:'#7aa2f7',font:'monospace',fontAsset:'',gradient:{enabled:true,end:'#312346',angle:135}};
 custom.actions={
  click:{type:'openPanel',params:{panel:'calendar'}},
  rightClick:{type:'muteToggle',params:{}},
  scrollUp:{type:'volumeStep',params:{delta:5}},
  scrollDown:{type:'volumeStep',params:{delta:-5}}
 };
 p.elements.push(custom);
 const roundTrip=parse(serialize(p));
 const saved=roundTrip.elements.find(n=>n.id===custom.id);
 assert.equal(saved.meter.style,'ring');
 assert.equal(saved.hover.scale,1.08);
 assert.equal(saved.appearance.gradient.enabled,true);
 assert.equal(saved.actions.scrollUp.params.delta,5);
 assert.equal(meterRatio(saved,{temperature:60}),0.5);
 const formatted=formatCustomValue(saved,{temperature:60},2);
 assert.match(formatted,/TEMP 60° · 60°C/);
 const templates={
  widget:fs.readFileSync(new URL('../dist/runtime/Widget.qml',import.meta.url),'utf8'),
  bridge:fs.readFileSync(new URL('../dist/runtime/bridge.py',import.meta.url),'utf8'),
  audioEngine:fs.readFileSync(new URL('../dist/runtime/audio_engine.py',import.meta.url),'utf8')
 };
 const files=buildFiles(roundTrip,templates);
 assert.match(files['Widget.qml'],/meterStyle/);
 assert.match(files['Widget.qml'],/hoverSpec/);
 assert.match(files['Widget.qml'],/rightClick/);
 assert.doesNotMatch(files['Widget.qml'],/\?\./);
});
