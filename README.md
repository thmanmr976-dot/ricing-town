# Ricing Town Desktop 0.4

Native PySide6 desktop studio for Hyprland. The main Qt window floats automatically,
with a desktop canvas and a collapsible right drawer: **Widgets / Layers / Waybar / Rice / Colors / Island**.

## Run

```bash
./scripts/ricing-town --show
./scripts/ricing-town --hide
./scripts/ricing-town --toggle
./scripts/ricing-town --quit
./scripts/ricing-town --rice-run https://github.com/andreumassanet/impasto
```

Hide, Escape and the close button show a small floating star. Click it to
restore the studio; drag anywhere on the star to move it. Applied desktop widgets remain running
while hidden. Quit stops the app-owned widgets and bar.
`--rice-run` uses the app's own importer and starts a discovered original interface
in isolated mode. Progress appears in Rice Explorer; Stop running Rice ends it.

Requires Python 3.11+, PySide6, Hyprland, Quickshell, grim; Waybar and gtk-launch are
needed for the bar, playerctl for the optional Now playing data source. Bubblewrap
is needed when running original Rice interfaces in isolated mode.

## Create and import widgets

- **Add Widget:** browse or search eight preview cards: Pill clock, Calendar,
  Sticky note, Battery, Memory, CPU, Disk, Now playing. Click a card or drag it onto
  the desktop to open its editable preview, then Save to add it to the draft.
- **Create:** start a blank widget. Add text, shapes and progress indicators;
  choose a live data source; change size, color, background and rounding. Drag an
  element freely to move it; drag any of its eight handles to resize. Optional Snap
  uses a 4px grid. Arrow keys nudge 1px (Shift: 10px). Zoom up to 200%, middle-drag
  to pan, and Fit to recenter. Ctrl+Z / Ctrl+Shift+Z undo / redo editor changes,
  including entire drag gestures. Layer order controls
  stacking. Cancel discards changes. Save can also retain a copy in My widgets.
- **Layers:** select, edit, duplicate, remove or export a desktop widget. Double-click
  a widget on the desktop canvas to edit its design. Drag a selected widget's corner
  to scale it and its contents. Undo restores previous desktop changes.
- **Import:** choose a Ricing Town widget JSON, inspect thumbnails and select the
  widgets to add. It does not apply anything to the desktop until Apply.
- **Export widget:** creates a versioned `.json` file that the same Import can read.
- **Apply / Save:** persists the scene and renders the managed widgets behind
  application windows through a trusted Quickshell layer-shell renderer.

Multiple instances are supported, up to 40 widgets and 32 elements per widget.
Imports accept only the documented data format (maximum 1 MB); no scripts, QML,
HTML, expressions, network URLs or file assets are executed or loaded from imports.
Delta Widgets and UI Builder are visual references, not compatible import formats.
See [widget format](docs/WIDGETS.md) and [design references](docs/DESIGN_REFERENCES.md).

The old single-clock scene is migrated in memory to an editable widget; Apply saves
the updated representation. Saved widgets are restored when the studio starts.

## Desktop and Waybar

Refresh desktop briefly visits an empty workspace to capture the background using
grim, then restores the original workspace unless you changed it yourself. This is
a snapshot, not a live desktop feed. The selected monitor must be focused. External
layer surfaces may appear in the snapshot but are not editable. Owned widgets are
paused during capture so they are not duplicated in the preview.

Add Waybar enables an independent app-owned bar: top/bottom, height, width, color,
five workspace buttons and installed application launchers. Apply restarts only this
bar, leaving other Waybar instances and configuration alone. Its buttons support
both Lua and legacy Hyprland.

**Remove Waybar now** stops only this application's managed bar and persists its
removal without saving unrelated drafts. Settings remain available for Add Waybar.
**Visibility** selects above or behind applications; the latter allows windows to
cover the bar and never reserves space. Above mode can optionally reserve screen
space. Corner rounding and edge gap share their values with the preview. This is
layer-based visibility, not pointer-triggered auto-hide. Original Rice bars are
stopped separately with Stop running Rice.

Choose applications offers **name**, **icon**, or **both** independently for each
launcher. Installed desktop-file icons are used; missing icons fall back to an initial.
The preview and actual bar share geometry and launcher artwork, with centered apps,
workspace buttons on the left and clock on the right. The requested width expands
when necessary to prevent overlap; too many apps for the output produce an error.
Launcher artwork uses CSS backgrounds, avoiding the image-module startup issue
observed on Waybar 0.15. Workspace highlighting follows the current workspace.

## Rice, colors and interactive island

Use **Import → Rice** or the **Rice** tab to inspect a GitHub repository, local ZIP,
or folder. Select individual components after previewing their source and support
status. Imports never execute installers, scripts or imported QML, nor change system
configuration. Supported data is reusable independently of its original Rice.

- **Native/data:** Ricing Town widgets, portable Rice manifests, literal color
  palettes and static PNG/JPEG/WebP wallpapers. Imported images become app-owned
  background surfaces only after Apply.
- **Adapted:** safe Waybar position/height/workspace settings; detected dynamic
  islands offer an explicitly labelled Ricing Town alternative, not the original shell.
- **Review-only:** arbitrary Quickshell/QML, Eww/AGS, compositor configs, system
  integrations and executable scripts. Dependencies and source excerpts are shown.
  They require implementation-specific adapters; universal feature conversion is
  **not** supported.

**Colors** loads imported palettes, maps tokens to background/surface/text/accent,
edits hex colors, saves custom palettes and applies them to selected targets (studio,
widgets, bar, island). **Island** controls the app-owned animated capsule:
click to expand/collapse, switch Stats / Media / Apps, and control media via playerctl.
Launchers use the installed applications selected in Waybar. The preview's capsule
can expand too; desktop controls become active after Apply.

Tested discovery against Impasto: 548 files, nine named palettes in Palettes.qml,
35 wallpaper candidates and a detected DynamicIsland. Its original services,
notifications, games, lock screen, glass effects and system integration are **not**
automatically converted or executed. See [Rice support and format](docs/RICE.md).

## Original Rice player (0.4)

Rice Explorer now opens a **visual gallery**, with wallpaper thumbnails, palette
swatches, widget previews and capability icons. Categories filter the gallery;
source files are kept in the optional diagnostics view. Capability icons indicate
detected features, not exact screenshots. Connected QML capabilities run with their
original shell, rather than being falsely offered as independent converted widgets.

**Run original interface** supports discovered Quickshell `shell.qml` / `main.qml`
entrypoints and original Waybar configurations. Every launch requires confirmation.
Source files and licenses are cached with checksums; a private writable workspace
preserves relative imports, helper scripts and packaged home/config paths. Saved
interfaces can be rerun offline from the Rice tab, stopped, and inspected through logs.
The importer offers **Keep original interface for offline Run** when a runnable
entrypoint is found. It is selected by default; saving a package never runs it.

**Layers → Original Rice** puts saved Quickshell components beside the owned widget
controls in the main studio. Choose an interface, search and select a shared component,
then adjust horizontal/vertical offsets (±2000 px) and size (50–200%). The panel shows
unsaved values; **Save Rice placement** saves without running code. **Reset selected
Rice component**, then Save, restores its original placement. Run from the Rice tab
with confirmation to see saved changes. Rice placement is stored separately from
scene Apply/Undo. The Layers page scrolls in smaller windows.

These controls edit a **shared component definition**, affecting every use of that
file. They do not select individual runtime instances, know their counts, or provide
live hit testing. Size scales the rendered component; it does not reflow its layout.
Unsupported AGS/Eww engine markers produce compatibility warnings during inspection;
static palette and wallpaper discovery remains available.

**Edit Rice components** in the Rice tab opens a visual placement editor for
individual QtQuick component files in a saved Quickshell interface. Search for a
component, set its horizontal and vertical offsets and size, or refresh the desktop picture,
click the component, and drag its placement handle. Save & run restarts the selected
interface with the offsets. The editor found 235 movable components in Impasto,
including DynamicIsland, WorkspacesWidget, DockItem and desktop Widget. Edits live
in Ricing Town's state directory and are applied only to its private runtime copy;
the downloaded source stays intact. A component used several times moves all of its
instances. Runtime-created subitems and native layer surfaces may require a custom
adapter; they are not presented as individually movable when their position cannot
be safely controlled by a QtQuick transform.

- **Isolated preview** (default): requires Bubblewrap; private namespaces/home,
  no host network, D-Bus or Hyprland control socket. Only the Wayland display is
  shared. The program can still display UI, and many original services may not work.
  Isolation failure does not silently fall back to unrestricted execution.
- **Desktop session**: explicitly trusted execution with access to the user's session
  and files. Private HOME is for compatibility, **not a sandbox**. Original code may
  change live settings, access the network or launch commands. Use only trusted Rice.

No setup/install scripts are invoked automatically, missing packages are not installed,
and downloaded interfaces never auto-start on application launch. Stop/Quit terminates
the owned process group. A malicious unrestricted program can escape that group;
use isolated mode for untrusted sources. Complete compatibility with every Rice is
not claimed. AGS/Eww and arbitrary installers are not executable entrypoints here.

## State and recovery

Scene: `$XDG_STATE_HOME/ricing-town/scene.json` (default `~/.local/state/ricing-town`).
Reusable templates: `library/` under that directory. Generated QML, service readings,
Waybar files and logs: `managed/`. No user compositor configuration is rewritten.
Use `--show` to recover visibility and `--quit` to stop this controller and its children.
Apply does not yet implement a full multi-process transactional rollback.

## Install / shortcut

```bash
python -m pip install --user .
install -Dm644 io.ricingtown.Desktop.desktop ~/.local/share/applications/io.ricingtown.Desktop.desktop
```

Bind the absolute source launcher or installed `ricing-town --toggle` in your own
Hyprland config. Legacy syntax: `bind = SUPER, R, exec, ricing-town --toggle`.
Lua syntax: `hl.bind("SUPER + R", hl.dsp.exec_cmd("ricing-town --toggle"))`.
Choose an unused key: SUPER+R may already launch a menu. No binding is installed automatically.

## Verification

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
QT_QPA_PLATFORM=offscreen ./scripts/smoke-test
```

Verified on this machine: floating Qt window; hide/star/restore; eight independent
Quickshell widget surfaces; live local data; managed Waybar; widget JSON round trips;
rejection of unsupported/executable imports. Broader multi-monitor testing and direct
editing handles on desktop surfaces remain future work.
