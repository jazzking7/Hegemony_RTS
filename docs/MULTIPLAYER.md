# Multiplayer development

The `early_local_dev` branch adds private room codes, invite links, commander
seats, ready state, host-owned match settings, a shared countdown, and the full
Command Radius game behind one Colyseus service.

## Run locally

Node.js 22 or newer is required.

```text
npm install
npm run dev
```

Open `http://localhost:2567/online.html`. Create a room in one browser and join
its room code or invite URL in another. Everyone selects Ready; the host presses
Start; every browser opens the original game in its assigned commander seat.

Local skirmish remains at `http://localhost:2567/` and can still be opened from
`index.html` without Node.js. Multiplayer must use the HTTP URL because browsers
block modules and WebSockets from `file:///` pages.

Useful checks:

```text
npm run build
npm run test:game
npm run test:lobby-live
```

`test:lobby-live` expects `npm run dev` to be active on port 2567. Set
`MULTIPLAYER_URL` when testing another endpoint.

## Run on one EC2 instance

The included container serves the game, lobby, and WebSocket room from one
process and one port:

```text
docker compose up -d --build
docker compose ps
```

For an internet-facing deployment, put Nginx or an AWS Application Load
Balancer in front of port 2567, terminate TLS there, and proxy both HTTP and
WebSocket upgrade requests to the service. Keep port 2567 private to the EC2
security group and expose ports 80 and 443 publicly.

Lobby and active-match data live in server memory. A service restart ends active
rooms, which is appropriate for a single EC2 instance during development. Redis
is only needed when rooms must span multiple processes or instances. A database
is only needed for accounts, statistics, match history, or durable progression.

## Synchronization boundary

The server assigns the host, seats, phase, map, AI count, seed, fixed clock, and
canonical command sequence. Browsers run the complete deterministic simulation
and apply each ordered human command before its assigned 30 Hz tick. The room
keeps command history so a page that loads later can replay and catch up.

See `docs/FULL_GAME_MULTIPLAYER_MIGRATION.md` for the command coverage and
hardening notes.

## Optional Secret Agendas

The host can enable Secret Agendas in Victory Mode. These matches run the full game on the server and send private objectives only to their owner. Classic mode keeps its existing command synchronization. See [Secret Agendas](SECRET_AGENDAS.md) for rules, authority, reconnect behavior and testing.

### Updating a live server

Deploy the browser files and server together. `npm start` runs compiled files in
`dist`; pulling source changes alone does not update that code or the running process.
For a direct Node deployment, run `npm ci` and `npm run build`, then restart the
service using your process manager. For Docker Compose, run
`docker compose up -d --build`; `docker compose restart` alone uses the old image.

After deploying this fix, `/health` should include `"secretAgendas":true`.
Refresh the lobby page and create a new room. An older server receiving
`set_agendas` can disconnect the host with the reason
`room onMessage for "set_agendas" not registered.` The lobby now disables the
mode selector when the connected room does not advertise agenda support, and
displays disconnect codes and reasons to help diagnose other failures.
