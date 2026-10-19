import {validate,serialize} from './model.js';
import {desktop} from './design.js';
import {buildFiles} from './exporter.js';
import {exportWaybar} from './waybar.js';
import {buildHybridFiles} from './hybrid.js';
import {zip,decodeData} from './zip.js';
import {APPS} from './catalog.js';

const luaString=value=>JSON.stringify(String(value));
const rgb=hex=>'0xff'+hex.slice(1).toLowerCase();
const shellCommand=p=>{const base=p.integrations.shell==='waybar'?'waybar -c ~/.config/ricing-town/config/waybar/config.jsonc -s ~/.config/ricing-town/config/waybar/style.css':p.integrations.shell==='hybrid'?'sh ~/.config/ricing-town/config/hybrid/start.sh':'sh ~/.config/ricing-town/config/quickshell/start.sh';return p.integrations.shell==='waybar'&&desktop(p).mode==='live'?'sh ~/.config/ricing-town/config/live-wallpaper/start.sh & '+base:base;};

export function hyprlandLua(project){const p=validate(project),h=p.hyprland;
 const monitorLua=p.monitors.map(m=>`hl.monitor({ output = ${luaString(m.output)}, mode = ${luaString(m.mode)}, position = ${luaString(m.position)}, scale = ${m.scale} })`).join('\n');
 const automationLua=[...p.automation.keybindings.map(b=>`hl.bind(${luaString(b.keys)}, hl.dsp.exec_cmd(${luaString(APPS[b.actionId].command.join(' '))}))`),...p.automation.windowRules.filter(r=>r.float||r.center||r.workspace).map(r=>`hl.window_rule({ match = { class = ${luaString(r.class)} }${r.float?', float = true':''}${r.center?', center = true':''}${r.workspace?', workspace = '+luaString(r.workspace):''} })`),...p.automation.workspaceRules.map(r=>`hl.workspace_rule({ workspace = ${luaString(r.workspace)}${r.monitor?', monitor = '+luaString(r.monitor):''}, persistent = ${r.persistent} })`)].join('\n');
 const motionLua=h.animationStyle==='popin'?`hl.animation({ leaf = "windows", enabled = ${h.animations}, speed = ${h.animationSpeed}, bezier = "default", style = "popin" })`:h.animationStyle==='fade'?`hl.animation({ leaf = "workspaces", enabled = ${h.animations}, speed = ${h.animationSpeed}, bezier = "default", style = "fade" })`:`hl.animation({ leaf = "windows", enabled = ${h.animations}, speed = ${h.animationSpeed}, bezier = "default", style = "slide" })\nhl.animation({ leaf = "workspaces", enabled = ${h.animations}, speed = ${h.animationSpeed}, bezier = "default", style = "slide" })`;
 return `-- Ricing Town generated fragment for Hyprland 0.55+
-- Review this file before loading it. It contains appearance/input/monitor settings only.
${monitorLua}
hl.config({
  general = { gaps_in = ${h.gapsIn}, gaps_out = ${h.gapsOut}, border_size = ${h.borderSize}, col = { active_border = ${rgb(h.activeBorder)}, inactive_border = ${rgb(h.inactiveBorder)} }, layout = ${luaString(h.layout)} },
  decoration = { rounding = ${h.rounding}, active_opacity = ${h.activeOpacity}, inactive_opacity = ${h.inactiveOpacity},
    blur = { enabled = ${h.blurEnabled}, size = ${h.blurSize}, passes = ${h.blurPasses} },
    shadow = { enabled = ${h.shadowEnabled}, range = ${h.shadowRange}, color = ${rgb(h.shadowColor)} }
  },
  input = { kb_layout = ${luaString(h.keyboardLayout)}, kb_options = ${luaString(h.keyboardOptions)}, follow_mouse = ${h.followMouse}, touchpad = { natural_scroll = ${h.naturalScroll} } },
  animations = { enabled = ${h.animations} }
})
hl.animation({ leaf = "global", enabled = ${h.animations}, speed = ${h.animationSpeed}, bezier = "default" })
${motionLua}
${automationLua}
hl.on("hyprland.start", function()
  hl.exec_cmd(${luaString(shellCommand(p))})
end)
`;
}

export function hyprlandLegacy(project){const p=validate(project),h=p.hyprland;
 const monitorLegacy=p.monitors.map(m=>`monitor = ${m.output}, ${m.mode}, ${m.position}, ${m.scale}`).join('\n');
 const automationLegacy=[...p.automation.keybindings.map(b=>{const parts=b.keys.split('+').map(x=>x.trim()),key=parts.pop(),mods=parts.join(' ');return `bind = ${mods}, ${key}, exec, ${APPS[b.actionId].command.join(' ')}`;}),...p.automation.windowRules.filter(r=>r.float||r.center||r.workspace).map(r=>`windowrulev2 = ${[r.float?'float':'',r.center?'center':'',r.workspace?'workspace '+r.workspace:''].filter(Boolean).join(', ')}, class:^(${r.class})$`),...p.automation.workspaceRules.map(r=>`workspace = ${r.workspace}${r.monitor?', monitor:'+r.monitor:''}${r.persistent?', persistent:true':''}`)].join('\n');
 return `# Ricing Town compatibility fragment for Hyprland 0.54 and older
${monitorLegacy}
general { gaps_in = ${h.gapsIn}; gaps_out = ${h.gapsOut}; border_size = ${h.borderSize}; col.active_border = rgb(${h.activeBorder.slice(1)}); col.inactive_border = rgb(${h.inactiveBorder.slice(1)}); layout = ${h.layout} }
decoration { rounding = ${h.rounding}; active_opacity = ${h.activeOpacity}; inactive_opacity = ${h.inactiveOpacity}; blur { enabled = ${h.blurEnabled}; size = ${h.blurSize}; passes = ${h.blurPasses} }; shadow { enabled = ${h.shadowEnabled}; range = ${h.shadowRange}; color = rgb(${h.shadowColor.slice(1)}) } }
input { kb_layout = ${h.keyboardLayout}; kb_options = ${h.keyboardOptions}; follow_mouse = ${h.followMouse}; touchpad { natural_scroll = ${h.naturalScroll} } }
animations { enabled = ${h.animations}; animation = global, 1, ${h.animationSpeed}, default, ${h.animationStyle} }
${automationLegacy}
exec-once = ${shellCommand(p)}
`;
}

export function fullRiceReport(project){const p=validate(project);return [
 `✓ Hyprland appearance: gaps, borders, rounding, blur, shadow, opacity, layout, animation, monitor and input basics.`,
 `✓ ${p.monitors.length} display profile${p.monitors.length===1?'':'s'} with output, mode, position and scale; Quickshell elements are filtered by their selected output.`,
 `✓ ${p.integrations.shell==='hybrid'?'Hybrid Waybar + Quickshell':p.integrations.shell==='quickshell'?'Quickshell':'Waybar'} shell, wallpaper, uploaded fonts/assets and the original .rce project.`,
 `✓ Optional ${p.integrations.launcher}, ${p.integrations.notifications}, ${p.integrations.lockscreen}, ${p.integrations.terminal}, GTK and Qt theme fragments are included when selected.`,
 '⚠ The package is reviewed and applied with a local script. The website does not claim to modify Hyprland directly.',
 '⚠ GTK/terminal/launcher themes cover colors and typography; they do not install third-party programs, fonts, icon packs or cursors.',
 `✓ ${p.automation.keybindings.length} allowlisted keybindings, ${p.automation.windowRules.length} window rules and ${p.automation.workspaceRules.length} workspace rules are exported.`,
 '⚠ Empty window rules are ignored. Existing user bindings and rules outside the generated fragment remain untouched.'
 ];}

const installer=()=>`#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
mode="${'${1:---dry-run}'}"
root="${'${XDG_CONFIG_HOME:-$HOME/.config}'}"
target="$root/ricing-town"
case "$mode" in
 --dry-run) echo "Would install this package to $target and create a timestamped backup if it exists."; echo "Then add the printed source/dofile line to your Hyprland config after review." ;;
 --apply) stamp=$(date +%Y%m%d-%H%M%S); if [ -e "$target" ]; then mv "$target" "$target.backup-$stamp"; fi; mkdir -p "$target"; cp -R config assets project.rce manifest.json "$target/"; printf '%s\n' "Installed files only. Hyprland config was not edited." "Hyprland 0.55+: add: dofile(os.getenv('HOME') .. '/.config/ricing-town/config/hyprland/ricing-town.lua')" "Hyprland <=0.54: add: source = ~/.config/ricing-town/config/hyprland/ricing-town.conf" ;;
 *) echo "Use --dry-run or --apply" >&2; exit 2;;
esac
`;

const restore=()=>`#!/bin/sh
set -eu
root="${'${XDG_CONFIG_HOME:-$HOME/.config}'}"
target="$root/ricing-town"
echo "Remove the Ricing Town dofile/source line from your Hyprland config first."
latest=$(find "$root" -maxdepth 1 -type d -name 'ricing-town.backup-*' | sort | tail -n 1)
if [ -n "$latest" ]; then rm -rf "$target"; mv "$latest" "$target"; echo "Restored $latest"; else echo "No backup found; remove $target manually after review."; fi
`;

function simpleThemes(p){const fg=p.elements[0]?.color||'#c0caf5',bg=p.canvas.background,accent=p.hyprland.activeBorder,out={};
 if(p.integrations.terminal==='kitty')out['config/kitty/ricing-town.conf']=`background ${bg}\nforeground ${fg}\nselection_background ${accent}\nfont_family monospace\n`;
 if(p.integrations.terminal==='foot')out['config/foot/ricing-town.ini']=`[colors]\nbackground=${bg.slice(1)}\nforeground=${fg.slice(1)}\nselection-background=${accent.slice(1)}\n`;
 if(p.integrations.launcher==='rofi')out['config/rofi/ricing-town.rasi']=`* { background: ${bg}; foreground: ${fg}; selected: ${accent}; }\nwindow { background-color: @background; border: 2px; border-color: @selected; border-radius: ${p.hyprland.rounding}px; }\nelement selected { background-color: @selected; text-color: @background; }\n`;
 if(p.integrations.launcher==='wofi')out['config/wofi/ricing-town.css']=`window { background: ${bg}; color: ${fg}; border: 2px solid ${accent}; border-radius: ${p.hyprland.rounding}px; }\n#entry:selected { background: ${accent}; color: ${bg}; }\n`;
 if(p.integrations.notifications==='swaync')out['config/swaync/ricing-town.css']=`.control-center, .notification-row { background: ${bg}; color: ${fg}; border: 2px solid ${accent}; border-radius: ${p.hyprland.rounding}px; }\n`;
 if(p.integrations.lockscreen==='hyprlock'){const match=desktop(p).image.match(/^data:image\/(\w+)/),wallpaper=match?'~/.config/ricing-town/assets/wallpaper.'+match[1]:'screenshot';out['config/hyprlock/ricing-town.conf']=`background { path = ${wallpaper}; blur_passes = ${p.hyprland.blurPasses}; blur_size = ${p.hyprland.blurSize} }\nlabel { text = cmd[update:1000] date +\"%H:%M\"; color = rgb(${fg.slice(1)}); font_size = 72; position = 0, 80; halign = center; valign = center; }\n`;}
 if(p.integrations.gtk)out['config/gtk-3.0/ricing-town.css']=`@define-color theme_bg_color ${bg};\n@define-color theme_fg_color ${fg};\n@define-color theme_selected_bg_color ${accent};\n`;
 if(p.integrations.qt)out['config/qt6ct/colors/ricing-town.conf']=`[ColorScheme]\nactive_colors=${fg}, ${bg}, ${bg}, ${bg}, ${bg}, ${bg}, ${fg}, ${fg}, ${fg}, ${bg}, ${bg}, ${accent}, ${accent}, ${bg}, ${accent}, ${fg}, ${bg}, ${fg}, ${bg}, ${fg}, ${bg}\n`;
 out['config/environment/ricing-town.env']=`# Apply through your session environment only after installing these themes.\nICON_THEME=${p.integrations.iconTheme}\nXCURSOR_THEME=${p.integrations.cursorTheme}\n`;
 return out;}

export async function buildFullRiceFiles(project){const p=validate(project),files={
 'project.rce':serialize(p),'config/hyprland/ricing-town.lua':hyprlandLua(p),'config/hyprland/ricing-town.conf':hyprlandLegacy(p),'assets/README.txt':'Static and live wallpapers, fonts and SVG icons embedded in the project are placed in this directory. Live video playback requires mpvpaper.\n',
 'install.sh':installer(),'restore.sh':restore(),
 'README.md':`# ${p.name} — Ricing Town full rice\n\nOpen the visual manager with \`sh open-manager.sh\` to check dependencies, run the rice temporarily, install it permanently with a timestamped backup, or restore the previous package. The legacy scripts remain available: run \`sh install.sh --dry-run\` before \`--apply\`.\n\n## Scope\n\n${fullRiceReport(p).join('\n\n')}\n`,
 'manifest.json':JSON.stringify({format:'ricing-town-full-rice',version:2,projectVersion:p.version,hyprland:{primary:'0.55+ Lua',compatibility:'0.54 and older hyprlang'},integrations:p.integrations,assetPacks:(p.assetPacks||[]).map(pack=>({id:pack.id,name:pack.name,kind:pack.kind,license:pack.license,source:pack.source,files:pack.files.map(file=>({path:file.path,sha256:file.sha256}))})),warnings:fullRiceReport(p)},null,2)
 };
 Object.assign(files,simpleThemes(p));
 const d=desktop(p);if(d.image)files['assets/wallpaper.'+d.image.match(/^data:image\/(\w+)/)[1]]=decodeData(d.image);const liveMatch=d.video.match(/^data:video\/(mp4|webm)/);if(liveMatch){files['assets/live-wallpaper.'+liveMatch[1]]=decodeData(d.video);const alignX=d.position==='left'?-1:d.position==='right'?1:0,alignY=d.position==='top'?-1:d.position==='bottom'?1:0,opts=[d.videoMuted?'--no-audio':'',d.fit==='cover'?'--panscan=1.0':d.fit==='stretch'?'--video-aspect-override=-1':'--panscan=0.0',`--video-align-x=${alignX}`,`--video-align-y=${alignY}`,'--loop-file=inf'].filter(Boolean).join(' ');files['config/live-wallpaper/start.sh']=`#!/bin/sh\nset -eu\ncommand -v mpvpaper >/dev/null || { echo "Live wallpaper unavailable: install mpvpaper" >&2; exit 1; }\nexec mpvpaper -o ${JSON.stringify(opts)} '*' "${'${XDG_CONFIG_HOME:-$HOME/.config}'}/ricing-town/assets/live-wallpaper.${liveMatch[1]}"\n`;}
 for(const [i,a] of (p.assets||[]).entries())files[`assets/${a.extension==='svg'?'icons':['ttf','otf'].includes(a.extension)?'fonts':'audio'}/${i}.${a.extension}`]=a.extension==='svg'?a.data:decodeData(a.data);
 for(const pack of p.assetPacks||[])for(const file of pack.files)files[`assets/theme-packs/${pack.kind}/${pack.name}/${file.path}`]=decodeData(file.data);
 if((p.assetPacks||[]).length)files['assets/theme-packs/INSTALL.md']=`# Bundled theme packs\n\nThese files were imported by the project author. Verify manifest.json, license and source metadata before installing. Copy an icon or cursor theme directory to \`$XDG_DATA_HOME/icons/\` (usually \`~/.local/share/icons/\`), then select its exact directory name in your desktop settings. The package installer deliberately leaves third-party packs inside the Ricing Town directory so it never overwrites an existing system theme.\n`;
 const managerResponse=await fetch('runtime/manager.py');if(!managerResponse.ok)throw Error('Rice manager unavailable');files['manager.py']=await managerResponse.text();files['open-manager.sh']='#!/bin/sh\nset -eu\ncd -- "$(dirname -- "$0")"\nexec python3 manager.py\n';
 if(p.integrations.shell==='waybar'){const wb=exportWaybar(p);for(const [name,data] of Object.entries(wb.files))files['config/waybar/'+name]=data;}
 else {const [widget,bridge,audioEngine]=await Promise.all(['runtime/Widget.qml','runtime/bridge.py','runtime/audio_engine.py'].map(async path=>{const r=await fetch(path);if(!r.ok)throw Error('Export runtime unavailable');return r.text();}));if(p.integrations.shell==='hybrid'){for(const [name,data] of Object.entries(await buildHybridFiles(p,{widget,bridge,audioEngine})))files['config/hybrid/'+name]=data;}else for(const [name,data] of Object.entries(buildFiles(p,{widget,bridge,audioEngine})))files['config/quickshell/'+name]=data;}
 return files;
}
export async function exportFullRice(project){return zip(await buildFullRiceFiles(project));}
