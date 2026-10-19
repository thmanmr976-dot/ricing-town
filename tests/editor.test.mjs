import test from 'node:test';
import assert from 'node:assert/strict';
import {history,resize,options} from '../dist/editor-core.js';
import {fresh,parse,serialize,validate} from '../dist/model.js';
test('history restores edits, skips no-ops and discards redo after a new edit',()=>{const h=history({x:1});h.push({x:2});h.push({x:2});assert.deepEqual(h.undo(),{x:1});assert.deepEqual(h.redo(),{x:2});h.undo();h.push({x:3});assert.equal(h.redo(),null);assert.deepEqual(h.undo(),{x:1});});
test('resize opposite edges stay anchored, minimum size prevents flipping',()=>{const b={x:100,y:100,width:200,height:80};assert.deepEqual(resize(b,'nw',30,20),{x:130,y:120,width:170,height:60});assert.deepEqual(resize(b,'se',-500,-500),{x:100,y:100,width:20,height:20});assert.deepEqual(resize(b,'w',500,0),{x:280,y:100,width:20,height:80});});
test('legacy projects load and new shortcut data round trips',()=>{const p=fresh();delete p.elements[0].options;assert.equal(options(parse(serialize(p)).elements[0]).items.length,1);p.elements[1].options.items.push({id:'new',icon:'⌘',label:'Terminal',action:'kitty',shortcut:'Super+Return'});p.elements[1].options.showSeconds=true;assert.deepEqual(parse(serialize(p)),p);});
test('malformed shortcut data is rejected',()=>{for(const value of [{items:[null]},{padding:-2},{showDate:'yes'},{items:[{id:'x',icon:'',label:'',action:4,shortcut:''}]}]){const p=fresh();p.elements[0].options=value;assert.throws(()=>validate(p));}});
