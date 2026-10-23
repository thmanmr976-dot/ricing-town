import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fresh,element,parse,serialize} from '../dist/model.js';
import {desktop,changeSize,constrain,arrange,snap} from '../dist/design.js';
import {ProjectStorage,renderThumbnailSvg} from '../dist/storage.js';
import {buildFiles,exportReport} from '../dist/exporter.js';
import {zip} from '../dist/zip.js';
const original=readFileSync(new URL('../Hyprland-Amethyst.original.rce',import.meta.url),'utf8');
test('Amethyst migrates once and remains stable through later round trips',()=>{const migrated=parse(original);assert.equal(migrated.version,8);assert.equal(migrated.name,JSON.parse(original).name);assert.equal(migrated.elements.length,JSON.parse(original).elements.length);assert.deepEqual(parse(serialize(migrated)),migrated);});
test('all component types, background, assets, actions and appearance round trip',()=>{const p=fresh();p.canvas.desktop={...desktop(p),mode:'image',image:'data:image/png;base64,AQID',text:'Welcome',showText:false};p.assets=[{id:'font',name:'Test',extension:'ttf',data:'data:font/ttf;base64,BAUG'}];for(const type of ['dock','network','bluetooth','battery','notifications','launcher','music','cpu','memory','power'])p.elements.push(element(type));p.elements[0].appearance={opacity:.6,blur:15,shadow:20,borderWidth:2,borderColor:'#ffffff',font:'sans-serif',fontAsset:'font'};assert.deepEqual(parse(serialize(p)),p);const files=buildFiles(p,{widget:'qml',bridge:'python'});assert.deepEqual([...files['wallpaper.png']],[1,2,3]);assert.deepEqual([...files['fonts/0.ttf']],[4,5,6]);assert.deepEqual(parse(files['project.rce']),p);assert.ok(zip(files).length>1000);});

test('local audio and music waves round trip and export as a bounded media asset',()=>{const p=fresh(),music=element('music'),waves=element('visualizer');waves.spectrum={bars:48,sensitivity:2.2,smoothing:.8,secondaryColor:'#c8bfae',mirror:true,direction:'center',range:'bass'};waves.timeline={enabled:true,duration:1800,loop:true,keyframes:[{at:0,x:0,y:0,scale:1,rotation:0,opacity:.7},{at:1,x:20,y:-8,scale:1.1,rotation:4,opacity:1}]};waves.signalBindings=[{id:'bass-scale',source:'spectrumBass',target:'scale',inputMin:0,inputMax:1,outputMin:1,outputMax:1.2,smoothing:.7}];p.assets=[{id:'song',name:'Local song.mp3',extension:'mp3',data:'data:audio/mpeg;base64,AQID'}];music.mediaAsset='song';p.elements.push(music,waves);const saved=parse(serialize(p));assert.equal(saved.elements.at(-2).mediaAsset,'song');const files=buildFiles(saved,{widget:'Item {}',bridge:'python'});assert.deepEqual([...files['audio/0.mp3']],[1,2,3]);assert.match(files['shell.qml'],/bundledMedia/);assert.match(files['shell.qml'],/Play bundled track/);assert.equal(saved.elements.at(-1).spectrum.bars,48);assert.equal(saved.elements.at(-1).spectrum.engine,'cava');assert.equal(saved.elements.at(-1).spectrum.channels,'stereo');assert.match(files['shell.qml'],/"48","1","77","stereo","cava"/);assert.equal(saved.elements.at(-1).timeline.keyframes.length,2);assert.equal(saved.elements.at(-1).signalBindings[0].source,'spectrumBass');assert.match(files['shell.qml'],/id:audioEngine/);});
test('responsive resize and movement keep roots and children inside screen',()=>{const p=fresh(),bar=p.elements[0],child=element('battery');child.parentId=bar.id;p.elements.push(child);bar.anchorX='stretch';bar.anchorY='top';changeSize(p,800,500);for(const e of p.elements){const bounds=p.elements.find(n=>n.id===e.parentId)||p.canvas;assert.ok(e.x>=0&&e.y>=0&&e.x+e.width<=bounds.width&&e.y+e.height<=bounds.height);}child.x=9999;constrain(p,child);assert.equal(child.x+child.width,bar.width);});
test('alignment, spacing and snapping compute screen geometry',()=>{const p=fresh();p.elements=[element('battery',10,20),element('cpu',400,20),element('memory',900,20)];arrange(p,p.elements.map(e=>e.id),'distribute-x');assert.equal(p.elements[1].x,455);arrange(p,[p.elements[0].id],'right');assert.equal(p.elements[0].x,1290);p.elements[0].x=4;assert.ok(snap(p,p.elements[0]).some(g=>g.axis==='x'));assert.equal(p.elements[0].x,0);});
test('storage writes serialize in order, retain recovery and recover corrupt current',async()=>{const values=new Map();globalThis.localStorage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};try{const store=new ProjectStorage(),a=parse(original),b=structuredClone(a);b.name='Edited';await store.checkpoint(a);await Promise.all([store.save(a),store.save(b)]);assert.equal((await store.load()).name,'Edited');assert.equal((await store.restore()).name,a.name);values.set('ricing-town.v1','broken');assert.equal((await store.load()).name,a.name);}finally{delete globalThis.localStorage;}});
test('export warns about unsupported and unlinked behavior',()=>{const p=parse(original);assert.ok(exportReport(p).some(s=>s.includes('Unlinked shortcuts')));p.canvas.desktop={...desktop(p),mode:'gradient'};assert.ok(exportReport(p).some(s=>s.includes('Gradient angles')));});

test('live wallpaper survives rce and exports an honest mpvpaper launcher',()=>{const p=fresh();p.canvas.desktop={mode:'live',gradientEnd:'#34204d',angle:135,image:'',video:'data:video/mp4;base64,AQID',videoMuted:true,videoRate:1,fit:'cover',position:'center',showText:false,text:'',textColor:'#ffffff'};const saved=parse(serialize(p)),files=buildFiles(saved,{widget:'Item {}',bridge:'python',audioEngine:'python'});assert.equal(saved.canvas.desktop.mode,'live');assert.deepEqual([...files['live-wallpaper.mp4']],[1,2,3]);assert.match(files['start.sh'],/mpvpaper/);assert.match(files['start.sh'],/Live wallpaper unavailable/);assert.match(files['shell.qml'],/color:"transparent"/);assert.match(files['REQUIREMENTS.md'],/require mpvpaper/);});
test('start screen project index saves thumbnails, renames, duplicates, opens and deletes entries',async()=>{
 const values=new Map();
 globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 try{
  const store=new ProjectStorage();
  const p=fresh();p.name='Neon Test';
  const entry=await store.saveProjectEntry(p,'proj-1');
  assert.equal(entry.name,'Neon Test');
  assert.ok(entry.thumbnail.startsWith('data:image/svg+xml;charset=utf-8,'));
  assert.equal((await store.listProjects()).length,1);
  await store.renameProjectEntry('proj-1','Amethyst Renamed');
  const loaded=await store.openProjectEntry('proj-1');
  assert.equal(loaded.name,'Amethyst Renamed');
  const dup=await store.duplicateProjectEntry('proj-1');
  assert.equal(dup.name,'Amethyst Renamed Copy');
  assert.equal((await store.listProjects()).length,2);
  await store.deleteProjectEntry('proj-1');
  assert.equal((await store.listProjects()).length,1);
  assert.ok(renderThumbnailSvg(p).includes('svg'));
 }finally{
  delete globalThis.localStorage;
 }
});
