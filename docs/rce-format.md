# Ricing Town project format

## Compatible JSON v1
`.rce` remains a UTF-8 JSON document. Schema v8 includes Hyprland compositor settings, `quickshell`, `waybar`, or `hybrid` integration selection, visual keybindings/rules, custom Widget Neighborhood content, bounded animations, optional checked `assetPacks`, ordered visual-logic conditions and up to eight display profiles. Versions 1–7 migrate in memory when opened; the original remains available as a recovery copy. Imports are validated before replacing the current project; unsupported future versions are rejected. Limit: 24 MB, 1,000 elements, 100 shortcut items per element, 20 font assets and 8 logic conditions per element.

`monitors` stores a stable editor id, display name, Hyprland output, logical preview dimensions, mode, position, scale and primary marker. `canvas.activeMonitorId` selects the edited display. Each element has `monitorId`, containing `all` or a valid display id. Quickshell resolves display ids to output names; Waybar writes its `output` selector for a targeted bar.

Each element may contain `logic`. A rule selects an allowlisted source (`cpu`, `memory`, `battery`, `network`, `musicPlaying`, or `charging`), a bounded comparison and a visual result containing fill, text color, opacity, text override and animation. Rules run in array order and the first match wins; arbitrary expressions and commands are not accepted.

Canvas coordinates use design pixels independently of editor zoom. A Bar or Dock can contain one level of non-container children through `parentId`. Child positions are relative to the parent. Resizing/moving through the editor clamps elements to their parent or canvas. Import itself does not silently rewrite existing layouts. Roots paint first, then children. Elements of each group follow project array order.

Types: bar, dock, clock, workspaces, volume, network, bluetooth, battery, notifications, launcher, music, cpu, memory, power. Common properties: stable id, name, x/y, width/height, fill/color, radius, fontSize, format. Optional `options` stores padding, gap, iconSize, alignment, orientation, showSeconds, showDate, icon, items. Items keep legacy action/shortcut strings as inert data; optional `actionId` selects a catalog action. Recognized legacy application commands can map to known actions. Raw commands are never evaluated.

Optional `canvas.desktop`: mode (solid/gradient/image), gradientEnd, angle, image (PNG/JPEG/WebP data URL), fit (cover/contain/stretch), position (center/top/bottom/left/right), showText, text, textColor. Canvas background remains the base color.

Optional `appearance`: opacity (background only), blur, shadow, borderWidth, borderColor, font, fontAsset. `assets` contains font records {id, name, extension:ttf|otf, data:dataURL}. Images and uploaded fonts are embedded in JSON and travel with the project. Optional anchorX/anchorY select edge, center, stretch or proportional scale behavior.

Optional `behavior` keeps type-specific click/scroll actions, workspaceCount, volumeStep, activeColor, mutedColor. Simulation values and editor viewport/selection are never serialized. No real system credentials are stored.

IndexedDB stores current, backup (previous saved revision), and original (previous imported/open project). The legacy localStorage key is migrated automatically. File downloads are independent portable backups. Undo history is session-only and limited to 40 snapshots.

## Export is a separate ZIP
The Quickshell export includes QML, a fixed-action Python adapter, a project.rce copy, extracted image/fonts, launch instructions and compatibility diagnostics. It does not change the .rce transport. Exporters consume validated data and do not mutate the design; future Waybar or other adapters can use this same boundary.

## Future .rce container (not implemented)
A future version can use ZIP with project.json, design.json, assets/, code/{quickshell,waybar,hyprland}/ and metadata.json. It must declare schema and container versions, detect JSON versus ZIP by signature, migrate JSON losslessly, reject unsafe paths and bound decompressed sizes. Namespaced extension data may use extensions.quickshell, extensions.waybar and extensions.hyprland.
