// Shared capability lists for Widget Neighborhood layers.
// The model validator, browser preview, studio and Quickshell runtime all read
// from these lists so a widget built in the studio always exports faithfully.
export const ANIMATION_KINDS=['none','pulse','float','rotate','glow','slide','fade','bounce','shake'];
export const ANIMATION_LABELS={none:'None',pulse:'Pulse',float:'Float',rotate:'Rotate',glow:'Glow',slide:'Slide in',fade:'Fade',bounce:'Bounce',shake:'Shake'};
export const DATA_SOURCES=['static','time','date','cpu','memory','battery','music','network','volume','brightness','temperature','disk','gpu','uptime','workspace'];
export const DATA_LABELS={static:'Static text',time:'Time',date:'Date',cpu:'CPU usage',memory:'Memory usage',battery:'Battery',music:'Music title',network:'Network',volume:'Volume',brightness:'Brightness',temperature:'Temperature',disk:'Disk usage',gpu:'GPU usage',uptime:'Uptime',workspace:'Active workspace'};
// Numeric signals usable by logic rules, data bindings and meters.
export const NUMERIC_SOURCES=['cpu','memory','battery','volume','brightness','temperature','disk','gpu'];
export const LOGIC_SOURCES=[...NUMERIC_SOURCES,'workspace','network','musicPlaying','charging','spectrumBass','spectrumMid','spectrumTreble','spectrumBeat'];
export const BINDING_SOURCES=[...NUMERIC_SOURCES,'spectrumBass','spectrumMid','spectrumTreble','spectrumBeat'];
export const METER_SOURCES=BINDING_SOURCES;
export const SOURCE_LABELS={cpu:'CPU',memory:'Memory',battery:'Battery',volume:'Volume',brightness:'Brightness',temperature:'Temperature',disk:'Disk',gpu:'GPU',workspace:'Workspace number',network:'Network connected',musicPlaying:'Music playing',charging:'Charging',spectrumBass:'Audio · Bass',spectrumMid:'Audio · Mid',spectrumTreble:'Audio · Treble',spectrumBeat:'Audio · Beat'};
export const METER_STYLES=['none','bar','vbar','ring'];
export const ACTION_TRIGGERS=['click','rightClick','scrollUp','scrollDown','scroll'];
export const TRIGGER_LABELS={click:'Left click',rightClick:'Right click',scrollUp:'Scroll up',scrollDown:'Scroll down'};
export const SHAPES=['rectangle','circle','pill','diamond'];

const num=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const color=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);

export function meter(e){return {style:'none',source:'cpu',min:0,max:100,color:e?.color||'#7aa2f7',track:'#ffffff',thickness:8,...e?.meter};}
export function hover(e){return {enabled:false,scale:1.05,lift:0,...e?.hover};}
export function gradient(e){return {enabled:false,end:'#bb9af7',angle:90,...e?.appearance?.gradient};}

// Throws on invalid studio extras; returns nothing. Called by model.validate.
export function validateWidgetExtras(e){
 if(e.meter!==undefined){const m=meter(e);if(!METER_STYLES.includes(m.style)||!METER_SOURCES.includes(m.source)||!num(m.min,-100000,100000)||!num(m.max,-100000,100000)||m.max<=m.min||!color(m.color)||!color(m.track)||!num(m.thickness,1,200))throw Error('Invalid meter');e.meter=m;}
 if(e.hover!==undefined){const h=hover(e);if(typeof h.enabled!=='boolean'||!num(h.scale,.5,2)||!num(h.lift,-200,200))throw Error('Invalid hover effect');e.hover=h;}
 if(e.appearance?.gradient!==undefined){const g=gradient(e);if(typeof g.enabled!=='boolean'||!color(g.end)||!num(g.angle,0,360))throw Error('Invalid gradient');e.appearance={...e.appearance,gradient:g};}
 if(e.actions!==undefined&&(typeof e.actions!=='object'||Array.isArray(e.actions)||Object.keys(e.actions).some(k=>!ACTION_TRIGGERS.includes(k))))throw Error('Invalid action triggers');
}

// Numeric value for a source from a flat data record (sim or live).
export function numericValue(source,data={}){const v=data[source];return v==null||v===''?null:Number(v);}
export function meterRatio(e,data){const m=meter(e),raw=numericValue(m.source,data);if(raw==null||!Number.isFinite(raw))return 0;return Math.max(0,Math.min(1,(raw-m.min)/Math.max(.0001,m.max-m.min)));}
