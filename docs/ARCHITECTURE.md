# Architecture decision: native PySide6 / Qt Widgets

## Rice and interactive surfaces 0.3

### Version 0.4 runtime and visual browser

`rice_ui.py` presents supported data and detected shell capabilities as a visual
gallery; source files are in an optional diagnostics view. `rice_runner.py` caches
source bytes with per-file hashes, stages a separate writable runtime workspace,
and launches discovered Quickshell or Waybar entrypoints after explicit confirmation.
Isolated launches use Bubblewrap with a private home and network namespace. Trusted
session launches can access the current desktop. Stop/Quit terminate the owned
process group. No imported executable code is inserted into the app's trusted QML
widget renderer. A detected feature may rely on its original shell's services and
cannot always run independently.

The managed Waybar stores its layer, exclusive-zone choice, corner radius and edge
gap in `Scene`. `Remove Waybar now` stops the app-owned process and persists only
that removal, preserving unrelated draft edits. The canvas and Waybar use the same
geometry model.

`rice.py` inspects GitHub ZIPs and local sources without extraction or execution.
Adapters return typed component data with supported/adapted/review status. The
portable manifest is repository-independent; discovered QML is inventory, not a
trusted program. `rice_ui.py` runs inspection off the UI thread, previews selection,
records provenance/licenses, normalizes images and imports reusable data. Colors
are a role-based draft, never arbitrary CSS. See RICE.md for limits and unsupported
features.

`island.py` owns a trusted, data-configured Quickshell island with local media/app
actions and a background wallpaper surface. Imported code cannot supply commands.
`bar.py` shares layout and raster launcher artwork across the preview and Waybar;
CSS image cells work around Waybar 0.15 image-module startup behavior observed in
native tests. Editor undo/redo uses bounded snapshots and groups drag gestures.

## Widget Studio 0.2

`widgets.py` defines the strict versioned widget format, built-in templates,
atomic import/export helpers and fixed local data providers. `widget_editor.py`
implements original Qt composition controls and the shared canvas/thumbnail painter.
`widget_panel.py` owns the right-side template library, layers and selective import
preview. The main scene now stores a list of widget instances rather than one clock.

`widget_runtime.py` supplies a trusted Quickshell renderer. Validated definitions are
JSON-encoded into it as data; imported strings never become executable expressions
and text is explicitly plain text. One renderer process owns all widget surfaces.
`DesktopProcesses` updates app-owned readings once per second; FileView watches the
atomic replacements. No external resource paths, scripts or URLs exist in the schema.

Round-trip, malformed-import, editor-flow and IPC tests accompany live Hyprland
checks of eight mapped widget layers and renderer data updates. The main desktop
scene supports undo; the composition dialog now supports its own undo/redo history
as well as Save/Cancel. See WIDGETS.md for exact limits and DESIGN_REFERENCES.md for visual
attribution. Historical decisions below describe the earlier stages.

## Studio extension

`desktop.py` now owns address-and-PID-scoped compositor operations and child
processes. The palette floats automatically on mapping via the Lua dispatcher API,
with legacy fallback. It does not install configuration rules. Move/resize gestures
use Qt's native Wayland system operations. The right drawer and the desktop canvas
share the same draft scene.

The trusted clock renderer is generated QML on Quickshell's bottom layer. It never
loads imported QML. A separate Waybar process uses generated app-owned config/CSS;
only that process is restarted. `workspace_status.py` supplies checked workspace
buttons compatible with Lua and legacy Hyprland. Installed desktop ids are checked
against discovery before shell-quoted gtk-launch commands are generated.

`Capture` uses a worker thread to visit an empty workspace and capture it with grim.
It restores workspace focus in a finally block unless the user has already changed
workspace. Owned renderers are stopped and restored around capture to prevent
double-rendering the same components in the canvas. This is explicitly a snapshot.
Third-party layer surfaces may remain in it. Managed files are separate from external
configuration; editing existing Waybar/Quickshell source remains unimplemented.

Status: accepted for MVP, 2026-10-24.

## Decision

Use Python 3 with PySide6 and Qt Widgets for a native Qt top-level palette. Qt Widgets gives a compact, accessible implementation using packages already present on this Arch system. It is not a browser, webview, localhost server, Electron application, or wrapper around the earlier website. A future managed desktop surface may use Qt Quick/QML and layer-shell without changing the controller and state boundaries.

The application has four narrow boundaries:

1. `app.py` owns process lifetime and command dispatch.
2. `ipc.py` accepts only `show`, `hide`, `toggle`, and `quit` over a per-user Unix local socket. The socket is mode `0600`; unknown messages cannot invoke shell commands.
3. `state.py` owns the typed scene and atomic persistence. UI changes are drafts until Save.
4. `ui.py` owns the native palette and managed preview. It does not write compositor, Waybar, or Quickshell files.

## Window and Hyprland behavior

The palette is a normal movable Qt tool window with desktop file id `io.ricingtown.Desktop`. On Wayland, a client cannot reliably force itself above all other clients. Hyprland 0.56.2 can enforce this through a user-approved compositor rule, but this project does not edit the user's Lua/hyprland configuration. If desired, adapt this optional rule to the active config syntax:

```ini
windowrule = float on, match:class io.ricingtown.Desktop
windowrule = pin on, match:class io.ricingtown.Desktop
windowrule = size 480 650, match:class io.ricingtown.Desktop
```

The exact class can be checked with `hyprctl clients -j` while the app is open. `pin` is optional and changes workspace behavior, so it is never automatic. The window remembers geometry through `QSettings`.

## Single instance

Secondary CLI invocations connect to the controller socket and exit after acknowledgement. If no server answers, `--show` and `--toggle` start the controller; `--hide` and `--quit` return an error. A socket is removed as stale only after a connection probe fails.

## Safety and integration boundary

Imported QML must eventually be parsed without execution. External file adapters will stage, hash-check, back up, validate, atomically apply, and health-check changes. This MVP intentionally touches none of the detected live configs. Arbitrary shell strings are outside the model.

## Tradeoffs

Qt Widgets is quicker and lighter for the first working palette than a new QML component system, but a layer-shell desktop renderer will benefit from QML. The current preview provides real editing and persistence of managed state, not a real desktop overlay. Always-on-top and global shortcuts remain compositor-authorized operations.
