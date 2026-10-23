import {fresh,element,parse,serialize,TYPES,validate} from './model.js';
import {history,resize,options,clamp} from './editor-core.js';
import {behavior,box,attach,family,cloneFamily,calendarCells,simulation} from './components.js';
import {APPS,ICONS,THEMES,TYPE_META,actionId,isContainer,unresolved} from './catalog.js';
import {desktop,appearance,constrain,clampAll,changeSize,snap,arrange,autoLayout,rgba} from './design.js';
import {ProjectStorage,renderThumbnailSvg} from './storage.js';
import {exportReport,exportPackage} from './exporter.js';
import {legacyAction} from './actions.js';
import {LiveClient} from './live-client.js';
import {importWaybar,exportWaybar} from './waybar.js';
import {sanitizeSvg,sanitizeScopedCss} from './safe-assets.js';
import {zip,decodeData} from './zip.js';
import {exportFullRice,fullRiceReport,computeTilingLayout,MOCK_WINDOWS} from './hyprland.js';
import {analyzeCompatibility} from './compatibility.js';
import {exportHybrid} from './hybrid.js';
import {resolvedStyle} from './logic.js';
import {DESKTOP_PRESETS} from './presets.js';
import {ADVANCED_PRESETS} from './advanced-presets.js';
import {createNeighborhoodStudio,formatCustomValue,applyElementVisuals} from './neighborhood-studio.js';
import {ANIMATION_KINDS,ANIMATION_LABELS,DATA_SOURCES,DATA_LABELS,LOGIC_SOURCES,BINDING_SOURCES,SOURCE_LABELS} from './widget-spec.js';
const $=s=>document.querySelector(s),storage=new ProjectStorage(),sim=simulation();
const MAX_PROJECT_IMPORT_BYTES=80000000; // Same project envelope accepted by model.parse.
let project=fresh(),selected=null,selection=new Set(),preview=false,tool='select',space=false,drag=null,clipboard=null,calendarOffset=0,popupId=null,toastTimer,saveTimer,saveRevision=0,pending=false,view={x:0,y:0,z:.5},timeline,dataMode='demo';
const edgeTimers=new Map(),openEdges=new Set(),viewportEdges=new Set();
let edgeMotionUntil=0,liveDrawTimer=null,renderedWorkspace=null;
let workspaceSwitching=false,workspaceEditPage=1,tilingEntranceUntil=0;
let wallpaperObjectUrl='',wallpaperObjectKey='',wallpaperLoadingKey='',wallpaperLoadRevision=0,wallpaperPosterUrl='',wallpaperPosterKey='',wallpaperPosterLoading='',wallpaperVideoFailedKey='';
const live=new LiveClient();
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function button(text,fn,label){const n=node('button',text);n.onclick=fn;if(label)n.setAttribute('aria-label',label);return n;}
function notify(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',4500);}
try{await storage.init();project=await storage.load()||fresh();$('#save-status').textContent='Saved locally';}catch(e){notify(e.message);$('#save-status').textContent='Recovery needed · save a file';}
timeline=history(project,40);
const current=()=>project.elements.find(e=>e.id===selected);
function historyButtons(){$('#undo').disabled=preview||!timeline.canUndo;$('#redo').disabled=preview||!timeline.canRedo;}
function autosave(){const revision=++saveRevision;$('#save-status').textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>storage.save(project).then(()=>{if(revision===saveRevision)$('#save-status').textContent='Saved locally';}).catch(()=>{$('#save-status').textContent='Storage full · save a .rce file';}),200);}
function checkpoint(){timeline.push(project);pending=false;historyButtons();autosave();}
function flush(){document.activeElement?.blur();if(pending)checkpoint();}
function commit(fn){flush();try{fn();checkpoint();render();}catch(e){notify(e.message);}}
function select(id,additive=false){flush();if(!additive)selection.clear();if(additive&&selection.has(id))selection.delete(id);else if(id)selection.add(id);selected=selection.has(id)?id:[...selection].at(-1)||null;render();}
function clock(e){const o=options(e);return new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',...(o.showSeconds?{second:'2-digit'}:{}),hour12:e.format==='12h'}).format(new Date())+(o.showDate?' · '+new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short'}).format(new Date()):'');}
function logicData(e){const d=live.data||{},s=liveValue(e)||sim.get(e)||{};return {cpu:dataMode==='live'?d.system?.cpu:s.cpu,memory:dataMode==='live'?d.system?.memory:s.memory,battery:dataMode==='live'?d.battery?.percent:s.battery,volume:dataMode==='live'?d.audio?.volume:s.volume,muted:dataMode==='live'?d.audio?.muted:s.muted,brightness:dataMode==='live'?d.system?.brightness:s.brightness,temperature:dataMode==='live'?d.system?.temperature:s.temperature,disk:dataMode==='live'?d.system?.disk:s.disk,gpu:dataMode==='live'?d.system?.gpu:s.gpu,uptime:dataMode==='live'?d.system?.uptime:s.uptime,music:dataMode==='live'?d.media?.title:s.title,network:dataMode==='live'?d.network?.devices?.some(n=>n.active):s.connected,musicPlaying:dataMode==='live'?d.media?.status==='Playing':s.playing,charging:dataMode==='live'?d.battery?.charging:s.charging,spectrumBass:d.spectrum?.bass??0,spectrumMid:d.spectrum?.mid??0,spectrumTreble:d.spectrum?.treble??0,spectrumBeat:d.spectrum?.beat??0};}
function liveValue(e){const d=live.data;if(dataMode!=='live'||!d)return null;if(e.type==='volume')return d.audio?.available?{volume:d.audio.volume,muted:d.audio.muted}:null;if(e.type==='network')return d.network?.available?{connected:d.network.devices?.some(n=>n.active)}:null;if(e.type==='battery')return d.battery?.available?{battery:d.battery.percent,charging:d.battery.charging}:null;if(e.type==='music')return d.media?.available?{playing:d.media.status==='Playing',title:d.media.title}:null;if(e.type==='workspaces')return d.workspaces?.available?{active:d.workspaces.active}:null;if(['cpu','memory','gpu','temperature','disk','uptime','brightness'].includes(e.type))return d.system?.available?d.system:null;return null;}
function widgetText(e){const s=liveValue(e)||sim.get(e),icon=options(e).icon||TYPE_META[e.type][0];if(dataMode==='live'&&!liveValue(e)&&['volume','network','battery','music','workspaces','cpu','memory','gpu','temperature','disk','uptime','brightness'].includes(e.type))return icon+' Unavailable';const text={volume:s.muted?'Muted':s.volume+'%',brightness:s.brightness+'%',network:s.connected?'Wi-Fi':'Offline',bluetooth:s.bluetooth?'Bluetooth':'BT off',battery:(s.charging?'↯ ':'')+s.battery+'%',notifications:s.notifications+' notifications',launcher:'Applications',music:s.title?((s.playing?'Ⅱ ':'▶ ')+s.title):(s.playing?'Ⅱ Playing':'▶ No player'),cpu:s.cpu+'% CPU',memory:s.memory+'% RAM',gpu:(s.gpu==null?'Unavailable':s.gpu+'% GPU'),temperature:s.temperature+'°C',disk:s.disk+'% disk',uptime:s.uptime,power:'Power'}[e.type];return icon+' '+(text||'');}
function activeWorkspace(){const ws=project.elements.find(e=>e.type==='workspaces'),liveActive=dataMode==='live'?live.data?.workspaces?.active:null;return liveActive||(ws?sim.get(ws).active:1);}
function customText(e){const c=e.custom||{},src=c.dataSource||'static',d=live.data||{},data=logicData(e);if(dataMode==='live'&&!['static','time','date','workspace'].includes(src)&&data[src]==null){const now=new Date(),time=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(now),date=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long'}).format(now),template=e.workspaceContent?.[activeWorkspace()-1]??c.text,output=template===''?'':(template||'{{value}}');return output.replaceAll('{{value}}','Unavailable').replaceAll('{{number}}','–').replaceAll('{{time}}',time).replaceAll('{{date}}',date);}return formatCustomValue(e,data,activeWorkspace());}
function visibleOnWorkspace(e,page){return (!(e.workspaceOnly>0)||e.workspaceOnly===page)&&(!(e.workspaceHidden>0)||e.workspaceHidden!==page);}
function switchWorkspacePreview(workspaces,target){const currentPage=sim.get(workspaces).active;if(workspaceSwitching||currentPage===target)return;const moving=project.elements.filter(e=>e.workspaceContent||visibleOnWorkspace(e,currentPage)!==visibleOnWorkspace(e,target)),outgoing=moving.filter(e=>visibleOnWorkspace(e,currentPage)),incoming=moving.filter(e=>visibleOnWorkspace(e,target)),maxOrder=Math.max(0,...moving.map(e=>e.workspaceMotion?.order||0));workspaceSwitching=true;for(const e of outgoing){const el=$('#rt-'+e.id.replace(/[^a-z0-9-]/gi,''));if(el){el.style.setProperty('animation-delay',(e.workspaceMotion?.order||0)*90+'ms','important');el.classList.add('workspace-exit');}}setTimeout(()=>{sim.get(workspaces).active=target;draw();for(const e of incoming){const el=$('#rt-'+e.id.replace(/[^a-z0-9-]/gi,''));if(el){el.style.setProperty('animation-delay',(e.workspaceMotion?.order||0)*90+'ms','important');el.classList.add('workspace-enter');}}setTimeout(()=>{workspaceSwitching=false;draw();},430+maxOrder*90);},330+maxOrder*90);}
function modeStatus(){const label=dataMode==='demo'?'Demo data':({connected:'Live · connected',loading:'Live · connecting',stale:'Live · stale data',unpaired:'Live · pairing required',disconnected:'Live · disconnected'})[live.status]||'Live';$('#live-status').textContent=label;$('#live-status').className='mode-badge '+(dataMode==='live'?live.status:'demo');$('#preview-mode-label').textContent='Preview · '+label;const note=$('#preview-note');note.replaceChildren(node('span',dataMode==='demo'?'DEMO DATA · Actions stay inside this preview':label.toUpperCase()));if(dataMode==='demo')note.append(button('Reset states',()=>{sim.reset();closePopup();draw();}));}
function rootElement(e){let root=e;while(root.parentId){const parent=project.elements.find(n=>n.id===root.parentId);if(!parent)break;root=parent;}return root;}
function setEdgeFamily(rootId,open){clearTimeout(edgeTimers.get(rootId));if(openEdges.has(rootId)!==open)edgeMotionUntil=Date.now()+260;if(open)openEdges.add(rootId);else openEdges.delete(rootId);for(const el of $('#elements').children||[]){if(el.dataset.edgeRoot===rootId)el.style.transform=open?'translate3d(0,0,0)':el.dataset.edgeHidden;}const sensor=[...($('#elements').children||[])].find(el=>el.dataset.edgeSensor===rootId);if(sensor)sensor.setAttribute('aria-expanded',String(open));}
function scheduleEdgeClose(root){clearTimeout(edgeTimers.get(root.id));edgeTimers.set(root.id,setTimeout(()=>setEdgeFamily(root.id,false),root.reveal?.hideDelay??350));}
// Include the preview's letterbox gutter in edge hit testing, without a handle.
function hoverViewportEdges(event){const board=$('#artboard').getBoundingClientRect(),insidePanel=event.target?.closest('.edge-family')?.dataset.edgeRoot,overPopup=event.target?.closest('#widget-popup');for(const root of project.elements.filter(e=>!e.parentId&&e.reveal?.mode==='hot-edge')){const trigger=(root.reveal.triggerSize||4)*view.z,atEdge=!overPopup&&event.clientY>=board.top&&event.clientY<=board.bottom&&(root.reveal.edge==='right'?event.clientX>=board.right-trigger:event.clientX<=board.left+trigger);if(atEdge||insidePanel===root.id){viewportEdges.add(root.id);setEdgeFamily(root.id,true);}else if(viewportEdges.delete(root.id))scheduleEdgeClose(root);}}
function leaveViewportEdges(){for(const id of viewportEdges){const root=project.elements.find(e=>e.id===id);if(root)scheduleEdgeClose(root);}viewportEdges.clear();}
// Keep animated nodes alive until motion finishes; telemetry itself stays current.
function drawLivePreview(){if(!preview)return;const remaining=edgeMotionUntil-Date.now();if(remaining>0||workspaceSwitching){if(liveDrawTimer===null)liveDrawTimer=setTimeout(()=>{liveDrawTimer=null;drawLivePreview();},Math.max(16,remaining));return;}clearTimeout(liveDrawTimer);liveDrawTimer=null;if(renderedWorkspace!==activeWorkspace())draw();else refreshLiveContent();}
// A telemetry frame changes values, not the identity of clickable controls.
function refreshLiveContent(){const elements=new Map([...$('#elements').children].map(el=>[el.dataset.id,el]));for(const e of project.elements){const el=elements.get(e.id);if(!el)continue;const state=liveValue(e)||sim.get(e),text=el.querySelector('.custom-value'),value=el.querySelector('.widget-value');if(text)text.textContent=customText(e);if(value)value.textContent=widgetText(e);
 if(e.type==='music'){const title=el.querySelector('.music-title'),play=el.querySelector('.music-controls')?.children[1];if(title)title.textContent=state.title||'No player';if(play){play.textContent=state.playing?'⏸':'▶';play.setAttribute('aria-label',state.playing?'Pause':'Play');}}
 if(e.type==='workspaces'){const content=el.querySelector('.widget-content');for(const [i,b] of [...(content?.children||[])].filter(n=>n.className==='workspace-button').entries()){b.style.background=state.active===i+1?behavior(e).activeColor:'';b.style.color=state.active===i+1?'#182417':'';}}
 if(e.type==='memoryChart'){const label=el.querySelector('strong');if(label)label.textContent='RAM usage · '+(live.data?.system?.memory??sim.get(e).memory)+'%';}
 if(e.type==='volume'&&value)value.style.color=state.muted?behavior(e).mutedColor:'';
 if(e.type==='visualizer'){const waves=el.querySelector('.music-waves'),s={sensitivity:1.4,mirror:false,...e.spectrum},source=live.data?.spectrum?.bins,music=project.elements.find(n=>n.type==='music'),playing=dataMode==='live'?live.data?.media?.status==='Playing':music?sim.get(music).playing:true;if(waves){waves.classList.toggle('playing',!!playing);const bars=[...waves.children];for(const [i,bar] of bars.entries()){const index=s.mirror?Math.floor(Math.abs(i-(bars.length-1)/2)/Math.max(1,(bars.length-1)/2)*((source?.length||32)-1)):Math.floor(i/Math.max(1,bars.length-1)*((source?.length||32)-1)),raw=source?.[index]??(.16+((i*7)%13)/21);bar.style.setProperty('--wave',String(Math.min(1,Math.max(.025,raw*s.sensitivity))));}}}
 }applyLogicPreview();}
async function loadWallpaperPoster(blob,key){if(wallpaperPosterKey===key||wallpaperPosterLoading===key)return;wallpaperPosterLoading=key;try{const response=await fetch('/api/video-poster',{method:'POST',headers:{'Content-Type':blob.type},body:blob});if(!response.ok)throw Error();const next=URL.createObjectURL(await response.blob());if(wallpaperPosterUrl)URL.revokeObjectURL(wallpaperPosterUrl);wallpaperPosterUrl=next;wallpaperPosterKey=key;draw();}catch{notify('Live preview is unavailable; the exported wallpaper can still use mpvpaper.');}finally{wallpaperPosterLoading='';}}
function syncLiveWallpaper(video,d){const key=d.video?d.video.length+':'+d.video.slice(-24):'';video.muted=d.videoMuted;video.playbackRate=d.videoRate;video.style.objectFit=d.fit==='stretch'?'fill':d.fit;video.style.objectPosition=d.position;if(d.mode!=='live'||!d.video){wallpaperLoadRevision++;wallpaperLoadingKey='';video.hidden=true;video.pause?.();return;}if(wallpaperVideoFailedKey===key){video.hidden=true;return;}if(wallpaperObjectKey===key&&wallpaperObjectUrl){video.hidden=false;if(video.src!==wallpaperObjectUrl){video.src=wallpaperObjectUrl;video.load?.();}video.play?.().catch(()=>{});return;}if(wallpaperLoadingKey===key)return;const revision=++wallpaperLoadRevision;wallpaperLoadingKey=key;video.hidden=true;Promise.resolve().then(()=>new Blob([decodeData(d.video)],{type:d.video.slice(5,d.video.indexOf(';'))})).then(blob=>{if(revision!==wallpaperLoadRevision)return;loadWallpaperPoster(blob,key);const next=URL.createObjectURL(blob);if(wallpaperObjectUrl)URL.revokeObjectURL(wallpaperObjectUrl);wallpaperObjectUrl=next;wallpaperObjectKey=key;wallpaperLoadingKey='';video.onerror=()=>{wallpaperVideoFailedKey=key;video.hidden=true;loadWallpaperPoster(blob,key);};video.src=next;video.hidden=false;video.load?.();video.play?.().catch(()=>loadWallpaperPoster(blob,key));}).catch(()=>{wallpaperLoadingKey='';if(revision===wallpaperLoadRevision)notify('The live wallpaper could not be decoded in this browser.');});}
function triggerTilingAnimation(){const speed=project.hyprland?.animationSpeed||5,dur=Math.round(Math.max(90,Math.min(900,1200/speed)));tilingEntranceUntil=Date.now()+dur+220;drawTilingPreview();}
function drawTilingPreview(){
 const container=$('#tiling-preview'),toggleBtn=$('#toggle-tiling-preview'),h=project.hyprland||{},enabled=!!h.windowPreview;
 if(toggleBtn){toggleBtn.setAttribute('aria-pressed',String(enabled));toggleBtn.classList.toggle('active',enabled);}
 if(!container)return;
 container.hidden=!enabled;
 if(!enabled){container.replaceChildren();return;}
 const layout=computeTilingLayout(project,{activeWorkspace:activeWorkspace()});
 const barEl=project.elements.find(e=>e.type==='bar'||e.type==='dock')||project.elements[0];
 const surfaceFill=barEl?.fill||'#181825',textColor=barEl?.color||'#cdd6f4';
 const animMs=Math.round(Math.max(90,Math.min(900,1200/(h.animationSpeed||5))));
 container.replaceChildren();
 if(!preview){
  const outline=node('div',undefined,'tiling-usable-outline');
  Object.assign(outline.style,{left:layout.usable.x+'px',top:layout.usable.y+'px',width:layout.usable.width+'px',height:layout.usable.height+'px'});
  container.append(outline);
 }
 for(const w of layout.windows){
  const win=node('article',undefined,'mock-window'+(w.focused?' focused':'')+(w.floating?' floating':''));
  win.dataset.windowIndex=String(w.index);
  win.dataset.windowClass=w.class;
  win.setAttribute('aria-label','Mock window '+w.app);
  const bg=rgba(surfaceFill,h.blurEnabled?.78:.94),endColor=h.activeBorderEnd||'#bb9af7',angle=h.borderAngle??45;
  Object.assign(win.style,{
   left:w.x+'px',top:w.y+'px',width:w.width+'px',height:w.height+'px',
   borderRadius:h.rounding+'px',color:textColor,
   opacity:String(w.focused?h.activeOpacity:h.inactiveOpacity),
   backdropFilter:h.blurEnabled?`blur(${Math.min(40,h.blurSize*h.blurPasses)}px)`:'none',
   boxShadow:h.shadowEnabled?`0 ${Math.round(h.shadowRange/3)}px ${h.shadowRange}px ${rgba(h.shadowColor,.55)}`:'none',
   transition:h.animations?`left ${animMs}ms cubic-bezier(.22,1,.36,1), top ${animMs}ms cubic-bezier(.22,1,.36,1), width ${animMs}ms cubic-bezier(.22,1,.36,1), height ${animMs}ms cubic-bezier(.22,1,.36,1), opacity 180ms ease, border-radius 180ms ease`:'none',
   animation:h.animations&&tilingEntranceUntil>Date.now()?`rt-win-${h.animationStyle} ${animMs}ms cubic-bezier(.22,1,.36,1) ${w.index*55}ms both`:'none'
  });
  if(h.borderSize>0&&w.focused&&h.borderGradient){
   win.style.background=`linear-gradient(${bg},${bg}) padding-box, linear-gradient(${angle}deg,${h.activeBorder},${endColor}) border-box`;
   win.style.border=`${h.borderSize}px solid transparent`;
  }else{
   win.style.background=bg;
   win.style.border=h.borderSize>0?`${h.borderSize}px solid ${w.focused?h.activeBorder:h.inactiveBorder}`:'0';
  }
  const bar=node('div',undefined,'mock-window-bar'),title=node('div',undefined,'mock-window-title'),badges=node('div',undefined,'mock-window-badges');
  title.append(node('span',w.icon),node('span',w.title));
  if(w.focused){const b=node('span','ACTIVE','mock-badge active-pill');b.style.borderColor=h.activeBorder;badges.append(b);}
  if(w.floating)badges.append(node('span',w.centered?'FLOAT · CENTER':'FLOAT','mock-badge float-pill'));
  else badges.append(node('span',w.index===0&&h.layout==='master'?'MASTER':'TILED','mock-badge'));
  if(w.ruleWorkspace)badges.append(node('span','WS '+w.ruleWorkspace,'mock-badge'));
  bar.append(title,badges);
  const body=node('div',undefined,'mock-window-body');
  if(w.kind==='terminal'){
   const grid=node('div',undefined,'mock-terminal-grid'),ascii=node('pre','  /\\  \n /  \\ \n/ /\\ \\','mock-ascii'),kv=node('div',undefined,'mock-kv');
   ascii.style.color=h.activeBorder;
   kv.append(
    node('div',`wm      · Hyprland (${h.layout})`),
    node('div',`gaps    · in ${h.gapsIn}px / out ${h.gapsOut}px`),
    node('div',`border  · ${h.borderSize}px (${h.borderGradient?'gradient':'solid'}) · r=${h.rounding}px`),
    node('div',`effects · blur ${h.blurEnabled?h.blurSize+'×'+h.blurPasses:'off'} · shadow ${h.shadowEnabled?h.shadowRange+'px':'off'}`)
   );
   const swatches=node('div',undefined,'mock-swatches');
   for(const c of [project.canvas.background,surfaceFill,textColor,h.activeBorder,h.activeBorderEnd||h.inactiveBorder]){const s=node('i');s.style.background=c;swatches.append(s);}
   kv.append(swatches);grid.append(ascii,kv);body.append(grid);
  }else if(w.kind==='code'){
   const borderSnippet=h.borderGradient?`"${h.activeBorder} ${h.activeBorderEnd||'#bb9af7'} ${h.borderAngle??45}deg"`:`"${h.activeBorder}"`;
   body.append(node('pre',`hl.config({\n  general = { gaps_in = ${h.gapsIn}, gaps_out = ${h.gapsOut}, border_size = ${h.borderSize}, layout = "${h.layout}" },\n  col = { active_border = ${borderSnippet} },\n  decoration = { rounding = ${h.rounding}, active_opacity = ${h.activeOpacity}, inactive_opacity = ${h.inactiveOpacity} }\n})`,'mock-code'));
  }else if(w.kind==='files'){
   const files=node('div',undefined,'mock-files-grid');
   for(const label of ['▣ config/hyprland','◈ config/quickshell','▤ config/waybar','🖼 assets/wallpaper'])files.append(node('div',label,'mock-file-card'));
   body.append(files);
  }else{
   body.append(node('div','https://wiki.hypr.land/Configuring/Variables/','mock-browser-url'),node('div',`Live preview · ${w.width}×${w.height}px · Workspace ${activeWorkspace()}`,'mock-kv'));
  }
  const footer=node('div',undefined,'mock-window-footer');
  footer.append(node('span',`class: ${w.class}`),node('span',`${w.width}×${w.height} · click to focus`));
  body.append(footer);
  win.append(bar,body);
  win.onclick=event=>{event.stopPropagation();project.hyprland={...project.hyprland,focusedWindow:w.index};if(!preview&&selected!==null){selection.clear();selected=null;}draw();properties();autosave();};
  win.onmouseenter=()=>{if(preview&&project.hyprland.followMouse===1&&(project.hyprland.focusedWindow??0)!==w.index){project.hyprland={...project.hyprland,focusedWindow:w.index};drawTilingPreview();}};
  container.append(win);
 }
}
function draw(){let scopedCss='';let customStyles=$('#rt-custom-styles');if(!customStyles){customStyles=document.createElement('style');customStyles.id='rt-custom-styles';document.head?.append(customStyles);}
 const board=$('#artboard'),d=desktop(project),poster=d.mode==='live'&&wallpaperPosterKey===(d.video?d.video.length+':'+d.video.slice(-24):'')?wallpaperPosterUrl:'';Object.assign(board.style,{width:project.canvas.width+'px',height:project.canvas.height+'px',background:project.canvas.background,backgroundImage:d.mode==='image'&&d.image?`url("${d.image}")`:poster?`url("${poster}")`:d.mode==='gradient'?`linear-gradient(${d.angle}deg,${project.canvas.background},${d.gradientEnd})`:'none',backgroundSize:d.fit==='stretch'?'100% 100%':d.fit,backgroundPosition:d.position,backgroundRepeat:'no-repeat'});syncLiveWallpaper($('#live-wallpaper'),d);const label=$('.desktop-label');label.textContent=d.text;label.hidden=!d.showText;label.style.color=d.textColor;drawTilingPreview();
 $('#elements').replaceChildren();for(const e of [...project.elements.filter(n=>!n.parentId),...project.elements.filter(n=>n.parentId)]){const g=box(project,e),a=appearance(e),o=options(e),pageLayout=e.workspaceLayout?.[activeWorkspace()-1],effectiveOptions={...o,...(pageLayout?.align?{align:pageLayout.align}:{})},root=rootElement(e),edge=preview&&root.reveal?.mode==='hot-edge',el=node('div',undefined,'element'+(selection.has(e.id)&&!preview?' selected':'')+(preview?' interactive':'')+(edge?' edge-family':''));el.dataset.id=e.id;el.setAttribute('aria-label',e.name);const activePage=activeWorkspace();el.hidden=(e.workspaceOnly||0)>0&&e.workspaceOnly!==activePage||(e.workspaceHidden||0)===activePage;const timeline={enabled:false,duration:2000,loop:true,keyframes:[],...e.timeline},timelineName='rt-timeline-'+e.id.replace(/[^a-z0-9-]/gi,''),frames=[...timeline.keyframes].sort((a,b)=>a.at-b.at);if(timeline.enabled&&frames.length>=2)scopedCss+=`@keyframes ${timelineName}{${frames.map(f=>`${Math.round(f.at*10000)/100}%{transform:translate(${f.x}px,${f.y}px) scale(${f.scale}) rotate(${f.rotation}deg);opacity:${f.opacity}}`).join('')}}\n`;const timelineAnimation=timeline.enabled&&frames.length>=2?`${timelineName} ${timeline.duration}ms linear 0ms ${timeline.loop?'infinite':'1'} both`:(e.animation?.enabled&&e.animation.kind!=='none'?`rt-${e.animation.kind} ${e.animation.duration}ms ${e.animation.easing} ${e.animation.delay}ms ${e.animation.iteration}`:'none');Object.assign(el.style,{left:(pageLayout?.x??g.x)+'px',top:g.y+'px',width:e.width+'px',height:e.height+'px',background:rgba(e.fill,a.opacity),color:e.color,borderRadius:e.custom?.shape==='circle'?'50%':e.custom?.shape==='pill'?'999px':e.radius+'px',clipPath:e.custom?.shape==='diamond'?'polygon(50% 0,100% 50%,50% 100%,0 50%)':'none',fontSize:e.fontSize+'px',border:`${a.borderWidth}px solid ${a.borderColor}`,backdropFilter:`blur(${a.blur}px)`,boxShadow:a.shadow?`0 ${a.shadow/3}px ${a.shadow}px #0008`:'none',fontFamily:a.fontAsset?`asset-${a.fontAsset}`:a.font,animation:timelineAnimation});if(el.hidden)el.style.display='none';if(edge){const offset=root.reveal?.edge==='right'?project.canvas.width-root.x+16:-(root.x+root.width+16),hidden=`translate3d(${offset}px,0,0)`;el.dataset.edgeRoot=root.id;el.dataset.edgeHidden=hidden;el.style.transform=openEdges.has(root.id)?'translate3d(0,0,0)':hidden;el.onmouseenter=()=>setEdgeFamily(root.id,true);el.onmouseleave=()=>scheduleEdgeClose(root);}
 el.id='rt-'+e.id.replace(/[^a-z0-9-]/gi,'');if(e.customCss?.scoped)scopedCss+=e.customCss.scoped+'\n';const content=node('div',undefined,'widget-content');Object.assign(content.style,{padding:effectiveOptions.padding+'px',gap:effectiveOptions.gap+'px',flexDirection:effectiveOptions.orientation==='vertical'?'column':'row',justifyContent:({'start':'flex-start','end':'flex-end'})[effectiveOptions.align]||effectiveOptions.align});if(o.svgAsset){const asset=project.assets?.find(a=>a.id===o.svgAsset&&a.extension==='svg');if(asset){const img=node('img');img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(asset.data);img.alt='';img.width=o.iconSize;img.height=o.iconSize;content.append(img);}}
 if(e.type==='memoryChart'){const chart=node('div',undefined,'memory-chart'),label=node('strong','RAM usage · '+(liveValue(e)?.memory??sim.get(e).memory)+'%'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),poly=document.createElementNS('http://www.w3.org/2000/svg','polyline');svg.setAttribute('viewBox','0 0 100 40');svg.setAttribute('preserveAspectRatio','none');poly.setAttribute('points','0,31 12,27 24,29 36,20 48,23 60,14 72,17 84,8 100,11');poly.setAttribute('fill','none');poly.setAttribute('stroke','currentColor');poly.setAttribute('stroke-width','2');poly.setAttribute('vector-effect','non-scaling-stroke');svg.append(poly);chart.append(label,svg);content.append(chart);}
 else if(e.type==='visualizer'){const s={style:'bars',bars:28,sensitivity:1.4,smoothing:.7,secondaryColor:e.color,mirror:false,direction:'up',range:'full',...e.spectrum},waves=node('div',undefined,'music-waves style-'+s.style+' direction-'+s.direction),music=project.elements.find(n=>n.type==='music'),playing=dataMode==='live'?live.data?.media?.status==='Playing':music?sim.get(music).playing:true,source=live.data?.spectrum?.bins;waves.classList.toggle('playing',!!playing);waves.style.setProperty('--smoothing',Math.round(16+s.smoothing*90)+'ms');for(let i=0;i<s.bars;i++){const sourceIndex=s.mirror?Math.floor(Math.abs(i-(s.bars-1)/2)/Math.max(1,(s.bars-1)/2)*((source?.length||32)-1)):Math.floor(i/Math.max(1,s.bars-1)*((source?.length||32)-1)),raw=source?.[sourceIndex]??(.16+((i*7)%13)/21),bar=node('i');bar.style.setProperty('--wave',String(Math.min(1,Math.max(.025,raw*s.sensitivity))));bar.style.setProperty('--delay',(-i*37)+'ms');bar.style.background=`linear-gradient(${['left','right'].includes(s.direction)?'90deg':'0deg'},${e.color},${s.secondaryColor})`;waves.append(bar);}content.append(waves);}
 else if(['widget','text','shape'].includes(e.type)){const t=node('span',customText(e),'custom-value');t.style.whiteSpace='pre-wrap';t.style.textAlign=effectiveOptions.align==='start'?'left':effectiveOptions.align==='end'?'right':'center';content.append(t);}
 else if(e.type==='clock')content.append(node('span',(o.icon?o.icon+' ':'')+clock(e),'clock-time'));
 else if(e.type==='workspaces')for(let i=1;i<=behavior(e).workspaceCount;i++){const b=button(i,async event=>{event.stopPropagation();if(preview&&behavior(e).click==='activate'){if(dataMode==='live')await executeLive({type:'workspace',params:{workspace:i}});else switchWorkspacePreview(e,i);}else if(!preview)select(e.id,event.shiftKey);},'Workspace '+i);b.className='workspace-button';if((liveValue(e)||sim.get(e)).active===i){b.style.background=behavior(e).activeColor;b.style.color='#182417';}content.append(b);}
 else if(e.type==='music'){const state=liveValue(e)||sim.get(e),player=node('div',undefined,'music-player'),title=node('span',state.title||'No player','music-title'),controls=node('div',undefined,'music-controls');for(const [symbol,label,command] of [['⏮','Previous','previous'],[state.playing?'⏸':'▶',state.playing?'Pause':'Play','play-pause'],['⏭','Next','next']]){const control=button(symbol,event=>{event.stopPropagation();if(!preview)return;if(dataMode==='live')executeLive({type:'media',params:{command}});else if(command==='play-pause'){state.playing=!state.playing;draw();}},label);controls.append(control);}player.append(title,controls);content.append(player);}else if(e.type==='power'&&preview){const powerButton=button(widgetText(e),event=>{event.stopPropagation();calendarOffset=0;showPopup(e);},'Open power menu');powerButton.className='power-widget-button';content.append(powerButton);}else if(!isContainer(e)){const text=node('span',widgetText(e),'widget-value');if(e.type==='volume'&&sim.get(e).muted)text.style.color=behavior(e).mutedColor;content.append(text);}
 for(const item of o.items){const id=actionId(item),chip=button((item.icon?item.icon+' ':'')+item.label,event=>{event.stopPropagation();if(preview)runAction(id,item.actionModel||legacyAction(id));else select(e.id,event.shiftKey);});chip.replaceChildren();if(item.icon){const icon=node('span',item.icon);icon.style.fontSize=o.iconSize+'px';chip.append(icon);}chip.append(node('span',item.label));chip.className='widget-item'+(!id?' unresolved':'');chip.title=id?APPS[id].label:'Not linked to an action';chip.style.fontSize=e.fontSize+'px';content.append(chip);}applyElementVisuals(el,content,e,logicData(e));el.append(content);
 if(!preview&&selection.has(e.id))for(const direction of ['nw','n','ne','e','se','s','sw','w']){const h=node('span',undefined,'resize-handle '+direction);h.dataset.resize=direction;el.append(h);}
 if(preview){el.onclick=event=>{if(e.type==='power'&&event.target.closest('.power-widget-button'))return;const act=e.actions?.click||root.actions?.click;if(act&&act.type!=='none'){executeWidgetAction(act,e);return;}activate(e);};el.oncontextmenu=event=>{const act=e.actions?.rightClick||root.actions?.rightClick;if(act&&act.type!=='none'){event.preventDefault();event.stopPropagation();executeWidgetAction(act,e);}};el.onwheel=async event=>{event.preventDefault();event.stopPropagation();const key=event.deltaY<0?'scrollUp':'scrollDown',act=e.actions?.[key]||e.actions?.scroll||root.actions?.[key]||root.actions?.scroll;if(act&&act.type!=='none'){await executeWidgetAction(act,e);return;}if(e.type==='volume'&&behavior(e).scroll==='volume'){const delta=(event.deltaY<0?1:-1)*behavior(e).volumeStep;if(dataMode==='live')await executeLive({type:'volumeStep',params:{delta}});else{const s=sim.get(e);s.volume=clamp(s.volume+delta,0,100);draw();if(popupId===e.id)showPopup(e);}}};}$('#elements').append(el);}
 if(preview)for(const root of project.elements.filter(e=>!e.parentId&&e.reveal?.mode==='hot-edge')){const sensor=node('div',undefined,'hot-edge-sensor');sensor.dataset.edgeSensor=root.id;sensor.setAttribute('aria-label','Reveal '+root.name);sensor.setAttribute('aria-expanded',String(openEdges.has(root.id)));sensor.style.width=(root.reveal.triggerSize||4)+'px';sensor.style.left=root.reveal?.edge==='right'?'auto':'0';sensor.style.right=root.reveal?.edge==='right'?'0':'auto';sensor.onmouseenter=()=>setEdgeFamily(root.id,true);sensor.onmouseleave=()=>scheduleEdgeClose(root);$('#elements').append(sensor);}
 renderedWorkspace=activeWorkspace();customStyles.textContent=scopedCss;$('#canvas-caption').textContent=`DESKTOP · ${project.canvas.width} × ${project.canvas.height}`;
}
function layers(){$('#layers').replaceChildren();const addLayer=(e,child=false)=>{const b=button((child?'↳ ':'')+TYPE_META[e.type][0]+' '+e.name,event=>{if(!preview)select(e.id,event.shiftKey);});b.className='layer'+(selection.has(e.id)?' selected':'');$('#layers').append(b);};for(const e of [...project.elements].reverse().filter(e=>!e.parentId)){addLayer(e);for(const c of project.elements.filter(c=>c.parentId===e.id))addLayer(c,true);}$('#count').textContent=project.elements.length;}
const sectionOpenState=new Map();
let showAdvancedProps=false,customScreenSizeMode=false,currentAdvancedContainer=null;
const DEFAULT_OPEN_SECTIONS=new Set(['Appearance','Layout','Widget Neighborhood content','Behavior & state','Local music','Audio spectrum','Desktop','Hyprland compositor','Color presets','Unlinked shortcuts']);
function resetSectionByTitle(title){
 const e=current();
 commit(()=>{
  if(e){
   const def=element(e.type);
   if(title===e.name||title.endsWith('layers selected')){Object.assign(e,{radius:def.radius,fontSize:def.fontSize,fill:def.fill,color:def.color});e.appearance={...appearance(e),opacity:def.appearance.opacity,borderWidth:def.appearance.borderWidth,borderColor:def.appearance.borderColor,font:def.appearance.font,fontAsset:''};e.options={...options(e),icon:def.options.icon};}
   else if(title==='Appearance'||title==='Blur, shadow & custom CSS'){e.appearance=structuredClone(def.appearance);delete e.customCss;e.options={...options(e),svgAsset:''};}
   else if(title==='Layout'||title==='Internal layout & container'){const items=e.options?.items||[];e.options={...structuredClone(def.options),items};delete e.anchorX;delete e.anchorY;}
   else if(title==='Reveal & overlay'){e.reveal={mode:'always',edge:'left',triggerSize:4,hideDelay:350};}
   else if(title==='Widget Neighborhood content'){e.custom=structuredClone(def.custom||{text:'Custom Widget',dataSource:'static',shape:'rectangle'});}
   else if(title==='Animation'){e.animation=structuredClone(def.animation);}
   else if(title==='Timeline & keyframes'){e.timeline={enabled:false,duration:2000,loop:true,keyframes:[]};}
   else if(title==='Visual data bindings'){e.signalBindings=[];}
   else if(title==='Workspace Content'){delete e.workspaceContent;delete e.workspaceLayout;delete e.workspaceMotion;e.workspaceOnly=0;e.workspaceHidden=0;}
   else if(title==='Behavior & state'||title==='Click & scroll behavior'){e.behavior=structuredClone(def.behavior);}
   else if(title==='Display targeting'){e.monitorId='all';}
   else if(title==='Visual Logic'){e.logic=[];}
  }else{
   const def=fresh();
   if(title==='Desktop'||title==='Desktop text & video'){project.canvas.background=def.canvas.background;project.canvas.desktop=structuredClone(def.canvas.desktop);}
   else if(title==='Hyprland compositor'||title==='Window effects & preview'){const h=def.hyprland;project.hyprland={...project.hyprland,gapsIn:h.gapsIn,gapsOut:h.gapsOut,borderSize:h.borderSize,rounding:h.rounding,activeOpacity:h.activeOpacity,inactiveOpacity:h.inactiveOpacity,splitRatio:h.splitRatio,activeBorder:h.activeBorder,inactiveBorder:h.inactiveBorder,borderGradient:h.borderGradient,activeBorderEnd:h.activeBorderEnd,borderAngle:h.borderAngle,layout:h.layout,blurEnabled:h.blurEnabled,blurSize:h.blurSize,blurPasses:h.blurPasses,shadowEnabled:h.shadowEnabled,shadowRange:h.shadowRange,shadowColor:h.shadowColor,animations:h.animations,animationSpeed:h.animationSpeed,animationStyle:h.animationStyle};}
   else if(title==='Monitor & input'){const h=def.hyprland;project.hyprland={...project.hyprland,monitor:h.monitor,keyboardLayout:h.keyboardLayout,keyboardOptions:h.keyboardOptions,followMouse:h.followMouse,naturalScroll:h.naturalScroll};}
   else if(title==='Full rice integrations'){project.integrations=structuredClone(def.integrations);}
   else if(title==='Hyprland shortcuts'){project.automation.keybindings=structuredClone(def.automation.keybindings);}
   else if(title==='Window rules'){project.automation.windowRules=[];}
   else if(title==='Workspace rules'){project.automation.workspaceRules=[];}
  }
 });
 notify(title+' reset to defaults.');
}
function beginAdvancedProperties(label='⚙ Advanced settings · متقدم'){
 const wrap=node('div',undefined,'advanced-props-wrapper');
 const btn=button('',()=>{
  showAdvancedProps=!showAdvancedProps;
  container.hidden=!showAdvancedProps;
  btn.setAttribute('aria-expanded',String(showAdvancedProps));
  btn.classList.toggle('open',showAdvancedProps);
 },label);
 btn.className='advanced-props-toggle'+(showAdvancedProps?' open':'');
 btn.setAttribute('aria-expanded',String(showAdvancedProps));
 btn.append(node('span',label),node('span','▾','cat-chevron'));
 const container=node('div',undefined,'advanced-props-container');
 container.hidden=!showAdvancedProps;
 wrap.append(btn,container);
 $('#properties').append(wrap);
 currentAdvancedContainer=container;
 return container;
}
function section(title){
 const s=node('section',undefined,'property-section'+(currentAdvancedContainer?' is-advanced':''));
 const e=current();
 const isPrimaryLayerSection=e&&(title===e.name||title.endsWith('layers selected'));
 const hasActiveData=(title==='Reveal & overlay'&&e?.reveal?.mode==='hot-edge')||(title==='Applications & actions'&&['dock','launcher'].includes(e?.type));
 const defaultOpen=!currentAdvancedContainer&&(isPrimaryLayerSection||hasActiveData||DEFAULT_OPEN_SECTIONS.has(title));
 const isOpen=sectionOpenState.has(title)?sectionOpenState.get(title):defaultOpen;
 const header=node('div',undefined,'property-section-header');
 const toggleBtn=button('',()=>{
  const next=body.hidden;
  body.hidden=!next;
  toggleBtn.setAttribute('aria-expanded',String(next));
  sectionOpenState.set(title,next);
 },'Toggle '+title+' section');
 toggleBtn.className='section-toggle-btn';
 toggleBtn.setAttribute('aria-expanded',String(isOpen));
 toggleBtn.append(node('span','▾','cat-chevron'),node('h3',title));
 header.append(toggleBtn);
 if(!['Color presets','Unlinked shortcuts','Project','Displays'].includes(title)){
  const resetBtn=button('Reset',event=>{event.stopPropagation();resetSectionByTitle(title);},'Reset '+title+' section');
  resetBtn.className='section-reset-btn';
  header.append(resetBtn);
 }
 const body=node('div',undefined,'property-section-body');
 body.hidden=!isOpen;
 s.append(header,body);
 (currentAdvancedContainer||$('#properties')).append(s);
 return body;
}
function field(parent,label,value,change,{type='text',min,max,step=1,choices,maxLength=120,hidden=false}={}){const wrap=node('label',label);if(hidden)wrap.hidden=true;const input=node(choices?'select':type==='textarea'?'textarea':'input');input.setAttribute('aria-label',label);if(choices){for(const entry of choices){const [v,t]=Array.isArray(entry)?entry:[entry,entry];const opt=node('option',t);opt.value=v;input.append(opt);}}else if(type!=='textarea'){input.type=type;input.maxLength=maxLength;if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;input.step=step;}else input.maxLength=maxLength;if(type==='checkbox')input.checked=value;else input.value=value;
 const apply=()=>{const v=type==='checkbox'?input.checked:type==='number'||type==='range'?Number(input.value):input.value;if((type==='number'||type==='range')&&(!Number.isFinite(v)||input.value===''||v<min||v>max))return false;change(v);pending=true;draw();layers();autosave();return true;};
 if(type==='color'){
  const group=node('span',undefined,'color-hex-group');
  const hex=node('input',undefined,'color-hex-text');
  hex.type='text';hex.maxLength=7;hex.value=String(value||'#000000');hex.setAttribute('aria-label',label+' hex');
  input.oninput=()=>{hex.value=input.value;apply();};
  input.onchange=()=>{hex.value=input.value;if(apply())checkpoint();};
  hex.oninput=()=>{const c=hex.value.trim();if(/^#[0-9a-fA-F]{6}$/.test(c)){input.value=c.toLowerCase();apply();}};
  hex.onchange=()=>{const c=hex.value.trim();if(/^#[0-9a-fA-F]{6}$/.test(c)){input.value=c.toLowerCase();if(apply())checkpoint();}else hex.value=input.value;};
  group.append(input,hex);wrap.append(group);parent.append(wrap);return input;
 }
 if(choices||type==='checkbox'||type==='file'){input.onchange=()=>{if(apply()){checkpoint();properties();}};}else{input.oninput=apply;input.onchange=()=>{if(apply())checkpoint();};input.onblur=()=>{if(pending)checkpoint();};}wrap.append(input);parent.append(wrap);return input;}
function updateElement(id,key,value){const e=project.elements.find(n=>n.id===id);if(e)e[key]=value;}
function properties(){
 currentAdvancedContainer=null;
 $('#properties').replaceChildren();const e=current();if(!e){desktopProperties();return;}
 const o=options(e),a=appearance(e),b=behavior(e);
 // --- BASIC ELEMENT SETTINGS (أساسي — 10 core groups) ---
 const s=section(selection.size>1?`${selection.size} layers selected`:e.name),grid=node('div',undefined,'fields');s.append(grid);
 // 1. Name & 2. Position/Size & 3. Shape/Font
 field(grid,'Layer name',e.name,v=>updateElement(e.id,'name',v));
 for(const [key,title,min,max] of [['x','X',0,10000],['y','Y',0,10000],['width','Width',20,10000],['height','Height',20,10000],['radius','Radius',0,500],['fontSize','Font size',8,200]])field(grid,title,e[key],v=>{updateElement(e.id,key,v);constrain(project,e);if(isContainer(e))for(const c of project.elements.filter(n=>n.parentId===e.id))constrain(project,c);},{type:'number',min:e.type==='shape'&&['width','height'].includes(key)?2:min,max});
 for(const [k,t] of [['fill','Fill'],['color','Text color']])field(grid,t,e[k],v=>updateElement(e.id,k,v),{type:'color'});
 field(grid,'Font',a.fontAsset||a.font,v=>{e.appearance={...appearance(e),fontAsset:project.assets?.some(n=>n.id===v&&['ttf','otf'].includes(n.extension))?v:'',font:project.assets?.some(n=>n.id===v&&['ttf','otf'].includes(n.extension))?'sans-serif':v};},{choices:[['sans-serif','System sans'],['serif','System serif'],['monospace','Monospace'],...(project.assets||[]).filter(n=>['ttf','otf'].includes(n.extension)).map(n=>[n.id,n.name])]});
 // 4. Opacity & Border
 for(const [k,t,min,max,step] of [['opacity','Background opacity',0,1,.05],['borderWidth','Border width',0,20,1]])field(grid,t,a[k],v=>{e.appearance={...appearance(e),[k]:v};},{type:'number',min,max,step});
 field(grid,'Border color',a.borderColor,v=>e.appearance={...appearance(e),borderColor:v},{type:'color'});
 // 5. Icon
 field(grid,'Icon',o.icon,v=>e.options={...options(e),icon:v},{choices:ICONS.map(i=>[i,i||'Default'])});
 // 6. Widget content (for widget, text, shape)
 if(['widget','text','shape'].includes(e.type)){
  const c={text:'',dataSource:'static',shape:'rectangle',...e.custom},pageIndex=clamp(workspaceEditPage,1,Math.max(1,e.workspaceContent?.length||1))-1,pageText=Array.isArray(e.workspaceContent)?e.workspaceContent[pageIndex]??'':c.text,setc=(k,v)=>{e.custom={text:'',dataSource:'static',shape:'rectangle',...e.custom,[k]:v};},setText=v=>{if(Array.isArray(e.workspaceContent)){while(e.workspaceContent.length<=pageIndex)e.workspaceContent.push('');e.workspaceContent[pageIndex]=v;if(pageIndex===0)setc('text',v);}else setc('text',v);};
  field(s,Array.isArray(e.workspaceContent)?`Text / template · Workspace ${pageIndex+1}`:'Text / template',pageText,setText,{maxLength:2000});
  field(grid,'Data source',c.dataSource,v=>setc('dataSource',v),{choices:DATA_SOURCES.map(k=>[k,DATA_LABELS[k]||k])});
  field(grid,'Shape',c.shape,v=>setc('shape',v),{choices:[['rectangle','Rectangle'],['circle','Circle'],['pill','Pill'],['diamond','Diamond']]});
 }
 // 7. Clock (for clock)
 if(e.type==='clock'){
  field(grid,'Time format',e.format,v=>e.format=v,{choices:['24h','12h']});
  for(const [k,t] of [['showSeconds','Show seconds'],['showDate','Show date']])field(grid,t,o[k],v=>e.options={...options(e),[k]:v},{type:'checkbox'});
 }
 // 8. Workspaces (for workspaces)
 if(e.type==='workspaces'){
  field(grid,'Workspace count',b.workspaceCount,v=>e.behavior={...behavior(e),workspaceCount:Math.round(v)},{type:'number',min:1,max:10});
  field(grid,'Active color',b.activeColor,v=>e.behavior={...behavior(e),activeColor:v},{type:'color'});
 }
 // 10. Basic Audio Spectrum (for visualizer)
 if(e.type==='visualizer'){
  const sp={style:'bars',bars:64,sensitivity:1.4,smoothing:.35,secondaryColor:e.color,mirror:false,direction:'center',range:'full',engine:'cava',autosens:true,noiseReduction:77,channels:'stereo',...e.spectrum},sets=(k,v)=>e.spectrum={...sp,...e.spectrum,[k]:v};
  field(grid,'Bars',sp.bars,v=>sets('bars',Math.round(v)),{type:'number',min:4,max:96});
  field(grid,'Wave style',sp.style,v=>sets('style',v),{choices:[['bars','Spectrum bars'],['waveform','Centered waveform']]});
  field(grid,'Secondary color',sp.secondaryColor,v=>sets('secondaryColor',v),{type:'color'});
  field(grid,'Sensitivity',sp.sensitivity,v=>sets('sensitivity',v),{type:'number',min:.1,max:5,step:.1});
 }
 const openStudioBtn=button('⬡ Edit in Widget Studio',()=>studio?.open(e.id));openStudioBtn.className='open-studio-prop-btn';
 s.append(button('Duplicate',duplicate),button('Delete',remove),openStudioBtn);
 // 9. Dock / Launcher applications (Basic when dock or launcher)
 if(['dock','launcher'].includes(e.type))shortcutsProperties(e);

 // --- ADVANCED ELEMENT SETTINGS (متقدم — 14 groups) ---
 beginAdvancedProperties('⚙ Advanced element settings · متقدم');
 // Adv 1, 2, 3: Blur, Shadow, SVG icon, Custom CSS
 const appearanceSection=section('Appearance'),ag=node('div',undefined,'fields');appearanceSection.append(ag);
 for(const [k,t,min,max,step] of [['blur','Backdrop blur',0,50,1],['shadow','Shadow',0,80,1]])field(ag,t,a[k],v=>{e.appearance={...appearance(e),[k]:v};},{type:'number',min,max,step});
 appearanceSection.append(button('Upload font (.ttf / .otf)',()=>$('#font-file').click()),button('Upload safe SVG',()=>$('#svg-file').click()));
 field(appearanceSection,'SVG icon',o.svgAsset||'',v=>e.options={...options(e),svgAsset:v},{choices:[['','None'],...(project.assets||[]).filter(n=>n.extension==='svg').map(n=>[n.id,n.name])]});
 field(appearanceSection,'Scoped custom CSS',e.customCss?.source||'',v=>{const safe=sanitizeScopedCss(v,'#rt-'+e.id.replace(/[^a-z0-9-]/gi,''));e.customCss={source:v,scoped:safe.css,errors:safe.errors};},{maxLength:64000});
 if(e.customCss?.errors?.length)appearanceSection.append(node('p','CSS: '+e.customCss.errors.join(' · ')));

 // Adv 4 & 5: Internal layout & Container/Anchors
 const layout=section('Layout');
 for(const [k,t] of [['padding','Padding'],['gap','Item gap'],['iconSize','Icon size']])field(layout,t,o[k],v=>e.options={...options(e),[k]:v},{type:'number',min:k==='iconSize'?8:0,max:200});
 field(layout,'Alignment',o.align,v=>e.options={...options(e),align:v},{choices:['start','center','end','space-between']});
 field(layout,'Direction',o.orientation,v=>e.options={...options(e),orientation:v},{choices:['horizontal','vertical']});
 if(!isContainer(e))field(layout,'Container',e.parentId||'',id=>{attach(project,e,id);constrain(project,e);},{choices:[['','Desktop'],...project.elements.filter(isContainer).map(n=>[n.id,n.name])]});
 else layout.append(button('Arrange children in a row',()=>commit(()=>{if(autoLayout(project,e))notify('Some components need a wider container.');})));
 if(!e.parentId){
  field(layout,'Horizontal anchor',e.anchorX||'scale',v=>e.anchorX=v,{choices:['scale','left','center','right','stretch']});
  field(layout,'Vertical anchor',e.anchorY||'scale',v=>e.anchorY=v,{choices:['scale','top','center','bottom','stretch']});
 }
 // Adv 6: Reveal & overlay
 if(!e.parentId){const reveal={mode:'always',edge:'left',triggerSize:4,hideDelay:350,...e.reveal},visibility=section('Reveal & overlay'),visibilityValue=reveal.mode==='always'?'always':reveal.edge+'-edge';field(visibility,'Visibility',visibilityValue,v=>e.reveal={...reveal,mode:v==='always'?'always':'hot-edge',edge:v==='right-edge'?'right':'left'},{choices:[['always','Always visible'],['left-edge','Reveal from left edge'],['right-edge','Reveal from right edge']]});if(reveal.mode==='hot-edge'){field(visibility,'Edge trigger width',reveal.triggerSize,v=>e.reveal={...reveal,triggerSize:v},{type:'number',min:1,max:24});field(visibility,'Hide delay (ms)',reveal.hideDelay,v=>e.reveal={...reveal,hideDelay:v},{type:'number',min:0,max:3000,step:50});visibility.append(node('p',`In Preview and Quickshell export this panel stays above applications and opens when the pointer reaches the far-${reveal.edge} edge.`));}}
 // Adv 7: Animation
 const animation={kind:'none',duration:1200,delay:0,easing:'ease-in-out',enabled:true,iteration:'infinite',...e.animation},seta=(k,v)=>e.animation={kind:'none',duration:1200,delay:0,easing:'ease-in-out',enabled:true,iteration:'infinite',...e.animation,[k]:v},animationSection=section('Animation');field(animationSection,'Enabled',animation.enabled,v=>seta('enabled',v),{type:'checkbox'});field(animationSection,'Effect',animation.kind,v=>seta('kind',v),{choices:ANIMATION_KINDS.map(k=>[k,ANIMATION_LABELS[k]||k])});field(animationSection,'Duration (ms)',animation.duration,v=>seta('duration',v),{type:'number',min:100,max:30000,step:50});field(animationSection,'Delay (ms)',animation.delay,v=>seta('delay',v),{type:'number',min:0,max:30000,step:50});field(animationSection,'Easing',animation.easing,v=>seta('easing',v),{choices:['linear','ease','ease-in','ease-out','ease-in-out']});field(animationSection,'Repeat',animation.iteration,v=>seta('iteration',v),{choices:[['once','Once'],['infinite','Loop']]});
 // Adv 8: Timeline & keyframes
 const timeline={enabled:false,duration:2000,loop:true,keyframes:[],...e.timeline},sett=(k,v)=>e.timeline={...timeline,...e.timeline,[k]:v},timelineSection=section('Timeline & keyframes');field(timelineSection,'Timeline enabled',timeline.enabled,v=>sett('enabled',v),{type:'checkbox'});field(timelineSection,'Timeline duration (ms)',timeline.duration,v=>sett('duration',v),{type:'number',min:100,max:60000,step:50});field(timelineSection,'Loop timeline',timeline.loop,v=>sett('loop',v),{type:'checkbox'});timelineSection.append(button('+ Add keyframe',()=>commit(()=>{e.timeline={...timeline,...e.timeline};const frames=e.timeline.keyframes??=[];if(frames.length>=24)throw Error('Maximum 24 keyframes');const at=frames.length?Math.min(1,Math.max(0,(frames.at(-1).at||0)+.25)):0;frames.push({at,x:0,y:0,scale:1,rotation:0,opacity:1});e.timeline.keyframes=frames;})));for(const [index,frame] of (timeline.keyframes||[]).entries()){const card=node('div',undefined,'keyframe-card');card.append(node('strong','Keyframe '+(index+1)));field(card,'Time % #'+(index+1),Math.round(frame.at*100),v=>frame.at=v/100,{type:'number',min:0,max:100});field(card,'X offset #'+(index+1),frame.x,v=>frame.x=v,{type:'number',min:-10000,max:10000});field(card,'Y offset #'+(index+1),frame.y,v=>frame.y=v,{type:'number',min:-10000,max:10000});field(card,'Scale #'+(index+1),frame.scale,v=>frame.scale=v,{type:'number',min:.05,max:10,step:.05});field(card,'Rotation #'+(index+1),frame.rotation,v=>frame.rotation=v,{type:'number',min:-3600,max:3600});field(card,'Opacity #'+(index+1),frame.opacity,v=>frame.opacity=v,{type:'number',min:0,max:1,step:.05});card.append(button('Remove keyframe '+(index+1),()=>commit(()=>e.timeline.keyframes.splice(index,1))));timelineSection.append(card);}timelineSection.append(node('p','Keyframes interpolate position, scale, rotation and opacity in Preview and exported Quickshell.'));
 // Adv 9: Visual data bindings
 const bindingSection=section('Visual data bindings');bindingSection.append(button('+ Add data binding',()=>commit(()=>{e.signalBindings??=[];if(e.signalBindings.length>=8)throw Error('Maximum 8 data bindings');e.signalBindings.push({id:crypto.randomUUID(),source:'spectrumBass',target:'scale',inputMin:0,inputMax:1,outputMin:1,outputMax:1.15,smoothing:.7});})));for(const [index,binding] of (e.signalBindings||[]).entries()){const card=node('div',undefined,'binding-card');field(card,'Binding source #'+(index+1),binding.source,v=>binding.source=v,{choices:BINDING_SOURCES.map(k=>[k,SOURCE_LABELS[k]||k])});field(card,'Binding target #'+(index+1),binding.target,v=>binding.target=v,{choices:[['opacity','Opacity'],['scale','Scale'],['rotation','Rotation'],['xOffset','X offset'],['yOffset','Y offset']]});for(const [key,label,min,max,step] of [['inputMin','Input min',-1000,1000,.01],['inputMax','Input max',-1000,1000,.01],['outputMin','Output min',-10000,10000,.01],['outputMax','Output max',-10000,10000,.01],['smoothing','Smoothing',0,.98,.05]])field(card,label+' #'+(index+1),binding[key],v=>binding[key]=v,{type:'number',min,max,step});card.append(button('Remove binding '+(index+1),()=>commit(()=>e.signalBindings.splice(index,1))));bindingSection.append(card);}bindingSection.append(node('p','Bindings map live system or FFT values to visual properties without commands.'));
 // Adv 10 & 11: Workspace Content & Visibility
 const workspaceCount=Math.max(1,...project.elements.filter(n=>n.type==='workspaces').map(n=>behavior(n).workspaceCount)),workspaceSection=section('Workspace Content'),hasPages=Array.isArray(e.workspaceContent);field(workspaceSection,'Different content per workspace',hasPages,v=>{if(v){const base=['widget','text','shape'].includes(e.type)?e.custom?.text||'':'';e.workspaceContent=Array.from({length:workspaceCount},(_,i)=>i===0?base:'');e.workspaceLayout=Array.from({length:workspaceCount},()=>({x:e.x,align:options(e).align}));e.workspaceMotion={order:0};}else{delete e.workspaceContent;delete e.workspaceLayout;delete e.workspaceMotion;}},{type:'checkbox'});if(hasPages){workspaceEditPage=clamp(workspaceEditPage,1,workspaceCount);const pageSelect=node('select');pageSelect.setAttribute('aria-label','Editing workspace');for(let i=1;i<=workspaceCount;i++){const option=node('option','Workspace '+i);option.value=i;pageSelect.append(option);}pageSelect.value=workspaceEditPage;pageSelect.onchange=()=>{workspaceEditPage=Number(pageSelect.value);const ws=project.elements.find(n=>n.type==='workspaces');if(ws)sim.get(ws).active=workspaceEditPage;draw();properties();};const pageLabel=node('label','Editing workspace');pageLabel.append(pageSelect);workspaceSection.append(pageLabel);if(['widget','text','shape'].includes(e.type))field(workspaceSection,'Page content',e.workspaceContent[workspaceEditPage-1]??'',v=>{while(e.workspaceContent.length<workspaceCount)e.workspaceContent.push('');e.workspaceContent[workspaceEditPage-1]=v;},{type:'textarea',maxLength:2000});else workspaceSection.append(node('p','This component moves with the page but keeps its normal live value.'));e.workspaceLayout??=Array.from({length:workspaceCount},()=>({x:e.x,align:options(e).align}));while(e.workspaceLayout.length<workspaceCount)e.workspaceLayout.push({x:e.x,align:options(e).align});const pageLayout=e.workspaceLayout[workspaceEditPage-1]||{x:e.x,align:options(e).align};field(workspaceSection,'Page X position',pageLayout.x,v=>e.workspaceLayout[workspaceEditPage-1]={...e.workspaceLayout[workspaceEditPage-1],x:v},{type:'number',min:0,max:Math.max(0,project.canvas.width-e.width)});field(workspaceSection,'Page text alignment',pageLayout.align,v=>e.workspaceLayout[workspaceEditPage-1]={...e.workspaceLayout[workspaceEditPage-1],align:v},{choices:[['start','Left'],['center','Center'],['end','Right'],['space-between','Space between']]});field(workspaceSection,'Transition order',e.workspaceMotion?.order||0,v=>e.workspaceMotion={order:Math.round(v)},{type:'number',min:0,max:20});workspaceSection.append(node('p','Each workspace can keep its own horizontal position and text alignment. Lower order moves first. Changes are stored in the .rce project.'));}
 field(workspaceSection,'Visible on workspace',e.workspaceOnly||0,v=>e.workspaceOnly=Number(v),{choices:[[0,'All workspaces'],...Array.from({length:workspaceCount},(_,i)=>[i+1,'Workspace '+(i+1)+' only'])]});field(workspaceSection,'Hidden on workspace',e.workspaceHidden||0,v=>e.workspaceHidden=Number(v),{choices:[[0,'None'],...Array.from({length:workspaceCount},(_,i)=>[i+1,'Hide on Workspace '+(i+1)])]});if(!hasPages&&(e.workspaceOnly||e.workspaceHidden))field(workspaceSection,'Workspace transition order',e.workspaceMotion?.order||0,v=>e.workspaceMotion={order:Math.round(v)},{type:'number',min:0,max:20});
 // Adv 12: Click & Scroll behavior
 const behaviorSection=section('Behavior & state');
 if(!isContainer(e)){const choices=e.type==='clock'?[['calendar','Open calendar']]:e.type==='volume'?[['volume','Open volume panel'],['mute','Toggle mute']]:e.type==='workspaces'?[['activate','Activate workspace']]:[[e.type,'Open '+TYPES[e.type].name+' panel']];field(behaviorSection,'On click',b.click,v=>e.behavior={...behavior(e),click:v},{choices:[...choices,['none','No action']]});}
 if(e.type==='volume'){field(behaviorSection,'On scroll',b.scroll,v=>e.behavior={...behavior(e),scroll:v},{choices:[['volume','Change volume'],['none','No action']]});field(behaviorSection,'Scroll step',b.volumeStep,v=>e.behavior={...behavior(e),volumeStep:Math.round(v)},{type:'number',min:1,max:25});field(behaviorSection,'Muted color',b.mutedColor,v=>e.behavior={...behavior(e),mutedColor:v},{type:'color'});}
 behaviorSection.append(node('p','Preview states use sample data. Exported components read live data when their dependencies are installed.'));
 // Adv 13: Local music
 if(e.type==='music'){const media=section('Local music');field(media,'Audio file',e.mediaAsset||'',v=>e.mediaAsset=v||undefined,{choices:[['','Use active MPRIS player'],...(project.assets||[]).filter(a=>['mp3','ogg','wav','flac','m4a'].includes(a.extension)).map(a=>[a.id,a.name])]});media.append(button('Upload local audio',()=>$('#audio-file').click()),node('p','The file is embedded in .rce. Native playback uses mpv when installed; controls and waves follow MPRIS through playerctl.'));}
 // Adv 14: Audio engine (for visualizer; duplicate fields hidden in DOM)
 if(e.type==='visualizer'){
  const sp={style:'bars',bars:64,sensitivity:1.4,smoothing:.35,secondaryColor:e.color,mirror:false,direction:'center',range:'full',engine:'cava',autosens:true,noiseReduction:77,channels:'stereo',...e.spectrum},sets=(k,v)=>e.spectrum={...sp,...e.spectrum,[k]:v},audio=section('Audio spectrum');
  field(audio,'Audio engine',sp.engine,v=>sets('engine',v),{choices:[['cava','CAVA · recommended'],['builtin','Built-in FFT fallback']]});
  const channelLayout=sp.channels==='stereo'?'stereo':sp.mirror?'mirrored':'mono';
  field(audio,'Channel layout',channelLayout,v=>{if(v==='stereo')e.spectrum={...sp,...e.spectrum,channels:'stereo',mirror:false};else if(v==='mirrored')e.spectrum={...sp,...e.spectrum,channels:'mono',mirror:true};else e.spectrum={...sp,...e.spectrum,channels:'mono',mirror:false};},{choices:[['mirrored','Balanced mirrored mono'],['mono','Single mono spectrum'],['stereo','True stereo channels']]});
  field(audio,'CAVA auto sensitivity',sp.autosens,v=>sets('autosens',v),{type:'checkbox'});
  field(audio,'CAVA noise reduction',sp.noiseReduction,v=>sets('noiseReduction',Math.round(v)),{type:'number',min:0,max:100});
  field(audio,'Smoothing',sp.smoothing,v=>sets('smoothing',v),{type:'number',min:0,max:.98,step:.05});
  field(audio,'Direction',sp.direction,v=>sets('direction',v),{choices:[['up','Up'],['down','Down'],['center','From center'],['left','Left'],['right','Right']]});
  field(audio,'Frequency range',sp.range,v=>sets('range',v),{choices:[['full','Full spectrum'],['bass','Bass · 20–250 Hz'],['mid','Mid · 250–4000 Hz'],['treble','Treble · 4–20 kHz']]});
  // Retained in code but hidden to prevent UI duplication with Width/Height/Workspace/Channel layout
  field(audio,'Spectrum width',e.width,v=>e.width=Math.round(v),{type:'number',min:120,max:10000,hidden:true});
  field(audio,'Spectrum height',e.height,v=>e.height=Math.round(v),{type:'number',min:20,max:10000,hidden:true});
  field(audio,'Hide on workspace',e.workspaceHidden??0,v=>e.workspaceHidden=Math.round(v),{choices:[[0,'Do not hide'],[1,'Workspace 1'],[2,'Workspace 2'],[3,'Workspace 3'],[4,'Workspace 4'],[5,'Workspace 5']],hidden:true});
  field(audio,'Mirror',sp.mirror,v=>sets('mirror',v),{type:'checkbox',hidden:true});
  audio.append(button('Apply compact balanced spectrum',()=>commit(()=>{e.spectrum={...sp,style:'bars',bars:24,sensitivity:1,smoothing:.2,secondaryColor:'#dda58c',mirror:true,direction:'up',range:'full',engine:'cava',autosens:true,noiseReduction:65,channels:'mono'};e.fill='#2b2522';e.color='#8b5e3c';e.radius=12;e.width=600;e.height=68;e.x=Math.max(0,Math.round((project.canvas.width-e.width)/2));e.y=Math.max(0,project.canvas.height-e.height-20);e.workspaceHidden=3;e.options={...e.options,padding:6};e.appearance={...e.appearance,opacity:.82,borderWidth:2,borderColor:'#c8bfae'};})));
 }
 if(!['dock','launcher'].includes(e.type))shortcutsProperties(e);
}
const PRESET_SCREEN_SIZES=['1280x720','1366x768','1440x900','1920x1080','2560x1440','3840x2160'];
function desktopProperties(){
 currentAdvancedContainer=null;
 // --- BASIC DESKTOP & HYPRLAND SETTINGS (أساسي — 8 core groups) ---
 // 1. Color presets at the VERY TOP of the panel
 const themes=section('Color presets');
 const themeRow=node('div',undefined,'theme-presets-grid');
 for(const [name,t] of Object.entries(THEMES)){
  const b=button(name,()=>commit(()=>{project.canvas.background=t.background;project.hyprland={...project.hyprland,activeBorder:t.accent};for(const e of project.elements){e.fill=t.fill;e.color=t.color;e.behavior={...behavior(e),activeColor:t.accent};}}));
  themeRow.append(b);
 }
 themes.append(themeRow);

 // 2, 3, 4, 5: Screen size, Background mode, and conditional Background colors / image
 const s=section('Desktop'),d=desktop(project);
 const set=(k,v)=>project.canvas.desktop={...desktop(project),[k]:v};
 const currentSizeStr=project.canvas.width+'x'+project.canvas.height;
 const isCustomSize=customScreenSizeMode||!PRESET_SCREEN_SIZES.includes(currentSizeStr);
 field(s,'Screen size',isCustomSize?'custom':currentSizeStr,v=>{
  if(v==='custom'){customScreenSizeMode=true;return;}
  customScreenSizeMode=false;
  const [w,h]=v.split('x').map(Number);changeSize(project,w,h);fit();
 },{choices:[['1280x720','1280 × 720'],['1366x768','1366 × 768'],['1440x900','1440 × 900'],['1920x1080','1920 × 1080'],['2560x1440','2560 × 1440'],['3840x2160','3840 × 2160'],['custom',isCustomSize?`Custom (${project.canvas.width} × ${project.canvas.height})`:'Custom size…']]});
 // Screen width & height: hidden unless Custom size is active
 for(const [k,t] of [['width','Screen width'],['height','Screen height']])field(s,t,project.canvas[k],v=>{changeSize(project,k==='width'?v:project.canvas.width,k==='height'?v:project.canvas.height);},{type:'number',min:100,max:10000,hidden:!isCustomSize});
 field(s,'Background',d.mode,v=>set('mode',v),{choices:[['solid','Solid color'],['gradient','Gradient'],['image','Static image'],['live','Live wallpaper · video']]});
 // Background color (shown for solid & gradient)
 field(s,'Background color',project.canvas.background,v=>project.canvas.background=v,{type:'color',hidden:d.mode==='image'||d.mode==='live'});
 // Gradient fields (shown ONLY when Background === 'gradient')
 field(s,'Gradient end',d.gradientEnd,v=>set('gradientEnd',v),{type:'color',hidden:d.mode!=='gradient'});
 field(s,'Gradient angle',d.angle,v=>set('angle',v),{type:'number',min:0,max:360,hidden:d.mode!=='gradient'});
 // Image fields (shown ONLY when Background === 'image')
 const uploadWallBtn=button('Upload wallpaper',()=>$('#wallpaper-file').click());
 uploadWallBtn.hidden=d.mode!=='image';
 s.append(uploadWallBtn);
 field(s,'Image fit',d.fit,v=>set('fit',v),{choices:['cover','contain','stretch'],hidden:d.mode!=='image'&&d.mode!=='live'});
 field(s,'Image position',d.position,v=>set('position',v),{choices:['center','top','bottom','left','right'],hidden:d.mode!=='image'&&d.mode!=='live'});
 // Live video fields when mode === 'live'
 if(d.mode==='live'){
  s.append(button('Upload live wallpaper',()=>$('#live-wallpaper-file').click()));
  field(s,'Mute live wallpaper',d.videoMuted,v=>set('videoMuted',v),{type:'checkbox'});
  field(s,'Playback speed',d.videoRate,v=>set('videoRate',v),{type:'number',min:.25,max:2,step:.05});
 }

 // 6, 7, 8: Hyprland Basic (Gaps & Rounding, Border Colors, Layout)
 hyprlandProperties();
}
function hyprlandProperties(){
 const h=project.hyprland,set=(k,v)=>project.hyprland={...project.hyprland,[k]:v},d=desktop(project);
 const s=section('Hyprland compositor'),g=node('div',undefined,'fields');
 s.append(g);
 for(const [k,t,min,max,step] of [['gapsIn','Inner gaps',0,100,1],['gapsOut','Outer gaps',0,200,1],['borderSize','Border size',0,20,1],['rounding','Window rounding',0,100,1]])field(g,t,h[k],v=>set(k,v),{type:'number',min,max,step});
 field(g,'Active border',h.activeBorder,v=>set('activeBorder',v),{type:'color'});
 field(g,'Inactive border',h.inactiveBorder,v=>set('inactiveBorder',v),{type:'color'});
 field(s,'Layout',h.layout,v=>set('layout',v),{choices:[['dwindle','Dwindle'],['master','Master'],['scrolling','Scrolling']]});

 const warnings=unresolved(project);
 if(warnings.length){const w=section('Unlinked shortcuts');for(const message of warnings)w.append(node('p','⚠ '+message));}

 // --- ADVANCED DESKTOP & HYPRLAND SETTINGS (متقدم — 14 groups) ---
 beginAdvancedProperties('⚙ Advanced desktop & Hyprland · متقدم');
 // Adv 1 & 2: Desktop text & Live wallpaper
 const deskAdv=section('Desktop text & video');
 if(d.mode!=='live'){
  deskAdv.append(button('Upload live wallpaper',()=>$('#live-wallpaper-file').click()));
  field(deskAdv,'Mute live wallpaper',d.videoMuted,v=>project.canvas.desktop={...desktop(project),videoMuted:v},{type:'checkbox'});
  field(deskAdv,'Playback speed',d.videoRate,v=>project.canvas.desktop={...desktop(project),videoRate:v},{type:'number',min:.25,max:2,step:.05});
 }
 field(deskAdv,'Show desktop text',d.showText,v=>project.canvas.desktop={...desktop(project),showText:v},{type:'checkbox'});
 field(deskAdv,'Desktop text',d.text,v=>project.canvas.desktop={...desktop(project),text:v},{maxLength:500,hidden:!d.showText});
 field(deskAdv,'Desktop text color',d.textColor,v=>project.canvas.desktop={...desktop(project),textColor:v},{type:'color',hidden:!d.showText});

 // Adv 3-9: Window preview, Opacity, Split ratio, Gradient border, Blur, Shadows, Animations
 const winAdv=section('Window effects & preview'),wg=node('div',undefined,'fields');
 field(winAdv,'Preview tiled windows',!!h.windowPreview,v=>{set('windowPreview',v);if(v)triggerTilingAnimation();},{type:'checkbox'});
 const winCount=h.windowCount??3;
 field(wg,'Preview windows',String(winCount),v=>{const next=Number(v);set('windowCount',next);if((h.focusedWindow??0)>=next)set('focusedWindow',0);},{choices:[['1','1 window'],['2','2 windows'],['3','3 windows'],['4','4 windows']]});
 field(wg,'Focused window',String(Math.min(winCount-1,h.focusedWindow??0)),v=>set('focusedWindow',Number(v)),{choices:MOCK_WINDOWS.slice(0,winCount).map((w,i)=>[String(i),`${i+1} · ${w.app}`])});
 for(const [k,t,min,max,step] of [['activeOpacity','Active opacity',.1,1,.05],['inactiveOpacity','Inactive opacity',.1,1,.05],['splitRatio','Split ratio',.3,.7,.02]])field(wg,t,k==='splitRatio'?(h.splitRatio??.52):h[k],v=>set(k,v),{type:'number',min,max,step});
 winAdv.append(wg);
 field(winAdv,'Gradient active border',!!h.borderGradient,v=>set('borderGradient',v),{type:'checkbox'});
 if(h.borderGradient){
  field(wg,'Active border end',h.activeBorderEnd||'#bb9af7',v=>set('activeBorderEnd',v),{type:'color'});
  field(wg,'Border angle (deg)',h.borderAngle??45,v=>set('borderAngle',v),{type:'number',min:0,max:360});
 }
 field(winAdv,'Blur windows',h.blurEnabled,v=>set('blurEnabled',v),{type:'checkbox'});
 field(wg,'Blur size',h.blurSize,v=>set('blurSize',v),{type:'number',min:1,max:30,hidden:!h.blurEnabled});
 field(wg,'Blur passes',h.blurPasses,v=>set('blurPasses',v),{type:'number',min:1,max:10,hidden:!h.blurEnabled});
 field(winAdv,'Window shadows',h.shadowEnabled,v=>set('shadowEnabled',v),{type:'checkbox'});
 field(wg,'Shadow range',h.shadowRange,v=>set('shadowRange',v),{type:'number',min:1,max:100,hidden:!h.shadowEnabled});
 field(wg,'Shadow color',h.shadowColor,v=>set('shadowColor',v),{type:'color',hidden:!h.shadowEnabled});
 field(winAdv,'Animations',h.animations,v=>set('animations',v),{type:'checkbox'});
 field(wg,'Animation speed',h.animationSpeed,v=>set('animationSpeed',v),{type:'number',min:.1,max:20,step:.1,hidden:!h.animations});
 field(wg,'Animation style',h.animationStyle,v=>{set('animationStyle',v);triggerTilingAnimation();},{choices:['slide','popin','fade'],hidden:!h.animations});
 winAdv.append(button('Replay window animation',()=>{if(!project.hyprland.windowPreview){commit(()=>project.hyprland={...project.hyprland,windowPreview:true});}triggerTilingAnimation();}));

 // Adv 10: Monitor & input
 const m=section('Monitor & input');field(m,'Monitor mode',h.monitor,v=>set('monitor',v),{maxLength:200});field(m,'Keyboard layout',h.keyboardLayout,v=>set('keyboardLayout',v),{maxLength:40});field(m,'Keyboard switching',h.keyboardOptions,v=>set('keyboardOptions',v),{choices:[['','Disabled'],['grp:alt_shift_toggle','Shift + Alt'],['grp:win_space_toggle','Super + Space'],['grp:ctrl_shift_toggle','Ctrl + Shift']]});field(m,'Focus follows mouse',h.followMouse,v=>set('followMouse',Number(v)),{choices:[[0,'Disabled'],[1,'Enabled'],[2,'Detached'],[3,'Loose']]});field(m,'Natural scrolling',h.naturalScroll,v=>set('naturalScroll',v),{type:'checkbox'});
 // Adv 11: Full rice integrations
 const i=project.integrations,x=section('Full rice integrations'),seti=(k,v)=>project.integrations={...project.integrations,[k]:v};field(x,'Panel technology',i.shell,v=>seti('shell',v),{choices:[['quickshell','Quickshell'],['waybar','Waybar']]});field(x,'Terminal theme',i.terminal,v=>seti('terminal',v),{choices:['kitty','foot','none']});field(x,'Application launcher',i.launcher,v=>seti('launcher',v),{choices:['rofi','wofi','none']});field(x,'Notifications',i.notifications,v=>seti('notifications',v),{choices:['swaync','none']});field(x,'Lock screen',i.lockscreen,v=>seti('lockscreen',v),{choices:['hyprlock','none']});field(x,'GTK color fragment',i.gtk,v=>seti('gtk',v),{type:'checkbox'});field(x,'Qt color fragment',i.qt,v=>seti('qt',v),{type:'checkbox'});field(x,'System icon theme',i.iconTheme,v=>seti('iconTheme',v),{maxLength:100});field(x,'System cursor theme',i.cursorTheme,v=>seti('cursorTheme',v),{maxLength:100});x.append(node('p','Theme names refer to packages installed on the target machine. The exporter never claims to bundle missing third-party themes.'));
 // Adv 12, 13, 14: Shortcuts, Window rules, Workspace rules
 automationProperties();
 const info=section('Project');info.append(node('p','Images and uploaded fonts travel inside .rce. Recovery keeps the original imported project.'));
}
function automationProperties(){const au=project.automation,bindings=section('Hyprland shortcuts');bindings.append(button('+ Add shortcut',()=>commit(()=>au.keybindings.push({id:crypto.randomUUID(),keys:'SUPER + RETURN',actionId:'terminal'}))));au.keybindings.forEach((b,index)=>{const card=node('div',undefined,'shortcut-card');field(card,'Keys',b.keys,v=>b.keys=v,{maxLength:80});field(card,'Action',b.actionId,v=>b.actionId=v,{choices:Object.entries(APPS).map(([id,a])=>[id,a.label])});card.append(button('Remove',()=>commit(()=>au.keybindings.splice(index,1))));bindings.append(card);});bindings.append(node('p','Actions come from the fixed application list; arbitrary commands are not accepted.'));
 const windows=section('Window rules');windows.append(button('+ Add window rule',()=>commit(()=>au.windowRules.push({id:crypto.randomUUID(),class:'firefox',float:true,center:false,workspace:''}))));au.windowRules.forEach((r,index)=>{const card=node('div',undefined,'shortcut-card');field(card,'App class (RE2)',r.class,v=>r.class=v,{maxLength:160});field(card,'Workspace',r.workspace,v=>r.workspace=v,{maxLength:80});field(card,'Floating',r.float,v=>r.float=v,{type:'checkbox'});field(card,'Centered',r.center,v=>r.center=v,{type:'checkbox'});card.append(button('Remove',()=>commit(()=>au.windowRules.splice(index,1))));windows.append(card);});
 const workspaces=section('Workspace rules');workspaces.append(button('+ Add workspace rule',()=>commit(()=>au.workspaceRules.push({id:crypto.randomUUID(),workspace:'1',monitor:'',persistent:true}))));au.workspaceRules.forEach((r,index)=>{const card=node('div',undefined,'shortcut-card');field(card,'Workspace',r.workspace,v=>r.workspace=v,{maxLength:80});field(card,'Monitor',r.monitor,v=>r.monitor=v,{maxLength:160});field(card,'Persistent',r.persistent,v=>r.persistent=v,{type:'checkbox'});card.append(button('Remove',()=>commit(()=>au.workspaceRules.splice(index,1))));workspaces.append(card);});}
function shortcutsProperties(e){const s=section('Applications & actions');s.append(button('+ Add application',()=>commit(()=>{e.options={...options(e),items:[...options(e).items,{id:crypto.randomUUID(),label:'Terminal',icon:'⌘',action:'',shortcut:'',actionId:'terminal'}]};})));options(e).items.forEach((item,i)=>{const card=node('div',undefined,'shortcut-card');field(card,'Label '+(i+1),item.label,v=>item.label=v);field(card,'Icon '+(i+1),item.icon,v=>item.icon=v,{choices:[...new Set([...ICONS,item.icon])].map(i=>[i,i||'None'])});field(card,'Action '+(i+1),actionId(item),v=>{item.actionId=v;item.action='';},{choices:[['','Not linked'],...Object.entries(APPS).map(([k,a])=>[k,a.label])]});if(!actionId(item))card.append(node('p','⚠ Choose an action. This shortcut does nothing.'));if(item.shortcut)card.append(node('p','Saved desktop binding: '+item.shortcut+' (not installed by export)'));const actions=node('div',undefined,'item-actions');for(const [t,delta] of [['↑',-1],['↓',1],['Remove',0]]){const b=button(t,()=>commit(()=>{const items=[...options(e).items];items.splice(i,1);if(delta)items.splice(i+delta,0,item);e.options={...options(e),items};}));b.disabled=delta&&(i+delta<0||i+delta>=options(e).items.length);actions.append(b);}card.append(actions);s.append(card);});}
function render(){draw();layers();properties();$('#project-name').value=project.name;const alignGroup=$('#align-tools-group');if(alignGroup)alignGroup.hidden=selection.size<2;historyButtons();}
function transform(){$('#world').style.transform=`translate(${view.x}px,${view.y}px) scale(${view.z})`;$('#zoom').textContent=Math.round(view.z*100)+'%';}
function fit(){const r=$('#viewport').getBoundingClientRect(),pad=preview?12:90;view.z=Math.max(.05,Math.min((r.width-pad)/project.canvas.width,(r.height-(preview?12:150))/project.canvas.height,2));view.x=(r.width-project.canvas.width*view.z)/2;view.y=(r.height-project.canvas.height*view.z)/2;transform();}
function zoom(f,cx,cy){const r=$('#viewport').getBoundingClientRect();cx??=r.width/2;cy??=r.height/2;const z=clamp(view.z*f,.05,3);view.x=cx-(cx-view.x)*z/view.z;view.y=cy-(cy-view.y)*z/view.z;view.z=z;transform();}
function add(type){commit(()=>{if(project.elements.length>=1000)throw Error('Layer limit reached');const e=element(type),target=current(),parent=isContainer(target)?target:project.elements.find(n=>n.id===target?.parentId);if(!isContainer(e)&&parent){e.parentId=parent.id;e.height=Math.max(20,Math.min(40,parent.height-8));e.fontSize=16;e.options={...options(e),padding:4,gap:8};e.x=project.elements.filter(n=>n.parentId===parent.id).reduce((x,n)=>Math.max(x,n.x+n.width+12),12);e.y=(parent.height-e.height)/2;}if(type==='dock')e.options={...options(e),items:Object.entries(APPS).slice(0,5).map(([id,a])=>({id:crypto.randomUUID(),icon:a.icon,label:a.label.split(' · ')[0],action:'',shortcut:'',actionId:id}))};project.elements.push(e);constrain(project,e);selection=new Set([e.id]);selected=e.id;});}
const NEIGHBORHOOD=[
 {name:'Greeting card',description:'Large editable greeting with live time',make(){const e=element('widget',90,120);Object.assign(e,{name:'Greeting card',width:430,height:190,fontSize:38,fill:'#17182b',color:'#c0caf5'});e.custom={text:'Good evening\n{{time}}',dataSource:'time',shape:'rectangle'};e.animation={...e.animation,kind:'slide',iteration:'once',duration:700};return [e];}},
 {name:'System monitor',description:'CPU, memory and battery data tiles',make(){const root=element('widget',80,120);Object.assign(root,{name:'System monitor',width:480,height:180,fill:'#111827',color:'#e5e7eb'});root.custom={text:'SYSTEM',dataSource:'static',shape:'rectangle'};const specs=[['CPU','cpu','#7aa2f7'],['Memory','memory','#bb9af7'],['Battery','battery','#9ece6a']];const nodes=[root];specs.forEach(([name,data,fill],i)=>{const e=element('text');Object.assign(e,{name,parentId:root.id,x:20+i*150,y:65,width:135,height:82,fill,color:'#111827',fontSize:17,radius:18});e.custom={text:name+'\n{{value}}',dataSource:data,shape:'rectangle'};nodes.push(e);});return nodes;}},
 {name:'Music glass',description:'Animated music status card',make(){const e=element('widget',100,160);Object.assign(e,{name:'Music glass',width:390,height:130,fill:'#24283b',color:'#f7768e',fontSize:23});e.custom={text:'♫  {{value}}',dataSource:'music',shape:'pill'};e.appearance={opacity:.72,blur:18,shadow:28,borderWidth:1,borderColor:'#7aa2f7',font:'sans-serif',fontAsset:''};e.animation={...e.animation,kind:'float',duration:2600};return [e];}},
 {name:'Date typography',description:'Clean date and editorial text',make(){const e=element('text',110,150);Object.assign(e,{name:'Date typography',width:620,height:110,fill:'#111820',color:'#e0af68',fontSize:42});e.custom={text:'{{value}}',dataSource:'date',shape:'rectangle'};e.appearance={opacity:0,blur:0,shadow:0,borderWidth:0,borderColor:'#e0af68',font:'serif',fontAsset:''};return [e];}},
 {name:'Network pill',description:'Connection status with a soft pulse',make(){const e=element('text',120,160);Object.assign(e,{name:'Network pill',width:220,height:58,fill:'#0f766e',color:'#ecfeff',fontSize:18});e.custom={text:'⌁  {{value}}',dataSource:'network',shape:'pill'};e.animation={...e.animation,kind:'pulse',duration:1800};return [e];}},
 {name:'Decorative orbit',description:'Animated geometric accent',make(){const outer=element('widget',160,180),inner=element('shape');Object.assign(outer,{name:'Orbit',width:190,height:190,fill:'#1f2335',color:'#7aa2f7',radius:95});outer.custom={text:'◇',dataSource:'static',shape:'circle'};outer.animation={...outer.animation,kind:'rotate',duration:9000};Object.assign(inner,{name:'Orbit core',parentId:outer.id,x:55,y:55,width:80,height:80,fill:'#bb9af7',color:'#1a1b26',fontSize:28,radius:40});inner.custom={text:'✦',dataSource:'static',shape:'diamond'};return [outer,inner];}}
];
function addNeighborhood(preset){commit(()=>{const nodes=preset.make();if(project.elements.length+nodes.length>1000)throw Error('Layer limit reached');project.elements.push(...nodes);clampAll(project);selection=new Set([nodes[0].id]);selected=nodes[0].id;});$('#neighborhood-dialog').close();notify(preset.name+' added. Customize it in Properties.');}
function remove(){commit(()=>{project.elements=project.elements.filter(e=>!selection.has(e.id)&&!selection.has(e.parentId));selection.clear();selected=null;});}
function copy(){flush();const ids=new Set([...selection].flatMap(id=>family(project,id).map(e=>e.id)));clipboard=structuredClone(project.elements.filter(e=>ids.has(e.id)));for(const e of clipboard)if(e.parentId&&!ids.has(e.parentId)){const g=box(project,e);e.x=g.x;e.y=g.y;e.parentId=null;}notify('Copied '+clipboard.length+' layers');}
function paste(){if(!clipboard)return;commit(()=>{if(project.elements.length+clipboard.length>1000)throw Error('Layer limit reached');const nodes=cloneFamily(clipboard);project.elements.push(...nodes);clampAll(project);selection=new Set(nodes.filter(e=>!e.parentId).map(e=>e.id));selected=[...selection].at(-1);clipboard=structuredClone(nodes);});}
function duplicate(){copy();paste();}
function restoreHistory(direction){flush();const p=timeline[direction]();if(p){project=p;selection=new Set([...selection].filter(id=>project.elements.some(e=>e.id===id)));selected=[...selection].at(-1)||null;autosave();render();}}
function reorder(delta){commit(()=>{const i=project.elements.findIndex(n=>n.id===selected);if(i<0)return;const [e]=project.elements.splice(i,1);project.elements.splice(clamp(i+delta,0,project.elements.length),0,e);});}
function setTool(t){tool=t;$('#select-tool').classList.toggle('active',t==='select');$('#pan-tool').classList.toggle('active',t==='pan');}
function closePopup(){popupId=null;const panel=$('#widget-popup');panel.hidden=true;panel.classList.remove('power-popup');panel.replaceChildren();}
function togglePreview(){flush();finish();preview=!preview;clearTimeout(liveDrawTimer);liveDrawTimer=null;edgeMotionUntil=0;openEdges.clear();viewportEdges.clear();for(const timer of edgeTimers.values())clearTimeout(timer);edgeTimers.clear();closePopup();document.body.classList.toggle('preview',preview);document.body.classList.remove('clean-preview');$('#preview').setAttribute('aria-pressed',String(preview));$('#preview-controls').hidden=!preview;$('#preview-note').hidden=true;$('#project-name').disabled=preview;modeStatus();historyButtons();draw();requestAnimationFrame(fit);}
async function executeLive(value,confirmed=false){if(live.status!=='connected'){notify('Live helper is not connected. Choose Demo or pair the helper.');return false;}try{const result=await live.execute(value,{confirm:confirmed});notify(result.message||'Action confirmed by helper');if(preview)drawLivePreview();else draw();return true;}catch(e){if(e.code==='confirmation_required'||e.message.includes('confirmation required')){notify('This power action requires explicit confirmation.');return false;}notify('Live action failed: '+e.message);return false;}}
function runAction(id,value=legacyAction(id)){if(!APPS[id]){notify('This shortcut is not linked to an action.');return;}if(dataMode==='live'){executeLive(value);return;}if(['music','settings','network','bluetooth'].includes(id)){const type=id==='settings'?'volume':id;showPopup({id:'action-'+id,type,name:APPS[id].label});}else notify('Demo only: '+APPS[id].label+' would open on your desktop.');}
async function executeWidgetAction(act,e=current()){if(!act||act.type==='none')return;if(dataMode==='live'){await executeLive(act,act.type==='power');return;}if(act.type==='launch'){runAction(act.params?.app||'terminal',act);return;}if(act.type==='workspace'){const ws=project.elements.find(n=>n.type==='workspaces');if(ws)switchWorkspacePreview(ws,act.params?.workspace||1);else notify('Demo workspace switched to '+(act.params?.workspace||1));return;}if(act.type==='volumeSet'){const t=project.elements.find(n=>n.type==='volume')||e;if(t)sim.get(t).volume=clamp(act.params?.value??50,0,100);draw();return;}if(act.type==='volumeStep'){const t=project.elements.find(n=>n.type==='volume')||e;if(t)sim.get(t).volume=clamp((sim.get(t).volume??65)+(act.params?.delta??5),0,100);draw();return;}if(act.type==='muteToggle'){const t=project.elements.find(n=>n.type==='volume')||e;if(t)sim.get(t).muted=!sim.get(t).muted;draw();return;}if(act.type==='media'){const t=project.elements.find(n=>n.type==='music')||e;if(t){const s=sim.get(t);if(act.params?.command==='play-pause')s.playing=!s.playing;else s.track=((s.track||0)+(act.params?.command==='previous'?2:1))%3;}draw();return;}if(act.type==='openPanel'){const p=act.params?.panel||'calendar',type=p==='calendar'?'clock':p;showPopup({id:'action-panel-'+type,type,name:TYPES[type]?.name||p});return;}if(act.type==='power'){showPopup({id:'action-power',type:'power',name:'Power'});}}
function activate(e){if(!preview||behavior(e).click==='none')return;if(e.type==='workspaces'||isContainer(e))return;if(behavior(e).click==='mute'){if(dataMode==='live')executeLive({type:'muteToggle',params:{}});else{sim.get(e).muted=!sim.get(e).muted;draw();}return;}if(popupId===e.id)closePopup();else{calendarOffset=0;showPopup(e);}}
function showPopup(e){popupId=e.id;const panel=$('#widget-popup');panel.hidden=false;panel.classList.toggle('power-popup',e.type==='power');panel.replaceChildren();if(e.type==='power'){const renderPower=(pending='')=>{panel.replaceChildren();const heading=node('div',undefined,'power-heading');heading.append(node('span','PAPER CALM · SESSION'),button('×',closePopup,'Close power menu'));const title=node('h2',pending?'Are you sure?':'Take a quiet pause.');const subtitle=node('p',pending?`Press ${pending.label} again to confirm.`:'Choose what happens to this session.');const grid=node('div',undefined,'power-grid');const choices=[['◇','Lock','lock'],['☾','Sleep','suspend'],['↻','Restart','reboot'],['⏻','Shut down','shutdown']];for(const [icon,label,command] of choices){const card=button('',async()=>{if(command==='lock'){if(dataMode==='live'){if(await executeLive(legacyAction('lock')))closePopup();}else{notify('Demo only: the session would lock.');closePopup();}return;}if(pending?.command!==command){renderPower({icon,label,command});return;}if(dataMode==='live'){if(await executeLive({type:'power',params:{command}},true))closePopup();}else{notify('Demo only: '+label+' would be requested.');closePopup();}},label);card.className='power-choice'+(pending?.command===command?' confirm':'');card.append(node('b',icon),node('span',pending?.command===command?'Confirm '+label:label));grid.append(card);}const cancel=button(pending?'Go back':'Cancel',pending?()=>renderPower():closePopup,'Cancel power action');cancel.className='power-cancel';panel.append(heading,title,subtitle,grid,cancel);};renderPower();return;}const heading=node('div',undefined,'popup-heading');heading.append(node('strong',e.name||TYPES[e.type].name),button('×',closePopup,'Close widget panel'));panel.append(heading,node('p',dataMode==='live'?'Live mode · actions require helper confirmation':'Demo mode · no system changes'));const state=liveValue(e)||sim.get(e);const refresh=()=>{draw();showPopup(e);};
 const toggle=(text,key)=>panel.append(button(text,()=>{state[key]=!state[key];refresh();}));
 if(e.type==='clock'){const now=new Date(),date=new Date(now.getFullYear(),now.getMonth()+calendarOffset,1),nav=node('div',undefined,'calendar-nav');nav.append(button('‹',()=>{calendarOffset--;refresh();},'Previous month'),node('strong',new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric'}).format(date)),button('›',()=>{calendarOffset++;refresh();},'Next month'));panel.append(nav);const grid=node('div',undefined,'calendar-grid');for(const d of ['M','T','W','T','F','S','S'])grid.append(node('small',d));for(const day of calendarCells(date.getFullYear(),date.getMonth()))grid.append(node('span',day||'',day===now.getDate()&&calendarOffset===0?'today':''));panel.append(grid,button('Today',()=>{calendarOffset=0;refresh();}));}
 if(e.type==='volume'){const label=node('label','Volume'),range=node('input');range.type='range';range.min=0;range.max=100;range.value=state.volume??0;range.disabled=dataMode==='live'&&!liveValue(e);range.setAttribute('aria-label',dataMode==='live'?'Live volume':'Demo volume');const output=node('output',(state.volume??'Unavailable')+(state.volume==null?'':'%'));range.oninput=()=>{output.textContent=range.value+'%';if(dataMode==='demo'){state.volume=Number(range.value);draw();}};range.onchange=()=>dataMode==='live'&&executeLive({type:'volumeSet',params:{value:Number(range.value)}});label.append(range,output);panel.append(label,button(state.muted?'Unmute':'Mute',()=>dataMode==='live'?executeLive({type:'muteToggle',params:{}}):(state.muted=!state.muted,refresh())));}
 if(e.type==='network'){panel.append(node('p',state.connected?'Connected to Amethyst Wi-Fi':'Disconnected'));toggle(state.connected?'Disconnect':'Connect to sample network','connected');}
 if(e.type==='bluetooth'){toggle(state.bluetooth?'Turn Bluetooth off':'Turn Bluetooth on','bluetooth');panel.append(node('p',state.bluetooth?'Sample headphones · connected':'Bluetooth disabled'));}
 if(e.type==='battery'){panel.append(node('p',state.battery+'% · '+(state.charging?'Charging':'On battery')));toggle('Toggle charging state','charging');panel.append(button('Low battery state',()=>{state.battery=12;refresh();}));}
 if(e.type==='notifications'){panel.append(node('p',state.notifications?state.notifications+' sample notifications':'No notifications'));panel.append(button('Clear sample notifications',()=>{state.notifications=0;refresh();}));}
 if(e.type==='launcher')for(const [id,a] of Object.entries(APPS))panel.append(button(a.icon+' '+a.label,()=>runAction(id)));
 if(e.type==='music'){const audio=project.assets?.find(a=>a.id===e.mediaAsset);panel.append(node('p',audio?.name||state.title||['Amethyst skies','Night drive','Soft glow'][state.track%3]));const media=(command,demo)=>dataMode==='live'?executeLive({type:'media',params:{command}}):demo();panel.append(button('⏮',()=>media('previous',()=>{state.track=(state.track+2)%3;refresh();})),button(state.playing?'⏸':'▶',()=>media('play-pause',()=>{state.playing=!state.playing;refresh();})),button('⏭',()=>media('next',()=>{state.track=(state.track+1)%3;refresh();})));}
 if(e.type==='cpu'||e.type==='memory'){const k=e.type==='cpu'?'cpu':'memory';panel.append(node('p','Sample usage: '+state[k]+'%'),button('High load state',()=>{state[k]=89;refresh();}));}
}
const COMPONENT_CATEGORIES=[
 {id:'system',label:'System',types:['bar','dock','workspaces','battery','network','volume','brightness','bluetooth','notifications','launcher','power']},
 {id:'info',label:'Info',types:['clock','cpu','memory','memoryChart','gpu','temperature','disk','uptime']},
 {id:'media',label:'Media',types:['music','visualizer']},
 {id:'decor',label:'Decor',types:['widget','text','shape']}
];
const COLLAPSED_CATS_KEY='ricing-town.collapsed-cats';
function getCollapsedCats(){try{return new Set(JSON.parse(localStorage?.getItem(COLLAPSED_CATS_KEY)||'[]'));}catch{return new Set();}}
function saveCollapsedCats(set){try{localStorage?.setItem(COLLAPSED_CATS_KEY,JSON.stringify([...set]));}catch{}}
function renderLibrary(query=''){
 const lib=$('#library');
 lib.replaceChildren();
 const q=String(query||'').trim().toLowerCase();
 const collapsed=getCollapsedCats();
 // Direct hidden proxy nodes so tests/interaction.test.mjs (`get('#library').children.find(n=>n.id==='add-'+type)`) always works
 for(const [type,[icon,label]] of Object.entries(TYPE_META)){
  const proxy=button(icon+' '+label,()=>add(type));
  proxy.id='add-'+type;
  proxy.hidden=true;
  proxy.style.display='none';
  proxy.setAttribute('aria-hidden','true');
  proxy.tabIndex=-1;
  lib.append(proxy);
 }
 let matchedCount=0;
 for(const cat of COMPONENT_CATEGORIES){
  const items=cat.types.filter(type=>{
   if(!TYPE_META[type])return false;
   if(!q)return true;
   const [icon,label]=TYPE_META[type];
   return type.toLowerCase().includes(q)||label.toLowerCase().includes(q)||cat.label.toLowerCase().includes(q)||icon.includes(q);
  });
  if(!items.length)continue;
  matchedCount+=items.length;
  const isOpen=q?true:!collapsed.has(cat.id);
  const block=node('div',undefined,'comp-category');
  const toggle=button('',()=>{
   const next=grid.hidden;
   grid.hidden=!next;
   toggle.setAttribute('aria-expanded',String(next));
   const set=getCollapsedCats();
   if(next)set.delete(cat.id);else set.add(cat.id);
   saveCollapsedCats(set);
  },'Toggle '+cat.label+' components');
  toggle.className='comp-category-toggle';
  toggle.setAttribute('aria-expanded',String(isOpen));
  toggle.append(node('span',cat.label),node('span','▾','cat-chevron'));
  const grid=node('div',undefined,'comp-category-grid');
  grid.hidden=!isOpen;
  for(const type of items){
   const [icon,label]=TYPE_META[type];
   const b=button('',()=>add(type),label);
   b.className='comp-item-btn';
   b.dataset.componentType=type;
   b.append(node('span',icon,'comp-icon'),node('span',label,'comp-label'));
   grid.append(b);
  }
  block.append(toggle,grid);
  lib.append(block);
 }
 if(!matchedCount&&q){
  lib.append(node('div','No components match "'+query.trim()+'"','comp-no-results'));
 }
}
renderLibrary();
function switchLeftTab(tab){
 const isComp=tab==='components';
 const tabComp=$('#tab-components'),tabLayers=$('#tab-layers'),paneComp=$('#components-pane'),paneLayers=$('#layers-pane');
 if(tabComp){tabComp.classList.toggle('active',isComp);tabComp.setAttribute('aria-selected',String(isComp));}
 if(tabLayers){tabLayers.classList.toggle('active',!isComp);tabLayers.setAttribute('aria-selected',String(!isComp));}
 if(paneComp)paneComp.hidden=!isComp;
 if(paneLayers)paneLayers.hidden=isComp;
}
if($('#tab-components'))$('#tab-components').onclick=()=>switchLeftTab('components');
if($('#tab-layers'))$('#tab-layers').onclick=()=>switchLeftTab('layers');
const searchInput=$('#component-search');
if(searchInput)searchInput.oninput=e=>renderLibrary(e.target.value);
const collapseLeftBtn=$('#collapse-left');
if(collapseLeftBtn)collapseLeftBtn.onclick=()=>{const collapsed=document.body.classList.toggle('left-collapsed');collapseLeftBtn.setAttribute('aria-expanded',String(!collapsed));collapseLeftBtn.textContent=collapsed?'▸':'◂';requestAnimationFrame(fit);};
const collapseRightBtn=$('#collapse-right');
if(collapseRightBtn)collapseRightBtn.onclick=()=>{const collapsed=document.body.classList.toggle('right-collapsed');collapseRightBtn.setAttribute('aria-expanded',String(!collapsed));collapseRightBtn.textContent=collapsed?'◂':'▸';requestAnimationFrame(fit);};
$('#desktop').onclick=()=>select(null);$('#live-wallpaper-settings').onclick=()=>{select(null);requestAnimationFrame(()=>{const input=$('#live-wallpaper-file');input?.scrollIntoView?.({block:'center'});});};$('#project-name').oninput=e=>{project.name=e.target.value;pending=true;autosave();};$('#project-name').onchange=checkpoint;$('#project-name').onblur=()=>{if(pending)checkpoint();};
$('#undo').onclick=()=>restoreHistory('undo');$('#redo').onclick=()=>restoreHistory('redo');$('#preview').onclick=togglePreview;$('#exit-preview').onclick=togglePreview;$('#clean').onclick=()=>{document.body.classList.add('clean-preview');notify('Press Escape to return to the editor.');setTimeout(()=>$('#toast').style.display='none',2000);};$('#reset-preview').onclick=()=>{sim.reset();closePopup();draw();};$('#select-tool').onclick=()=>setTool('select');$('#pan-tool').onclick=()=>setTool('pan');$('#fit').onclick=fit;$('#zoom-in').onclick=()=>zoom(1.2);$('#zoom-out').onclick=()=>zoom(1/1.2);
for(const action of ['left','center','right','top','middle','bottom','distribute-x','distribute-y'])$('#'+(action.startsWith('distribute')?action:'align-'+action)).onclick=()=>commit(()=>arrange(project,[...selection],action));
$('#viewport').addEventListener('wheel',event=>{if(preview||event.target.closest('button,input,#widget-popup'))return;event.preventDefault();const r=$('#viewport').getBoundingClientRect();zoom(Math.exp(-event.deltaY*.0015),event.clientX-r.left,event.clientY-r.top);},{passive:false});
$('#viewport').onpointerdown=event=>{if(preview||event.target.closest('button,input,#widget-popup')||![0,1].includes(event.button))return;flush();event.preventDefault();const id=event.target.closest('.element')?.dataset.id,mockWin=event.target.closest?.('.mock-window');if(tool==='pan'||space||event.button===1)drag={mode:'pan',x:event.clientX,y:event.clientY,ox:view.x,oy:view.y};else if(id){if(!selection.has(id)||event.shiftKey)select(id,event.shiftKey);else selected=id;const e=current();if(!e)return;const pageIndex=activeWorkspace()-1;drag={mode:event.target.dataset.resize?'resize':'move',handle:event.target.dataset.resize,box:structuredClone(e),start:new Map(project.elements.filter(n=>selection.has(n.id)&&!selection.has(n.parentId)).map(n=>[n.id,{x:n.x,y:n.y,pageIndex,pageX:n.workspaceLayout?.[pageIndex]?.x}])),x:event.clientX,y:event.clientY};draw();}else{if(mockWin?.dataset?.windowIndex!==undefined)project.hyprland={...project.hyprland,focusedWindow:Number(mockWin.dataset.windowIndex)||0};select(null);}if(drag)$('#viewport').setPointerCapture(event.pointerId);};
$('#viewport').onpointermove=event=>{if(preview){hoverViewportEdges(event);return;}if(!drag)return;const dx=(event.clientX-drag.x)/view.z,dy=(event.clientY-drag.y)/view.z;$('#guides').replaceChildren();if(drag.mode==='pan'){view.x=drag.ox+event.clientX-drag.x;view.y=drag.oy+event.clientY-drag.y;transform();return;}const e=current();if(!e)return;if(drag.mode==='resize'){Object.assign(e,resize(drag.box,drag.handle,dx,dy));constrain(project,e);if(isContainer(e))for(const child of project.elements.filter(n=>n.parentId===e.id))constrain(project,child);}else{let workspaceMove=false;for(const [id,start] of drag.start){const n=project.elements.find(n=>n.id===id);n.y=start.y+dy;if(Number.isFinite(start.pageX)&&n.workspaceLayout?.[start.pageIndex]){workspaceMove=true;n.workspaceLayout[start.pageIndex]={...n.workspaceLayout[start.pageIndex],x:clamp(start.pageX+dx,0,Math.max(0,project.canvas.width-n.width))};constrain(project,n);}else{n.x=start.x+dx;constrain(project,n);}}const guides=workspaceMove?[]:snap(project,e,$('#snap').checked&&!event.altKey);for(const g of guides){const guide=node('div',undefined,'guide '+g.axis),parent=project.elements.find(n=>n.id===e.parentId);guide.style[g.axis==='x'?'left':'top']=(g.value+(parent?.[g.axis]||0))+'px';$('#guides').append(guide);}}
 const effectiveX=e.workspaceLayout?.[activeWorkspace()-1]?.x??e.x;$('#measurements').textContent=`X ${Math.round(effectiveX)} · Y ${Math.round(e.y)} · ${Math.round(e.width)} × ${Math.round(e.height)} · right ${Math.round((project.elements.find(n=>n.id===e.parentId)||project.canvas).width-effectiveX-e.width)}px`;draw();};
function finish(){if(drag&&drag.mode!=='pan'){const e=current();if(e&&drag.mode==='move'&&!isContainer(e)&&selection.size===1){const g=box(project,e),parent=[...project.elements].reverse().find(p=>isContainer(p)&&g.x+g.width/2>=p.x&&g.x+g.width/2<=p.x+p.width&&g.y+g.height/2>=p.y&&g.y+g.height/2<=p.y+p.height);if(!e.parentId&&parent){attach(project,e,parent.id);constrain(project,e);}}checkpoint();render();}drag=null;$('#guides').replaceChildren();}
$('#viewport').onpointerleave=leaveViewportEdges;$('#viewport').onpointerup=finish;$('#viewport').onpointercancel=finish;window.addEventListener('blur',()=>{space=false;finish();});
$('#shortcuts').onclick=()=>$('#shortcut-dialog').showModal();$('#close-shortcuts').onclick=()=>$('#shortcut-dialog').close();
for(const preset of NEIGHBORHOOD){const b=button('',()=>{addNeighborhood(preset);studio?.refresh();});b.className='neighborhood-card';b.append(node('strong',preset.name),node('small',preset.description));$('#neighborhood-grid').append(b);}
for(const preset of DESKTOP_PRESETS){const b=button('',async()=>{try{await storage.checkpoint(project);project=validate(preset.create());await storage.saveProjectEntry(project,crypto.randomUUID());selection.clear();selected=null;timeline=history(project,40);checkpoint();render();fit();$('#neighborhood-dialog').close();notify(preset.name+' desktop opened.');}catch(e){notify(e.message);}});b.className='neighborhood-card';b.append(node('strong',preset.name),node('small',preset.description));$('#desktop-preset-grid').append(b);}
const studio=createNeighborhoodStudio({getProject:()=>project,commitProject:fn=>commit(()=>fn(project)),renderApp:render,getSelectedId:()=>selected,setSelectedId:id=>{selection=id?new Set([id]):new Set();selected=id||null;},notify,openFontUpload:()=>$('#font-file').click(),openSvgUpload:()=>$('#svg-file').click(),runWidgetAction:act=>executeWidgetAction(act)});
$('#widget-neighborhood').onclick=()=>studio.open(selected);$('#close-neighborhood').onclick=()=>studio.close();$('#toggle-tiling-preview').onclick=()=>commit(()=>{const next=!project.hyprland?.windowPreview;project.hyprland={...project.hyprland,windowPreview:next};if(next){selection.clear();selected=null;triggerTilingAnimation();}});
live.subscribe(()=>{modeStatus();drawLivePreview();});
$('#pair-helper').onclick=()=>{$('#pair-error').textContent='';$('#pair-code').value='';$('#pair-dialog').showModal();$('#pair-code').focus();};
$('#close-pair').onclick=()=>$('#pair-dialog').close();
$('#pair-now').onclick=async()=>{const b=$('#pair-now');b.disabled=true;$('#pair-error').textContent='';try{await live.pair($('#pair-code').value.trim());dataMode='live';$('#data-mode').value='live';$('#pair-dialog').close();notify('Helper paired and live data connected.');modeStatus();draw();}catch(e){$('#pair-error').textContent=e.message;}finally{b.disabled=false;}};
$('#data-mode').onchange=async event=>{dataMode=event.target.value;if(dataMode==='demo'){live.disconnect();modeStatus();draw();return;}try{await live.connect();notify('Live helper connected.');}catch(e){modeStatus();$('#pair-error').textContent=e.message;$('#pair-dialog').showModal();}draw();};
window.addEventListener('keydown',event=>{
 const mod=event.ctrlKey||event.metaKey,k=event.key?.toLowerCase()||'';
 if(mod&&k==='k'){
  event.preventDefault();
  if(!$('#start-screen')?.hidden)closeStartScreen();
  if(document.body.classList?.contains?.('left-collapsed')){document.body.classList.remove('left-collapsed');$('#collapse-left')?.setAttribute('aria-expanded','true');if($('#collapse-left'))$('#collapse-left').textContent='◂';requestAnimationFrame(fit);}
  switchLeftTab('components');
  const input=$('#component-search');
  input?.focus?.();input?.select?.();
  return;
 }
 if(!$('#start-screen')?.hidden&& $('#start-screen')?.hidden===false){
  if(event.key==='Escape'){event.preventDefault();closeStartScreen();return;}
  if(mod&&k==='o'){event.preventDefault();$('#file').click();return;}
  return;
 }
 if(preview){if(event.key==='Escape'){event.preventDefault();togglePreview();}return;}
 if(event.target.closest('input,select,textarea,[contenteditable="true"]')||$('#shortcut-dialog').open||$('#export-dialog').open||drag)return;
 let handled=true;
 if(mod&&k==='z')restoreHistory(event.shiftKey?'redo':'undo');else if(mod&&k==='y')restoreHistory('redo');else if(mod&&k==='c')copy();else if(mod&&k==='x'){copy();remove();}else if(mod&&k==='v')paste();else if(mod&&k==='d')duplicate();else if(mod&&k==='a'){flush();selection=new Set(project.elements.map(e=>e.id));selected=[...selection].at(-1);render();}else if(mod&&k==='s')save();else if(mod&&k==='o')$('#file').click();else if(mod&&event.code==='BracketRight')reorder(event.shiftKey?1000:1);else if(mod&&event.code==='BracketLeft')reorder(event.shiftKey?-1000:-1);else if(event.code==='Space'){space=true;}else if(k==='v')setTool('select');else if(k==='h')setTool('pan');else if(k==='delete'||k==='backspace')remove();else if(k==='escape')select(null);else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))commit(()=>{for(const e of project.elements.filter(n=>selection.has(n.id)&&!selection.has(n.parentId))){const step=event.shiftKey?10:1;e.x+=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0;e.y+=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;constrain(project,e);}});else if(['+','='].includes(k))zoom(1.2);else if(k==='-')zoom(1/1.2);else if(event.shiftKey&&event.code==='Digit1')fit();else if(event.shiftKey&&event.code==='Digit2'&&current()){const e=box(project,current()),r=$('#viewport').getBoundingClientRect();view.z=clamp(Math.min((r.width-80)/e.width,(r.height-120)/e.height),.05,3);view.x=r.width/2-(e.x+e.width/2)*view.z;view.y=r.height/2-(e.y+e.height/2)*view.z;transform();}else if(k==='0')zoom(1/view.z);else if(k==='?')$('#shortcut-dialog').showModal();else handled=false;if(handled)event.preventDefault();});window.addEventListener('keyup',event=>{if(event.code==='Space')space=false;});
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function save(){flush();storage.saveProjectEntry(project).catch(()=>{});download(serialize(project),(project.name.replace(/[^a-z0-9_-]/gi,'-')||'desktop')+'.rce','application/json');notify('Project saved and download requested');}
$('#save').onclick=save;$('#open').onclick=()=>{flush();$('#file-menu')?.removeAttribute?.('open');$('#file').click();};
async function openProject(text,asNewEntry=true){const loaded=parse(text);await storage.checkpoint(project);project=loaded;if(asNewEntry)await storage.saveProjectEntry(project,crypto.randomUUID());openEdges.clear();selection.clear();selected=null;sim.reset();timeline=history(project,40);checkpoint();render();loadFonts();fit();}
function showStartError(msg){const banner=$('#start-error');if(banner){if(msg){banner.textContent='⚠ '+msg;banner.hidden=false;}else{banner.textContent='';banner.hidden=true;}}}
async function handleProjectFileImport(file){
 showStartError('');
 if(!file)return;
 if(file.size>MAX_PROJECT_IMPORT_BYTES)throw Error('File exceeds 80 MB limit');
 const name=file.name.toLowerCase();
 if(!name.endsWith('.rce')&&!name.endsWith('.json')&&!name.endsWith('.jsonc'))throw Error('Unsupported file type "'+file.name+'". Choose a .rce or .json project file.');
 const text=await file.text();
 try{
  await openProject(text,true);
  closeStartScreen();
  notify('Opened "'+(project.name||file.name)+'"');
 }catch(rceErr){
  // Also allow importing Waybar JSON/JSONC config directly via Import File
  if(name.endsWith('.json')||name.endsWith('.jsonc')){
   try{
    const imported=importWaybar(text,'');
    await storage.checkpoint(project);
    project=imported.project;
    await storage.saveProjectEntry(project,crypto.randomUUID());
    selection.clear();selected=null;timeline=history(project,40);checkpoint();render();fit();
    closeStartScreen();
    notify('Imported Waybar configuration as project.');
    return;
   }catch{}
  }
  throw Error('Invalid or corrupt project file: '+rceErr.message);
 }
}
$('#file').onchange=async event=>{const file=event.target.files[0];try{if(!file)return;await handleProjectFileImport(file);}catch(e){showStartError(e.message);notify(e.message);}finally{event.target.value='';}};
const importFileInput=$('#import-file-input');
if(importFileInput)importFileInput.onchange=async event=>{const file=event.target.files[0];try{if(!file)return;await handleProjectFileImport(file);}catch(e){showStartError(e.message);notify(e.message);}finally{event.target.value='';}};
const importPackageBtn=$('#import-package-btn');
if(importPackageBtn)importPackageBtn.onclick=()=>{$('#file-menu')?.removeAttribute?.('open');importFileInput?.click();};
$('#example').onclick=async()=>{try{await openProject(await (await fetch('Hyprland-Amethyst.rce')).text());notify('Amethyst opened · previous project retained as recovery copy');}catch(e){notify(e.message);}};
$('#studio-example').onclick=async()=>{try{await openProject(await (await fetch('Hyprland-Amethyst-Studio.rce')).text());notify('Studio example opened · previous project kept for recovery');}catch(e){notify(e.message);}};
$('#restore').onclick=async()=>{try{const restored=await storage.restore();await openProject(serialize(restored));notify('Recovery copy restored');}catch(e){notify(e.message);}};
function readData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
$('#live-wallpaper-file').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;const ext=file.name.split('.').at(-1).toLowerCase();if(!['mp4','webm'].includes(ext)||!['video/mp4','video/webm'].includes(file.type)||file.size>50*1024*1024)throw Error('Use an MP4 or WebM video up to 50 MB');const data=await readData(file),probe=document.createElement('video');probe.preload='metadata';probe.src=data;await new Promise((resolve,reject)=>{probe.onloadedmetadata=resolve;probe.onerror=()=>reject(Error('The video could not be decoded'));});commit(()=>{project.canvas.desktop={...desktop(project),video:data,mode:'live',videoMuted:true};});notify('Live wallpaper embedded · exported Hyprland playback requires mpvpaper.');}catch(e){notify(e.message);}finally{event.target.value='';}};
$('#wallpaper-file').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8000000)throw Error('Use a PNG, JPEG or WebP image up to 8 MB');const data=await readData(file);const img=new Image();img.src=data;await img.decode();commit(()=>{project.canvas.desktop={...desktop(project),image:data,mode:'image'};});}catch(e){notify(e.message);}finally{event.target.value='';}};
async function loadFonts(){if(typeof FontFace==='undefined')return;for(const asset of (project.assets||[]).filter(a=>['ttf','otf'].includes(a.extension))){try{const font=new FontFace('asset-'+asset.id,`url(${asset.data})`);await font.load();document.fonts.add(font);}catch{notify('A font could not be loaded: '+asset.name);}}draw();}
$('#font-file').onchange=async event=>{try{const file=event.target.files[0],e=current();if(!file||!e)return;if((project.assets||[]).length>=20)throw Error('Maximum 20 uploaded fonts');const ext=file.name.split('.').at(-1).toLowerCase();if(!['ttf','otf'].includes(ext)||file.size>4000000)throw Error('Use a TTF or OTF font up to 4 MB');const data=(await readData(file)).replace(/^data:[^;]+;/,'data:font/'+ext+';'),asset={id:crypto.randomUUID(),name:file.name,extension:ext,data};const font=new FontFace('asset-'+asset.id,`url(${data})`);await font.load();commit(()=>{project.assets??=[];project.assets.push(asset);e.appearance={...appearance(e),fontAsset:asset.id};});document.fonts.add(font);draw();}catch(e){notify(e.message);}finally{event.target.value='';}};
$('#audio-file').onchange=async event=>{try{const file=event.target.files[0],e=current();if(!file||!e||e.type!=='music')return;const ext=file.name.split('.').at(-1).toLowerCase();if(!['mp3','ogg','wav','flac','m4a'].includes(ext)||file.size>12000000)throw Error('Use MP3, OGG, WAV, FLAC or M4A up to 12 MB');const data=await readData(file),asset={id:crypto.randomUUID(),name:file.name.slice(0,120),extension:ext,data};commit(()=>{project.assets??=[];project.assets.push(asset);e.mediaAsset=asset.id;});notify('Local track embedded in the project.');}catch(e){notify(e.message);}finally{event.target.value='';}};
$('#svg-file').onchange=async event=>{try{const file=event.target.files[0],e=current();if(!file||!e)return;if(file.size>1024*1024)throw Error('SVG must be smaller than 1 MB');const safe=sanitizeSvg(await file.text()),asset={id:crypto.randomUUID(),name:file.name.slice(0,120),extension:'svg',data:safe};commit(()=>{project.assets??=[];project.assets.push(asset);e.options={...options(e),svgAsset:asset.id};});notify('SVG sanitized and added.');}catch(e){notify(e.message);}finally{event.target.value='';}};
$('#import-waybar').onclick=()=>{$('#waybar-report').replaceChildren();$('#waybar-dialog').showModal();};$('#close-waybar').onclick=()=>$('#waybar-dialog').close();
$('#import-waybar-now').onclick=async()=>{try{const config=$('#waybar-config').files[0],css=$('#waybar-css').files[0];if(!config)throw Error('Choose a Waybar config file');if(config.size>1024*1024||css?.size>1024*1024)throw Error('Each import file must be at most 1 MB');const imported=importWaybar(await config.text(),css?await css.text():'');await storage.checkpoint(project);project=imported.project;selection.clear();selected=null;timeline=history(project,40);checkpoint();render();fit();const reportBox=$('#waybar-report');for(const [group,items] of Object.entries(imported.report))for(const item of items)reportBox.append(node('p',`${group}: ${item}`));notify('Waybar imported. Review the report before export.');}catch(e){notify(e.message);$('#waybar-report').replaceChildren(node('p',e.message));}};
$('#export').onclick=()=>{flush();const report=exportReport(project),waybar=exportWaybar(project).report;$('#export-report').replaceChildren(node('p','Choose a component package or the complete rice. Downloads make no system changes.'));for(const line of fullRiceReport(project))$('#export-report').append(node('p',line));for(const line of report)$('#export-report').append(node('p',line));for(const line of waybar.unsupported)$('#export-report').append(node('p','Waybar ⚠ '+line));$('#export-dialog').showModal();};$('#close-export').onclick=()=>$('#export-dialog').close();$('#stage-hyprland').onclick=async()=>{const b=$('#stage-hyprland');b.disabled=true;b.textContent='Preparing…';try{const response=await fetch('/api/stage-project',{method:'POST',headers:{'Content-Type':'application/json'},body:serialize(project)}),result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'Could not prepare project');notify('Project validated and prepared for local Hyprland');}catch(error){notify(error.message);}finally{b.disabled=false;b.textContent='Prepare for local Hyprland';}};$('#download-package').onclick=async()=>{const b=$('#download-package');b.disabled=true;b.textContent='Preparing files…';try{const data=await exportPackage(project);download(data,'ricing-town-quickshell.zip','application/zip');notify('Package download requested · read REQUIREMENTS.md before applying');}catch(e){notify(e.message);}finally{b.disabled=false;b.textContent='Download Quickshell package';}};$('#download-waybar').onclick=()=>{try{const output=exportWaybar(project);download(zip(output.files),'ricing-town-waybar.zip','application/zip');notify('Waybar package prepared. Run install.sh --dry-run first.');}catch(e){notify(e.message);}};$('#download-full-rice').onclick=async()=>{const b=$('#download-full-rice');b.disabled=true;b.textContent='Building full rice…';try{const data=await exportFullRice(project);download(data,(project.name.replace(/[^a-z0-9_-]/gi,'-')||'ricing-town')+'-full-rice.zip','application/zip');notify('Full rice prepared · dry-run and review README before applying');}catch(e){notify(e.message);}finally{b.disabled=false;b.textContent='Download Full Rice';}};
window.addEventListener('resize',()=>{if(preview)fit();});window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);storage.save(project).catch(()=>{});});
modeStatus();render();fit();loadFonts();setInterval(()=>{for(const e of project.elements.filter(n=>n.type==='clock')){const el=[...$('#elements').children].find(n=>n.dataset.id===e.id),time=el?.querySelector('.clock-time');if(time)time.textContent=(options(e).icon?options(e).icon+' ':'')+clock(e);}},1000);
function ensureHybridOption(){if(!document.querySelectorAll)return;for(const label of document.querySelectorAll('.property-section label'))if(label.firstChild?.textContent==='Panel technology'){const select=label.querySelector('select');if(select&&!select.querySelector('option[value="hybrid"]')){const option=document.createElement('option');option.value='hybrid';option.textContent='Hybrid · Waybar + Quickshell';select.insertBefore(option,select.options[1]||null);if(project.integrations.shell==='hybrid')select.value='hybrid';}}}
if(typeof MutationObserver!=='undefined')new MutationObserver(ensureHybridOption).observe($('#properties'),{childList:true,subtree:true});ensureHybridOption();
function logicProperties(e){
 const s=section('Visual Logic');
 s.append(button('+ Add condition',()=>commit(()=>{e.logic??=[];if(e.logic.length>=8)throw Error('Maximum 8 conditions per element');e.logic.push({id:crypto.randomUUID(),enabled:true,source:'battery',operator:'lt',value:20,style:{fill:e.fill,color:'#ffffff',opacity:1,text:'Low battery · {{value}}',animation:'pulse'}});}))); 
 for(const [index,rule] of (e.logic||[]).entries()){
  const card=node('div',undefined,'logic-card'),booleanSource=['network','musicPlaying','charging'].includes(rule.source);
  field(card,'Enabled',rule.enabled,v=>rule.enabled=v,{type:'checkbox'});
  field(card,'When',rule.source,v=>rule.source=v,{choices:LOGIC_SOURCES.map(k=>[k,SOURCE_LABELS[k]||k])});
  field(card,'Condition',rule.operator,v=>rule.operator=v,{choices:[['lt','Less than'],['lte','At most'],['eq','Equals'],['neq','Not equal'],['gte','At least'],['gt','Greater than']]});
  field(card,'Value',String(rule.value),v=>rule.value=booleanSource?v==='true':Number(v),{choices:booleanSource?[['true','True'],['false','False']]:[[0,'0'],[10,'10'],[20,'20'],[50,'50'],[80,'80'],[90,'90'],[100,'100']]});
  field(card,'Fill',rule.style.fill,v=>rule.style.fill=v,{type:'color'});field(card,'Text color',rule.style.color,v=>rule.style.color=v,{type:'color'});field(card,'Opacity',rule.style.opacity,v=>rule.style.opacity=v,{type:'number',min:0,max:1,step:.05});field(card,'Text override',rule.style.text,v=>rule.style.text=v,{maxLength:500});field(card,'Animation',rule.style.animation,v=>rule.style.animation=v,{choices:ANIMATION_KINDS});
  card.append(button('Remove condition',()=>commit(()=>e.logic.splice(index,1))));s.append(card);
 }
 s.append(node('p','The first matching condition wins. Browser Demo values and exported live values use the same rule order.'));
}
function elementMonitorProperties(e){const s=section('Display targeting');field(s,'Show on',e.monitorId||'all',v=>e.monitorId=v,{choices:[['all','All displays'],...project.monitors.map(m=>[m.id,m.name])]});s.append(node('p','Children normally inherit the visible panel window. Assign the parent container and its children to the same display for predictable Waybar and Quickshell output.'));}
function monitorProperties(){const s=section('Displays'),active=project.canvas.activeMonitorId;s.append(button('+ Add display',()=>commit(()=>{if(project.monitors.length>=8)throw Error('Maximum 8 displays');const id=crypto.randomUUID(),offset=project.monitors.reduce((n,m)=>n+Math.round(m.width/m.scale),0);project.monitors.push({id,name:'Display '+(project.monitors.length+1),output:'DP-'+project.monitors.length,width:1920,height:1080,mode:'preferred',position:offset+'x0',scale:1,primary:false});project.canvas.activeMonitorId=id;changeSize(project,1920,1080);fit();})));field(s,'Editing display',active,v=>{const m=project.monitors.find(n=>n.id===v);if(!m)return;project.canvas.activeMonitorId=v;changeSize(project,m.width,m.height);selection.clear();selected=null;fit();},{choices:project.monitors.map(m=>[m.id,m.name])});for(const [index,m] of project.monitors.entries()){const card=node('div',undefined,'monitor-card');field(card,'Name',m.name,v=>m.name=v);field(card,'Hyprland output',m.output,v=>m.output=v,{maxLength:200});field(card,'Width',m.width,v=>{m.width=v;if(m.id===project.canvas.activeMonitorId)changeSize(project,v,m.height);},{type:'number',min:100,max:10000});field(card,'Height',m.height,v=>{m.height=v;if(m.id===project.canvas.activeMonitorId)changeSize(project,m.width,v);},{type:'number',min:100,max:10000});field(card,'Mode',m.mode,v=>m.mode=v,{maxLength:80});field(card,'Position',m.position,v=>m.position=v,{maxLength:80});field(card,'Scale',m.scale,v=>m.scale=v,{type:'number',min:.5,max:4,step:.25});field(card,'Primary',m.primary,v=>{if(v)for(const n of project.monitors)n.primary=n.id===m.id;else m.primary=false;},{type:'checkbox'});if(project.monitors.length>1)card.append(button('Remove display',()=>commit(()=>{project.monitors.splice(index,1);for(const e of project.elements)if(e.monitorId===m.id)e.monitorId='all';if(project.canvas.activeMonitorId===m.id){const next=project.monitors[0];project.canvas.activeMonitorId=next.id;changeSize(project,next.width,next.height);}})));s.append(card);}s.append(node('p','Use the output name shown by hyprctl monitors. Empty output is a fallback rule. Positions use the scaled Hyprland layout.'));}
const baseDesktopProperties=desktopProperties;desktopProperties=function(){baseDesktopProperties();monitorProperties();};
const baseProperties=properties;properties=function(){baseProperties();const e=current();if(e){elementMonitorProperties(e);logicProperties(e);}};properties();
function applyLogicPreview(){const active=project.canvas.activeMonitorId;for(const e of project.elements){const el=$('#rt-'+e.id.replace(/[^a-z0-9-]/gi,''));if(!el)continue;el.hidden=!!e.monitorId&&e.monitorId!=='all'&&e.monitorId!==active;const data=logicData(e),style=resolvedStyle(e,data),content=el.querySelector('.widget-content');applyElementVisuals(el,content,e,data);if(!e.timeline?.enabled)el.style.animation=e.animation?.enabled&&style.animation!=='none'?`rt-${style.animation} ${e.animation.duration}ms ${e.animation.easing} ${e.animation.delay}ms ${e.animation.iteration}`:'none';const mapped={opacity:1,scale:1,rotation:0,xOffset:0,yOffset:0};for(const binding of e.signalBindings||[]){const raw=data[binding.source];if(raw==null)continue;const ratio=Math.max(0,Math.min(1,(Number(raw)-binding.inputMin)/(binding.inputMax-binding.inputMin)));mapped[binding.target]=binding.outputMin+ratio*(binding.outputMax-binding.outputMin);}if(content){content.style.opacity=String(mapped.opacity);content.style.transform=`translate(${mapped.xOffset}px,${mapped.yOffset}px) scale(${mapped.scale}) rotate(${mapped.rotation}deg)`;content.style.transition=`transform ${40+Math.round(((e.signalBindings||[])[0]?.smoothing||0)*260)}ms linear, opacity 120ms linear`;}if(style.text){const target=el.querySelector('.custom-value,.widget-value');if(target)target.textContent=style.text.replaceAll('{{value}}',customText(e));}}}
if(typeof MutationObserver!=='undefined'){const logicObserver=new MutationObserver(applyLogicPreview);logicObserver.observe($('#elements'),{childList:true});}applyLogicPreview();setInterval(applyLogicPreview,1000);

function showCompatibility(){const report=analyzeCompatibility(project);$('#compatibility-summary').textContent=report.summary;$('#compatibility-list').replaceChildren(...report.items.map(item=>{const card=node('article',undefined,'compatibility-card '+item.status);card.append(node('strong',item.name),node('span',item.status==='quickshell'?'Quickshell required':item.status),node('p',item.reasons.join(' ')));return card;}));$('#compatibility-dialog').showModal();}
$('#inspect-compatibility').onclick=showCompatibility;$('#close-compatibility').onclick=()=>$('#compatibility-dialog').close();
$('#download-hybrid').onclick=async()=>{const b=$('#download-hybrid');b.disabled=true;b.textContent='Building Hybrid…';try{download(await exportHybrid(project),'ricing-town-hybrid.zip','application/zip');notify('Hybrid package prepared · inspect compatibility.json before applying');}catch(e){notify(e.message);}finally{b.disabled=false;b.textContent='Download Hybrid package';}};

const assetButton=button('Asset Manager',()=>{$('#file-menu')?.removeAttribute?.('open');renderAssetPacks();$('#assets-dialog').showModal();});document.querySelector('.project-tools').append(assetButton);
$('#close-assets').onclick=()=>$('#assets-dialog').close();
function renderAssetPacks(){const box=$('#asset-pack-list');box.replaceChildren();for(const pack of project.assetPacks||[]){const row=node('article',undefined,'asset-pack-row');row.append(node('strong',pack.name),node('small',`${pack.kind} · ${pack.files.length} files · ${pack.license||'license not supplied'}`),button('Remove',()=>commit(()=>{project.assetPacks=project.assetPacks.filter(p=>p.id!==pack.id);renderAssetPacks();})));box.append(row);}}
async function sha256(file){const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');}
$('#import-asset-pack').onclick=async()=>{const input=$('#asset-folder'),files=[...input.files];try{if(!files.length)throw Error('Choose an icon or cursor theme folder');if(files.length>500)throw Error('A pack may contain at most 500 files');const total=files.reduce((n,f)=>n+f.size,0);if(total>16*1024*1024)throw Error('A pack may be at most 16 MB');const allowed=/\.(png|svg|theme|cursor)$/i;for(const f of files)if(!allowed.test(f.name)&&!f.webkitRelativePath.includes('/cursors/'))throw Error('Unsupported pack file: '+f.name);const root=files[0].webkitRelativePath.split('/')[0].slice(0,100),entries=[];for(const file of files){const rel=file.webkitRelativePath.split('/').slice(1).join('/');if(!rel||rel.includes('..')||rel.startsWith('/'))throw Error('Unsafe asset path');let data=await readData(file);if(file.name.endsWith('.svg')){const safe=sanitizeSvg(await file.text());data='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(safe)));}else if(file.name.endsWith('.theme'))data='data:text/plain;base64,'+btoa(unescape(encodeURIComponent(await file.text())));else if(!/^data:(image\/png|application\/octet-stream)/.test(data))data=data.replace(/^data:[^;]+;/,'data:application/octet-stream;');entries.push({path:rel,sha256:await sha256(file),data});}const pack={id:crypto.randomUUID(),name:root,kind:$('#asset-kind').value,license:$('#asset-license').value.trim(),source:$('#asset-source').value.trim(),files:entries};commit(()=>{project.assetPacks??=[];project.assetPacks.push(pack);if(pack.kind==='icons')project.integrations.iconTheme=pack.name;else project.integrations.cursorTheme=pack.name;});renderAssetPacks();input.value='';notify(pack.name+' imported and hashed.');}catch(e){notify(e.message);}};

// --- Start Screen & Recent Projects Controller ---
let pendingDeleteId=null;
function formatModifiedDate(ts){
 if(!ts)return 'Just now';
 try{return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(ts));}catch{return 'Recently';}
}
async function renderStartScreen(){
 const grid=$('#recent-projects-grid'),empty=$('#recent-empty'),countBadge=$('#recent-count')||$('#recent-count-badge'),tplRow=$('#start-templates-row');
 if(!grid||!empty)return;
 const list=await storage.listProjects();
 if(countBadge)countBadge.textContent=list.length+(list.length===1?' project':' projects');
 grid.replaceChildren();
 empty.hidden=list.length>0;
 grid.hidden=list.length===0;
 for(const entry of list){
  const card=node('article',undefined,'project-card');
  card.dataset.projectId=entry.id;
  const thumb=node('div',undefined,'project-card-thumb');
  const img=node('img');
  img.src=entry.thumbnail||renderThumbnailSvg(fresh());
  img.alt=entry.name+' preview';
  const badge=node('span',`${entry.width||1920}×${entry.height||1080} · ${entry.elementCount??0} layers`,'project-card-badge');
  thumb.append(img,badge);
  const openEntry=async()=>{
   try{
    showStartError('');
    const loaded=await storage.openProjectEntry(entry.id);
    await storage.checkpoint(project);
    project=loaded;
    openEdges.clear();selection.clear();selected=null;sim.reset();
    timeline=history(project,40);
    render();loadFonts();fit();
    closeStartScreen();
    notify('Opened "'+project.name+'"');
   }catch(e){showStartError(e.message);notify(e.message);}
  };
  thumb.onclick=openEntry;
  const body=node('div',undefined,'project-card-body');
  const info=node('div',undefined,'project-card-info');
  const titleEl=node('strong',entry.name||'Untitled Rice');
  titleEl.title='Click to open · Use menu to rename';
  titleEl.style.cursor='pointer';
  titleEl.onclick=openEntry;
  const dateEl=node('small','Modified '+formatModifiedDate(entry.updatedAt));
  info.append(titleEl,dateEl);

  const menu=node('details',undefined,'card-menu');
  const summary=node('summary','⋯');
  summary.setAttribute('aria-label','Actions for '+entry.name);
  const pop=node('div',undefined,'card-menu-popover');
  const startRename=()=>{
   menu.removeAttribute('open');
   const input=node('input',undefined,'card-rename-input');
   input.type='text';
   input.value=entry.name||'Untitled Rice';
   input.maxLength=120;
   input.setAttribute('aria-label','Rename project');
   const commitRename=async()=>{
    const next=input.value.trim()||'Untitled Rice';
    await storage.renameProjectEntry(entry.id,next);
    if(storage.activeProjectId===entry.id){project.name=next;$('#project-name').value=next;}
    await renderStartScreen();
   };
   input.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();commitRename();}else if(ev.key==='Escape'){ev.preventDefault();renderStartScreen();}};
   input.onblur=commitRename;
   info.replaceChildren(input,dateEl);
   input.focus?.();input.select?.();
  };
  pop.append(
   button('Open',()=>{menu.removeAttribute('open');openEntry();}),
   button('Rename',startRename),
   button('Duplicate',async()=>{menu.removeAttribute('open');await storage.duplicateProjectEntry(entry.id);await renderStartScreen();notify('Duplicated "'+entry.name+'"');}),
   (()=>{const del=button('Delete',()=>{menu.removeAttribute('open');pendingDeleteId=entry.id;const msg=$('#confirm-delete-message');if(msg)msg.textContent=`Are you sure you want to delete "${entry.name}"? This cannot be undone.`;$('#confirm-delete-dialog')?.showModal?.();});del.className='danger-item';return del;})()
  );
  menu.append(summary,pop);
  body.append(info,menu);
  card.append(thumb,body);
  grid.append(card);
 }
 const advRow=$('#start-advanced-row');
 if(advRow&&!advRow.children.length){
  for(const preset of ADVANCED_PRESETS){
   const sample=preset.create();
   const card=button('',async()=>{
    try{
     showStartError('');
     await storage.checkpoint(project);
     project=validate(preset.create());
     await storage.saveProjectEntry(project,crypto.randomUUID());
     openEdges.clear();selection.clear();selected=null;sim.reset();timeline=history(project,40);
     checkpoint();render();loadFonts();fit();
     closeStartScreen();
     notify(preset.name+' created as your own editable project.');
    }catch(e){showStartError(e.message);notify(e.message);}
   },'Create an editable copy of the '+preset.name+' design');
   card.className='template-card advanced-design-card';
   const thumb=node('div',undefined,'template-card-thumb');
   const img=node('img');
   img.src=renderThumbnailSvg(sample);
   img.alt=preset.name+' preview';
   thumb.append(img,node('span',preset.tag,'design-tag'));
   card.append(thumb,node('strong',preset.name),node('small',preset.description),node('span','✎ Customize','design-cta'));
   advRow.append(card);
  }
 }

 if(tplRow&&!tplRow.children.length){
  for(const preset of DESKTOP_PRESETS){
   const sample=preset.create();
   const card=button('',async()=>{
    try{
     showStartError('');
     await storage.checkpoint(project);
     project=validate(preset.create());
     await storage.saveProjectEntry(project,crypto.randomUUID());
     selection.clear();selected=null;timeline=history(project,40);
     checkpoint();render();fit();
     closeStartScreen();
     notify(preset.name+' template loaded.');
    }catch(e){showStartError(e.message);notify(e.message);}
   },'Start from '+preset.name+' template');
   card.className='template-card';
   const thumb=node('div',undefined,'template-card-thumb');
   const img=node('img');
   img.src=renderThumbnailSvg(sample);
   img.alt=preset.name+' preview';
   thumb.append(img);
   card.append(thumb,node('strong',preset.name),node('small',preset.description));
   tplRow.append(card);
  }
  for(const [name,desc,fileUrl] of [
   ['Hyprland Amethyst','Original purple showcase setup with top bar, dock and desktop wallpaper','Hyprland-Amethyst.rce'],
   ['Amethyst Studio','Full component showcase with linked media, volume and system controls','Hyprland-Amethyst-Studio.rce']
  ]){
   const card=button('',async()=>{
    try{
     showStartError('');
     await openProject(await (await fetch(fileUrl)).text(),true);
     closeStartScreen();
     notify(name+' template opened.');
    }catch(e){showStartError(e.message);notify(e.message);}
   },'Start from '+name+' template');
   card.className='template-card';
   const thumb=node('div',undefined,'template-card-thumb');
   const img=node('img');
   img.src=renderThumbnailSvg(fresh());
   img.alt=name+' preview';
   thumb.append(img);
   card.append(thumb,node('strong',name),node('small',desc));
   tplRow.append(card);
   fetch(fileUrl).then(r=>r.ok?r.text():null).then(t=>{if(t)img.src=renderThumbnailSvg(parse(t));}).catch(()=>{});
  }
 }
}
async function openStartScreen(){
 flush();
 showStartError('');
 const screen=$('#start-screen');
 if(!screen)return;
 if(storage.activeProjectId)await storage.saveProjectEntry(project,storage.activeProjectId).catch(()=>{});
 await renderStartScreen();
 screen.hidden=false;
}
function closeStartScreen(){
 const screen=$('#start-screen');
 if(screen)screen.hidden=true;
 showStartError('');
 requestAnimationFrame(fit);
}
async function createNewProjectFromHome(){
 showStartError('');
 await storage.checkpoint(project);
 project=fresh();
 project.name='Untitled Rice';
 await storage.saveProjectEntry(project,crypto.randomUUID());
 openEdges.clear();selection.clear();selected=null;sim.reset();
 timeline=history(project,40);
 checkpoint();render();fit();
 closeStartScreen();
 notify('New project created.');
}
if($('#home-btn'))$('#home-btn').onclick=openStartScreen;
if($('#brand-home'))$('#brand-home').onclick=ev=>{ev.preventDefault?.();openStartScreen();};
if($('#start-resume'))$('#start-resume').onclick=closeStartScreen;
if($('#start-new'))$('#start-new').onclick=createNewProjectFromHome;
if($('#start-empty-cta'))$('#start-empty-cta').onclick=createNewProjectFromHome;
if($('#start-open'))$('#start-open').onclick=()=>$('#file').click();
if($('#start-import'))$('#start-import').onclick=()=>$('#import-file-input')?.click();
for(const sel of ['#confirm-delete-cancel','#cancel-delete-btn','#close-confirm-delete']){
 if($(sel))$(sel).onclick=()=>{pendingDeleteId=null;$('#confirm-delete-dialog')?.close?.();};
}
for(const sel of ['#confirm-delete-yes','#confirm-delete-btn']){
 if($(sel))$(sel).onclick=async()=>{
  if(!pendingDeleteId)return;
  const id=pendingDeleteId;pendingDeleteId=null;
  await storage.deleteProjectEntry(id);
  $('#confirm-delete-dialog')?.close?.();
  await renderStartScreen();
  notify('Project deleted.');
 };
}
const dropzone=$('#start-dropzone');
if(dropzone&&typeof window.addEventListener==='function'){
 window.addEventListener('dragover',ev=>{ev.preventDefault();dropzone.classList?.add?.('drag-over');});
 window.addEventListener('dragleave',ev=>{if(!ev.relatedTarget)dropzone.classList?.remove?.('drag-over');});
 window.addEventListener('drop',async ev=>{
  ev.preventDefault();
  dropzone.classList?.remove?.('drag-over');
  const file=ev.dataTransfer?.files?.[0];
  if(!file)return;
  try{await handleProjectFileImport(file);}catch(e){showStartError(e.message);notify(e.message);}
 });
}
if(typeof document.querySelectorAll==='function'){
 for(const btn of document.querySelectorAll('#file-menu .menu-popover button')){
  const prev=btn.onclick;
  if(prev)btn.onclick=ev=>{$('#file-menu')?.removeAttribute?.('open');return prev(ev);};
 }
 window.addEventListener('pointerdown',ev=>{
  const menu=$('#file-menu');
  if(menu?.hasAttribute?.('open')&&!ev.target?.closest?.('#file-menu'))menu.removeAttribute('open');
 });
 (async()=>{
  const existing=await storage.listProjects();
  if(!existing.length){
   await storage.saveProjectEntry(project,crypto.randomUUID()).catch(()=>{});
  }else{
   storage.activeProjectId=existing[0].id;
  }
  await openStartScreen();
 })();
}
