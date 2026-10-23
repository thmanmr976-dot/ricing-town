#!/usr/bin/env node
import {readFile,writeFile,mkdir,chmod,rm,readdir} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from './dist/model.js';
import {buildFullRiceFiles} from './dist/hyprland.js';

const projectRoot=dirname(fileURLToPath(import.meta.url));
globalThis.fetch=async path=>{try{return {ok:true,text:()=>readFile(join(projectRoot,'dist',String(path)),'utf8')}}catch{return {ok:false,text:async()=>''}}};

function chooseFile(){
  for(const [command,args] of [['zenity',['--file-selection','--title=Open a Ricing Town project','--file-filter=Ricing Town projects | *.rce']],['kdialog',['--getopenfilename',process.env.HOME||'.','Ricing Town projects (*.rce)']]]){
    const found=spawnSync('sh',['-c',`command -v ${command}`],{encoding:'utf8'});
    if(found.status===0){const result=spawnSync(command,args,{encoding:'utf8'});if(result.status===0&&result.stdout.trim())return result.stdout.trim();}
  }
  return '';
}

async function stopPreviousTemporaryRices(){
  try{
    const entries=await readdir('/proc');
    for(const name of entries){
      if(!/^\d+$/.test(name))continue;
      const pid=Number(name);
      if(pid===process.pid||pid===process.ppid)continue;
      try{
        const raw=await readFile(`/proc/${pid}/cmdline`);
        const cmdline=raw.toString('utf8').replace(/\0/g,' ');
        if(cmdline.includes('/ricing-town-')&&(cmdline.includes('manager.py')||cmdline.includes('shell.qml')||cmdline.includes('start.sh')||cmdline.includes('waybar')||cmdline.includes('mpvpaper')||cmdline.includes('bridge.py')||cmdline.includes('audio_engine.py'))){
          try{process.kill(pid,'SIGTERM');}catch{}
        }
      }catch{}
    }
  }catch{}
}

async function writeBundle(files,target){
  for(const [name,data] of Object.entries(files)){
    if(name.startsWith('/')||name.split('/').includes('..'))throw Error('Unsafe generated path');
    const destination=join(target,name);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,data);
    if(name.endsWith('.sh')||name==='manager.py')await chmod(destination,0o700);
  }
}

async function main(){
  const selected=process.argv[2]||chooseFile();if(!selected)throw Error('Choose a .rce file or pass its path to Ricing Town Manager.');
  const file=resolve(selected);if(!file.toLowerCase().endsWith('.rce'))throw Error('Ricing Town Manager only opens .rce projects.');
  const project=parse(await readFile(file,'utf8'));
  await stopPreviousTemporaryRices();
  const safeName=(basename(file,'.rce').replace(/[^a-z0-9_-]/gi,'-')||'rice').slice(0,80);
  const target=join(process.env.XDG_RUNTIME_DIR||tmpdir(),`ricing-town-${safeName}-${process.pid}`);
  await mkdir(target,{recursive:true});await writeBundle(await buildFullRiceFiles(project),target);
  console.log(`Validated ${project.name}. Opening Ricing Town Manager.`);
  const child=spawn('python3',[join(target,'manager.py')],{cwd:target,stdio:'inherit'});
  const forwardSignal=sig=>{try{child.kill(sig);}catch{}};
  process.on('SIGINT',()=>forwardSignal('SIGINT'));
  process.on('SIGTERM',()=>forwardSignal('SIGTERM'));
  process.on('SIGHUP',()=>forwardSignal('SIGHUP'));
  child.on('exit',async code=>{
    try{await rm(target,{recursive:true,force:true});}catch{}
    process.exitCode=code||0;
  });
}
main().catch(error=>{console.error(`Ricing Town Manager: ${error.message}`);process.exitCode=1;});
