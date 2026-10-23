# Ricing Town · Visual Desktop Rice Studio for Hyprland

**Ricing Town** is a visual web-based editor for designing desktop "rice" setups (status bars, docks, floating widgets, wallpapers, window layouts, gaps, borders, workspaces, and animations) for **Hyprland**, similar in spirit to Figma.

Design visually in your browser, test interactively with live window tiling previews or simulated telemetry, and export production-ready packages for **Quickshell**, **Waybar**, or a complete **Full Rice** configuration.

---

## ✨ Features

### 1. Project Start Screen & Project Hub
- **Recent Projects**: Visual grid of cards showing dynamic SVG canvas thumbnails, resolution, layer counts, and last modified timestamps.
- **Card Actions**: Open, inline Rename, Duplicate, or Delete projects (with confirmation dialog).
- **Starter Templates**: Jumpstart your setup with built-in presets including *Neon Orbit*, *Aurora Grid*, *Paper Calm*, and *Amethyst*.
- **Drag & Drop**: Drop `.rce` or `.json` files directly onto the start screen or editor to import.
- **Safe Persistence**: Built on IndexedDB with automatic `localStorage` fallback and auto-save indicators (`Saved locally` / `Saving...`).

### 2. Figma-Like Editor Layout
- **Clean Top Bar**:
  - Project name (click or type to rename) and auto-save status.
  - Centered Undo/Redo (`Ctrl+Z`, `Ctrl+Shift+Z`), Widget Studio launcher, and Live Tiling preview toggle.
  - Primary **Save .rce** (`Ctrl+S`) button, `File & Export ▾` menu (Open, Import `.rce`/`.json`/Waybar, Full Rice Export, Package Download, Compatibility Inspector, Starter Presets, Asset Manager, Pairing Helper), and fullscreen **Preview**.
- **Categorized Component Panel (Left)**:
  - Collapsible categories: **System** (*Bar, Dock, Workspaces, Battery, Network, Volume, Brightness, Bluetooth, Notifications, Launcher, Power*), **Info** (*Clock, CPU, Memory, Memory Chart, GPU, Temperature, Disk, Uptime*), **Media** (*Music, Audio Visualizer*), and **Decor** (*Custom Widget, Text, Shape*).
  - Instant search filtering with shortcut badge (`Ctrl/Cmd+K`).
  - Collapse left panel into a minimalist icon-rail.
- **Collapsible Properties Panel (Right)**:
  - Scannable, collapsible sections with sensible defaults open and advanced controls collapsed.
  - Per-section **Reset** action to restore defaults quickly.
  - Color pickers paired with synchronized `#rrggbb` hex text inputs.
  - Collapse right panel to maximize canvas workspace.
- **Interactive Canvas**:
  - Pan & zoom (Space + drag, scroll wheel, floating zoom toolbar, fit to screen).
  - Floating toolbar with grouped actions, alignment tools, and shortcut tooltips.
  - Multi-select (`Shift+click`), resize handles, auto-snap guides, and container containment.

### 3. Live Hyprland Window Tiling Preview
- Toggle live mock windows directly inside the canvas to preview your real rice aesthetics:
  - Supports **Dwindle**, **Master**, and **Scrolling** layouts with live split ratio calculation.
  - Accurate workarea insets accounting for top/bottom/left/right status bars and docks.
  - Renders inner and outer gaps (`gaps_in` / `gaps_out`), window border sizes, solid or gradient active borders (`border_size`, `col.active_border`), window rounding (`rounding`), active/inactive opacity, background blur, and drop shadows.
  - Window animations (*slide*, *popin*, *fade*) with customizable speeds and replay controls.

### 4. Widget Neighborhood Studio
- Dedicated studio mode for authoring custom desktop widgets and decorative elements without limits.
- Bind properties to live data sources: Time, Date, CPU, RAM, Battery, Network, Music / MPRIS, and CAVA spectrum audio.
- CSS transitions, animations (Float, Pulse, Rotate, Glow, Slide, Fade), and multi-keyframe timeline animations.
- **Visual Logic**: Define conditional rules (e.g. change color, opacity, text, or animation when battery is low or CPU is high) without scripting.

### 5. Full Rice & Modular Export
- **Download Full Rice**: Generates a unified bundle containing:
  - Hyprland configuration (Lua or classic `hyprland.conf`).
  - Quickshell QML application or Waybar config & GTK CSS.
  - Theming for Kitty/Foot, Rofi/Wofi, SwayNC, Hyprlock, and GTK color fragments.
  - Embedded wallpapers (static images, gradients, or video live wallpaper via `mpvpaper`).
  - Project `.rce` file and local assets.
  - Safe `install.sh` script with `--dry-run` and automatic backup into `~/.config/ricing-town`.
- **Waybar Integration**: Bi-directional support — import existing Waybar `config` and `style.css` files, edit them visually, and export updated setups.
- **Hybrid Engine**: Route native bar modules to Waybar while rendering freeform floating widgets with Quickshell.

### 6. Live Companion Helper & Demo Mode
- **Demo Mode**: Safe in-browser simulation for quick prototyping without making system calls.
- **Live Mode**: Optional local companion helper (`npm run helper`) running on `127.0.0.1:5174`:
  - 6-digit pairing code authentication.
  - Streams real system metrics (CPU, RAM, Battery, Audio volume/mute, Network status, MPRIS media).
  - Power actions (Sleep, Reboot, Power off) require explicit two-step user confirmation.

---

## 🚀 Quick Start

### Prerequisites
- Modern web browser (Chrome, Chromium, Firefox, etc.)
- [Node.js](https://nodejs.org/) (v18 or newer recommended; zero npm dependencies required).

### Run the Visual Editor
```bash
# Clone the repository
git clone https://github.com/thmanmr976-dot/ricing-town.git
cd ricing-town

# Start the web editor server
npm start
```
Open **[http://127.0.0.1:5173](http://127.0.0.1:5173)** in your browser.

### (Optional) Run the Local Helper for Live Data
In a separate terminal window:
```bash
npm run helper
```
1. Click **File & Export ▾ → Pair helper** in the editor.
2. Enter the 6-digit pairing code shown in the helper terminal.
3. Switch data mode to **Live** to preview live desktop telemetry.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl / Cmd + S` | Save & download project `.rce` file |
| `Ctrl / Cmd + O` | Open file picker for `.rce` project |
| `Ctrl / Cmd + K` | Focus component search in left panel |
| `Ctrl / Cmd + Z` | Undo last change |
| `Ctrl / Cmd + Shift + Z` (or `Ctrl + Y`) | Redo last undone change |
| `Ctrl / Cmd + C` | Copy selected element(s) |
| `Ctrl / Cmd + V` | Paste copied element(s) |
| `Ctrl / Cmd + D` | Duplicate selected element(s) |
| `Ctrl / Cmd + A` | Select all elements |
| `Delete` / `Backspace` | Delete selected element(s) |
| `Space + Drag` | Pan canvas |
| `Scroll Wheel` | Zoom in / out canvas |
| `Shift + 1` | Fit canvas to screen |
| `Escape` | Deselect element / Exit full preview |

---

## 🧪 Testing

The test suite validates data schemas, project round-trips, layout computation, UI interactions, and exporter outputs:

```bash
# Run all unit and integration tests (60 Node.js tests + 10 Python tests)
npm test
```

---

## 📂 Architecture Overview

```
ricing-town/
├── dist/
│   ├── app.js                 # Editor layout, Start Screen, events, UI controllers
│   ├── catalog.js             # Component metadata, icons, applications, themes
│   ├── compatibility.js       # Compatibility engine for Quickshell & Waybar
│   ├── components.js          # Component behaviors, layout containment, calendar
│   ├── design.js              # Alignment, snapping, canvas transformations, colors
│   ├── editor-core.js         # History stack, bounding box math, resize handlers
│   ├── exporter.js            # Quickshell & package code generators
│   ├── hybrid.js              # Hybrid Quickshell + Waybar export pipeline
│   ├── hyprland.js            # Hyprland exporter & live tiling layout calculator
│   ├── index.html             # Shell layout (Start Screen, topbar, side panels, canvas)
│   ├── live-client.js         # WebSocket/HTTP client for local helper
│   ├── logic.js               # Visual logic condition evaluator
│   ├── model.js               # Project schema validation, migration, serialization
│   ├── neighborhood-studio.js # Fullscreen widget authoring studio
│   ├── presets.js             # Desktop presets (Neon Orbit, Paper Calm, Aurora Grid)
│   ├── safe-assets.js         # SVG & CSS sanitizers
│   ├── storage.js             # IndexedDB/localStorage storage & SVG thumbnail renderer
│   ├── style.css              # Design tokens, Figma-like layout, and theme styles
│   └── waybar.js              # Waybar importer and exporter
├── helper.mjs                 # Local companion helper for system telemetry
├── server.mjs                 # Zero-dependency local development server
└── tests/                     # Node.js and Python test suites
```

---

## 📄 License & Safety
- **Zero intrusive actions**: Exported configurations never overwrite your primary system configuration files without explicit confirmation (`--apply` defaults to copying to `~/.config/ricing-town` with automatic backup).
- **Sanitized assets**: Uploaded SVGs and scoped CSS are strictly sanitized to prevent code injection.
