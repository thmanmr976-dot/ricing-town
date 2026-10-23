import {element,TYPES,validate} from './model.js';
import {options,resize,clamp} from './editor-core.js';
import {behavior,attach,family,cloneFamily} from './components.js';
import {APPS,ICONS,TYPE_META,actionId,isContainer} from './catalog.js';
import {appearance,constrain,autoLayout,rgba} from './design.js';
import {ACTIONS,action,validateAction,actionLabel} from './actions.js';
import {resolvedStyle} from './logic.js';
import { sanitizeScopedCss } from './safe-assets.js';
import {
 ANIMATION_KINDS,ANIMATION_LABELS,DATA_SOURCES,DATA_LABELS,
 LOGIC_SOURCES,BINDING_SOURCES,METER_SOURCES,SOURCE_LABELS,
 METER_STYLES,TRIGGER_LABELS,SHAPES,
 meter,hover,gradient,meterRatio
} from './widget-spec.js';

export function formatCustomValue(e,data={},activeWorkspace=1){
 const c=e.custom||{},now=new Date();
 const time=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(now);
 const date=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long'}).format(now);
 const template=e.workspaceContent?.[activeWorkspace-1]??c.text;
 const src=c.dataSource||'static';
 const raw=src==='workspace'?activeWorkspace:data[src];
 const formatted={
  static:template,
  time,
  date,
  cpu:(data.cpu??24)+'% CPU',
  memory:(data.memory??42)+'% RAM',
  battery:(data.battery??78)+'% battery',
  music:data.music||data.title||'Amethyst skies',
  network:(data.network??data.connected??true)?'Connected':'Offline',
  volume:data.muted?'Muted':(data.volume??65)+'%',
  brightness:(data.brightness??72)+'%',
  temperature:(data.temperature??48)+'°C',
  disk:(data.disk??37)+'% disk',
  gpu:data.gpu==null?'31% GPU':data.gpu+'% GPU',
  uptime:data.uptime||'3h 24m',
  workspace:'Workspace '+activeWorkspace
 }[src]??template??'';
 const numText=raw!=null&&Number.isFinite(Number(raw))?String(Math.round(Number(raw))):'–';
 const output=template===''?'':(template||'{{value}}');
 return output
  .replaceAll('{{value}}',String(formatted))
  .replaceAll('{{number}}',numText)
  .replaceAll('{{time}}',time)
  .replaceAll('{{date}}',date);
}

export function applyElementVisuals(el,content,e,data={}){
 const a=appearance(e),g=gradient(e),h=hover(e),m=meter(e),style=resolvedStyle(e,data);
 const baseFill=style.fill||e.fill,alpha=style.opacity??a.opacity??1;
 if(g.enabled){
  el.style.background=`linear-gradient(${g.angle}deg,${rgba(baseFill,alpha)},${rgba(g.end,alpha)})`;
 }else{
  el.style.background=rgba(baseFill,alpha);
 }
 el.style.color=style.color||e.color;
 if(h.enabled){
  el.classList.add('has-hover-effect');
  el.style.setProperty?.('--hover-scale',String(h.scale));
  el.style.setProperty?.('--hover-lift',`${-h.lift}px`);
 }else{
  el.classList.remove('has-hover-effect');
 }
 const oldMeter=content?.querySelector?.('.widget-meter');
 if(oldMeter){if(typeof oldMeter.remove==='function')oldMeter.remove();else if(Array.isArray(content?.children))content.children=content.children.filter(c=>c!==oldMeter);}
 if(content&&m.style&&m.style!=='none'){
  const ratio=meterRatio(e,data),pct=Math.round(ratio*100);
  const wrap=document.createElement('div');
  wrap.className='widget-meter meter-'+m.style;
  wrap.setAttribute('aria-label',`${m.source} meter ${pct}%`);
  if(m.style==='bar'){
   const track=document.createElement('div'),fill=document.createElement('div');
   track.className='meter-track-h';
   Object.assign(track.style,{height:m.thickness+'px',background:rgba(m.track,.22),borderRadius:m.thickness+'px'});
   fill.className='meter-fill-h';
   Object.assign(fill.style,{width:(ratio*100)+'%',height:'100%',background:m.color,borderRadius:m.thickness+'px'});
   track.append(fill);wrap.append(track);
  }else if(m.style==='vbar'){
   const track=document.createElement('div'),fill=document.createElement('div');
   track.className='meter-track-v';
   Object.assign(track.style,{width:m.thickness+'px',background:rgba(m.track,.22),borderRadius:m.thickness+'px'});
   fill.className='meter-fill-v';
   Object.assign(fill.style,{height:(ratio*100)+'%',width:'100%',background:m.color,borderRadius:m.thickness+'px'});
   track.append(fill);wrap.append(track);
  }else if(m.style==='ring'&&typeof document.createElementNS==='function'){
   const size=Math.max(24,Math.min(e.width,e.height)-(options(e).padding||0)*2);
   const stroke=Math.max(2,Math.min(size/2-2,m.thickness));
   const r=Math.max(4,(size-stroke)/2),circ=2*Math.PI*r;
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   svg.setAttribute('viewBox',`0 0 ${size} ${size}`);
   svg.setAttribute('width',String(size));
   svg.setAttribute('height',String(size));
   svg.className='meter-ring-svg';
   const bgCircle=document.createElementNS('http://www.w3.org/2000/svg','circle');
   bgCircle.setAttribute('cx',String(size/2));bgCircle.setAttribute('cy',String(size/2));bgCircle.setAttribute('r',String(r));
   bgCircle.setAttribute('fill','none');bgCircle.setAttribute('stroke',rgba(m.track,.22));bgCircle.setAttribute('stroke-width',String(stroke));
   const fgCircle=document.createElementNS('http://www.w3.org/2000/svg','circle');
   fgCircle.setAttribute('cx',String(size/2));fgCircle.setAttribute('cy',String(size/2));fgCircle.setAttribute('r',String(r));
   fgCircle.setAttribute('fill','none');fgCircle.setAttribute('stroke',m.color);fgCircle.setAttribute('stroke-width',String(stroke));
   fgCircle.setAttribute('stroke-linecap','round');
   fgCircle.setAttribute('stroke-dasharray',String(circ));
   fgCircle.setAttribute('stroke-dashoffset',String(circ*(1-ratio)));
   fgCircle.setAttribute('transform',`rotate(-90 ${size/2} ${size/2})`);
   svg.append(bgCircle,fgCircle);wrap.append(svg);
  }
  if(typeof content.prepend==='function')content.prepend(wrap);else content.append(wrap);
 }
}

export const STUDIO_BLUEPRINTS=[
 {
  name:'Circular Telemetry Ring',
  description:'Ring gauge with centered live percentage and label',
  make(){
   const root=element('widget',120,140);
   Object.assign(root,{name:'Telemetry Ring',width:220,height:220,fill:'#181825',color:'#cdd6f4',radius:34,fontSize:26});
   root.custom={text:'CPU\n{{number}}%',dataSource:'cpu',shape:'rectangle'};
   root.appearance={opacity:.88,blur:16,shadow:24,borderWidth:1,borderColor:'#313244',font:'sans-serif',fontAsset:'',gradient:{enabled:true,end:'#1e1e2e',angle:145}};
   root.meter={style:'ring',source:'cpu',min:0,max:100,color:'#cba6f7',track:'#ffffff',thickness:12};
   root.hover={enabled:true,scale:1.04,lift:4};
   return [root];
  }
 },
 {
  name:'Glass Media Controller',
  description:'Interactive music card with spectrum bar and hover lift',
  make(){
   const root=element('widget',100,120);
   Object.assign(root,{name:'Glass Media Controller',width:420,height:170,fill:'#1e1e2e',color:'#cdd6f4',radius:26,fontSize:18});
   root.custom={text:'',dataSource:'static',shape:'rectangle'};
   root.appearance={opacity:.82,blur:20,shadow:30,borderWidth:1,borderColor:'#7aa2f7',font:'sans-serif',fontAsset:'',gradient:{enabled:true,end:'#312346',angle:135}};
   root.hover={enabled:true,scale:1.02,lift:3};
   const title=element('text');
   Object.assign(title,{name:'Track Title',parentId:root.id,x:22,y:18,width:376,height:42,fill:'#1e1e2e',color:'#f5e0dc',fontSize:20,radius:10});
   title.appearance={opacity:0,blur:0,shadow:0,borderWidth:0,borderColor:'#000000',font:'sans-serif',fontAsset:''};
   title.custom={text:'♫  {{value}}',dataSource:'music',shape:'rectangle'};
   const controls=element('music');
   Object.assign(controls,{name:'Player Controls',parentId:root.id,x:22,y:66,width:376,height:44,fill:'#11111b',color:'#cba6f7',radius:14,fontSize:15});
   const waves=element('visualizer');
   Object.assign(waves,{name:'Mini Spectrum',parentId:root.id,x:22,y:118,width:376,height:36,fill:'#11111b',color:'#7aa2f7',radius:10,fontSize:12});
   waves.appearance={opacity:0,blur:0,shadow:0,borderWidth:0,borderColor:'#000000',font:'sans-serif',fontAsset:''};
   waves.spectrum={style:'bars',bars:32,sensitivity:1.4,smoothing:.4,secondaryColor:'#cba6f7',mirror:true,direction:'up',range:'full',engine:'cava',autosens:true,noiseReduction:77,channels:'mono'};
   return [root,title,controls,waves];
  }
 },
 {
  name:'Cyberpunk System Bars',
  description:'Multi-bar CPU, RAM and Battery telemetry stack with logic',
  make(){
   const root=element('widget',90,110);
   Object.assign(root,{name:'System Bars HUD',width:360,height:210,fill:'#111827',color:'#e5e7eb',radius:24,fontSize:16});
   root.custom={text:'',dataSource:'static',shape:'rectangle'};
   root.appearance={opacity:.9,blur:14,shadow:26,borderWidth:2,borderColor:'#38bdf8',font:'monospace',fontAsset:''};
   const items=[['CPU Load','cpu','#38bdf8',20],['Memory','memory','#a855f7',82],['Battery','battery','#4ade80',144]];
   const out=[root];
   for(const [label,src,col,y] of items){
    const row=element('text');
    Object.assign(row,{name:label,parentId:root.id,x:20,y,width:320,height:48,fill:'#1f2937',color:'#f8fafc',radius:12,fontSize:14});
    row.custom={text:`${label.toUpperCase()} · {{number}}%`,dataSource:src,shape:'rectangle'};
    row.meter={style:'bar',source:src,min:0,max:100,color:col,track:'#ffffff',thickness:8};
    out.push(row);
   }
   return out;
  }
 }
];

export function createNeighborhoodStudio({
 getProject,
 commitProject,
 renderApp,
 getSelectedId,
 setSelectedId,
 notify,
 openFontUpload,
 openSvgUpload,
 runWidgetAction
}){
 const dialog=document.querySelector('#neighborhood-dialog');
 if(!dialog)return {open(){},close(){},refresh(){}};

 let activeRootId=null;
 let activeLayerId=null;
 let activeTab='design';
 let interactiveMode=false;
 let stageZoom=1;
 let stageDrag=null;
 const testSignals={cpu:34,memory:58,battery:76,volume:68,brightness:80,temperature:49,disk:41,gpu:29,spectrumBass:.45,spectrumMid:.35,spectrumTreble:.25,spectrumBeat:.6,network:true,musicPlaying:true,charging:false,music:'Midnight Synthwave'};

 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const btn=(text,fn,cls,label)=>{const b=node('button',text,cls);b.type='button';b.onclick=fn;if(label)b.setAttribute('aria-label',label);return b;};

 function findRootWidget(p,id){
  let e=p.elements.find(n=>n.id===id);
  while(e?.parentId){const parent=p.elements.find(n=>n.id===e.parentId);if(!parent)break;e=parent;}
  return e;
 }

 function ensureStudioRoot(){
  const p=getProject();
  const sel=getSelectedId();
  if(sel){
   const r=findRootWidget(p,sel);
   if(r){activeRootId=r.id;activeLayerId=sel;return;}
  }
  const existing=p.elements.find(e=>!e.parentId&&['widget','text','shape'].includes(e.type))||p.elements.find(e=>!e.parentId);
  if(existing){
   activeRootId=existing.id;
   activeLayerId=existing.id;
  }
 }

 function activeRoot(){
  const p=getProject();
  return p.elements.find(e=>e.id===activeRootId&&!e.parentId)||null;
 }

 function activeLayer(){
  const p=getProject();
  return p.elements.find(e=>e.id===activeLayerId)||activeRoot();
 }

 function createNewWidget(kind='widget'){
  commitProject(p=>{
   if(p.elements.length>=1000)throw Error('Layer limit reached');
   const w=element(kind,Math.round((p.canvas.width-360)/2),Math.round((p.canvas.height-220)/2));
   if(kind==='widget'){
    Object.assign(w,{name:'Custom Studio Widget',width:380,height:220,fill:'#181825',color:'#cdd6f4',radius:24,fontSize:22});
    w.custom={text:'{{time}}\n{{date}}',dataSource:'time',shape:'rectangle'};
    w.appearance={opacity:.9,blur:14,shadow:24,borderWidth:1,borderColor:'#cba6f7',font:'sans-serif',fontAsset:''};
   }
   p.elements.push(w);
   constrain(p,w);
   activeRootId=w.id;
   activeLayerId=w.id;
   setSelectedId(w.id);
  });
  refreshStudio();
  notify('New custom widget created in Studio.');
 }

 function addChildLayer(type,presetKind=''){
  const root=activeRoot();
  if(!root){createNewWidget('widget');return;}
  commitProject(p=>{
   const r=p.elements.find(n=>n.id===root.id);
   if(!r)return;
   if(!isContainer(r)){
    r.type='widget';
    r.custom={text:r.custom?.text||'',dataSource:r.custom?.dataSource||'static',shape:r.custom?.shape||'rectangle'};
   }
   if(p.elements.length>=1000)throw Error('Layer limit reached');
   const child=element(type,18,18);
   child.parentId=r.id;
   const siblings=p.elements.filter(n=>n.parentId===r.id);
   child.y=Math.min(Math.max(12,r.height-60),16+siblings.length*28);
   child.x=Math.min(Math.max(12,r.width-120),16+(siblings.length%3)*24);
   if(type==='text'){
    Object.assign(child,{name:'Text Layer '+(siblings.length+1),width:Math.min(220,Math.max(60,r.width-36)),height:48,fontSize:18,radius:12,fill:r.fill,color:r.color});
    child.appearance={opacity:0,blur:0,shadow:0,borderWidth:0,borderColor:r.color,font:'sans-serif',fontAsset:''};
    child.custom={text:'Label · {{value}}',dataSource:'cpu',shape:'rectangle'};
   }else if(type==='shape'){
    Object.assign(child,{name:presetKind==='ring'?'Ring Gauge':presetKind==='bar'?'Progress Bar':'Shape '+(siblings.length+1),width:presetKind==='ring'?96:Math.min(200,Math.max(40,r.width-36)),height:presetKind==='ring'?96:36,radius:presetKind==='ring'?48:14,fill:'#313244',color:'#cba6f7',fontSize:14});
    child.custom={text:presetKind? '{{number}}%' : '',dataSource:'cpu',shape:presetKind==='ring'?'circle':'pill'};
    if(presetKind==='ring'||presetKind==='bar'){
     child.meter={style:presetKind,source:'cpu',min:0,max:100,color:'#cba6f7',track:'#ffffff',thickness:presetKind==='ring'?10:8};
    }
   }else{
    child.width=Math.min(child.width,Math.max(60,r.width-24));
    child.height=Math.min(child.height,Math.max(28,r.height-24));
   }
   p.elements.push(child);
   constrain(p,child);
   activeLayerId=child.id;
   setSelectedId(child.id);
  });
  refreshStudio();
 }

 function duplicateLayer(targetId){
  const p=getProject(),target=p.elements.find(e=>e.id===targetId);
  if(!target)return;
  commitProject(proj=>{
   if(!target.parentId){
    const fam=family(proj,target.id);
    const cloned=cloneFamily(fam);
    proj.elements.push(...cloned);
    const newRoot=cloned.find(n=>!n.parentId);
    if(newRoot){constrain(proj,newRoot);activeRootId=newRoot.id;activeLayerId=newRoot.id;setSelectedId(newRoot.id);}
   }else{
    const copy=structuredClone(target);
    copy.id=crypto.randomUUID();
    copy.name=target.name+' copy';
    copy.x=clamp(target.x+16,0,10000);
    copy.y=clamp(target.y+16,0,10000);
    proj.elements.push(copy);
    constrain(proj,copy);
    activeLayerId=copy.id;
    setSelectedId(copy.id);
   }
  });
  refreshStudio();
 }

 function deleteLayer(targetId){
  const p=getProject(),target=p.elements.find(e=>e.id===targetId);
  if(!target)return;
  commitProject(proj=>{
   proj.elements=proj.elements.filter(e=>e.id!==targetId&&e.parentId!==targetId);
   if(targetId===activeRootId){
    const next=proj.elements.find(e=>!e.parentId&&['widget','text','shape'].includes(e.type))||proj.elements.find(e=>!e.parentId);
    activeRootId=next?.id||null;
    activeLayerId=activeRootId;
   }else{
    activeLayerId=activeRootId;
   }
   setSelectedId(activeLayerId);
  });
  refreshStudio();
 }

 function reorderChild(targetId,delta){
  commitProject(proj=>{
   const i=proj.elements.findIndex(e=>e.id===targetId);
   if(i<0)return;
   const [item]=proj.elements.splice(i,1);
   proj.elements.splice(clamp(i+delta,0,proj.elements.length),0,item);
  });
  refreshStudio();
 }

 function makeField(parent,label,value,onChange,{type='text',min,max,step=1,choices,maxLength=200,wide=false}={}){
  const wrap=node('label',label,wide?'wide':'');
  const input=node(choices?'select':type==='textarea'?'textarea':'input');
  input.setAttribute('aria-label',label);
  if(choices){
   for(const entry of choices){
    const [v,t]=Array.isArray(entry)?entry:[entry,entry];
    const opt=node('option',t);opt.value=String(v);input.append(opt);
   }
  }else if(type!=='textarea'){
   input.type=type;input.maxLength=maxLength;
   if(min!==undefined)input.min=min;
   if(max!==undefined)input.max=max;
   input.step=step;
  }else input.maxLength=maxLength;
  if(type==='checkbox')input.checked=Boolean(value);
  else input.value=String(value??'');

  const apply=(rerenderInspector=false)=>{
   const v=type==='checkbox'?input.checked:type==='number'||type==='range'?Number(input.value):input.value;
   if((type==='number'||type==='range')&&(!Number.isFinite(v)||input.value===''||(min!==undefined&&v<min)||(max!==undefined&&v>max)))return;
   commitProject(proj=>{onChange(v,proj);});
   renderStage();
   renderLayerList();
   if(rerenderInspector)renderInspector();
  };
  if(choices||type==='checkbox'){
   input.onchange=()=>apply(true);
  }else{
   input.oninput=()=>apply(false);
   input.onchange=()=>apply(true);
  }
  wrap.append(input);
  parent.append(wrap);
  return input;
 }

 let stageWrap=null,layerTreeBox=null,inspectorBox=null,rootSelectEl=null,modeToggleBtn=null;

 function renderStage(){
  if(!stageWrap)return;
  stageWrap.replaceChildren();
  const p=getProject(),root=activeRoot();
  if(!root){
   const empty=node('div',undefined,'studio-empty-state');
   empty.append(
    node('h3','No widget selected'),
    node('p','Create a blank custom widget or choose a template on the left to start building.'),
    btn('+ Create Custom Widget',()=>createNewWidget('widget'),'studio-primary-btn')
   );
   stageWrap.append(empty);
   return;
  }

  const art=node('div',undefined,'studio-artboard');
  const pad=48;
  const stageW=Math.max(460,root.width+pad*2);
  const stageH=Math.max(300,root.height+pad*2);
  Object.assign(art.style,{
   width:stageW+'px',
   height:stageH+'px',
   background:p.canvas.background,
   transform:`scale(${stageZoom})`
  });

  const nodes=[root,...p.elements.filter(e=>e.parentId===root.id)];
  for(const e of nodes){
   const isRoot=e.id===root.id;
   const a=appearance(e),o=options(e),style=resolvedStyle(e,testSignals);
   const el=node('div',undefined,'studio-element'+(e.id===activeLayerId&&!interactiveMode?' selected':'')+(interactiveMode?' interactive':'')+(isRoot?' is-root':' is-child'));
   el.dataset.layerId=e.id;
   el.setAttribute('aria-label',e.name);
   const left=isRoot?pad:pad+e.x;
   const top=isRoot?pad:pad+e.y;
   const tl={enabled:false,duration:2000,loop:true,keyframes:[],...e.timeline};
   const animKind=style.animation&&style.animation!=='none'?style.animation:(e.animation?.enabled?e.animation.kind:'none');
   const animCss=animKind&&animKind!=='none'?`rt-${animKind} ${e.animation?.duration||1200}ms ${e.animation?.easing||'ease-in-out'} ${e.animation?.delay||0}ms ${e.animation?.iteration||'infinite'}`:'none';
   Object.assign(el.style,{
    left:left+'px',
    top:top+'px',
    width:e.width+'px',
    height:e.height+'px',
    borderRadius:e.custom?.shape==='circle'?'50%':e.custom?.shape==='pill'?'999px':e.radius+'px',
    clipPath:e.custom?.shape==='diamond'?'polygon(50% 0,100% 50%,50% 100%,0 50%)':'none',
    fontSize:e.fontSize+'px',
    border:`${a.borderWidth}px solid ${a.borderColor}`,
    backdropFilter:`blur(${a.blur}px)`,
    boxShadow:a.shadow?`0 ${Math.round(a.shadow/3)}px ${a.shadow}px #0008`:'none',
    fontFamily:a.fontAsset?`asset-${a.fontAsset}`:a.font,
    animation:animCss
   });

   const content=node('div',undefined,'widget-content');
   Object.assign(content.style,{
    padding:o.padding+'px',
    gap:o.gap+'px',
    flexDirection:o.orientation==='vertical'?'column':'row',
    justifyContent:({'start':'flex-start','end':'flex-end'})[o.align]||o.align
   });

   if(o.svgAsset){
    const asset=(p.assets||[]).find(x=>x.id===o.svgAsset&&x.extension==='svg');
    if(asset){
     const img=node('img');
     img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(asset.data);
     img.width=o.iconSize;img.height=o.iconSize;
     content.append(img);
    }
   }

   if(['widget','text','shape'].includes(e.type)){
    const rawText=formatCustomValue(e,testSignals,1);
    const display=style.text?style.text.replaceAll('{{value}}',rawText):rawText;
    const span=node('span',display,'custom-value');
    span.style.whiteSpace='pre-wrap';
    span.style.textAlign=o.align==='start'?'left':o.align==='end'?'right':'center';
    content.append(span);
   }else if(e.type==='visualizer'){
    const s={style:'bars',bars:24,sensitivity:1.4,secondaryColor:e.color,...e.spectrum};
    const waves=node('div',undefined,'music-waves playing style-'+s.style+' direction-'+(s.direction||'up'));
    for(let i=0;i<Math.min(48,s.bars||24);i++){
     const bar=node('i');
     const val=Math.min(1,Math.max(.08,((i*7)%11)/11*(testSignals.spectrumBass+.3)*s.sensitivity));
     bar.style.setProperty('--wave',String(val));
     bar.style.background=`linear-gradient(0deg,${e.color},${s.secondaryColor||e.color})`;
     waves.append(bar);
    }
    content.append(waves);
   }else{
    const icon=o.icon||TYPE_META[e.type]?.[0]||'◈';
    const sample=formatCustomValue({custom:{text:'{{value}}',dataSource:e.type==='clock'?'time':e.type}},testSignals,1);
    content.append(node('span',`${icon} ${sample}`,'widget-value'));
   }

   for(const item of o.items||[]){
    const chip=node('span',`${item.icon?item.icon+' ':''}${item.label}`,'widget-item');
    chip.style.fontSize=e.fontSize+'px';
    content.append(chip);
   }

   applyElementVisuals(el,content,e,testSignals);

   const mapped={opacity:1,scale:1,rotation:0,xOffset:0,yOffset:0};
   for(const b of e.signalBindings||[]){
    const raw=testSignals[b.source];
    if(raw==null)continue;
    const ratio=Math.max(0,Math.min(1,(Number(raw)-b.inputMin)/Math.max(.0001,b.inputMax-b.inputMin)));
    mapped[b.target]=b.outputMin+ratio*(b.outputMax-b.outputMin);
   }
   if((e.signalBindings||[]).length){
    content.style.opacity=String(mapped.opacity);
    content.style.transform=`translate(${mapped.xOffset}px,${mapped.yOffset}px) scale(${mapped.scale}) rotate(${mapped.rotation}deg)`;
   }
   if(tl.enabled&&tl.keyframes?.length>=2){
    const badge=node('span',`⏱ ${tl.keyframes.length} keyframes · ${tl.duration}ms`,'studio-timeline-badge');
    el.append(badge);
   }

   el.append(content);

   if(!interactiveMode&&e.id===activeLayerId){
    for(const dir of ['nw','n','ne','e','se','s','sw','w']){
     const h=node('span',undefined,'resize-handle '+dir);
     h.dataset.resize=dir;
     el.append(h);
    }
   }

   el.onpointerdown=ev=>{
    ev.stopPropagation();
    if(interactiveMode){
     const trig=ev.button===2?'rightClick':'click';
     const act=e.actions?.[trig]||root.actions?.[trig];
     if(act&&act.type!=='none'){
      runWidgetAction(act);
     }else{
      notify(`Tested ${trig} on "${e.name}" (assign an action in the Mechanism & Actions tab).`);
     }
     return;
    }
    activeLayerId=e.id;
    setSelectedId(e.id);
    const handle=ev.target?.dataset?.resize;
    const pNow=getProject(),target=pNow.elements.find(n=>n.id===e.id);
    if(!target)return;
    stageDrag={
     id:e.id,
     isRoot,
     mode:handle?'resize':'move',
     handle,
     box:structuredClone(target),
     startX:ev.clientX,
     startY:ev.clientY
    };
    renderStage();
    renderLayerList();
    renderInspector();
   };

   el.oncontextmenu=ev=>{
    if(interactiveMode){
     ev.preventDefault();
     const act=e.actions?.rightClick||root.actions?.rightClick;
     if(act&&act.type!=='none')runWidgetAction(act);
    }
   };

   el.onwheel=ev=>{
    if(!interactiveMode)return;
    ev.preventDefault();
    ev.stopPropagation();
    const key=ev.deltaY<0?'scrollUp':'scrollDown';
    const act=e.actions?.[key]||root.actions?.[key];
    if(act&&act.type!=='none')runWidgetAction(act);
   };

   art.append(el);
  }
  stageWrap.append(art);
 }

 window.addEventListener('pointermove',ev=>{
  if(!stageDrag||!dialog.open)return;
  const dx=(ev.clientX-stageDrag.startX)/stageZoom;
  const dy=(ev.clientY-stageDrag.startY)/stageZoom;
  commitProject(p=>{
   const target=p.elements.find(n=>n.id===stageDrag.id);
   if(!target)return;
   if(stageDrag.mode==='resize'){
    const next=resize(stageDrag.box,stageDrag.handle,dx,dy);
    target.width=next.width;
    target.height=next.height;
    if(!stageDrag.isRoot){target.x=next.x;target.y=next.y;}
    constrain(p,target);
   }else if(!stageDrag.isRoot){
    target.x=Math.round(stageDrag.box.x+dx);
    target.y=Math.round(stageDrag.box.y+dy);
    constrain(p,target);
   }else{
    target.x=clamp(Math.round(stageDrag.box.x+dx),0,Math.max(0,p.canvas.width-target.width));
    target.y=clamp(Math.round(stageDrag.box.y+dy),0,Math.max(0,p.canvas.height-target.height));
   }
  });
  renderStage();
 });

 window.addEventListener('pointerup',()=>{
  if(stageDrag){
   stageDrag=null;
   renderInspector();
  }
 });

 function renderLayerList(){
  if(!layerTreeBox)return;
  layerTreeBox.replaceChildren();
  const p=getProject(),root=activeRoot();
  if(rootSelectEl){
   rootSelectEl.replaceChildren();
   const roots=p.elements.filter(e=>!e.parentId);
   for(const r of roots){
    const opt=node('option',`${TYPE_META[r.type]?.[0]||'⬡'} ${r.name} (${r.width}×${r.height})`);
    opt.value=r.id;
    rootSelectEl.append(opt);
   }
   if(root)rootSelectEl.value=root.id;
  }
  if(!root)return;
  const items=[root,...p.elements.filter(e=>e.parentId===root.id)];
  for(const item of items){
   const isRoot=item.id===root.id;
   const row=node('div',undefined,'studio-layer-row'+(item.id===activeLayerId?' selected':''));
   const pick=btn(`${isRoot?'⬡ ':'↳ '}${TYPE_META[item.type]?.[0]||'◆'} ${item.name}`,()=>{
    activeLayerId=item.id;
    setSelectedId(item.id);
    renderStage();
    renderLayerList();
    renderInspector();
   },'studio-layer-pick');
   const tools=node('div',undefined,'studio-layer-tools');
   if(!isRoot){
    tools.append(
     btn('↑',()=>reorderChild(item.id,-1),'studio-mini-btn','Move layer up'),
     btn('↓',()=>reorderChild(item.id,1),'studio-mini-btn','Move layer down')
    );
   }
   tools.append(
    btn('⧉',()=>duplicateLayer(item.id),'studio-mini-btn','Duplicate layer'),
    btn('×',()=>deleteLayer(item.id),'studio-mini-btn danger-mini','Delete layer')
   );
   row.append(pick,tools);
   layerTreeBox.append(row);
  }
 }

 function renderInspector(){
  if(!inspectorBox)return;
  inspectorBox.replaceChildren();
  const p=getProject(),e=activeLayer(),root=activeRoot();
  if(!e||!root){
   inspectorBox.append(node('p','Select or create a widget layer to edit its properties.'));
   return;
  }
  const isRoot=e.id===root.id;
  const o=options(e),a=appearance(e),g=gradient(e),h=hover(e),m=meter(e);

  if(activeTab==='design'){
   const sec=node('section',undefined,'property-section'),grid=node('div',undefined,'fields');
   sec.append(node('h3',isRoot?`Root Container · ${e.name}`:`Child Layer · ${e.name}`),grid);
   makeField(grid,'Layer name',e.name,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.name=v;},{wide:true});
   makeField(grid,isRoot?'Desktop X':'Offset X',e.x,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t){t.x=v;constrain(proj,t);}},{type:'number',min:0,max:10000});
   makeField(grid,isRoot?'Desktop Y':'Offset Y',e.y,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t){t.y=v;constrain(proj,t);}},{type:'number',min:0,max:10000});
   makeField(grid,'Width',e.width,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t){t.width=v;constrain(proj,t);}},{type:'number',min:e.type==='shape'?2:20,max:10000});
   makeField(grid,'Height',e.height,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t){t.height=v;constrain(proj,t);}},{type:'number',min:e.type==='shape'?2:20,max:10000});
   makeField(grid,'Corner radius',e.radius,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.radius=v;},{type:'number',min:0,max:500});
   makeField(grid,'Font size',e.fontSize,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.fontSize=v;},{type:'number',min:8,max:200});
   if(['widget','text','shape'].includes(e.type)){
    makeField(grid,'Geometry shape',e.custom?.shape||'rectangle',(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.custom={text:'',dataSource:'static',shape:'rectangle',...t.custom,shape:v};},{choices:SHAPES.map(s=>[s,s[0].toUpperCase()+s.slice(1)])});
   }
   makeField(grid,'Padding',o.padding,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.options={...options(t),padding:v};},{type:'number',min:0,max:200});
   makeField(grid,'Item gap',o.gap,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.options={...options(t),gap:v};},{type:'number',min:0,max:200});
   makeField(grid,'Content align',o.align,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.options={...options(t),align:v};},{choices:['start','center','end','space-between']});
   makeField(grid,'Direction',o.orientation,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.options={...options(t),orientation:v};},{choices:['horizontal','vertical']});
   if(isRoot&&isContainer(e)){
    sec.append(btn('Arrange children in a row',()=>{commitProject(proj=>{const r=proj.elements.find(n=>n.id===e.id);if(r)autoLayout(proj,r);});renderStage();}));
   }
   inspectorBox.append(sec);

   const styleSec=node('section',undefined,'property-section'),sGrid=node('div',undefined,'fields');
   styleSec.append(node('h3','Colors, Gradient & Glass'),sGrid);
   makeField(sGrid,'Fill color',e.fill,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.fill=v;},{type:'color'});
   makeField(sGrid,'Text color',e.color,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.color=v;},{type:'color'});
   makeField(sGrid,'Fill gradient',g.enabled,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.appearance={...appearance(t),gradient:{...gradient(t),enabled:v}};},{type:'checkbox'});
   makeField(sGrid,'Gradient end',g.end,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.appearance={...appearance(t),gradient:{...gradient(t),end:v}};},{type:'color'});
   makeField(sGrid,'Gradient angle',g.angle,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.appearance={...appearance(t),gradient:{...gradient(t),angle:v}};},{type:'number',min:0,max:360});
   makeField(sGrid,'Opacity',a.opacity,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.appearance={...appearance(t),opacity:v};},{type:'number',min:0,max:1,step:.05});
   makeField(sGrid,'Backdrop blur',a.blur,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.appearance={...appearance(t),blur:v};},{type:'number',min:0,max:50});
   makeField(sGrid,'Shadow',a.shadow,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.appearance={...appearance(t),shadow:v};},{type:'number',min:0,max:80});
   makeField(sGrid,'Border width',a.borderWidth,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.appearance={...appearance(t),borderWidth:v};},{type:'number',min:0,max:20});
   makeField(sGrid,'Border color',a.borderColor,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.appearance={...appearance(t),borderColor:v};},{type:'color'});
   makeField(sGrid,'Font',a.fontAsset||a.font,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(!t)return;const isAsset=(proj.assets||[]).some(n=>n.id===v&&['ttf','otf'].includes(n.extension));t.appearance={...appearance(t),fontAsset:isAsset?v:'',font:isAsset?'sans-serif':v};},{choices:[['sans-serif','System sans'],['serif','System serif'],['monospace','Monospace'],...(p.assets||[]).filter(n=>['ttf','otf'].includes(n.extension)).map(n=>[n.id,n.name])],wide:true});
   makeField(sGrid,'SVG Icon',o.svgAsset||'',(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.options={...options(t),svgAsset:v};},{choices:[['','None'],...(p.assets||[]).filter(n=>n.extension==='svg').map(n=>[n.id,n.name])]});
   makeField(sGrid,'SVG Icon size',o.iconSize,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.options={...options(t),iconSize:v};},{type:'number',min:8,max:200});
   styleSec.append(btn('Upload Font (.ttf/.otf)',openFontUpload),btn('Upload Safe SVG',openSvgUpload));
   inspectorBox.append(styleSec);

   const meterSec=node('section',undefined,'property-section'),mGrid=node('div',undefined,'fields');
   meterSec.append(node('h3','Live Progress Meter / Gauge'),mGrid);
   makeField(mGrid,'Meter style',m.style,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.meter={...meter(t),style:v};},{choices:[['none','None (text/shape only)'],['bar','Horizontal progress bar'],['vbar','Vertical progress bar'],['ring','Circular ring gauge']],wide:true});
   if(m.style!=='none'){
    makeField(mGrid,'Signal source',m.source,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.meter={...meter(t),source:v};},{choices:METER_SOURCES.map(s=>[s,SOURCE_LABELS[s]||s])});
    makeField(mGrid,'Thickness (px)',m.thickness,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.meter={...meter(t),thickness:v};},{type:'number',min:1,max:200});
    makeField(mGrid,'Min value',m.min,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t&&v<meter(t).max)t.meter={...meter(t),min:v};},{type:'number',min:-10000,max:10000});
    makeField(mGrid,'Max value',m.max,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t&&v>meter(t).min)t.meter={...meter(t),max:v};},{type:'number',min:-10000,max:10000});
    makeField(mGrid,'Meter color',m.color,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.meter={...meter(t),color:v};},{type:'color'});
    makeField(mGrid,'Track color',m.track,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.meter={...meter(t),track:v};},{type:'color'});
   }
   inspectorBox.append(meterSec);

   const cssSec=node('section',undefined,'property-section');
   cssSec.append(node('h3','Scoped Custom CSS'));
   makeField(cssSec,'Custom CSS rules',e.customCss?.source||'',(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(!t)return;const safe=sanitizeScopedCss(v,'#rt-'+t.id.replace(/[^a-z0-9-]/gi,''));t.customCss={source:v,scoped:safe.css,errors:safe.errors};},{type:'textarea',maxLength:64000});
   if(e.customCss?.errors?.length)cssSec.append(node('p','CSS: '+e.customCss.errors.join(' · ')));
   inspectorBox.append(cssSec);
  }

  else if(activeTab==='content'){
   const sec=node('section',undefined,'property-section');
   sec.append(node('h3','Data Source & Dynamic Text'));
   if(['widget','text','shape'].includes(e.type)){
    const c={text:'',dataSource:'static',shape:'rectangle',...e.custom};
    makeField(sec,'Live data source',c.dataSource,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.custom={...c,...t.custom,dataSource:v};},{choices:DATA_SOURCES.map(s=>[s,DATA_LABELS[s]||s])});
    makeField(sec,'Text / template',c.text,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.custom={...c,...t.custom,text:v};},{type:'textarea',maxLength:2000});
    const tokens=node('div',undefined,'studio-token-bar');
    for(const [tok,desc] of [['{{value}}','Formatted value'],['{{number}}','Raw number'],['{{time}}','Current time'],['{{date}}','Current date']]){
     tokens.append(btn(`+ ${tok}`,()=>{
      commitProject(proj=>{
       const t=proj.elements.find(n=>n.id===e.id);
       if(!t)return;
       const cur=t.custom?.text||'';
       t.custom={...c,...t.custom,text:(cur+(cur?' ':'')+tok).slice(0,2000)};
      });
      renderStage();
      renderInspector();
     },'studio-chip-btn',desc));
    }
    sec.append(tokens,node('p','Insert placeholders to combine multiple live values inside one text or shape layer.'));
   }else{
    makeField(sec,'Glyph icon',o.icon,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.options={...options(t),icon:v};},{choices:ICONS.map(i=>[i,i||'Default'])});
    if(e.type==='clock'){
     makeField(sec,'Time format',e.format,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.format=v;},{choices:['24h','12h']});
     makeField(sec,'Show seconds',o.showSeconds,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.options={...options(t),showSeconds:v};},{type:'checkbox'});
     makeField(sec,'Show date',o.showDate,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.options={...options(t),showDate:v};},{type:'checkbox'});
    }
   }
   inspectorBox.append(sec);

   const wsSec=node('section',undefined,'property-section'),wGrid=node('div',undefined,'fields');
   wsSec.append(node('h3','Workspace & Display Visibility'),wGrid);
   makeField(wGrid,'Show on display',e.monitorId||'all',(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.monitorId=v;},{choices:[['all','All displays'],...p.monitors.map(m=>[m.id,m.name])],wide:true});
   makeField(wGrid,'Only on workspace',e.workspaceOnly||0,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.workspaceOnly=Number(v);},{choices:[[0,'All workspaces'],...Array.from({length:10},(_,i)=>[i+1,'Workspace '+(i+1)])]});
   makeField(wGrid,'Hide on workspace',e.workspaceHidden||0,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.workspaceHidden=Number(v);},{choices:[[0,'None'],...Array.from({length:10},(_,i)=>[i+1,'Workspace '+(i+1)])]});
   inspectorBox.append(wsSec);
  }

  else if(activeTab==='animation'){
   const anim={kind:'none',duration:1200,delay:0,easing:'ease-in-out',enabled:true,iteration:'infinite',...e.animation};
   const sec=node('section',undefined,'property-section'),grid=node('div',undefined,'fields');
   sec.append(node('h3','Continuous & Entrance Animation'),grid);
   makeField(grid,'Animation enabled',anim.enabled,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.animation={...anim,...t.animation,enabled:v};},{type:'checkbox'});
   makeField(grid,'Effect kind',anim.kind,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.animation={...anim,...t.animation,kind:v};},{choices:ANIMATION_KINDS.map(k=>[k,ANIMATION_LABELS[k]||k])});
   makeField(grid,'Duration (ms)',anim.duration,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.animation={...anim,...t.animation,duration:v};},{type:'number',min:100,max:30000,step:50});
   makeField(grid,'Delay (ms)',anim.delay,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.animation={...anim,...t.animation,delay:v};},{type:'number',min:0,max:30000,step:50});
   makeField(grid,'Easing curve',anim.easing,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.animation={...anim,...t.animation,easing:v};},{choices:['linear','ease','ease-in','ease-out','ease-in-out']});
   makeField(grid,'Repeat mode',anim.iteration,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.animation={...anim,...t.animation,iteration:v};},{choices:[['once','Play once'],['infinite','Infinite loop']]});
   inspectorBox.append(sec);

   const hovSec=node('section',undefined,'property-section'),hGrid=node('div',undefined,'fields');
   hovSec.append(node('h3','Hover Micro-Interaction'),hGrid);
   makeField(hGrid,'Hover effect enabled',h.enabled,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.hover={...hover(t),enabled:v};},{type:'checkbox',wide:true});
   makeField(hGrid,'Hover scale',h.scale,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.hover={...hover(t),scale:v};},{type:'number',min:.5,max:2,step:.02});
   makeField(hGrid,'Hover lift (px)',h.lift,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.hover={...hover(t),lift:v};},{type:'number',min:-200,max:200});
   hovSec.append(node('p','Hover scaling and vertical lift work in both Browser Preview and exported Quickshell.'));
   inspectorBox.append(hovSec);

   const tl={enabled:false,duration:2000,loop:true,keyframes:[],...e.timeline};
   const tlSec=node('section',undefined,'property-section'),tlGrid=node('div',undefined,'fields');
   tlSec.append(node('h3','Keyframe Timeline Sequencer'),tlGrid);
   makeField(tlGrid,'Timeline enabled',tl.enabled,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.timeline={...tl,...t.timeline,enabled:v};},{type:'checkbox'});
   makeField(tlGrid,'Loop timeline',tl.loop,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.timeline={...tl,...t.timeline,loop:v};},{type:'checkbox'});
   makeField(tlGrid,'Duration (ms)',tl.duration,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.timeline={...tl,...t.timeline,duration:v};},{type:'number',min:100,max:60000,step:100,wide:true});
   tlSec.append(btn('+ Add Keyframe',()=>{
    commitProject(proj=>{
     const t=proj.elements.find(n=>n.id===e.id);
     if(!t)return;
     t.timeline={...tl,...t.timeline};
     const frames=t.timeline.keyframes??=[];
     if(frames.length>=24)throw Error('Maximum 24 keyframes');
     const at=frames.length?Math.min(1,Math.max(0,(frames.at(-1).at||0)+.25)):0;
     frames.push({at,x:0,y:0,scale:1,rotation:0,opacity:1});
     t.timeline.keyframes=frames;
    });
    renderStage();
    renderInspector();
   }));
   for(const [idx,frame] of (tl.keyframes||[]).entries()){
    const card=node('div',undefined,'keyframe-card');
    card.append(node('strong',`Keyframe #${idx+1} (${Math.round(frame.at*100)}%)`));
    makeField(card,'At % #'+(idx+1),Math.round(frame.at*100),(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.timeline?.keyframes?.[idx])t.timeline.keyframes[idx].at=clamp(v/100,0,1);},{type:'number',min:0,max:100});
    makeField(card,'X offset #'+(idx+1),frame.x,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.timeline?.keyframes?.[idx])t.timeline.keyframes[idx].x=v;},{type:'number',min:-10000,max:10000});
    makeField(card,'Y offset #'+(idx+1),frame.y,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.timeline?.keyframes?.[idx])t.timeline.keyframes[idx].y=v;},{type:'number',min:-10000,max:10000});
    makeField(card,'Scale #'+(idx+1),frame.scale,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.timeline?.keyframes?.[idx])t.timeline.keyframes[idx].scale=v;},{type:'number',min:.05,max:10,step:.05});
    makeField(card,'Rotation #'+(idx+1),frame.rotation,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.timeline?.keyframes?.[idx])t.timeline.keyframes[idx].rotation=v;},{type:'number',min:-3600,max:3600});
    makeField(card,'Opacity #'+(idx+1),frame.opacity,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.timeline?.keyframes?.[idx])t.timeline.keyframes[idx].opacity=v;},{type:'number',min:0,max:1,step:.05});
    card.append(btn('Remove keyframe #'+(idx+1),()=>{
     commitProject(proj=>{const t=proj.elements.find(n=>n.id===e.id);t?.timeline?.keyframes?.splice(idx,1);});
     renderStage();renderInspector();
    }));
    tlSec.append(card);
   }
   inspectorBox.append(tlSec);
  }

  else if(activeTab==='bindings'){
   const bindSec=node('section',undefined,'property-section');
   bindSec.append(node('h3','Live Signal → Property Bindings'));
   bindSec.append(btn('+ Bind Signal to Visual Property',()=>{
    commitProject(proj=>{
     const t=proj.elements.find(n=>n.id===e.id);
     if(!t)return;
     t.signalBindings??=[];
     if(t.signalBindings.length>=8)throw Error('Maximum 8 data bindings');
     t.signalBindings.push({id:crypto.randomUUID(),source:'cpu',target:'scale',inputMin:0,inputMax:100,outputMin:1,outputMax:1.2,smoothing:.6});
    });
    renderStage();renderInspector();
   }));
   for(const [idx,b] of (e.signalBindings||[]).entries()){
    const card=node('div',undefined,'binding-card');
    makeField(card,'Signal #'+(idx+1),b.source,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.signalBindings?.[idx])t.signalBindings[idx].source=v;},{choices:BINDING_SOURCES.map(s=>[s,SOURCE_LABELS[s]||s])});
    makeField(card,'Target #'+(idx+1),b.target,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.signalBindings?.[idx])t.signalBindings[idx].target=v;},{choices:[['opacity','Opacity'],['scale','Scale'],['rotation','Rotation (deg)'],['xOffset','X offset (px)'],['yOffset','Y offset (px)']]});
    for(const [k,lbl,min,max,step] of [['inputMin','Input min',-1000,1000,.1],['inputMax','Input max',-1000,1000,.1],['outputMin','Output min',-10000,10000,.05],['outputMax','Output max',-10000,10000,.05],['smoothing','Smoothing',0,.98,.05]]){
     makeField(card,`${lbl} #${idx+1}`,b[k],(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.signalBindings?.[idx])t.signalBindings[idx][k]=v;},{type:'number',min,max,step});
    }
    card.append(btn('Remove binding #'+(idx+1),()=>{
     commitProject(proj=>{const t=proj.elements.find(n=>n.id===e.id);t?.signalBindings?.splice(idx,1);});
     renderStage();renderInspector();
    }));
    bindSec.append(card);
   }
   inspectorBox.append(bindSec);

   const logicSec=node('section',undefined,'property-section');
   logicSec.append(node('h3','Conditional Visual Logic Rules'));
   logicSec.append(btn('+ Add Logic Rule (If / Then)',()=>{
    commitProject(proj=>{
     const t=proj.elements.find(n=>n.id===e.id);
     if(!t)return;
     t.logic??=[];
     if(t.logic.length>=8)throw Error('Maximum 8 logic rules');
     t.logic.push({id:crypto.randomUUID(),enabled:true,source:'battery',operator:'lt',value:25,style:{fill:'#ef4444',color:'#ffffff',opacity:1,text:'LOW · {{value}}',animation:'pulse'}});
    });
    renderStage();renderInspector();
   }));
   for(const [idx,rule] of (e.logic||[]).entries()){
    const card=node('div',undefined,'logic-card');
    const boolSrc=['network','musicPlaying','charging'].includes(rule.source);
    makeField(card,'Active #'+(idx+1),rule.enabled,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.logic?.[idx])t.logic[idx].enabled=v;},{type:'checkbox'});
    makeField(card,'When #'+(idx+1),rule.source,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.logic?.[idx]){t.logic[idx].source=v;t.logic[idx].value=['network','musicPlaying','charging'].includes(v)?true:50;}},{choices:LOGIC_SOURCES.map(s=>[s,SOURCE_LABELS[s]||s])});
    makeField(card,'Operator #'+(idx+1),rule.operator,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.logic?.[idx])t.logic[idx].operator=v;},{choices:[['lt','< Less than'],['lte','≤ At most'],['eq','= Equals'],['neq','≠ Not equal'],['gte','≥ At least'],['gt','> Greater than']]});
    if(boolSrc){
     makeField(card,'Value #'+(idx+1),String(rule.value),(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.logic?.[idx])t.logic[idx].value=v==='true';},{choices:[['true','True'],['false','False']]});
    }else{
     makeField(card,'Threshold #'+(idx+1),Number(rule.value)||0,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.logic?.[idx])t.logic[idx].value=v;},{type:'number',min:-1000,max:1000,step:1});
    }
    makeField(card,'Fill #'+(idx+1),rule.style.fill,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.logic?.[idx])t.logic[idx].style.fill=v;},{type:'color'});
    makeField(card,'Text color #'+(idx+1),rule.style.color,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.logic?.[idx])t.logic[idx].style.color=v;},{type:'color'});
    makeField(card,'Opacity #'+(idx+1),rule.style.opacity,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.logic?.[idx])t.logic[idx].style.opacity=v;},{type:'number',min:0,max:1,step:.05});
    makeField(card,'Animation #'+(idx+1),rule.style.animation,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.logic?.[idx])t.logic[idx].style.animation=v;},{choices:ANIMATION_KINDS.map(k=>[k,ANIMATION_LABELS[k]||k])});
    makeField(card,'Text override #'+(idx+1),rule.style.text,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.logic?.[idx])t.logic[idx].style.text=v;},{maxLength:500,wide:true});
    card.append(btn('Remove rule #'+(idx+1),()=>{
     commitProject(proj=>{const t=proj.elements.find(n=>n.id===e.id);t?.logic?.splice(idx,1);});
     renderStage();renderInspector();
    }));
    logicSec.append(card);
   }
   inspectorBox.append(logicSec);
  }

  else if(activeTab==='mechanism'){
   const actSec=node('section',undefined,'property-section');
   actSec.append(node('h3','Interactive Triggers & Mechanism'));
   actSec.append(node('p','Bind mouse clicks and wheel scrolling to safe desktop actions in Preview, Live Helper and exported Quickshell.'));
   const defaultParams={
    launch:{app:'terminal'},
    workspace:{workspace:1},
    volumeSet:{value:50},
    volumeStep:{delta:5},
    muteToggle:{},
    media:{command:'play-pause'},
    openPanel:{panel:'calendar'},
    power:{command:'suspend'},
    none:{}
   };
   for(const [trigKey,trigLabel] of Object.entries(TRIGGER_LABELS)){
    const card=node('div',undefined,'shortcut-card');
    const cur=e.actions?.[trigKey]||{type:'none',params:{}};
    card.append(node('strong',`${trigLabel} (${actionLabel(cur)})`));
    makeField(card,`${trigLabel} action`,cur.type,(v,proj)=>{
     const t=proj.elements.find(n=>n.id===e.id);
     if(!t)return;
     t.actions={...t.actions};
     if(v==='none')delete t.actions[trigKey];
     else t.actions[trigKey]=validateAction(action(v,defaultParams[v]||{}));
    },{choices:Object.entries(ACTIONS).map(([k,meta])=>[k,meta.label]),wide:true});

    if(cur.type==='launch'){
     makeField(card,`${trigLabel} app`,cur.params?.app||'terminal',(v,proj)=>{
      const t=proj.elements.find(n=>n.id===e.id);
      if(t)t.actions={...t.actions,[trigKey]:validateAction(action('launch',{app:v}))};
     },{choices:Object.entries(APPS).filter(([k])=>k!=='music').map(([k,meta])=>[k,meta.label]),wide:true});
    }else if(cur.type==='workspace'){
     makeField(card,`${trigLabel} workspace`,cur.params?.workspace||1,(v,proj)=>{
      const t=proj.elements.find(n=>n.id===e.id);
      if(t)t.actions={...t.actions,[trigKey]:validateAction(action('workspace',{workspace:Math.round(v)}))};
     },{type:'number',min:1,max:10,wide:true});
    }else if(cur.type==='volumeSet'){
     makeField(card,`${trigLabel} volume %`,cur.params?.value??50,(v,proj)=>{
      const t=proj.elements.find(n=>n.id===e.id);
      if(t)t.actions={...t.actions,[trigKey]:validateAction(action('volumeSet',{value:Math.round(v)}))};
     },{type:'number',min:0,max:100,wide:true});
    }else if(cur.type==='volumeStep'){
     makeField(card,`${trigLabel} step %`,cur.params?.delta??5,(v,proj)=>{
      const t=proj.elements.find(n=>n.id===e.id);
      if(t&&v!==0)t.actions={...t.actions,[trigKey]:validateAction(action('volumeStep',{delta:Math.round(v)}))};
     },{type:'number',min:-25,max:25,wide:true});
    }else if(cur.type==='media'){
     makeField(card,`${trigLabel} media`,cur.params?.command||'play-pause',(v,proj)=>{
      const t=proj.elements.find(n=>n.id===e.id);
      if(t)t.actions={...t.actions,[trigKey]:validateAction(action('media',{command:v}))};
     },{choices:[['play-pause','Play / Pause'],['next','Next track'],['previous','Previous track']],wide:true});
    }else if(cur.type==='openPanel'){
     makeField(card,`${trigLabel} panel`,cur.params?.panel||'calendar',(v,proj)=>{
      const t=proj.elements.find(n=>n.id===e.id);
      if(t)t.actions={...t.actions,[trigKey]:validateAction(action('openPanel',{panel:v}))};
     },{choices:[['calendar','Calendar'],['volume','Audio slider'],['music','Media player'],['network','Network'],['bluetooth','Bluetooth'],['notifications','Notifications'],['launcher','App launcher'],['power','Power menu']],wide:true});
    }else if(cur.type==='power'){
     makeField(card,`${trigLabel} power`,cur.params?.command||'suspend',(v,proj)=>{
      const t=proj.elements.find(n=>n.id===e.id);
      if(t)t.actions={...t.actions,[trigKey]:validateAction(action('power',{command:v}))};
     },{choices:[['suspend','Sleep'],['reboot','Restart'],['shutdown','Shut down']],wide:true});
    }
    actSec.append(card);
   }
   inspectorBox.append(actSec);

   if(isRoot){
    const rev={mode:'always',edge:'left',triggerSize:4,hideDelay:350,...e.reveal};
    const placeSec=node('section',undefined,'property-section'),pGrid=node('div',undefined,'fields');
    placeSec.append(node('h3','Desktop Anchor & Hot-Edge Reveal'),pGrid);
    makeField(pGrid,'Horizontal anchor',e.anchorX||'scale',(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.anchorX=v;},{choices:['scale','left','center','right','stretch']});
    makeField(pGrid,'Vertical anchor',e.anchorY||'scale',(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.anchorY=v;},{choices:['scale','top','center','bottom','stretch']});
    const revChoice=rev.mode==='always'?'always':rev.edge+'-edge';
    makeField(pGrid,'Visibility mode',revChoice,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.reveal={...rev,mode:v==='always'?'always':'hot-edge',edge:v==='right-edge'?'right':'left'};},{choices:[['always','Always visible on desktop'],['left-edge','Slide out from left screen edge'],['right-edge','Slide out from right screen edge']],wide:true});
    if(rev.mode==='hot-edge'){
     makeField(pGrid,'Trigger width (px)',rev.triggerSize,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.reveal={...rev,triggerSize:v};},{type:'number',min:1,max:24});
     makeField(pGrid,'Hide delay (ms)',rev.hideDelay,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t)t.reveal={...rev,hideDelay:v};},{type:'number',min:0,max:3000,step:50});
    }
    inspectorBox.append(placeSec);
   }

   const chipsSec=node('section',undefined,'property-section');
   chipsSec.append(node('h3','Embedded Shortcut Chips'));
   chipsSec.append(btn('+ Add Shortcut Chip',()=>{
    commitProject(proj=>{
     const t=proj.elements.find(n=>n.id===e.id);
     if(!t)return;
     const cur=options(t);
     t.options={...cur,items:[...cur.items,{id:crypto.randomUUID(),label:'Terminal',icon:'⌘',action:'',shortcut:'',actionId:'terminal'}]};
    });
    renderStage();renderInspector();
   }));
   for(const [idx,item] of (o.items||[]).entries()){
    const card=node('div',undefined,'shortcut-card');
    makeField(card,'Label #'+(idx+1),item.label,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.options?.items?.[idx])t.options.items[idx].label=v;});
    makeField(card,'Icon #'+(idx+1),item.icon,(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.options?.items?.[idx])t.options.items[idx].icon=v;},{choices:ICONS.map(i=>[i,i||'None'])});
    makeField(card,'App action #'+(idx+1),actionId(item),(v,proj)=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.options?.items?.[idx]){t.options.items[idx].actionId=v;t.options.items[idx].action='';}},{choices:[['','Not linked'],...Object.entries(APPS).map(([k,meta])=>[k,meta.label])],wide:true});
    card.append(btn('Remove chip #'+(idx+1),()=>{
     commitProject(proj=>{const t=proj.elements.find(n=>n.id===e.id);if(t?.options?.items)t.options.items.splice(idx,1);});
     renderStage();renderInspector();
    }));
    chipsSec.append(card);
   }
   inspectorBox.append(chipsSec);
  }
 }

 function buildStudioDom(){
  const neighborhoodGrid=dialog.querySelector?.('#neighborhood-grid')||document.querySelector?.('#neighborhood-grid');
  const desktopPresetGrid=dialog.querySelector?.('#desktop-preset-grid')||document.querySelector?.('#desktop-preset-grid');
  const closeBtn=dialog.querySelector?.('#close-neighborhood')||document.querySelector?.('#close-neighborhood');

  for(const bp of STUDIO_BLUEPRINTS){
   if(neighborhoodGrid&&typeof neighborhoodGrid.prepend==='function'&&![...(neighborhoodGrid.children||[])].some(c=>c.dataset?.blueprint===bp.name)){
    const card=btn('',()=>{
     commitProject(p=>{
      const nodes=bp.make();
      if(p.elements.length+nodes.length>1000)throw Error('Layer limit reached');
      p.elements.push(...nodes);
      for(const n of nodes)constrain(p,n);
      activeRootId=nodes[0].id;
      activeLayerId=nodes[0].id;
      setSelectedId(nodes[0].id);
     });
     refreshStudio();
     notify(bp.name+' loaded in Widget Studio.');
    },'neighborhood-card');
    card.dataset.blueprint=bp.name;
    card.append(node('strong',bp.name),node('small',bp.description));
    neighborhoodGrid.prepend(card);
   }
  }

  dialog.classList.add('neighborhood-studio-fullscreen');
  dialog.replaceChildren();

  const topbar=node('header',undefined,'studio-topbar');
  const titleGroup=node('div',undefined,'studio-title-group');
  titleGroup.append(node('span','⬡','studio-hex-logo'),node('strong','Widget Neighborhood Studio'),node('span','Full-page custom widget builder · animations · bindings · mechanism','studio-subtitle'));

  const targetGroup=node('div',undefined,'studio-target-group');
  rootSelectEl=node('select',undefined,'studio-root-select');
  rootSelectEl.setAttribute('aria-label','Target root widget');
  rootSelectEl.onchange=()=>{
   activeRootId=rootSelectEl.value;
   activeLayerId=activeRootId;
   setSelectedId(activeRootId);
   refreshStudio();
  };
  modeToggleBtn=btn('▶ Test Interactive Mode',()=>{
   interactiveMode=!interactiveMode;
   modeToggleBtn.textContent=interactiveMode?'✎ Design & Edit Mode':'▶ Test Interactive Mode';
   modeToggleBtn.classList.toggle('active',interactiveMode);
   renderStage();
  },'studio-test-btn');

  targetGroup.append(
   rootSelectEl,
   btn('+ New Blank Widget',()=>createNewWidget('widget'),'studio-primary-btn'),
   btn('⧉ Duplicate Widget',()=>{if(activeRootId)duplicateLayer(activeRootId);}),
   modeToggleBtn
  );

  const closeGroup=node('div',undefined,'studio-close-group');
  if(closeBtn){
   closeBtn.textContent='✓ Done · Back to Desktop';
   closeBtn.className='studio-done-btn';
   closeGroup.append(closeBtn);
  }else{
   closeGroup.append(btn('✓ Done · Back to Desktop',()=>dialog.close(),'studio-done-btn'));
  }
  topbar.append(titleGroup,targetGroup,closeGroup);

  const body=node('div',undefined,'studio-body');

  const left=node('aside',undefined,'studio-left');
  const addSec=node('section',undefined,'studio-panel-block');
  addSec.append(node('h3','Add Layer Inside Widget'));
  const primGrid=node('div',undefined,'studio-prim-grid');
  for(const [label,type,preset] of [
   ['T Text / Value','text',''],
   ['◆ Shape / Card','shape',''],
   ['◔ Ring Gauge','shape','ring'],
   ['▰ Progress Bar','shape','bar'],
   ['◷ Clock','clock',''],
   ['♫ Music Player','music',''],
   ['≋ Spectrum Waves','visualizer',''],
   ['♪ Volume','volume',''],
   ['◈ CPU','cpu',''],
   ['▥ Memory','memory',''],
   ['▰ Battery','battery',''],
   ['⌁ Network','network','']
  ]){
   primGrid.append(btn(label,()=>addChildLayer(type,preset),'studio-prim-btn'));
  }
  addSec.append(primGrid);

  const treeSec=node('section',undefined,'studio-panel-block');
  treeSec.append(node('h3','Widget Hierarchy & Layers'));
  layerTreeBox=node('div',undefined,'studio-layer-tree');
  treeSec.append(layerTreeBox);

  const startersSec=node('section',undefined,'studio-panel-block');
  startersSec.append(node('h3','Widget Templates & Starters'));
  if(neighborhoodGrid)startersSec.append(neighborhoodGrid);
  startersSec.append(node('h3','Complete Desktop Starters'));
  if(desktopPresetGrid)startersSec.append(desktopPresetGrid);

  left.append(addSec,treeSec,startersSec);

  const center=node('section',undefined,'studio-center');
  const stageToolbar=node('div',undefined,'studio-stage-toolbar');
  const zoomBox=node('div',undefined,'studio-zoom-controls');
  stageToolbar.append(
   node('span','Drag layers on canvas · resize handles · test live telemetry below'),
   zoomBox
  );
  const zoomLabel=node('span','100%');
  const setZoom=z=>{stageZoom=clamp(z,.5,2.5);zoomLabel.textContent=Math.round(stageZoom*100)+'%';renderStage();};
  zoomBox.append(
   btn('−',()=>setZoom(stageZoom-.2),'studio-mini-btn','Zoom out studio'),
   btn('100%',()=>setZoom(1),'studio-mini-btn','Reset studio zoom'),
   btn('+',()=>setZoom(stageZoom+.2),'studio-mini-btn','Zoom in studio'),
   zoomLabel
  );

  stageWrap=node('div',undefined,'studio-stage-wrap');

  const simBar=node('div',undefined,'studio-sim-bar');
  simBar.append(node('strong','Live Telemetry Simulator'));
  const simGrid=node('div',undefined,'studio-sim-grid');
  for(const [key,label,min,max,step] of [
   ['cpu','CPU %',0,100,1],
   ['memory','RAM %',0,100,1],
   ['battery','Battery %',0,100,1],
   ['volume','Volume %',0,100,1],
   ['spectrumBass','Audio Bass',0,1,.05]
  ]){
   const w=node('label',`${label}: `);
   const valSpan=node('b',String(testSignals[key]));
   const rng=node('input');
   rng.type='range';rng.min=min;rng.max=max;rng.step=step;rng.value=String(testSignals[key]);
   rng.oninput=()=>{testSignals[key]=Number(rng.value);valSpan.textContent=String(testSignals[key]);renderStage();};
   w.append(valSpan,rng);
   simGrid.append(w);
  }
  const simToggles=node('div',undefined,'studio-sim-toggles');
  for(const [key,label] of [['charging','⚡ Charging'],['musicPlaying','♫ Playing'],['network','⌁ Online']]){
   const b=btn(label,()=>{
    testSignals[key]=!testSignals[key];
    b.classList.toggle('active',Boolean(testSignals[key]));
    renderStage();
   },'studio-chip-btn'+(testSignals[key]?' active':''));
   simToggles.append(b);
  }
  simBar.append(simGrid,simToggles);
  center.append(stageToolbar,stageWrap,simBar);

  const right=node('aside',undefined,'studio-right');
  const tabsBar=node('nav',undefined,'studio-tabs');
  const tabs=[
   ['design','1. Design & Gauge'],
   ['content','2. Data & Text'],
   ['animation','3. Animation'],
   ['bindings','4. Bindings & Logic'],
   ['mechanism','5. Mechanism & Actions']
  ];
  const tabBtns=new Map();
  for(const [id,label] of tabs){
   const b=btn(label,()=>{
    activeTab=id;
    for(const [k,tb] of tabBtns)tb.classList.toggle('active',k===id);
    renderInspector();
   },'studio-tab-btn'+(activeTab===id?' active':''));
   tabBtns.set(id,b);
   tabsBar.append(b);
  }
  inspectorBox=node('div',undefined,'studio-inspector-body');
  right.append(tabsBar,inspectorBox);

  body.append(left,center,right);
  dialog.append(topbar,body);
 }

 function refreshStudio(){
  if(!dialog.open)return;
  ensureStudioRoot();
  renderLayerList();
  renderStage();
  renderInspector();
  renderApp();
 }

 buildStudioDom();

 return {
  open(targetId){
   if(targetId){
    const p=getProject(),r=findRootWidget(p,targetId);
    if(r){activeRootId=r.id;activeLayerId=targetId;}
   }else{
    ensureStudioRoot();
   }
   if(!dialog.open)dialog.showModal();
   refreshStudio();
  },
  close(){if(dialog.open)dialog.close();},
  refresh:refreshStudio
 };
}
