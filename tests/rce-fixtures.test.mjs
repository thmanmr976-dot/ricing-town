import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from '../dist/model.js';
import {buildFiles} from '../dist/exporter.js';
import {hyprlandLua,hyprlandLegacy} from '../dist/hyprland.js';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtures=[path.join(root,'Hyprland-Amethyst.original.rce'),...fs.readdirSync(path.join(root,'dist')).filter(name=>name.endsWith('.rce')).map(name=>path.join(root,'dist',name))];
const templates={widget:fs.readFileSync(path.join(root,'dist/runtime/Widget.qml'),'utf8'),bridge:fs.readFileSync(path.join(root,'dist/runtime/bridge.py'),'utf8')};

test('every bundled RCE validates and exports complete Hyprland and Quickshell files',()=>{
 assert.ok(fixtures.length>=5);
 for(const file of fixtures){
  const project=parse(fs.readFileSync(file,'utf8'));
  const files=buildFiles(project,templates);
  assert.match(files['shell.qml'],/ShellRoot/);
  assert.match(files['shell.qml'],/workspace-snapshot/);
  assert.match(files['Widget.qml'],/workspaceEnter/);
  assert.doesNotMatch(files['Widget.qml'],/\?\./);
  assert.match(files['bridge.py'],/gpu_busy_percent/);
  assert.match(hyprlandLua(project),/hl\.config/);
  assert.match(hyprlandLegacy(project),/general/);
  assert.doesNotThrow(()=>parse(files['project.rce']));
 }
});
