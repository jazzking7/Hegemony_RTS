# Multiplayer development

The `early_local_dev` branch contains a playable multiplayer vertical slice. It
adds a Colyseus server, private room codes, invite links, ready state,
host-owned match settings, a guarded Start button, a shared countdown,
automatic reconnect handling, and a server-owned 30 Hz battlefield.

Online commanders begin with a Capital, five Infantry, one Tank, and shared
map visibility. They earn funds, train units, select formations, issue
attack-move orders, fight human or server-controlled AI commanders, eliminate
enemy Capitals, and receive one authoritative victory result. The client
renders interpolated 10 Hz snapshots from the 30 Hz simulation and never sets
money, ownership, damage, health, or victory itself.

This online mode is intentionally smaller than the mature local skirmish. The
local mode's construction catalog, stored-unit deployment, research doctrines,
aircraft, missiles, automation, electronic warfare, and specialist systems
remain local while they are extracted behind serializable server commands.
The active feature-parity work and completed multi-seat runtime foundation are
tracked in `docs/FULL_GAME_MULTIPLAYER_MIGRATION.md`.

## Run locally

Node.js 22 or newer is required.

```text
npm install
npm run dev
```

Open `http://localhost:2567/online.html`. Create a room in one browser and join
its room code or invite URL in another. The original local game remains
available at `http://localhost:2567/` and can still be opened directly from
`index.html` without Node.js.

Do not open `online.html` directly as a `file:///` URL. Browsers block its ES
module and networking client in that mode. If it is opened directly, the page
now disables lobby actions, explains how to start the server, and keeps the
Back link pointed at the local `index.html` instead of the drive root.

Battlefield controls:

- Left click or drag selects owned units.
- Right click issues a formation move/attack-move order.
- WASD or arrow keys pan; the mouse wheel zooms; middle-drag pans directly.
- Space selects every owned unit.
- `1` trains Infantry for $50 and `2` trains a Tank for $140.

Useful checks:

```text
npm run build
npm run test:all
npm run test:lobby-live
```

`test:lobby-live` expects the server to already be running on port 2567. Set
`MULTIPLAYER_URL` when testing a different endpoint.

## Run on one EC2 instance

The included container serves the static game and WebSocket server from one
process and one port:

```text
docker compose up -d --build
docker compose ps
```

For an internet-facing deployment, put Nginx or an AWS Application Load
Balancer in front of port 2567, terminate TLS there, and proxy both HTTP and
WebSocket upgrade requests to this service. Keep port 2567 private to the EC2
security group and expose only ports 80 and 443 publicly.

This version keeps lobby and match state in server memory. A service
restart ends active rooms. That is suitable for one EC2 instance during early
development. Redis becomes useful only when rooms must span multiple server
processes or instances. A database is not needed until accounts, statistics,
match history, or durable progression are added.

## Server boundary

The client sends intent messages such as ready, map selection, AI count, and
start. The room validates them and broadcasts canonical state. Clients never
choose the host, player seat, phase, or start time.

The continuing migration should move one complete local-game subsystem at a
time behind the same boundary:

1. Add server-validated construction placement and production queues.
2. Migrate the existing economy, stored-unit deployment, and building combat.
3. Move research and doctrine modifiers, followed by aircraft and special
   systems, using shared pure rule functions.
4. Replace whole-world 10 Hz snapshots with interest-filtered deltas as entity
   counts approach the local mode's 1000-entity ceiling.
5. Add command sequence acknowledgements, persistent reload reconnection,
   match cleanup, and load tests before opening the server publicly.

Do not network the current browser simulation by mirroring its mutable globals.
Extract pure state transitions first; otherwise every client becomes a second
authority and desynchronization or cheating is unavoidable.
