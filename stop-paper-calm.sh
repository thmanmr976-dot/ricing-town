#!/bin/sh
set -eu
instances=$(qs list --all 2>/dev/null || true)
pids=$(printf '%s\n' "$instances" | awk '
  /Process ID:/ { pid=$3 }
  /Config path:/ && /ricing-town-Paper-Calm-/ { if (pid ~ /^[0-9]+$/) print pid }
')
if [ -n "$pids" ]; then
  for pid in $pids; do kill -TERM "$pid" 2>/dev/null || true; done
  sleep 1
fi
hyprctl reload >/dev/null 2>&1 || true
if qs list --all 2>/dev/null | grep -q 'ricing-town-Paper-Calm-'; then
  printf '%s\n' 'Paper Calm is still running. Log out of the Hyprland session if this message remains.'
  exit 1
fi
printf '%s\n' 'Paper Calm stopped and the normal Hyprland configuration was reloaded.'
