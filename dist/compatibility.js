import {validate} from './model.js';

const NATIVE=new Set(['workspaces','clock','volume','brightness','network','bluetooth','battery','notifications','music','cpu','memory','temperature','disk','power']);
const FREEFORM=new Set(['widget','text','shape','dock','launcher','uptime','visualizer']);

export function analyzeCompatibility(project){
 const p=validate(project),byId=new Map(p.elements.map(e=>[e.id,e])),items=[];
 for(const e of p.elements){
  let status='native',backend='waybar',reasons=[];
  const parent=e.parentId&&byId.get(e.parentId);
  if(e.type==='bar'){status='native';reasons.push('Waybar can render this top or bottom panel.');}
  else if(FREEFORM.has(e.type)){status='quickshell';backend='quickshell';reasons.push('Free positioning, custom composition or drawing requires Quickshell.');}
  else if(!NATIVE.has(e.type)){status='quickshell';backend='quickshell';reasons.push('No safe native Waybar module is available.');}
  else if(!parent||!['bar','dock'].includes(parent.type)){status='quickshell';backend='quickshell';reasons.push('The component is free-floating rather than a child of a Waybar panel.');}
  else reasons.push('A native Waybar module is available.');
  if(status==='native'&&e.animation?.enabled&&e.animation.kind!=='none'){status='approximated';reasons.push('Waybar CSS cannot preserve this animation exactly.');}
  if(status!=='quickshell'&&(e.appearance?.blur||e.appearance?.shadow)){status='approximated';reasons.push('Blur or shadow depends on GTK and compositor support.');}
  items.push({id:e.id,name:e.name,type:e.type,status,backend,reasons});
 }
 const counts={native:0,approximated:0,quickshell:0};for(const item of items)counts[item.status]++;
 return {strategy:p.integrations.shell,items,counts,summary:`${counts.native} native · ${counts.approximated} approximated · ${counts.quickshell} Quickshell`};
}

export function quickshellSubset(project){
 const p=validate(project),report=analyzeCompatibility(p),quick=new Set(report.items.filter(i=>i.backend==='quickshell').map(i=>i.id));
 for(const e of p.elements)if(quick.has(e.id)&&e.parentId)quick.add(e.parentId);
 const copy=structuredClone(p);copy.integrations.shell='quickshell';copy.elements=copy.elements.filter(e=>quick.has(e.id));
 for(const e of copy.elements)if(e.parentId&&!quick.has(e.parentId))e.parentId=null;
 return copy;
}
