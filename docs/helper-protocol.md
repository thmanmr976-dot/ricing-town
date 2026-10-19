# Ricing Town Helper protocol v2

The editor connects to `http://127.0.0.1:5174`. The helper accepts only the editor origins `http://127.0.0.1:5173` and `http://localhost:5173`, validates `Host`, and never enables wildcard CORS. Both processes must run on the same machine over loopback.

Start the editor with `npm start`, start the helper separately with `npm run helper`, then press **Pair helper** and enter the six-digit terminal code. Pairing returns a random bearer token stored in `sessionStorage`; it is not put in URLs, logs, `.rce` files, or exports. Restarting the helper invalidates the token and pairing code.

Requests carry `X-Ricing-Town-Protocol: 2`. Responses include a protocol version and structured errors `{error:{code,message}}`.

- `POST /v1/pair` body `{code}`: one pairing attempt succeeds per helper process.
- `GET /v1/capabilities`: detected commands and supported integrations.
- `GET /v1/snapshot`: timestamped audio, workspace, network, battery, and media state. Missing services return `available:false` and null values.
- `GET /v1/events`: authenticated NDJSON stream with an initial snapshot and ordered events. The client rejects duplicate sequence numbers and reconnects with exponential backoff and jitter while keeping the last data marked stale.
- `POST /v1/actions` body `{action,confirm}`: validates and executes one allowlisted action.

Action objects use `{type,params}`. Supported types are `launch`, `workspace`, `volumeSet`, `volumeStep`, `muteToggle`, `media`, and `power`. Launch actions choose an ID from the local registry; the helper never accepts an executable path, argument list, shell string, script, or arbitrary environment. Power actions require `confirm:true`, and the editor must request explicit confirmation immediately before sending it.

The helper runs as the current user, limits request bodies, applies command timeouts, and launches programs without a shell. It does not install software or change configuration. Hyprland uses `.socket2.sock`; audio uses `pactl subscribe`; networking uses `nmcli monitor`; batteries use `upower --monitor-detail`; and MPRIS uses `playerctl --follow`. A bounded 30-second snapshot remains as a missed-event fallback and is labeled `poll.fallback`.

## Browser and deployment constraints

The supplied editor is HTTP on loopback, so Chromium-family browsers can connect to the HTTP loopback helper without mixed-content blocking. If the editor is later hosted over HTTPS, browsers may block or gate local-network HTTP requests. Keep the editor local, or replace this transport with an authenticated native bridge or a loopback HTTPS endpoint whose certificate is explicitly trusted. Do not expose port 5174 on a LAN interface.

## Optional systemd user service

Copy `packaging/ricing-town-helper.service` to `~/.config/systemd/user/`, replace `__PROJECT_DIR__` with this project directory, then inspect it before running `systemctl --user daemon-reload` and `systemctl --user enable --now ricing-town-helper.service`. The project never runs these commands for you. Since each helper start creates a fresh pairing secret, pair again after a restart.
