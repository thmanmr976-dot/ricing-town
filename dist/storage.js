import {parse,serialize} from './model.js';
const KEY='ricing-town.v1';
const INDEX_KEY='index';

function escapeXml(s){
 return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function renderThumbnailSvg(p){
 const w=Math.max(100,p?.canvas?.width||1920),h=Math.max(100,p?.canvas?.height||1080);
 const bg=escapeXml(p?.canvas?.background||'#11111b');
 const d=p?.canvas?.desktop||{};
 const gradEnd=escapeXml(d.gradientEnd||bg);
 const useGrad=d.mode==='gradient';
 const elements=Array.isArray(p?.elements)?p.elements:[];
 const byId=new Map(elements.map(e=>[e.id,e]));
 const rects=[];
 for(const e of elements.slice(0,40)){
  const parent=e.parentId?byId.get(e.parentId):null;
  const x=(parent?parent.x:0)+(e.x||0);
  const y=(parent?parent.y:0)+(e.y||0);
  const ew=Math.max(8,e.width||40);
  const eh=Math.max(6,e.height||24);
  const rx=e.custom?.shape==='circle'?Math.min(ew,eh)/2:e.custom?.shape==='pill'?eh/2:Math.min(120,e.radius||8);
  const fill=escapeXml(e.fill||'#1e1e2e');
  const stroke=escapeXml(e.appearance?.borderColor||e.color||'#cba6f7');
  const opacity=Math.max(.18,Math.min(1,e.appearance?.opacity??.9));
  rects.push(`<rect x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(ew)}" height="${Math.round(eh)}" rx="${Math.round(rx)}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-opacity="0.45" stroke-width="${Math.max(2,Math.round(w/480))}"/>`);
 }
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="320" height="180"><defs>${useGrad?`<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bg}"/><stop offset="100%" stop-color="${gradEnd}"/></linearGradient>`:''}</defs><rect width="${w}" height="${h}" fill="${useGrad?'url(#bg)':bg}"/>${rects.join('')}</svg>`;
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}

export class ProjectStorage{
 constructor(){this.db=null;this.chain=Promise.resolve();this.activeProjectId=null;}
 async init(){if(typeof indexedDB==='undefined')return;this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ricing-town',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async get(key){if(!this.db)return typeof localStorage!=='undefined'?localStorage.getItem(key==='current'?KEY:KEY+'.'+key):null;return new Promise((resolve,reject)=>{const r=this.db.transaction('projects').objectStore('projects').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async load(){const legacy=typeof localStorage!=='undefined'?localStorage.getItem(KEY):null;let latest=await this.get('current');if(!latest&&legacy){parse(legacy);await this.put('original',legacy);await this.put('current',legacy);latest=legacy;}if(!latest)return null;try{return parse(latest);}catch{const backup=await this.get('backup');if(backup)return parse(backup);throw Error('Stored project is damaged. Import a saved .rce or restore the original backup.');}}
 async put(key,value){if(!this.db){if(typeof localStorage!=='undefined')localStorage.setItem(key==='current'?KEY:KEY+'.'+key,value);return;}await new Promise((resolve,reject)=>{const t=this.db.transaction('projects','readwrite');t.objectStore('projects').put(value,key);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
 save(p){const text=serialize(p);const task=this.chain.catch(()=>{}).then(async()=>{const previous=await this.get('current');if(previous&&previous!==text)await this.put('backup',previous);await this.put('current',text);if(this.activeProjectId)await this._upsertIndexEntry(this.activeProjectId,p,text);});this.chain=task;return task;}
 async restore(){const text=await this.get('original')||await this.get('backup');if(!text)throw Error('No recovery copy is available');return parse(text);}
 async checkpoint(p){await this.put('original',serialize(p));}

 async listProjects(){
  try{
   const raw=await this.get(INDEX_KEY);
   const list=raw?JSON.parse(raw):[];
   if(!Array.isArray(list))return [];
   return list.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  }catch{return [];}
 }

 async _upsertIndexEntry(id,p,serializedText){
  const list=await this.listProjects();
  const now=Date.now();
  const entry={
   id,
   name:p.name||'Untitled Rice',
   updatedAt:now,
   width:p.canvas?.width||1920,
   height:p.canvas?.height||1080,
   elementCount:Array.isArray(p.elements)?p.elements.length:0,
   thumbnail:renderThumbnailSvg(p)
  };
  const idx=list.findIndex(item=>item.id===id);
  if(idx>=0)list[idx]=entry;else list.unshift(entry);
  await this.put('proj:'+id,serializedText??serialize(p));
  await this.put(INDEX_KEY,JSON.stringify(list.slice(0,50)));
  return entry;
 }

 async saveProjectEntry(p,id=this.activeProjectId||crypto.randomUUID()){
  const valid=parse(serialize(p));
  const text=serialize(valid);
  this.activeProjectId=id;
  await this.put('current',text);
  return this._upsertIndexEntry(id,valid,text);
 }

 async openProjectEntry(id){
  const raw=await this.get('proj:'+id);
  if(!raw)throw Error('Project entry could not be found in local storage.');
  const loaded=parse(raw);
  this.activeProjectId=id;
  await this.put('current',raw);
  return loaded;
 }

 async renameProjectEntry(id,newName){
  const clean=String(newName||'').trim().slice(0,120)||'Untitled Rice';
  const list=await this.listProjects();
  const item=list.find(x=>x.id===id);
  if(!item)return null;
  item.name=clean;
  item.updatedAt=Date.now();
  const raw=await this.get('proj:'+id);
  if(raw){
   try{
    const p=parse(raw);
    p.name=clean;
    const nextText=serialize(p);
    await this.put('proj:'+id,nextText);
    if(this.activeProjectId===id)await this.put('current',nextText);
   }catch{}
  }
  await this.put(INDEX_KEY,JSON.stringify(list));
  return item;
 }

 async duplicateProjectEntry(id){
  const raw=await this.get('proj:'+id);
  if(!raw)throw Error('Project not found');
  const p=parse(raw);
  p.name=(p.name||'Untitled')+' Copy';
  const newId=crypto.randomUUID();
  return this.saveProjectEntry(p,newId);
 }

 async deleteProjectEntry(id){
  const list=(await this.listProjects()).filter(x=>x.id!==id);
  await this.put(INDEX_KEY,JSON.stringify(list));
  if(this.activeProjectId===id)this.activeProjectId=list[0]?.id||null;
  return list;
 }
}
