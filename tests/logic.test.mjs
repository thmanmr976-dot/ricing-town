import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,element,parse,serialize,validate} from '../dist/model.js';
import {activeRule,matches,resolvedStyle} from '../dist/logic.js';

const rule={id:'low',enabled:true,source:'battery',operator:'lt',value:20,style:{fill:'#ff0000',color:'#ffffff',opacity:.8,text:'Low · {{value}}',animation:'pulse'}};
test('visual logic evaluates bounded numeric and boolean conditions in order',()=>{assert.equal(matches(rule,{battery:19}),true);assert.equal(matches(rule,{battery:20}),false);const network={...rule,source:'network',operator:'eq',value:false};assert.equal(matches(network,{network:false}),true);});
test('visual logic round trips and resolves appearance',()=>{const p=fresh(),e=element('widget');e.logic=[rule];p.elements.push(e);const q=parse(serialize(p)),saved=q.elements.at(-1);assert.equal(activeRule(saved,{battery:10}).id,'low');assert.deepEqual(resolvedStyle(saved,{battery:10}),{rule:saved.logic[0],fill:'#ff0000',color:'#ffffff',opacity:.8,text:'Low · {{value}}',animation:'pulse'});});
test('visual logic rejects unsafe and unbounded rules',()=>{const p=fresh(),e=element('widget');p.elements.push(e);e.logic=[{...rule,source:'shell'}];assert.throws(()=>validate(p));e.logic=Array.from({length:9},(_,i)=>({...rule,id:String(i)}));assert.throws(()=>validate(p));});
