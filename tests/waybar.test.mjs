import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJsonc,importWaybar,exportWaybar} from '../dist/waybar.js';
import {fresh,element} from '../dist/model.js';
test('JSONC parser handles comments and trailing commas with strict resource limits',()=>{assert.deepEqual(parseJsonc('{//x\n"a":1,}'),{a:1});assert.throws(()=>parseJsonc('{"a":'+'['.repeat(45)+'0'+']'.repeat(45)+'}'));assert.throws(()=>parseJsonc(' '.repeat(1024*1024+1)));});
test('Waybar import maps native modules and disables executable actions',()=>{const source=`{
 "position":"top", "height":42, "spacing":8,
 "modules-left":["hyprland/workspaces"], "modules-center":["clock"],
 "modules-right":["wireplumber","network","battery","custom/weather"],
 "wireplumber":{"format":"{volume}%","on-click":"pavucontrol"},
}`;const css='@import url("https://evil/x.css"); #clock { color: #fff; font-size: 14px; } #network { background-image: url(https://evil/x); color:#aaa; }';const {project,report}=importWaybar(source,css);assert.equal(project.version,8);assert.ok(project.elements.some(e=>e.type==='workspaces'));assert.ok(report.disabled.some(x=>x.includes('on-click')));assert.ok(report.unsupported.some(x=>x.includes('custom/weather')));assert.ok(project.elements.some(e=>e.importedUnsafe?.['on-click']==='pavucontrol'));});
test('Waybar exporter emits valid config, GTK CSS, report and dry-run installer without secrets or arbitrary commands',()=>{const p=fresh(),bar=p.elements[0];for(const type of ['workspaces','volume','battery','clock']){const e=element(type);e.parentId=bar.id;p.elements.push(e);}const {files,report}=exportWaybar(p);const config=JSON.parse(files['config.jsonc']);assert.ok(config['modules-center'].length+config['modules-left'].length+config['modules-right'].length>=4);assert.match(files['style.css'],/window#waybar/);assert.match(files['install.sh'],/--dry-run/);assert.doesNotMatch(JSON.stringify(files),/helper-token|Bearer |pavucontrol/);assert.ok(report.supported.length>=4);});
