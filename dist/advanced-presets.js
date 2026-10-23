// Advanced rice designs shown on the Start Screen.
// Each design creates a fresh, fully editable project: every bar, widget,
// dock, colour and Hyprland setting can be changed later in the editor.
import {fresh,element} from './model.js';
import {options} from './editor-core.js';

const put=(type,props,custom)=>{const e=element(type);Object.assign(e,props);if(custom)e.custom=custom;return e;};
const child=(type,parent,x,y,width,height,props={})=>put(type,{parentId:parent.id,x,y,width,height,...props});
const look=(opacity,blur,shadow,borderWidth,borderColor,font='sans-serif')=>({opacity,blur,shadow,borderWidth,borderColor,font,fontAsset:''});
const anim=(kind,duration=1600,extra={})=>({kind,duration,delay:0,easing:'ease-in-out',enabled:true,iteration:'infinite',...extra});
const items=list=>list.map(([actionId,icon,label])=>({id:crypto.randomUUID(),actionId,icon,label,action:'',shortcut:''}));
const desk=(background,mode,gradientEnd,angle,extra={})=>({width:1920,height:1080,background,desktop:{mode,gradientEnd,angle,image:'',fit:'cover',position:'center',showText:false,text:'',textColor:'#ffffff',...extra}});

// 1. Cyber Synthwave — neon gradient borders, music waves, animated sun, floating dock.
function synthwave(){
 const p=fresh();p.name='Cyber Synthwave';p.canvas=desk('#0d0221','gradient','#2b0b3f',180);
 p.hyprland={...p.hyprland,gapsIn:8,gapsOut:20,borderSize:3,rounding:14,activeBorder:'#ff2a6d',activeBorderEnd:'#05d9e8',borderGradient:true,borderAngle:45,inactiveBorder:'#2b1145',blurSize:10,blurPasses:3,shadowRange:30,shadowColor:'#ff2a6d',animationStyle:'popin',animationSpeed:6};
 const bar=put('bar',{name:'Synth top bar',x:30,y:20,width:1860,height:56,fill:'#1a0933',color:'#f8e1ff',radius:16});bar.appearance=look(.8,16,24,2,'#ff2a6d','monospace');
 const ws=child('workspaces',bar,16,8,280,40,{color:'#05d9e8'}),music=child('music',bar,700,8,460,40,{color:'#ff2a6d'}),vol=child('volume',bar,1460,8,130,40),clock=child('clock',bar,1610,6,230,44,{fontSize:22,color:'#05d9e8'});
 const sun=put('shape',{name:'Retro sun',x:760,y:200,width:400,height:400,fill:'#ff2a6d',color:'#ffd319',fontSize:40,radius:200},{text:'',dataSource:'static',shape:'circle'});sun.appearance=look(.85,0,60,0,'#ffd319');sun.animation=anim('glow',2600);
 const title=put('text',{name:'Synth title',x:560,y:620,width:800,height:110,fill:'#0d0221',color:'#05d9e8',fontSize:72},{text:'{{time}}',dataSource:'time',shape:'rectangle'});title.appearance=look(0,0,0,0,'#05d9e8','monospace');title.animation=anim('pulse',2200);
 const waves=put('visualizer',{name:'Neon waves',x:360,y:760,width:1200,height:110,fill:'#1a0933',color:'#ff2a6d',radius:20});waves.appearance=look(.55,12,20,1,'#05d9e8');waves.spectrum={...waves.spectrum,style:'bars',bars:72,secondaryColor:'#05d9e8',sensitivity:1.6};
 const dock=put('dock',{name:'Synth dock',x:610,y:960,width:700,height:80,fill:'#1a0933',color:'#f8e1ff',radius:24});dock.options={...options(dock),align:'center',gap:30,items:items([['terminal','⌘','Terminal'],['browser','◎','Browser'],['files','▣','Files'],['music','♫','Music'],['settings','⚙','Settings'],['lock','◇','Lock']])};dock.appearance=look(.78,18,30,2,'#05d9e8');
 p.elements=[bar,ws,music,vol,clock,sun,title,waves,dock];return p;
}

// 2. Nord Frost — calm blue workstation with dashboard cards and a vertical right rail.
function nordFrost(){
 const p=fresh();p.name='Nord Frost';p.canvas=desk('#2e3440','gradient','#3b4252',150);
 p.hyprland={...p.hyprland,gapsIn:6,gapsOut:14,borderSize:2,rounding:10,activeBorder:'#88c0d0',inactiveBorder:'#4c566a',blurSize:8,blurPasses:2,layout:'master',splitRatio:.58,animationStyle:'slide'};
 const bar=put('bar',{name:'Frost bar',x:20,y:14,width:1880,height:46,fill:'#3b4252',color:'#eceff4',radius:12});bar.appearance=look(.9,10,14,1,'#4c566a');
 const ws=child('workspaces',bar,12,4,260,38,{color:'#88c0d0'}),net=child('network',bar,1380,4,130,38),bt=child('bluetooth',bar,1520,4,110,38),bat=child('battery',bar,1640,4,110,38),clock=child('clock',bar,1760,2,110,42,{fontSize:18,color:'#88c0d0'});
 const greet=put('widget',{name:'Frost greeting',x:120,y:180,width:700,height:220,fill:'#3b4252',color:'#eceff4',fontSize:44,radius:24},{text:'Good day ❄\n{{date}}',dataSource:'date',shape:'rectangle'});greet.appearance=look(.82,16,26,1,'#88c0d0');greet.animation=anim('fade',1200,{iteration:'once'});
 const stats=put('widget',{name:'Frost system card',x:120,y:440,width:700,height:300,fill:'#3b4252',color:'#88c0d0',fontSize:20,radius:24},{text:'SYSTEM',dataSource:'static',shape:'rectangle'});stats.appearance=look(.82,16,26,1,'#4c566a','monospace');
 const cpu=child('text',stats,30,70,310,90,{name:'Frost CPU',fill:'#434c5e',color:'#eceff4',fontSize:22,radius:16});cpu.custom={text:'CPU {{value}}',dataSource:'cpu',shape:'rectangle'};
 const mem=child('text',stats,360,70,310,90,{name:'Frost RAM',fill:'#434c5e',color:'#eceff4',fontSize:22,radius:16});mem.custom={text:'RAM {{value}}',dataSource:'memory',shape:'rectangle'};
 const temp=child('text',stats,30,180,310,90,{name:'Frost temp',fill:'#434c5e',color:'#eceff4',fontSize:22,radius:16});temp.custom={text:'TEMP {{value}}',dataSource:'temperature',shape:'rectangle'};
 const disk=child('text',stats,360,180,310,90,{name:'Frost disk',fill:'#88c0d0',color:'#2e3440',fontSize:22,radius:16});disk.custom={text:'DISK {{value}}',dataSource:'disk',shape:'rectangle'};
 const rail=put('dock',{name:'Frost app rail',x:1810,y:300,width:80,height:480,fill:'#3b4252',color:'#eceff4',radius:22});rail.options={...options(rail),orientation:'vertical',align:'center',gap:22,items:items([['terminal','⌘','Terminal'],['browser','◎','Browser'],['files','▣','Files'],['calculator','⊞','Calculator'],['settings','⚙','Settings']])};rail.appearance=look(.86,14,22,1,'#88c0d0');
 p.elements=[bar,ws,net,bt,bat,clock,greet,stats,cpu,mem,temp,disk,rail];return p;
}

// 3. Tokyo Night Hot-Edge — minimal top bar plus a left hot-edge control center.
function tokyoEdge(){
 const p=fresh();p.name='Tokyo Night Edge';p.canvas=desk('#1a1b26','gradient','#24283b',120);
 p.hyprland={...p.hyprland,gapsIn:5,gapsOut:12,borderSize:2,rounding:12,activeBorder:'#7aa2f7',activeBorderEnd:'#bb9af7',borderGradient:true,borderAngle:90,inactiveBorder:'#292e42',blurSize:12,blurPasses:3,animationStyle:'slide'};
 const bar=put('bar',{name:'Tokyo bar',x:600,y:14,width:720,height:44,fill:'#1f2335',color:'#c0caf5',radius:22});bar.appearance=look(.85,14,18,1,'#3b4261');
 const ws=child('workspaces',bar,14,4,260,36,{color:'#7aa2f7'}),clock=child('clock',bar,470,2,230,40,{fontSize:18,color:'#bb9af7'});
 const panel=put('widget',{name:'Tokyo control center',x:16,y:120,width:360,height:820,fill:'#1f2335',color:'#c0caf5',fontSize:22,radius:22,anchorX:'left',anchorY:'center'},{text:'CONTROL CENTER',dataSource:'static',shape:'rectangle'});panel.appearance=look(.94,16,30,1,'#7aa2f7');panel.reveal={mode:'hot-edge',edge:'left',triggerSize:5,hideDelay:450};
 const big=child('clock',panel,30,70,300,110,{fontSize:52,fill:'#24283b',color:'#7aa2f7',radius:18});
 const music=child('music',panel,30,200,300,60,{fill:'#24283b',color:'#bb9af7',radius:14});
 const vol=child('volume',panel,30,280,140,54,{fill:'#24283b',radius:14}),bright=child('brightness',panel,190,280,140,54,{fill:'#24283b',radius:14});
 const net=child('network',panel,30,350,140,54,{fill:'#24283b',radius:14}),bt=child('bluetooth',panel,190,350,140,54,{fill:'#24283b',radius:14});
 const cpu=child('cpu',panel,30,420,140,54,{fill:'#24283b',radius:14}),mem=child('memory',panel,190,420,140,54,{fill:'#24283b',radius:14});
 const notif=child('notifications',panel,30,490,300,54,{fill:'#24283b',radius:14});
 const power=child('power',panel,30,730,300,60,{fill:'#f7768e',color:'#1a1b26',radius:16});
 for(const c of [big,music,vol,bright,net,bt,cpu,mem,notif,power])c.reveal={mode:'always',edge:'left',triggerSize:4,hideDelay:350};
 const quote=put('text',{name:'Tokyo quote',x:560,y:440,width:800,height:200,fill:'#1a1b26',color:'#565f89',fontSize:34},{text:'move the cursor to the left edge →\nfor the control center',dataSource:'static',shape:'rectangle'});quote.appearance=look(0,0,0,0,'#565f89','monospace');quote.workspaceContent=['move the cursor to the left edge →\nfor the control center','// focus mode','// build & ship','// read & research','// rest'];quote.workspaceMotion={order:0};
 p.elements=[bar,ws,clock,panel,big,music,vol,bright,net,bt,cpu,mem,notif,power,quote];return p;
}

// 4. Gruvbox Retro Terminal — warm monospace dashboard with segmented bottom bar.
function gruvbox(){
 const p=fresh();p.name='Gruvbox Retro';p.canvas=desk('#282828','solid','#3c3836',0);
 p.hyprland={...p.hyprland,gapsIn:4,gapsOut:8,borderSize:2,rounding:4,activeBorder:'#fabd2f',inactiveBorder:'#504945',blurEnabled:false,shadowRange:10,activeOpacity:1,inactiveOpacity:.92,animationStyle:'fade',animationSpeed:4};
 const bar=put('bar',{name:'Gruvbox bottom bar',x:0,y:1034,width:1920,height:46,fill:'#3c3836',color:'#ebdbb2',radius:0,anchorY:'bottom'});bar.appearance=look(1,0,0,0,'#504945','monospace');
 const launcher=child('launcher',bar,8,4,130,38,{fill:'#fabd2f',color:'#282828',radius:4}),ws=child('workspaces',bar,150,4,280,38,{color:'#fabd2f',radius:4}),cpu=child('cpu',bar,1230,4,120,38,{fill:'#504945',color:'#b8bb26',radius:4}),mem=child('memory',bar,1360,4,120,38,{fill:'#504945',color:'#83a598',radius:4}),temp=child('temperature',bar,1490,4,120,38,{fill:'#504945',color:'#fb4934',radius:4}),vol=child('volume',bar,1620,4,120,38,{fill:'#504945',color:'#d3869b',radius:4}),clock=child('clock',bar,1750,2,160,42,{fontSize:18,fill:'#fabd2f',color:'#282828',radius:4});
 const ascii=put('widget',{name:'Gruvbox fetch',x:140,y:140,width:820,height:440,fill:'#32302f',color:'#ebdbb2',fontSize:22,radius:6},{text:'omer@hyprland\n─────────────\nOS      Arch Linux\nWM      Hyprland\nShell   zsh\nUptime  {{value}}',dataSource:'uptime',shape:'rectangle'});ascii.appearance=look(.96,0,16,2,'#fabd2f','monospace');ascii.animation=anim('slide',800,{iteration:'once'});
 const date=put('text',{name:'Gruvbox date',x:1080,y:180,width:700,height:120,fill:'#282828',color:'#fabd2f',fontSize:56},{text:'{{value}}',dataSource:'date',shape:'rectangle'});date.appearance=look(0,0,0,0,'#fabd2f','monospace');
 const gauge=put('memoryChart',{name:'Gruvbox memory graph',x:1080,y:330,width:700,height:250,fill:'#32302f',color:'#b8bb26',radius:6});gauge.appearance=look(.96,0,16,2,'#504945','monospace');
 const tip=put('shape',{name:'Gruvbox cursor',x:140,y:610,width:30,height:44,fill:'#fabd2f',color:'#282828',radius:0},{text:'',dataSource:'static',shape:'rectangle'});tip.animation=anim('pulse',1000);
 p.elements=[bar,launcher,ws,cpu,mem,temp,vol,clock,ascii,date,gauge,tip];return p;
}

// 5. Catppuccin Islands — floating island bars, rich media card and GPU monitor.
function catppuccin(){
 const p=fresh();p.name='Catppuccin Islands';p.canvas=desk('#1e1e2e','gradient','#313244',135);
 p.hyprland={...p.hyprland,gapsIn:8,gapsOut:16,borderSize:2,rounding:18,activeBorder:'#cba6f7',activeBorderEnd:'#f5c2e7',borderGradient:true,borderAngle:135,inactiveBorder:'#313244',blurSize:14,blurPasses:3,shadowRange:24,animationStyle:'popin'};
 const left=put('bar',{name:'Island · left',x:24,y:18,width:420,height:50,fill:'#181825',color:'#cdd6f4',radius:25});left.appearance=look(.86,16,20,1,'#cba6f7');
 const ws=child('workspaces',left,14,5,260,40,{color:'#cba6f7'}),launch=child('launcher',left,290,5,116,40,{color:'#f5c2e7'});
 const mid=put('bar',{name:'Island · center',x:760,y:18,width:400,height:50,fill:'#181825',color:'#cdd6f4',radius:25});mid.appearance=look(.86,16,20,1,'#f5c2e7');
 const clock=child('clock',mid,90,3,220,44,{fontSize:22,color:'#f5c2e7'});
 const right=put('bar',{name:'Island · right',x:1376,y:18,width:520,height:50,fill:'#181825',color:'#cdd6f4',radius:25});right.appearance=look(.86,16,20,1,'#cba6f7');
 const net=child('network',right,12,5,120,40),vol=child('volume',right,140,5,120,40),bat=child('battery',right,268,5,120,40),notif=child('notifications',right,396,5,112,40);
 const media=put('widget',{name:'Catppuccin media card',x:120,y:620,width:620,height:300,fill:'#181825',color:'#cdd6f4',fontSize:22,radius:28},{text:'NOW PLAYING',dataSource:'static',shape:'rectangle'});media.appearance=look(.85,18,30,1,'#cba6f7');
 const song=child('music',media,30,70,560,60,{fill:'#313244',color:'#f5c2e7',radius:16});
 const wv=child('visualizer',media,30,150,560,120,{fill:'#313244',color:'#cba6f7',radius:16});wv.spectrum={...wv.spectrum,style:'waveform',bars:48,secondaryColor:'#f5c2e7'};
 const gpu=put('gpu',{name:'Catppuccin GPU',x:1380,y:620,width:420,height:300,fill:'#181825',color:'#a6e3a1',radius:28});gpu.appearance=look(.85,18,30,1,'#a6e3a1');
 const hello=put('text',{name:'Catppuccin hello',x:560,y:300,width:800,height:140,fill:'#1e1e2e',color:'#cba6f7',fontSize:64},{text:'meow ✦ {{time}}',dataSource:'time',shape:'rectangle'});hello.appearance=look(0,0,0,0,'#cba6f7');hello.animation=anim('float',3400);
 p.elements=[left,ws,launch,mid,clock,right,net,vol,bat,notif,media,song,wv,gpu,hello];return p;
}

// 6. Mono Glass Minimal — black & white glass, centered dock, per-workspace headline.
function monoGlass(){
 const p=fresh();p.name='Mono Glass';p.canvas=desk('#0a0a0a','gradient','#1c1c1c',200);
 p.hyprland={...p.hyprland,gapsIn:10,gapsOut:24,borderSize:1,rounding:20,activeBorder:'#ffffff',inactiveBorder:'#2a2a2a',blurSize:20,blurPasses:4,shadowRange:40,activeOpacity:.98,inactiveOpacity:.85,layout:'scrolling',animationStyle:'slide',animationSpeed:7};
 const head=put('text',{name:'Mono headline',x:160,y:360,width:1600,height:200,fill:'#0a0a0a',color:'#ffffff',fontSize:120},{text:'{{time}}',dataSource:'time',shape:'rectangle'});head.appearance=look(0,0,0,0,'#ffffff');head.workspaceContent=['{{time}}','WORK','CODE','READ','PLAY'];head.workspaceMotion={order:0};
 const sub=put('text',{name:'Mono subline',x:160,y:570,width:1200,height:70,fill:'#0a0a0a',color:'#8a8a8a',fontSize:28},{text:'{{date}}',dataSource:'date',shape:'rectangle'});sub.appearance=look(0,0,0,0,'#8a8a8a');sub.workspaceMotion={order:1};
 const pill=put('bar',{name:'Mono status pill',x:1560,y:24,width:336,height:44,fill:'#1a1a1a',color:'#f0f0f0',radius:22});pill.appearance=look(.6,24,20,1,'#3a3a3a');
 const ws=child('workspaces',pill,12,4,180,36,{color:'#ffffff'}),bat=child('battery',pill,200,4,124,36);
 const dock=put('dock',{name:'Mono dock',x:660,y:970,width:600,height:76,fill:'#1a1a1a',color:'#f0f0f0',radius:38});dock.options={...options(dock),align:'center',gap:34,items:items([['terminal','⌘','Terminal'],['browser','◎','Browser'],['files','▣','Files'],['music','♫','Music'],['lock','◇','Lock']])};dock.appearance=look(.55,24,36,1,'#3a3a3a');dock.reveal={mode:'always',edge:'left',triggerSize:4,hideDelay:350};
 const orb=put('shape',{name:'Mono orb',x:1500,y:300,width:260,height:260,fill:'#ffffff',color:'#0a0a0a',radius:130},{text:'',dataSource:'static',shape:'circle'});orb.appearance=look(.06,30,0,1,'#ffffff');orb.animation=anim('rotate',12000);
 p.elements=[head,sub,pill,ws,bat,dock,orb];return p;
}

export const ADVANCED_PRESETS=[
 {name:'Cyber Synthwave',description:'Neon gradient borders, music waves, glowing sun and a floating dock',tag:'Media',create:synthwave},
 {name:'Nord Frost',description:'Calm blue workstation with system cards and a vertical app rail',tag:'Workstation',create:nordFrost},
 {name:'Tokyo Night Edge',description:'Minimal bar plus a left hot-edge control center and per-workspace text',tag:'Hot-edge',create:tokyoEdge},
 {name:'Gruvbox Retro',description:'Warm monospace fetch card, memory graph and segmented bottom bar',tag:'Terminal',create:gruvbox},
 {name:'Catppuccin Islands',description:'Three floating island bars, now-playing card with waveform and GPU monitor',tag:'Islands',create:catppuccin},
 {name:'Mono Glass',description:'Black & white glass, scrolling layout and per-workspace headline',tag:'Minimal',create:monoGlass}
];
