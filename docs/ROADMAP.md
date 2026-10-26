# Current status — 0.4

| Area | Implemented | Remaining |
|---|---|---|
| Controller | Native floating palette, IPC, hide-to-star, tray recovery | Shortcut preferences, broader compositor testing |
| Widget library | Eight previews, search, custom saved templates, multiple instances | More widget types, template organization |
| Composition | Text/shape/progress, live data, layers, eight resize handles, free/grid movement, keyboard nudging, zoom/pan, undo/redo | Images, nested containers, richer alignment |
| Desktop | Trusted Quickshell widget layers, per-widget output, background snapshot | Direct desktop edit handles, monitor hotplug hardening |
| Import/export | Validated versioned JSON, selective preview, atomic export | Source-preserving QML/Delta/HTML conversion |
| Waybar | Shared preview/runtime geometry/artwork, per-app icon/name/both, bounded module layout | Editing arbitrary existing configs |
| Rice | GitHub/ZIP/folder analysis, per-component status/source, palettes, images, native widgets, portable manifest, partial Waybar adapter | Original arbitrary QML/Eww/AGS execution and feature-preserving adapters |
| Rice player | Visual gallery, semantic capability cards, original Quickshell/Waybar launch, explicit trust confirmation, isolated and session modes, offline cache, Stop/logs | AGS/Eww runners, runtime dependency installation, detached extraction of coupled features |
| Colors | Editable/saveable palettes, role mapping, target-specific application, managed wallpapers | Automatic wallpaper palette extraction, global application theming |
| Island | Native animated capsule, stats/media/apps, size/color controls, preview | Notifications, service panels, games and original third-party shell behavior |
| Persistence | Scene and templates, desktop undo, legacy clock migration | Redo, checkpoints, transactional multi-process rollback |
| Packaging | Source launcher, pip entry point, desktop file | Arch package, installer UI |

No universal QML, rice, HTML or Delta import support is claimed. The visual references
in `DESIGN_REFERENCES.md` informed the appearance, not the execution model.
