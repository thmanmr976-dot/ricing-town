"""Waybar entry point: fixed workspace operations, supporting Lua and legacy Hyprland."""
import argparse
import json
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("number", type=int, choices=range(1, 6))
    parser.add_argument("--activate", action="store_true")
    args = parser.parse_args()
    if args.activate:
        result = subprocess.run(["hyprctl", "dispatch", f"hl.dsp.focus({{workspace={args.number}}})"], capture_output=True, text=True, timeout=2)
        if result.returncode or result.stdout.startswith("error:"):
            subprocess.run(["hyprctl", "dispatch", "workspace", str(args.number)], check=True, timeout=2)
    else:
        try:
            result = subprocess.run(["hyprctl", "activeworkspace", "-j"], capture_output=True, text=True, check=True, timeout=2)
            active = json.loads(result.stdout)["id"] == args.number
            print(json.dumps({"text": str(args.number), "class": "active" if active else "inactive", "tooltip": f"Workspace {args.number}"}))
        except (OSError, ValueError, KeyError, subprocess.SubprocessError):
            print(json.dumps({"text": str(args.number), "class": "unavailable", "tooltip": "Hyprland unavailable"}))


if __name__ == "__main__": main()
