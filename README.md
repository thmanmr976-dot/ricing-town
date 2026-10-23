# Ricing Town · Visual Desktop Rice Studio for Hyprland

**Ricing Town** is a visual web-based editor for designing desktop "rice" setups (status bars, docks, floating widgets, wallpapers, window layouts, gaps, borders, workspaces, and animations) for **Hyprland**, similar in spirit to Figma.

Design visually in your browser, test interactively with live window tiling previews or simulated telemetry, and export production-ready packages for **Quickshell**, **Waybar**, or a complete **Full Rice** configuration.

---

## 🚀 What's New in Recent Releases

### 🌟 Project Start Screen & Library Hub
- **Home Hub**: A welcoming start screen shown on launch and via the Top Bar **Home** button.
- **Recent Projects Grid**: Visual cards with dynamically generated SVG canvas thumbnails, resolution, layer counts, and last modified dates.
- **Card Actions**: Instant project loading, inline card renaming, duplicating, and safe project deletion with modal confirmation.
- **Start from Templates**: One-click starters including *Neon Orbit*, *Aurora Grid*, *Paper Calm*, and *Amethyst*.
- **Drag & Drop Import**: Drop `.rce` or `.json` projects directly into the app with automatic validation and error reporting.
- **Robust Storage**: Uses IndexedDB with transparent `localStorage` fallback and visible autosave indicator.

### 🎨 Figma-Inspired Editor Layout Overhaul
- **Streamlined Top Bar**: Replaced button clutter with a clean 3-zone layout:
  - Left: Home button, brand logo, inline project rename, and autosave status pill.
  - Center: Undo/Redo history buttons, Widget Studio launcher, and Live Tiling preview toggle.
  - Right: Primary `Save .rce` button, consolidated `File & Export ▾` menu, and fullscreen `Preview`.
- **Categorized Component Panel**:
  - Components grouped into collapsible sections: **System**, **Info**, **Media**, and **Decor**.
  - Real-time search filter with keyboard shortcut (`Ctrl/Cmd+K`).
  - Collapse left panel into a compact icon rail.
- **Collapsible Properties Panel**:
  - Organized into collapsible sections with sensible default states (frequently used sections open, advanced sections collapsed).
  - Per-section **Reset to defaults** button.
  - Dual-input color pickers with synced `#rrggbb` hex text inputs.
  - Panel collapse toggle to maximize canvas editing space.

### 🪟 Live Hyprland Window Tiling Preview
- Interactive mock windows simulating live Hyprland tiling behavior inside the canvas:
  - Supports **Dwindle**, **Master**, and **Scrolling** layouts with real-time split ratio adjustments.
  - Accurate screen workarea calculation factoring in status bars, docks, and panel margins.
  - Renders inner/outer gaps (`gaps_in` / `gaps_out`), borders (solid or gradient), corner rounding, active/inactive window opacity, background blur, and drop shadows.
  - Window entrance animations (*slide*, *popin*, *fade*) with adjustable speed and replay button.

### 🧩 Widget Neighborhood Studio
- Fullscreen authoring environment for custom widgets, cards, text banners, and decorative shapes.
- Direct telemetry data bindings: Time, Date, CPU, RAM, Battery, Network, MPRIS player, and CAVA audio spectrum.
- CSS transitions, animations (Float, Pulse, Rotate, Glow, Slide, Fade), and multi-keyframe timeline interpolation.
- **Visual Logic Engine**: Add condition-based visual rules (e.g., change color or trigger pulse when battery drops below 20%) without writing any code.

### 🔄 Waybar & Hybrid Rice Architecture
- **Bi-directional Waybar**: Import existing Waybar `config` and `style.css` files, edit them visually, and export clean modular Waybar configs.
- **Hybrid Rice Mode**: Automatically routes traditional status bar modules to Waybar while running custom floating widgets in Quickshell.

### 🖥️ Multi-Display Targeting
- Add and configure multiple monitors with Hyprland output names, custom resolutions, positions, scales, and primary flags.
- Target individual elements to specific displays or span across all connected screens.

---

## ✨ Core Features

| Feature | Description |
| :--- | :--- |
| **Canvas & Artboard** | Pan, zoom, fit to screen, snap to grid/edges, multi-selection, alignment, and auto-distribution. |
| **Component Catalog** | Status Bar, Dock, Workspaces, Clock, System Stats (CPU, RAM, GPU, Temp, Disk, Uptime), Audio, Network, Bluetooth, Battery, Notifications, Launchers, Power Menu, and Music Visualizer. |
| **Wallpapers & Styling** | Solid colors, multi-angle gradients, image wallpapers (PNG/JPEG/WebP), and live video wallpapers (`.mp4`/`.webm` with `mpvpaper`). |
| **Typography & Assets** | System fonts, custom TTF/OTF font upload, SVG icon embedding, and local asset manager with SHA-256 integrity verification. |
| **Hyprland Rules** | Visual editor for window rules (floating, centered, workspace assignments) and custom keyboard shortcuts. |
| **Live Companion** | Optional local Node.js daemon (`npm run helper`) providing real system metrics via WebSocket with pairing code security. |
| **Full Rice Export** | Complete downloadable archive with Hyprland Lua/conf configs, shell QML, Waybar configs, themes for Kitty/Foot/Rofi/SwayNC/Hyprlock, and safe `install.sh` (`--dry-run`). |

---

## 🗺️ Roadmap & Future Plans

We have exciting improvements planned for upcoming versions of Ricing Town:

### 🌟 Phase 1: Community & Preset Ecosystem
- [ ] **Community Rice Hub**: Browse, preview, and download community-shared rices directly within the editor.
- [ ] **One-Click Rice Sharing**: Export shareable short links or self-contained `.rce` bundles to share setups with the community.
- [ ] **Custom Template Library**: Save custom-built widgets and setups as reusable personal templates.
- [ ] **Tagging & Collections**: Organize projects on the Start Screen by tags (*Minimal*, *Nord*, *Catppuccin*, *Cyberpunk*, *Dual-Screen*) and search query.

### ⚡ Phase 2: Enhanced Editor & Visuals
- [ ] **GLSL Shader Backgrounds**: Visual picker and preview for interactive GLSL animated background shaders.
- [ ] **Advanced Animation Curve Editor**: Visual cubic-bezier curve editor for custom window and widget transition timing.
- [ ] **Unified Color Theme Generator**: Generate complete color palettes from wallpaper dominant colors (using Material You / Pywal algorithms).
- [ ] **Batch Project Backup**: Export and import an archive containing all local projects and assets in a single `.zip`.

### 🐧 Phase 3: Expanded Linux & Compositor Support
- [ ] **Additional Wayland Compositors**: Extend export targets to support **Niri**, **Sway**, and **River**.
- [ ] **System Auto-Discovery**: Companion helper automatically detects installed terminal emulators, app launchers, and notification daemons to tailor exported configs.
- [ ] **Agnostic Bar Exporters**: Direct export support for additional bars such as **Eww** and **Ags (Aylur's GTK Shell)**.
- [ ] **Live Hot-Reload CLI**: Apply rices to a running Hyprland session in real time with instant rollback capabilities.

---

## 🚀 Quick Start

### Prerequisites
- Modern web browser (Chrome, Chromium, Firefox, etc.)
- [Node.js](https://nodejs.org/) (v18 or newer recommended; zero external npm dependencies required).

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

The automated test suite verifies schema integrity, migrations, visual logic, layout calculation, UI interactions, and packaging:

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
