#!/bin/sh
set -eu
instances=$(qs list --all 2>/dev/null || true)
pids=$(printf '%s\n' "$instances" | awk '
  /Process ID:/ { pid=$3 }
  /Config path:/ && /ricing-town-/ { if (pid ~ /^[0-9]+$/) print pid }
')
if [ -n "$pids" ]; then
  for pid in $pids; do kill -TERM "$pid" 2>/dev/null || true; done
  sleep 0.5
  for pid in $pids; do kill -KILL "$pid" 2>/dev/null || true; done
fi
for proc in /proc/[0-9]*; do
  pid=${proc#/proc/}
  [ "$pid" = "$$" ] && continue
  cmdline=$(tr '\000' ' ' < "$proc/cmdline" 2>/dev/null || true)
  case "$cmdline" in
    *"/ricing-town-"*) kill -TERM "$pid" 2>/dev/null || true ;;
  esac
done
hyprctl reload >/dev/null 2>&1 || true
if qs list --all 2>/dev/null | grep -q 'ricing-town-'; then
  printf '%s\n' 'Temporary rice is still running. Log out of the Hyprland session if this message remains.'
  exit 1
fi
printf '%s\n' 'Temporary rice stopped and the normal Hyprland configuration was reloaded.'
