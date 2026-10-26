# Codex implementation task

Work in `/home/omer787/Documents/Codex/2026-10-24/files-pasted-by-the-user-codex/ricing-town-desktop`.

Develop the existing Ricing Town desktop application. Start by inspecting `src/ricing_town/rice.py`, `rice_runner.py`, `rice_layout.py`, `rice_ui.py`, `ui.py`, and the tests. Make imported Rice designs editable within the main desktop studio rather than treating them as a separate launcher. Implement a concrete, reviewable improvement now; do not stop at a plan.

Priorities:

1. Improve the imported Rice editing flow: show original Rice components beside owned widgets in the main layer/design controls; allow clear selection, movement, size adjustment, reset, and visible feedback. Distinguish one component used many times from an individual instance.
2. Make importing varied Rice repositories more reliable. Detect supported Quickshell and Waybar entry points and present features, wallpapers, palettes, and runtime requirements clearly. Add a compatibility report when a repository uses unsupported engines such as AGS or Eww rather than pretending it can run.
3. Keep execution safe and reversible: imported source immutable, isolated preview as the default, app-owned runtime workspaces, no setup scripts or writes to user dotfiles. Preserve stop/restart behavior and existing widget/Waybar features.
4. Refine the editor UI only where it supports the above workflows. Keep controls understandable for people who do not know QML. Add focused tests and update README with exact capabilities and limits.

Run the test command in `AGENTS.md` and report what changed, what was verified, and what remains unsupported. Avoid editing `docs/ARGON4_DESIGN_TASK.md` or any Argon design output while that design assignment is active.
