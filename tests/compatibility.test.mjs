import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,element,parse,serialize} from '../dist/model.js';
import {analyzeCompatibility,quickshellSubset} from '../dist/compatibility.js';
import {buildHybridFiles} from '../dist/hybrid.js';

test('compatibility compiler routes panel modules and freeform widgets',async()=>{
 const p=fresh(),bar=p.elements[0],clock=p.elements[1];clock.parentId=bar.id;
 const custom=element('widget',300,300);p.elements.push(custom);
 const report=analyzeCompatibility(p);
 assert.equal(report.items.find(i=>i.id===clock.id).backend,'waybar');
 assert.equal(report.items.find(i=>i.id===custom.id).backend,'quickshell');
 const subset=quickshellSubset(p);assert.deepEqual(subset.elements.map(e=>e.id),[custom.id]);
 const files=await buildHybridFiles(p,{widget:'import QtQuick\nItem {}',bridge:'print("{}")'});
 assert.ok(files['waybar/config.jsonc']);assert.ok(files['quickshell/shell.qml']);
 assert.match(files['start.sh'],/waybar/);assert.match(files['start.sh'],/quickshell/);
});

test('version 5 projects migrate and asset-pack metadata round trips',()=>{
 const p=fresh();p.version=5;const upgraded=parse(JSON.stringify(p));assert.equal(upgraded.version,8);
 upgraded.assetPacks=[{id:'pack',name:'LocalTheme',kind:'icons',license:'MIT',source:'local',files:[{path:'index.theme',sha256:'a'.repeat(64),data:'data:text/plain;base64,QQ=='}]}];
 assert.deepEqual(parse(serialize(upgraded)).assetPacks,upgraded.assetPacks);
});
