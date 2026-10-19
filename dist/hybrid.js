import {validate,serialize} from './model.js';
import {analyzeCompatibility,quickshellSubset} from './compatibility.js';
import {exportWaybar} from './waybar.js';
import {buildFiles} from './exporter.js';
import {zip} from './zip.js';

export async function buildHybridFiles(project,templates){
 const p=validate(project),compatibility=analyzeCompatibility(p),files={};
 const wb=exportWaybar(p);for(const [name,data] of Object.entries(wb.files))files['waybar/'+name]=data;
 const qp=quickshellSubset(p);if(qp.elements.length)for(const [name,data] of Object.entries(buildFiles(qp,templates)))files['quickshell/'+name]=data;
 files['project.rce']=serialize(p);
 files['compatibility.json']=JSON.stringify(compatibility,null,2);
 files['start.sh']=`#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
command -v waybar >/dev/null || { echo "Waybar is required" >&2; exit 1; }
waybar -c "$PWD/waybar/config.jsonc" -s "$PWD/waybar/style.css" & waybar_pid=$!
cleanup(){ kill "$waybar_pid" 2>/dev/null || true; [ -z "\${qs_pid:-}" ] || kill "$qs_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
${qp.elements.length?'sh "$PWD/quickshell/start.sh" & qs_pid=$!\nwait "$qs_pid"':'wait "$waybar_pid"'}
`;
 files['README.md']=`# Ricing Town hybrid shell

This package uses Waybar for compatible panel modules and Quickshell for free-floating/custom widgets. Read compatibility.json for the decision made for every element.

Run \`sh start.sh\` to preview it. The script stops both processes together and does not edit system configuration. Add this script to Hyprland autostart only after reviewing the generated files.
`;
 files['manifest.json']=JSON.stringify({format:'ricing-town-hybrid',version:1,projectVersion:p.version,components:{waybar:true,quickshell:qp.elements.length>0},compatibility},null,2);
 return files;
}

export async function exportHybrid(project){
 const [widget,bridge,audioEngine]=await Promise.all(['runtime/Widget.qml','runtime/bridge.py','runtime/audio_engine.py'].map(async path=>{const r=await fetch(path);if(!r.ok)throw Error('Export runtime unavailable');return r.text();}));
 return zip(await buildHybridFiles(project,{widget,bridge,audioEngine}));
}
