import {readFile,writeFile} from 'node:fs/promises';
import {DESKTOP_PRESETS} from '../dist/presets.js';
import {serialize,validate} from '../dist/model.js';
import {exportFullRice,hyprlandLua,hyprlandLegacy} from '../dist/hyprland.js';

const preset=DESKTOP_PRESETS.find(p=>p.name==='Paper Calm Edge');
if(!preset)throw Error('Paper Calm Edge preset is missing');
const project=validate(preset.create());
await writeFile(new URL('../dist/Paper-Calm-Edge.rce',import.meta.url),serialize(project));
globalThis.fetch=async path=>({ok:true,text:()=>readFile(new URL('../dist/'+path,import.meta.url),'utf8')});
await writeFile(new URL('../Paper-Calm-Edge-full-rice.zip',import.meta.url),await exportFullRice(project));
await writeFile(new URL('../Paper-Calm-Edge.lua',import.meta.url),hyprlandLua(project));
await writeFile(new URL('../Paper-Calm-Edge.conf',import.meta.url),hyprlandLegacy(project));
console.log(JSON.stringify({name:project.name,elements:project.elements.length,hotEdge:project.elements.filter(e=>e.reveal?.mode==='hot-edge').map(e=>e.name),shell:project.integrations.shell},null,2));
