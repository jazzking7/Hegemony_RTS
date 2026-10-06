# Multiplayer development

The `early_local_dev` branch contains the first multiplayer slice. It adds a
Colyseus server, private room codes, invite links, ready state, host-owned match
settings, a guarded Start button, a shared countdown, reconnect handling, and a
server-owned 30 Hz match clock.

The existing RTS simulation is still local. Starting an online match currently
proves the full lobby-to-match handoff and opens the authoritative session; it
does not yet synchronize battlefield units or combat. This boundary is
intentional so gameplay can move to the server without rewriting the working
single-player mode all at once.

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

This first version keeps lobby and match state in server memory. A service
restart ends active rooms. That is suitable for one EC2 instance during early
development. Redis becomes useful only when rooms must span multiple server
processes or instances. A database is not needed until accounts, statistics,
match history, or durable progression are added.

## Server boundary

The client sends intent messages such as ready, map selection, AI count, and
start. The room validates them and broadcasts canonical state. Clients never
choose the host, player seat, phase, or start time.

The next implementation phase should move one deterministic skirmish slice at
a time behind the same boundary:

1. Extract a browser-independent simulation core and seeded map generation.
2. Give each human a server-assigned player ID and input-command queue.
3. Run economy, construction, production, AI, movement, combat, and victory on
   the server at the existing 30 Hz fixed step.
4. Send compact snapshots or deltas at 10-15 Hz while clients interpolate
   visuals and acknowledge command sequence numbers.
5. Add late-command rejection, input rate limits, reconnect snapshots, and
   match-end cleanup before opening the server publicly.

Do not network the current browser simulation by mirroring its mutable globals.
Extract pure state transitions first; otherwise every client becomes a second
authority and desynchronization or cheating is unavoidable.
