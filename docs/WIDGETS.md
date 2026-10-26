# Widget format v1

An export is UTF-8 JSON with exactly `format`, `version` and `widgets`:

```json
{
  "format": "ricing-town-widget",
  "version": 1,
  "widgets": [{
    "id": "my-note", "name": "My note", "x": 80, "y": 80,
    "width": 320, "height": 180, "background": "#202331",
    "radius": 24, "monitor": "", "elements": [{
      "id": "title", "kind": "text", "source": "text", "text": "Hello desktop",
      "x": 20, "y": 20, "width": 280, "height": 80,
      "size": 24, "color": "#eff1f5", "radius": 8
    }]
  }]
}
```

Kinds: `text`, `shape`, `progress`. Sources: `text`, `time`, `date`, `day`,
`calendar`, `battery`, `memory`, `cpu`, `disk`, `media`. Shapes use color/radius;
progress uses the source's percentage; text displays either literal text or source text.
All source names select built-in providers. There is no expression language.

Coordinates and dimensions are integer logical pixels. Widget dimensions are
80–1600; element dimensions 1–1600, font size 8–160. Colors are `#RRGGBB`.
Ids contain only letters, numbers, hyphens and underscores; imports generate new ids
to avoid collisions. Elements beyond their parent's bounds are clipped. Element order
is back-to-front. Monitor is an output name; imports adopt the currently selected output.

Maximum file size: 1 MB; 40 widgets; 32 elements per widget. Unknown fields, wrong
types, invalid values, executable formats and unsupported format versions are rejected.
No extraction, script execution or external resource fetching occurs. Export writes
atomically with user-only permissions. Canceling import leaves the scene unchanged.

Data is read from `/proc`, `/sys/class/power_supply`, home filesystem usage, the
local clock and optional `playerctl`. Missing services show an unavailable status.
Live readings are never embedded in exported templates. The desktop renderer reads
app-owned `readings.json`, refreshed once a second, through Quickshell FileView.
Only trusted QML supplied by the application is executed.
