import {readFile,writeFile} from 'node:fs/promises';
import {fresh,element,serialize,validate} from '../dist/model.js';
import {desktop} from '../dist/design.js';
import {exportFullRice,hyprlandLua,hyprlandLegacy} from '../dist/hyprland.js';

const p=fresh();
p.name='Nexus Dualscape';
p.canvas={...p.canvas,width:1920,height:1080,activeMonitorId:'primary',background:'#080b16',desktop:{...desktop(p),mode:'gradient',gradientEnd:'#20113d',angle:142,showText:true,text:'NEXUS\nDUALSCAPE',textColor:'#5a4b82'}};
p.monitors=[
 {id:'primary',name:'Primary · Laptop',output:'eDP-1',width:1920,height:1080,mode:'preferred',position:'0x0',scale:1,primary:true},
 {id:'studio',name:'Studio · External',output:'DP-1',width:2560,height:1440,mode:'2560x1440@144',position:'1920x0',scale:1,primary:false}
];
p.integrations={...p.integrations,shell:'hybrid',terminal:'kitty',launcher:'rofi',notifications:'swaync',lockscreen:'hyprlock',iconTheme:'Papirus-Dark',cursorTheme:'Bibata-Modern-Ice'};
p.hyprland={...p.hyprland,gapsIn:7,gapsOut:14,borderSize:2,activeBorder:'#cba6f7',inactiveBorder:'#24243a',rounding:18,blurSize:12,blurPasses:3,shadowRange:24,activeOpacity:.98,inactiveOpacity:.9,layout:'dwindle',animationSpeed:6,animationStyle:'slide'};
p.automation.keybindings=[
 {id:'bind-terminal',keys:'SUPER + RETURN',actionId:'terminal'},
 {id:'bind-browser',keys:'SUPER + B',actionId:'browser'},
 {id:'bind-settings',keys:'SUPER + S',actionId:'settings'},
 {id:'bind-lock',keys:'SUPER + L',actionId:'lock'}
];
p.automation.windowRules=[{id:'float-volume',class:'pavucontrol',float:true,center:true,workspace:''},{id:'browser-workspace',class:'firefox',float:false,center:false,workspace:'2'}];
p.automation.workspaceRules=[{id:'primary-workspace',workspace:'1',monitor:'eDP-1',persistent:true},{id:'studio-workspace',workspace:'2',monitor:'DP-1',persistent:true}];
p.assets=[{id:'nexus-mark',name:'Nexus mark.svg',extension:'svg',data:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#cba6f7" d="M32 2 58 17v30L32 62 6 47V17zm0 9L14 21v22l18 10 18-10V21z"/><circle cx="32" cy="32" r="8" fill="#89dceb"/></svg>'}];
p.elements=[];
const style=(e,values={})=>{e.appearance={opacity:.78,blur:16,shadow:24,borderWidth:1,borderColor:'#6c5b8c',font:'sans-serif',fontAsset:'',...values};return e;};
const animate=(e,kind='none',duration=1600)=>{e.animation={kind,duration,delay:0,easing:'ease-in-out',enabled:true,iteration:'infinite'};return e;};

const bar=style(element('bar',24,22));Object.assign(bar,{name:'Nexus command bar',width:1872,height:58,fill:'#151426',color:'#e8def8',radius:18,monitorId:'all',anchorX:'stretch',anchorY:'top'});bar.options={...bar.options,padding:12,gap:15,align:'center'};p.elements.push(bar);
const barChildren=[
 ['workspaces','Orbit workspaces',20,9,270],['network','Network',1160,9,125],['bluetooth','Bluetooth',1295,9,120],['battery','Battery',1425,9,110],['clock','Nexus clock',1545,9,280]
];
for(const [type,name,x,y,width] of barChildren){const e=element(type,x,y);Object.assign(e,{name,parentId:bar.id,width,height:40,fill:'#151426',color:type==='clock'?'#89dceb':'#e8def8',radius:12,monitorId:'all',fontSize:type==='clock'?17:14});e.options={...e.options,padding:7,gap:7,align:type==='workspaces'?'start':'center'};if(type==='clock')e.options={...e.options,showDate:true};if(type==='workspaces')e.behavior={...e.behavior,workspaceCount:6,activeColor:'#cba6f7'};p.elements.push(e);}

const dock=style(element('dock',610,962),{opacity:.82,blur:20,shadow:32,borderColor:'#51456d'});Object.assign(dock,{name:'Nexus app dock',width:700,height:82,fill:'#121221',color:'#f5eaff',radius:26,monitorId:'primary',anchorX:'center',anchorY:'bottom'});dock.options={...dock.options,padding:15,gap:22,align:'center',iconSize:22,items:[
 {id:'app-terminal',icon:'⌘',label:'Terminal',action:'',shortcut:'SUPER + RETURN',actionId:'terminal'},
 {id:'app-browser',icon:'◎',label:'Web',action:'',shortcut:'SUPER + B',actionId:'browser'},
 {id:'app-files',icon:'▣',label:'Files',action:'',shortcut:'',actionId:'files'},
 {id:'app-music',icon:'♫',label:'Music',action:'',shortcut:'',actionId:'music'},
 {id:'app-lock',icon:'◇',label:'Lock',action:'',shortcut:'SUPER + L',actionId:'lock'}
]};p.elements.push(dock);

const greeting=animate(style(element('widget',92,150),{opacity:.42,blur:12,shadow:18,borderColor:'#3d3556'}),'slide',900);Object.assign(greeting,{name:'Temporal greeting',width:520,height:210,fill:'#141326',color:'#f0e7ff',fontSize:39,radius:28,monitorId:'primary'});greeting.custom={text:'GOOD EVENING\n{{time}}',dataSource:'time',shape:'rectangle'};greeting.options={...greeting.options,align:'start',padding:28,svgAsset:'nexus-mark'};p.elements.push(greeting);

const battery=animate(style(element('widget',1460,820),{opacity:.8,blur:18,borderColor:'#5d4d78'}),'float',2800);Object.assign(battery,{name:'Adaptive power capsule',width:330,height:112,fill:'#17162b',color:'#a6e3a1',fontSize:20,radius:40,monitorId:'primary'});battery.custom={text:'POWER  {{value}}',dataSource:'battery',shape:'pill'};battery.logic=[
 {id:'battery-low',enabled:true,source:'battery',operator:'lt',value:20,style:{fill:'#5a1826',color:'#ffb4bd',opacity:.96,text:'LOW POWER · {{value}}',animation:'pulse'}},
 {id:'battery-charge',enabled:true,source:'charging',operator:'eq',value:true,style:{fill:'#12382f',color:'#94f7d2',opacity:.92,text:'CHARGING · {{value}}',animation:'glow'}}
];p.elements.push(battery);

const music=animate(style(element('widget',92,760),{opacity:.6,blur:22,borderColor:'#564370'}),'glow',3200);Object.assign(music,{name:'Now playing glass',width:560,height:160,fill:'#161226',color:'#f5c2e7',fontSize:23,radius:30,monitorId:'primary'});music.custom={text:'NOW PLAYING\n♫  {{value}}',dataSource:'music',shape:'rectangle'};music.logic=[{id:'music-paused',enabled:true,source:'musicPlaying',operator:'eq',value:false,style:{fill:'#151522',color:'#7f849c',opacity:.55,text:'MUSIC PAUSED',animation:'none'}}];p.elements.push(music);

const grid=style(element('widget',100,170),{opacity:.7,blur:18,shadow:28,borderColor:'#3a6680'});Object.assign(grid,{name:'Studio telemetry',width:680,height:330,fill:'#0d1b2a',color:'#d6efff',fontSize:24,radius:34,monitorId:'studio'});grid.custom={text:'STUDIO TELEMETRY',dataSource:'static',shape:'rectangle'};grid.options={...grid.options,align:'start',padding:26};p.elements.push(grid);
for(const [name,source,x,fill,color] of [['CPU','cpu',26,'#142a46','#89dceb'],['MEMORY','memory',238,'#2c2043','#cba6f7'],['BATTERY','battery',450,'#15342e','#a6e3a1']]){const e=animate(element('text',x,105),'pulse',2600);Object.assign(e,{name:name+' telemetry',parentId:grid.id,width:190,height:160,fill,color,fontSize:18,radius:24,monitorId:'studio'});e.custom={text:name+'\n{{value}}',dataSource:source,shape:'rectangle'};e.logic=source==='cpu'?[{id:'cpu-hot',enabled:true,source:'cpu',operator:'gt',value:80,style:{fill:'#5a1826',color:'#ffb4bd',opacity:1,text:'CPU ALERT\n{{value}}',animation:'glow'}}]:source==='memory'?[{id:'ram-high',enabled:true,source:'memory',operator:'gt',value:80,style:{fill:'#4b2b12',color:'#ffd8a8',opacity:1,text:'RAM HIGH\n{{value}}',animation:'pulse'}}]:[];p.elements.push(e);}

const studioDate=element('text',980,235);Object.assign(studioDate,{name:'Studio date',width:1050,height:170,fill:'#080b16',color:'#cba6f7',fontSize:58,radius:0,monitorId:'studio'});studioDate.custom={text:'{{value}}',dataSource:'date',shape:'rectangle'};studioDate.appearance={opacity:0,blur:0,shadow:0,borderWidth:0,borderColor:'#cba6f7',font:'serif',fontAsset:''};studioDate.options={...studioDate.options,align:'start'};p.elements.push(studioDate);
const connection=animate(style(element('text',980,470),{opacity:.86,blur:12,borderColor:'#285c68'}),'pulse',1900);Object.assign(connection,{name:'Connection state',width:300,height:72,fill:'#12303a',color:'#89dceb',fontSize:18,radius:36,monitorId:'studio'});connection.custom={text:'⌁  {{value}}',dataSource:'network',shape:'pill'};connection.logic=[{id:'offline',enabled:true,source:'network',operator:'eq',value:false,style:{fill:'#4b1820',color:'#ffb4bd',opacity:1,text:'OFFLINE',animation:'pulse'}}];p.elements.push(connection);

validate(p);
await writeFile(new URL('../dist/Nexus-Dualscape.rce',import.meta.url),serialize(p));
globalThis.fetch=async path=>({ok:true,text:()=>readFile(new URL('../dist/'+path,import.meta.url),'utf8')});
await writeFile(new URL('../Nexus-Dualscape-full-rice.zip',import.meta.url),await exportFullRice(p));
await writeFile(new URL('../Nexus-Dualscape.lua',import.meta.url),hyprlandLua(p));
await writeFile(new URL('../Nexus-Dualscape.conf',import.meta.url),hyprlandLegacy(p));
console.log(JSON.stringify({name:p.name,version:p.version,monitors:p.monitors.length,elements:p.elements.length,logicRules:p.elements.reduce((n,e)=>n+(e.logic?.length||0),0),shell:p.integrations.shell},null,2));
