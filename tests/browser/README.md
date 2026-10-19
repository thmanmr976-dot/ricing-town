# Sidebar browser regression

Start the editor with `npm start`, provide Playwright and its Chromium browser,
then run `npm run test:browser`. If Playwright is bundled outside this project,
set `PLAYWRIGHT_MODULE` to its package directory. `PLAYWRIGHT_BROWSERS_PATH` and
`RICING_URL` can override the browser cache and editor URL.

The test imports `staged/current.rce` (Paper Calm) through the Open control in
isolated browser contexts. It leaves the source project and the user's browser
storage untouched. It checks actual pointer hit-testing, motion from the right,
workspace and power controls, leaving/reopening, three viewport sizes, clean
preview, Design dragging/undo and autosave/reload. A synthetic 30 Hz helper stream
exercises Live updates without connecting to or controlling the desktop.

Screenshots and measured positions are written to `verification/sidebar/`.
Use `--compare-before` to also reproduce the original guide-layer interception
using the saved `verification/sidebar-before` app/CSS snapshot.
