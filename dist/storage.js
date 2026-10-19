import {parse,serialize} from './model.js';
const KEY='ricing-town.v1';
export class ProjectStorage{
 constructor(){this.db=null;this.chain=Promise.resolve();}
 async init(){if(typeof indexedDB==='undefined')return;this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ricing-town',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async get(key){if(!this.db)return localStorage.getItem(key=== 'current'?KEY:KEY+'.'+key);return new Promise((resolve,reject)=>{const r=this.db.transaction('projects').objectStore('projects').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async load(){const legacy=localStorage.getItem(KEY);let latest=await this.get('current');if(!latest&&legacy){parse(legacy);await this.put('original',legacy);await this.put('current',legacy);latest=legacy;}if(!latest)return null;try{return parse(latest);}catch{const backup=await this.get('backup');if(backup)return parse(backup);throw Error('Stored project is damaged. Import a saved .rce or restore the original backup.');}}
 async put(key,value){if(!this.db){localStorage.setItem(key==='current'?KEY:KEY+'.'+key,value);return;}await new Promise((resolve,reject)=>{const t=this.db.transaction('projects','readwrite');t.objectStore('projects').put(value,key);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
 save(p){const text=serialize(p);const task=this.chain.catch(()=>{}).then(async()=>{const previous=await this.get('current');if(previous&&previous!==text)await this.put('backup',previous);await this.put('current',text);});this.chain=task;return task;}
 async restore(){const text=await this.get('original')||await this.get('backup');if(!text)throw Error('No recovery copy is available');return parse(text);}
 async checkpoint(p){await this.put('original',serialize(p));}
}
