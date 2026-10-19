import test from 'node:test';
import assert from 'node:assert/strict';
import {action,legacyAction,validateAction} from '../dist/actions.js';
import {LiveClient,validateLiveAction} from '../dist/live-client.js';
test('typed actions accept bounded parameters and reject shell-like input',()=>{
 assert.deepEqual(validateAction(action('workspace',{workspace:4})),{type:'workspace',params:{workspace:4}});
 for(const bad of [action('workspace',{workspace:99}),action('volumeSet',{value:101}),action('volumeStep',{delta:0}),action('launch',{app:'sh -c id'}),action('media',{command:'exec'})])assert.throws(()=>validateAction(bad));
 assert.deepEqual(legacyAction('terminal'),{type:'launch',params:{app:'terminal'}});
});
test('live client pairs, authenticates, refreshes and never places token in URL',async()=>{
 const calls=[],memory=new Map();let paired=false;
 const fetcher=async(url,options)=>{calls.push({url,options});const path=new URL(url).pathname;if(path==='/v1/pair'){paired=true;return response(200,{token:'secret'});}assert.equal(options.headers.Authorization,'Bearer secret');if(path==='/v1/capabilities')return response(200,{protocol:1,capabilities:{audio:true}});if(path==='/v1/snapshot')return response(200,{data:{audio:{available:true,volume:42,muted:false}}});if(path==='/v1/actions')return response(200,{ok:true,message:'confirmed'});throw Error('unexpected');};
 const client=new LiveClient({fetcher,storage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)}});await client.pair('123456');client.disconnect();assert.equal(client.status,'disconnected');assert.equal(memory.get('ricing-town.helper-token'),'secret');assert.ok(paired);assert.equal(calls.some(c=>c.url.includes('secret')),false);await client.connect();client.disconnect();await client.execute({type:'muteToggle',params:{}});client.disconnect();
});
test('live action boundary rejects arbitrary action names',()=>assert.throws(()=>validateLiveAction({type:'shell',params:{command:'rm'}})));
function response(status,value){return {ok:status>=200&&status<300,status,async json(){return value;}};}
