import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

class Node {
 constructor(tag='div'){
  this.tag=tag;this.children=[];this.style={setProperty(k,v){this[k]=v;}};this.dataset={};this.attributes={};this.className='';this.value='';this.hidden=false;
  this.classList={toggle:(name,on)=>{const set=new Set(this.className.split(/\s+/).filter(Boolean));on?set.add(name):set.delete(name);this.className=[...set].join(' ');},remove:name=>{this.className=this.className.split(/\s+/).filter(x=>x&&x!==name).join(' ');},add:name=>{if(!this.className.split(/\s+/).includes(name))this.className=(this.className+' '+name).trim();}};
 }
 append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this.attributes[k]=v;} addEventListener(k,fn){this[k]=fn;}
 getBoundingClientRect(){return {width:1200,height:800,left:0,top:0};}
 setPointerCapture(){} closest(selector){return selector.startsWith('.')&&this.className.split(/\s+/).includes(selector.slice(1))?this:null;}
 querySelector(selector){for(const n of this.children){if(selector.split(',').some(s=>s.startsWith('.')?n.className.split(/\s+/).includes(s.slice(1)):s.startsWith('#')?n.id===s.slice(1):n.tag===s))return n;const nested=n.querySelector(selector);if(nested)return nested;}}
}

test('editor preview opens, moves and hides the Paper Calm panel without live redraws interrupting motion',async()=>{
 const nodes=new Map(),events={},storage=new Map(),timers=[];
 let now=0,cpu=24,playing=false;
 const project=await readFile(new URL('../staged/current.rce',import.meta.url),'utf8');
 storage.set('ricing-town.v1',project);
 globalThis.document={body:new Node('body'),head:new Node('head'),querySelector(s){const element=nodes.get('#elements')?.querySelector(s);if(element)return element;if(!nodes.has(s))nodes.set(s,new Node());return nodes.get(s);},createElement:t=>new Node(t),createElementNS:(_,t)=>new Node(t),activeElement:{blur(){}}};
 globalThis.window={addEventListener(k,fn){events[k]=fn;}};
 globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const originals={setInterval,setTimeout,clearTimeout,fetch,requestAnimationFrame:globalThis.requestAnimationFrame},dateNow=Date.now;
 globalThis.setInterval=()=>0;globalThis.setTimeout=(fn,delay)=>{timers.push({fn,delay,active:true});return timers.length;};globalThis.clearTimeout=id=>{if(timers[id-1])timers[id-1].active=false;};globalThis.requestAnimationFrame=fn=>fn();
 Date.now=()=>now;
 globalThis.fetch=async url=>({ok:true,json:async()=>url.endsWith('/v1/capabilities')?{protocol:1}:{data:{system:{available:true,cpu,memory:42},media:{available:true,title:'Test track',status:playing?'Playing':'Paused'}}}});
 const fire=async timer=>{assert.ok(timer?.active,'expected a pending timer');timer.active=false;await timer.fn();};
 try {
  await import('../dist/app.js?edge-preview');
  const get=s=>nodes.get(s);
  get('#preview').onclick();
  const elements=get('#elements').children;
  const rail=elements.find(n=>n.attributes['aria-label']==='Paper edge rail');
  assert.ok(rail.style.transform.includes('translate3d('));
  assert.notEqual(rail.style.transform,'translate3d(0,0,0)');
  const sensor=elements.find(n=>n.dataset.edgeSensor);
  sensor.onmouseenter();
  assert.equal(rail.style.transform,'translate3d(0,0,0)');
  rail.onmouseleave();
  timers.findLast(t=>t.delay===650).fn();
  assert.notEqual(rail.style.transform,'translate3d(0,0,0)');
  sensor.onmouseenter();
  assert.equal(rail.style.transform,'translate3d(0,0,0)');
  const power=elements.find(n=>n.attributes['aria-label']==='Power');
  const button=power.children[0].children.find(n=>n.attributes['aria-label']==='Open power menu');
  button.onclick({stopPropagation(){},target:button});
  assert.equal(get('#widget-popup').hidden,false);
  assert.ok(get('#widget-popup').children.some(n=>n.textContent==='Take a quiet pause.'));

  get('#preview').onclick();get('#preview').onclick();
  get('#artboard').getBoundingClientRect=()=>({left:10,right:1190,top:50,bottom:750,width:1180,height:700});
  const gutterRail=get('#elements').children.find(n=>n.attributes['aria-label']==='Paper edge rail');
  get('#viewport').onpointermove({clientX:1199,clientY:400,target:get('#viewport')});
  assert.equal(gutterRail.style.transform,'translate3d(0,0,0)','the viewport edge beyond the artboard opens the panel');
  get('#viewport').onpointermove({clientX:1120,clientY:400,target:gutterRail});
  assert.equal(timers.some(t=>t.active&&t.delay===650),false,'entering the panel from the gutter must not close it');
  get('#viewport').onpointermove({clientX:1199,clientY:400,target:get('#viewport')});
  get('#viewport').onpointerleave();
  await fire(timers.findLast(t=>t.active&&t.delay===650));
  assert.notEqual(gutterRail.style.transform,'translate3d(0,0,0)','leaving the viewport closes a gutter-opened panel');
  get('#viewport').onpointermove({clientX:1199,clientY:30,target:get('#viewport')});
  assert.notEqual(gutterRail.style.transform,'translate3d(0,0,0)','letterboxing above the artboard is not a side trigger');

  // Connect a fake helper through the existing data-mode UI, then deliver updates
  // during both opening and closing. Actual desktop actions are never requested.
  get('#preview').onclick();
  await get('#data-mode').onchange({target:{value:'live'}});
  get('#preview').onclick();
  const find=name=>get('#elements').children.find(n=>n.attributes['aria-label']===name);
  const edge=()=>get('#elements').children.find(n=>n.dataset.edgeSensor);
  const poll=()=>fire(timers.findLast(t=>t.active&&t.delay===1500));
  now=1490;edge().onmouseenter();const opening=find('Paper edge rail');
  now=1500;cpu=51;await poll();
  assert.equal(find('Paper edge rail'),opening,'a snapshot must retain the animating DOM node');
  assert.equal(get('#live-status').textContent,'Live · connected');
  now=1600;cpu=67;await poll();
  assert.equal(find('Paper edge rail'),opening,'intermediate snapshots coalesce');
  assert.equal(timers.filter(t=>t.active&&t.delay===250).length,1);
  get('#viewport').onpointermove({clientX:1120,clientY:400,target:opening});
  edge().onmouseenter(); // Child/sensor reentry must not extend the transition.
  now=1750;await fire(timers.findLast(t=>t.active&&t.delay===250));
  assert.equal(find('Paper edge rail'),opening,'settled telemetry updates retain the panel and its controls');
  assert.equal(find('CPU').querySelector('.widget-value').textContent.includes('67%'),true,'render the latest snapshot after motion');
  assert.equal(edge().attributes['aria-expanded'],'true','redrawn sensor reflects the open panel');

  const play=find('Now Playing').querySelector('.music-controls').children[1];
  for(let i=0;i<20;i++){now+=33;playing=i%2===0;await poll();assert.equal(find('Now Playing').querySelector('.music-controls').children[1],play,'frequent telemetry must not detach a clickable control');assert.equal(play.attributes['aria-label'],playing?'Pause':'Play');}
  // Viewport tracking closes after leaving without depending on mouseleave
  // from a particular element; workspace changes can still replace that node.
  get('#viewport').onpointermove({clientX:600,clientY:400,target:get('#viewport')});
  now=2400;await fire(timers.findLast(t=>t.active&&t.delay===650));
  const closing=find('Paper edge rail');
  now=2410;cpu=73;await poll();
  assert.equal(find('Paper edge rail'),closing,'closing motion retains its DOM node');
  assert.equal(edge().attributes['aria-expanded'],'false');
  now=2660;await fire(timers.findLast(t=>t.active&&t.delay===250));
  assert.equal(find('Paper edge rail'),closing);
  assert.notEqual(find('Paper edge rail').style.transform,'translate3d(0,0,0)');

  edge().onmouseenter();now=2670;await poll();
  const deferred=timers.findLast(t=>t.active&&t.delay===250);
  get('#preview').onclick();
  assert.equal(deferred.active,false,'leaving Preview cancels the queued redraw');
 } finally {
  Object.assign(globalThis,originals);Date.now=dateNow;delete globalThis.document;delete globalThis.window;delete globalThis.localStorage;
 }
});
