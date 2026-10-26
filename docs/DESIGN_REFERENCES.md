# Visual references reviewed 2026-10-25

- [Delta Widgets](https://github.com/amaan-mohib/delta-widgets), GPL-3.0:
  reviewed README, `ss-creator.png`, and `ss-templates.png`. Inspiration: preview cards,
  pill-shaped clock, system status cards, element palette, centered design canvas,
  and contextual properties. No code, images, icons or templates copied.
- [UI Builder](https://github.com/olliethedev/ui-builder), MIT:
  reviewed README and the editor demo shown on [its site](https://www.uibuilder.app/).
  Inspiration: dark quiet chrome, selected-component outline, layer list, property
  inspector, clear canvas/toolbar hierarchy. Not used as a runtime or implementation.

Implementation is original Python/PySide6 with an app-owned Quickshell renderer.
The main window stays compact with right-side tabs. The larger composition dialog
uses element/layer controls, a dotted canvas, and a property inspector. The source
projects' React, Tauri, HTML/CSS and execution architecture are not adopted.

Available presets are working local components. Weather and audio visualization
are not shown as functioning presets because their services are not implemented.
