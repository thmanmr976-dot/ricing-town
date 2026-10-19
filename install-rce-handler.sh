#!/bin/sh
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
data_home=${XDG_DATA_HOME:-"$HOME/.local/share"}
mkdir -p "$data_home/applications" "$data_home/mime/packages"
cat > "$data_home/mime/packages/ricing-town.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info"><mime-type type="application/x-ricing-town"><comment>Ricing Town project</comment><glob pattern="*.rce"/></mime-type></mime-info>
EOF
cat > "$data_home/applications/ricing-town-rce.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Ricing Town Manager
Comment=Run or install a Ricing Town project
Exec=node $project_dir/rce-manager.mjs %f
Terminal=false
MimeType=application/x-ricing-town;
Categories=Settings;DesktopSettings;
EOF
command -v update-mime-database >/dev/null && update-mime-database "$data_home/mime" || true
command -v update-desktop-database >/dev/null && update-desktop-database "$data_home/applications" || true
echo "Ricing Town is now registered for .rce files."
