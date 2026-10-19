// Real Chromium hit testing and motion checks; no direct event-handler calls.
// PLAYWRIGHT_MODULE may point to a bundled Playwright directory.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(new URL('../..',import.meta.url).pathname);
const out=path.join(root,'verification/sidebar');await mkdir(out,{recursive:true});
const source=JSON.parse(await readFile(path.join(root,'staged/current.rce'),'utf8'));
const railSource=source.elements.find(e=>e.name==='Paper edge rail');
const base=process.env.RICING_URL||'http://127.0.0.1:5173/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const evidence={reproduction:null,checks:[]};
async function setup(viewport,old=false,mockLive=false){
 const context=await browser.newContext({viewport});const page=await context.newPage();
 if(mockLive)await page.addInitScript(()=>{
  // Exercise the actual LiveClient with a 30 Hz synthetic helper stream.
  // No requests or actions reach the user's desktop helper.
  const original=window.fetch.bind(window);let sequence=0,playing=false;
  const data=()=>({system:{available:true,cpu:24+sequence%20,memory:42},media:{available:true,status:playing?'Playing':'Paused',title:'Test track'},workspaces:{available:true,active:1}});
  window.fetch=async(input,init={})=>{
   const url=String(input);if(!url.startsWith('http://127.0.0.1:5174/'))return original(input,init);
   const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
   if(url.endsWith('/v1/capabilities'))return json({protocol:2});
   if(url.endsWith('/v1/snapshot'))return json({data:data()});
   if(url.endsWith('/v1/actions')){playing=!playing;return json({ok:true,message:'Synthetic action'});}
   if(url.endsWith('/v1/events')){
    let timer;const body=new ReadableStream({start(controller){timer=setInterval(()=>controller.enqueue(new TextEncoder().encode(JSON.stringify({sequence:++sequence,data:data()})+'\n')),33);init.signal?.addEventListener('abort',()=>{clearInterval(timer);controller.close();},{once:true});},cancel(){clearInterval(timer);}});
    return new Response(body);
   }
   throw Error('Unexpected helper request: '+url);
  };
 });
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(old)for(const file of ['app.js','style.css'])await page.route('**/'+file+'*',r=>r.fulfill({body:readOld[file],contentType:file.endsWith('css')?'text/css':'text/javascript'}));
 await page.goto(base);await page.waitForFunction(()=>document.querySelector('#save-status').textContent!=='Opening project…');
 await page.locator('#file').setInputFiles({name:'Paper-Calm.rce',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});
 await page.getByRole('button',{name:'▤ Paper edge rail',exact:true}).waitFor();
 if(mockLive){await page.getByLabel('Data mode',{exact:true}).selectOption('live');await page.waitForFunction(()=>document.querySelector('#live-status').textContent==='Live · connected');}
 await page.getByRole('button',{name:'▶ Preview',exact:true}).click();
 await page.waitForTimeout(150);
 return {context,page,errors};
}
async function hit(page,x,y){return page.evaluate(({x,y})=>{const el=document.elementFromPoint(x,y);return {id:el?.id,label:el?.getAttribute('aria-label'),cls:el?.className};},{x,y});}
async function state(page){return page.evaluate(()=>{const el=document.querySelector('[aria-label="Paper edge rail"]');return {x:el.getBoundingClientRect().x,translate:getComputedStyle(el).transform,inline:el.style.transform};});}
const readOld={};
try{
 if(process.argv.includes('--compare-before')){
 for(const file of ['app.js','style.css'])readOld[file]=await readFile(path.join(root,'verification/sidebar-before',file),'utf8');
 const before=await setup({width:1366,height:900},true);let p=before.page;
 const sensor=p.locator('.hot-edge-sensor');const b=await sensor.boundingBox();
 const pos={x:b.x+b.width/2,y:b.y+b.height/2};const target=await hit(p,pos.x,pos.y);
 await p.mouse.move(pos.x,pos.y);await p.waitForTimeout(400);
 evidence.reproduction={target,afterHover:await state(p)};
 assert.equal(target.id,'guides','before: empty guide layer must reproduce the pointer interception');
 assert.notEqual((await state(p)).inline,'translate3d(0px, 0px, 0px)');
 await p.screenshot({path:path.join(out,'before-blocked.png')});await before.context.close();
 }
 let p;
 for(const viewport of (process.argv.includes('--live-only')?[]:[{width:1366,height:900},{width:1000,height:800},{width:700,height:820}])){
  const test=await setup(viewport);p=test.page;
  const rail=p.locator('[aria-label="Paper edge rail"]'),sensor=p.locator('.hot-edge-sensor');
  const board=await p.locator('#artboard').boundingBox(),b=await sensor.boundingBox();
  const point={x:b.x+b.width/2,y:b.y+b.height/2};
  assert.equal((await hit(p,point.x,point.y)).label,'Reveal Paper edge rail');
  const hidden=await state(p);assert.ok(hidden.x>=board.x+board.width-1);
  await p.mouse.move(viewport.width-1,board.y-1);await p.waitForTimeout(300);
  assert.notEqual((await state(p)).inline,'translate3d(0px, 0px, 0px)','top letterbox is not an activation region');
  await p.mouse.move(point.x,point.y);await p.waitForTimeout(70);const motion1=await state(p);
  await p.waitForTimeout(80);const motion2=await state(p);
  await p.waitForTimeout(200);const opened=await state(p);
  const expected=board.x+railSource.x*(board.width/source.canvas.width);
  assert.ok(hidden.x>motion1.x&&motion1.x>motion2.x&&motion2.x>=opened.x-1,'panel slides leftwards from the right');
  assert.ok(Math.abs(opened.x-expected)<2,'panel ends at its saved location');
  await p.getByRole('button',{name:'Workspace 2',exact:true}).hover();
  await p.waitForTimeout(900);assert.equal((await state(p)).inline,'translate3d(0px, 0px, 0px)');
  await p.getByRole('button',{name:'Workspace 2',exact:true}).click();await p.waitForTimeout(1700);
  assert.equal((await state(p)).inline,'translate3d(0px, 0px, 0px)','stays open after workspace redraw');
  assert.equal(await sensor.getAttribute('aria-expanded'),'true');
  assert.ok((await p.locator('[aria-label="Daily note"]').innerText()).length>0);
  await p.getByRole('button',{name:'Workspace 3',exact:true}).click();await p.waitForTimeout(1700);
  assert.equal((await state(p)).inline,'translate3d(0px, 0px, 0px)','stays open on Workspace 3');
  const power=p.getByRole('button',{name:'Open power menu',exact:true});const pb=await power.boundingBox();
  assert.equal((await hit(p,pb.x+pb.width/2,pb.y+pb.height/2)).label,'Open power menu','Power remains above Workspace 3');
  await power.click();await p.getByRole('heading',{name:'Take a quiet pause.'}).waitFor();
  const popup=await p.locator('#widget-popup').boundingBox();assert.equal(Math.round(popup.width),viewport.width);assert.equal(Math.round(popup.height),viewport.height);
  await p.getByRole('button',{name:'Restart',exact:true}).click();await p.getByRole('heading',{name:'Are you sure?'}).waitFor();
  await p.getByRole('button',{name:'Cancel power action',exact:true}).click();
  await p.getByRole('button',{name:'Close power menu'}).click();
  await p.mouse.move(point.x,point.y);await p.waitForTimeout(350);
  await p.getByRole('button',{name:'Workspace 1',exact:true}).click();await p.waitForTimeout(1700);
  if(viewport.width===1366)await p.screenshot({path:path.join(out,'after-open.png')});
  await p.mouse.move(board.x+board.width/2,board.y+board.height/2);await p.waitForTimeout(1050);
  assert.notEqual((await state(p)).inline,'translate3d(0px, 0px, 0px)','closes after leaving');
  if(viewport.width===1366)await p.screenshot({path:path.join(out,'after-closed.png')});
  await p.mouse.move(viewport.width-1,point.y);await p.waitForTimeout(1000);
  assert.equal((await state(p)).inline,'translate3d(0px, 0px, 0px)','jumping to the actual viewport edge opens and stays open');
  await p.getByRole('button',{name:'Workspace 1',exact:true}).hover();await p.waitForTimeout(800);
  assert.equal((await state(p)).inline,'translate3d(0px, 0px, 0px)','entering the panel from the gutter keeps it open');
  assert.deepEqual(test.errors,[]);
  evidence.checks.push({viewport,hit:await hit(p,point.x,point.y),hidden,motion1,motion2,opened,checks:'hover, motion, controls, workspace 2/3, power/cancel, exit/reopen, actual viewport edge/gutter'});
  if(viewport.width===1366){
   await p.getByRole('button',{name:'Hide all controls',exact:true}).click();
   await p.mouse.move(board.x+board.width/2,board.y+board.height/2);await p.waitForTimeout(1050);
   assert.notEqual((await state(p)).inline,'translate3d(0px, 0px, 0px)');
   await p.mouse.move(point.x,point.y);await p.waitForTimeout(350);
   assert.equal((await state(p)).inline,'translate3d(0px, 0px, 0px)','works with all editor controls hidden');
   await p.keyboard.press('Escape');
   // Drag the visible rail in Design, then undo; this exercises the formerly blocked canvas too.
   await p.locator('#snap').uncheck();
   const beforeDrag=await rail.boundingBox();
   await p.mouse.move(beforeDrag.x+3,beforeDrag.y+beforeDrag.height/2);await p.mouse.down();
   await p.mouse.move(beforeDrag.x-27,beforeDrag.y+beforeDrag.height/2,{steps:6});await p.mouse.up();
   assert.ok(Math.abs((await rail.boundingBox()).x-(beforeDrag.x-30))<2,'rail can be dragged directly in Design');
   await p.getByRole('button',{name:'Undo',exact:true}).click();
   assert.ok(Math.abs((await rail.boundingBox()).x-beforeDrag.x)<2,'undo restores the rail');
   await p.waitForFunction(()=>document.querySelector('#save-status').textContent==='Saved locally');
   await p.reload();await p.getByRole('button',{name:'▤ Paper edge rail',exact:true}).waitFor();
   await p.getByRole('button',{name:'▶ Preview',exact:true}).click();await p.waitForTimeout(200);
   const reloaded=await sensor.boundingBox();await p.mouse.move(reloaded.x+reloaded.width/2,reloaded.y+reloaded.height/2);await p.waitForTimeout(350);
   assert.equal((await state(p)).inline,'translate3d(0px, 0px, 0px)','works after autosave and reload');
   evidence.checks.push({checks:'clean preview, actual Design drag, undo, autosave/reload'});
  }
  await test.context.close();
 }
 const streamed=await setup({width:1366,height:900},false,true);p=streamed.page;
 const b=await p.evaluate(()=>document.querySelector('.hot-edge-sensor').getBoundingClientRect().toJSON()),point={x:b.x+b.width/2,y:b.y+b.height/2};
 const hidden=await state(p);await p.mouse.move(point.x,point.y);
 const samples=[];for(let i=0;i<4;i++){await p.waitForTimeout(40);samples.push(await state(p));}
 await p.waitForTimeout(180);const opened=await state(p);
 assert.ok(hidden.x>samples[0].x&&samples[0].x>samples[1].x&&samples[1].x>samples[2].x&&samples[2].x>opened.x+1,'Live telemetry must not cancel the slide');
 await p.getByRole('button',{name:'Play',exact:true}).click();await p.getByRole('button',{name:'Pause',exact:true}).waitFor();
 await p.waitForTimeout(1000);assert.equal((await state(p)).inline,'translate3d(0px, 0px, 0px)','Live redraw and clicking keep the panel open');
 await p.getByRole('button',{name:'Pause',exact:true}).click();await p.getByRole('button',{name:'Play',exact:true}).waitFor();
 await p.mouse.move(600,400);await p.waitForTimeout(1050);
 assert.notEqual((await state(p)).inline,'translate3d(0px, 0px, 0px)','Live panel closes after leaving');
 assert.deepEqual(streamed.errors,[]);evidence.checks.push({mode:'synthetic Live stream, 30 Hz',hidden,samples,opened,checks:'continuous slide, play/pause updates, stay open, leave'});
 await streamed.context.close();
 console.log(JSON.stringify(evidence,null,2));
}finally{await writeFile(path.join(out,'results.json'),JSON.stringify(evidence,null,2));await browser.close();}
