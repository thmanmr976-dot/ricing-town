import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,element,serialize,parse,validate} from '../dist/model.js';

test('custom widget content, shape and animation survive save and load',()=>{const p=fresh(),e=element('widget');e.custom={text:'CPU {{value}} at {{time}}',dataSource:'cpu',shape:'pill'};e.animation={kind:'pulse',duration:1800,delay:100,easing:'ease-in-out',enabled:true,iteration:'infinite'};p.elements.push(e);const q=parse(serialize(p)),saved=q.elements.at(-1);assert.deepEqual(saved.custom,e.custom);assert.deepEqual(saved.animation,e.animation);});
test('custom widget validation rejects script data and unbounded animation',()=>{const p=fresh(),e=element('text');p.elements.push(e);e.custom.dataSource='script';assert.throws(()=>validate(p));e.custom.dataSource='time';e.animation.duration=999999;assert.throws(()=>validate(p));});
