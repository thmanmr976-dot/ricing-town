export const ACTIONS={
  launch:{label:'Launch approved application',params:{app:'app'}},
  workspace:{label:'Switch workspace',params:{workspace:'integer'}},
  volumeSet:{label:'Set volume',params:{value:'integer'}},
  volumeStep:{label:'Adjust volume',params:{delta:'integer'}},
  muteToggle:{label:'Toggle mute',params:{}},
  media:{label:'Media control',params:{command:'media'}},
  openPanel:{label:'Open editor panel',params:{panel:'panel'}},
  power:{label:'Power action',params:{command:'power'}},
  none:{label:'No action',params:{}}
};
const apps=['terminal','browser','files','settings','network','bluetooth','calculator','lock'];
const media=['play-pause','next','previous'];
const panels=['calendar','volume','music','network','bluetooth','notifications','launcher','power'];
const power=['suspend','reboot','shutdown'];
export function action(type='none',params={}){return {type,params:{...params}};}
export function validateAction(value,{allowPower=true}={}){
  if(!value||typeof value!=='object'||!Object.hasOwn(ACTIONS,value.type)||!value.params||typeof value.params!=='object'||Array.isArray(value.params))throw Error('Invalid action');
  const p=value.params;
  if(value.type==='launch'&&!apps.includes(p.app))throw Error('Invalid approved application');
  if(value.type==='workspace'&&(!Number.isInteger(p.workspace)||p.workspace<1||p.workspace>10))throw Error('Workspace must be from 1 to 10');
  if(value.type==='volumeSet'&&(!Number.isInteger(p.value)||p.value<0||p.value>100))throw Error('Volume must be from 0 to 100');
  if(value.type==='volumeStep'&&(!Number.isInteger(p.delta)||p.delta===0||p.delta< -25||p.delta>25))throw Error('Volume step must be from -25 to 25');
  if(value.type==='media'&&!media.includes(p.command))throw Error('Invalid media command');
  if(value.type==='openPanel'&&!panels.includes(p.panel))throw Error('Invalid panel');
  if(value.type==='power'&&(!allowPower||!power.includes(p.command)))throw Error('Invalid power action');
  const allowed=new Set(Object.keys(ACTIONS[value.type].params));for(const key of Object.keys(p))if(!allowed.has(key))throw Error('Unexpected action parameter');
  return structuredClone(value);
}
export function legacyAction(id){
  if(['terminal','browser','files','settings','network','bluetooth','calculator','lock'].includes(id))return action('launch',{app:id});
  if(id==='music')return action('media',{command:'play-pause'});
  return action();
}
export function actionLabel(value){try{const a=validateAction(value);if(a.type==='launch')return `Launch ${a.params.app}`;if(a.type==='workspace')return `Workspace ${a.params.workspace}`;if(a.type==='media')return `Media ${a.params.command}`;if(a.type==='power')return `Power ${a.params.command}`;return ACTIONS[a.type].label;}catch{return 'Invalid action';}}
