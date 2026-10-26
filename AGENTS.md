# Ricing Town agent instructions

Project path: `/home/omer787/Documents/Codex/2026-10-24/files-pasted-by-the-user-codex/ricing-town-desktop`

Ricing Town is a native Python/PySide6 design studio for Hyprland. Read `README.md`, `docs/RICE.md`, and the relevant source before changing behavior. The user wants imported Rice designs to feel like editable parts of the same desktop composition, including widgets, bars, islands, icons, colors, and placement.

- Keep all source changes inside this project. Runtime caches and saved designs may use Ricing Town's own state directory. Do not rewrite the user's Hyprland configuration, run downloaded setup scripts, or install Rice dependencies automatically.
- Preserve the original downloaded package. Apply edits only to the app-owned runtime copy and keep an easy way to undo or reset them.
- Be honest about support: do not label a QML capability fully editable when only a shared component transform is available. Account for repeated instances and runtime-generated elements.
- Prefer focused, reviewable changes to the existing PySide6 application. Keep the editor usable at 1366×768 and in floating Hyprland windows.
- Run `PYTHONPATH=src QT_QPA_PLATFORM=offscreen python3 -m unittest discover -s tests -q` after implementation. Test real user behavior rather than mirroring the code. If possible, verify original Rice still launches in isolated mode.
- Coordinate editing work with other agents by using separate files or waiting for their output. Do not overwrite another agent's changes.

The concrete Codex implementation assignment is in `docs/CODEX_IMPLEMENTATION_TASK.md`. The Gemini 4 Argon research and design assignment is in `docs/ARGON4_DESIGN_TASK.md`.
