import test from 'node:test';
import assert from 'node:assert/strict';
class Node {
 constructor(tag='div'){this.tag=tag;this.children=[];this.style={};this.dataset={};this.attributes={};this.classList={toggle(){},remove(){},add(){}};this.value='';}
 append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this.attributes[k]=v;} addEventListener(k,fn){this[k]=fn;}
 getBoundingClientRect(){return {width:1000,height:800,left:0,top:0};}
 setPointerCapture(){} closest(){return null;}
 querySelector(s){return this.children.flatMap(n=>[n,...n.children]).find(n=>'.'+n.className===s);}
}
test('real app handlers preserve edits, history, containment and preview isolation',async()=>{
 const nodes=new Map(),events={},storage=new Map(),timers=new Map();
 globalThis.document={body:new Node(),querySelector(s){if(!nodes.has(s))nodes.set(s,new Node());return nodes.get(s);},createElement:t=>new Node(t),activeElement:{blur(){}}};
 globalThis.window={addEventListener(k,fn){events[k]=fn;}};
 globalThis.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
 const originals={setInterval, setTimeout,clearTimeout,requestAnimationFrame:globalThis.requestAnimationFrame};
 globalThis.setInterval=()=>0;globalThis.setTimeout=(fn,delay)=>{timers.set(delay,fn);return delay;};globalThis.clearTimeout=id=>timers.delete(id);globalThis.requestAnimationFrame=fn=>fn();
 try {await import('../dist/app.js');const get=s=>nodes.get(s);const state=()=>JSON.parse(storage.get('ricing-town.v1'));const persist=async()=>{timers.get(200)?.();await new Promise(resolve=>setImmediate(resolve));};const add=type=>get('#library').children.find(n=>n.id==='add-'+type).onclick();const key=(key,extra={})=>events.keydown({key,code:key,target:new Node(),preventDefault(){},...extra});
 add('clock');await persist();assert.equal(state().elements.length,3);
 key('d',{ctrlKey:true});await persist();assert.equal(state().elements.length,4);
 key('z',{ctrlKey:true});await persist();assert.equal(state().elements.length,3);
 key('z',{ctrlKey:true,shiftKey:true});await persist();assert.equal(state().elements.length,4);
 get('#layers').children[0].onclick({shiftKey:false});const before=state().elements.at(-1);key('ArrowRight',{shiftKey:true});await persist();assert.equal(state().elements.at(-1).x,before.x+10);
 const viewport=get('#viewport'),target=new Node();target.dataset.resize='se';target.closest=s=>s==='.element'?{dataset:{id:before.id}}:null;
 viewport.onpointerdown({target,button:0,clientX:100,clientY:100,pointerId:1,preventDefault(){}});viewport.onpointermove({clientX:140,clientY:130});viewport.onpointerup();await persist();assert.ok(state().elements.at(-1).width>before.width);key('z',{ctrlKey:true});await persist();assert.equal(state().elements.at(-1).width,before.width);
 add('bar');await persist();const bar=state().elements.at(-1);add('volume');await persist();const volume=state().elements.at(-1);assert.equal(volume.parentId,bar.id);assert.ok(volume.x+volume.width<=bar.width);
 get('#preview').onclick();assert.equal(get('#preview').attributes['aria-pressed'],'true');const savedBefore=storage.get('ricing-town.v1');key('Delete');await persist();assert.equal(storage.get('ricing-town.v1'),savedBefore);
 const widget=get('#elements').children.find(n=>n.dataset.id===volume.id);widget.onclick();assert.equal(get('#widget-popup').hidden,false);widget.onwheel({deltaY:-100,stopPropagation(){},preventDefault(){}});assert.equal(storage.get('ricing-town.v1'),savedBefore);get('#preview').onclick();assert.equal(get('#widget-popup').hidden,true);
 } finally {Object.assign(globalThis,originals);delete globalThis.document;delete globalThis.window;delete globalThis.localStorage;}
});
