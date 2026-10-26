# Rice import and player support (0.4)

## Visual browser and optional execution

The default browser is a card gallery: native widget previews, wallpaper thumbnails,
palette swatches and semantic icons for detected capabilities. Categories separate
widgets/features, wallpapers, colors, original interfaces and other images. Source
paths/files and excerpts are available only in the optional technical view. Capability
discovery is heuristic and icons are not exact renderings of third-party QML.

Original Quickshell entrypoints (`shell.qml`, `main.qml` importing Quickshell) and
Waybar configs now have a separate **Run** action. Feature cards point to their owning
shell, not a standalone wrapper that would lose service dependencies. Running is
never triggered by inspection, import, selection, startup, or preview generation.
Each launch presents a default-No confirmation explaining the execution mode.
When an entrypoint is detected, **Keep original interface for offline Run** can
cache it during import; this works even if no data components are selected.

Complete package bytes are cached under `rice-packages/<digest>/source` with per-file
checksums and provenance/licenses. Runtime copies live under `rice-runs`, maintain
relative imports and map packaged `home/.config` and `.local/share` into a private HOME.
The cache is verified before a run; runtime state is retained separately. No installer
or package-manager command is generated. Runtimes must already be installed.

Isolated mode requires Bubblewrap, exposes system libraries and `/etc` read-only,
private process/network namespaces, a writable runtime workspace and only the Wayland
display socket. It excludes the host home, host D-Bus and Hyprland sockets and clears
inherited environment variables. The shared display still permits visible UI; this is
not a guarantee against all display-protocol or resource-exhaustion attacks. Services
depending on network, D-Bus, GPU devices, audio or compositor control may not work.
Failure to isolate never triggers an automatic unrestricted fallback.

Trusted desktop-session mode is **not sandboxed**: code can access the user's files,
network and live desktop and may change settings. Private HOME only helps configuration
compatibility. Stop/Quit kills the managed process group, but malicious unrestricted
children could escape it. No downloaded package is auto-started after app restart.
The Rice tab provides offline relaunch, Stop and a bounded-tail log viewer. Runtime
logs are not disk-quota limited. Quickshell and Waybar are supported launch engines;
arbitrary AGS/Eww entrypoints, installers and foreign services remain unsupported.

Rice is not a standardized executable format. Dotfiles collections can include
arbitrary scripts, compositor configuration and entire desktop applications. This
importer deliberately separates data conversion from executing someone else's shell.

## Sources and workflow

Import → Rice accepts a GitHub repository URL (`/tree/branch` optional), a local ZIP,
or a folder. Other hosts and tar archives must be downloaded/unpacked manually into
a local folder. Download/analysis runs in a cancellable background worker. No Git
hooks, installers or archive members are executed. Archives are read without extraction.

Inspect → filter → preview → check individual components → Import selected.
Supported data and explicitly labelled adaptations may be selected. Review-only
files cannot be applied individually. Imported data is applied to the desktop only
after Apply / Save; separately confirmed Run starts an original interface immediately.
Imported templates and palettes remain in the library when undoing the draft.

| Adapter | Imported | Not imported |
| --- | --- | --- |
| Native widget JSON v1 | Validated editable elements and built-in data sources | Executable expressions / arbitrary file paths |
| Color token discovery | Literal hex tokens from QML/JSON/CSS/INI/TOML/YAML/config files; named QML palette objects | JS/Lua evaluation, computed colors, all syntax variants |
| Static images | PNG/JPEG/WebP, normalized into app-owned PNG wallpaper assets | Video wallpapers, SVG or executable formats |
| Waybar JSON/JSONC | Position, bounded height, workspace visibility | Original CSS, absolute width, layout order, arbitrary modules / exec / click commands |
| DynamicIsland filename discovery | Suggests a standalone Ricing Town island | Conversion of the source island or its services |
| Quickshell/QML inventory | Source excerpt, import dependencies, provenance | Execution of external QML |
| Eww/AGS/Hypr/system files | Review-only inventory | System settings, keybindings, packages, login/lock services |

Color tokens can be mapped manually to studio background, surface, text and accent.
Apply them independently to the studio, all draft widgets, bar background/text/active workspace and island.
This does not recolor unrelated GTK/Qt applications, terminals or the operating system.

The native island provides animated expand/collapse, stats, media controls (playerctl),
and installed application launchers. It does not currently implement notification
ownership, authentication, game panels, network/Bluetooth controls, lock/login screens,
liquid glass, or the corresponding Impasto features. The preview expands but is not
the desktop media-control surface; controls work on the applied island.

## Portable Rice manifest v1

Any repository may include `rice.json` with the following format; no repository name
or vendor-specific path is required. The explorer finds the manifest anywhere in
the package. Supported kinds are `palette`, `widget`, and `island`.

```json
{
  "format": "ricing-town-rice",
  "version": 1,
  "name": "My Rice",
  "components": [
    {
      "kind": "palette",
      "name": "Night palette",
      "data": {
        "background": "#141721",
        "surface": "#222735",
        "text": "#e4e8f4",
        "accent": "#a99bff"
      }
    },
    {
      "kind": "island",
      "name": "My island",
      "data": {
        "enabled": true,
        "width": 240,
        "expanded_width": 440,
        "height": 44,
        "expanded_height": 240,
        "top": 8,
        "radius": 24,
        "background": "#141721",
        "text": "#e4e8f4",
        "accent": "#a99bff"
      }
    }
  ]
}
```

Widget `data` uses the single widget object documented in [WIDGETS.md](WIDGETS.md).
At most 200 manifest components, 40 desktop widgets and 32 elements per widget.
Unknown manifest kinds or executable fields are rejected. Native island fields are
strictly validated; absent fields use defaults. Its top offset starts below an enabled
top bar. The expanded width cannot be smaller than the compact width.

## Storage, safety and extensions

Library records live under the application state directory:

- `rice-library/<content-sha256>/provenance.json`: source, inventory, selection,
  dependency hints, warnings and discovered license/notice text.
- `palettes/*.json`: reusable named palettes.
- `library/*.json`: validated widget templates.
- `assets/<image-sha256>.png`: normalized wallpapers.

Limits: 256 MB downloaded ZIP, 512 MB declared expanded content, 5,000 entries,
32 MB per file, 2 MB per scanned text file, 40 megapixels per decoded image.
Path traversal and absolute archive paths are rejected; symlinks are skipped and
reported. Network URLs are restricted to GitHub/codeload HTTPS. A per-read timeout
and overall download deadline apply. Cancellation is checked between network chunks
and inspected files. Existing user/compositor files are never overwritten.

No broad claim of compatibility with every Rice is made. New adapters should return
validated component data, describe unsupported behavior explicitly, and have fixtures
and negative/security tests. Supporting an original executable shell requires a
separate reviewed integration with its runtime/service dependencies, not merely a
filename detector. Original source licenses still apply to imported assets/data.

Impasto discovery was tested on 548 files: nine named palettes in `Palettes.qml`,
35 wallpaper candidates, one island alternative; arbitrary QML stayed review-only.
No Impasto program code is included in the renderer or executed by the importer.
