# Full-game multiplayer

The lobby now starts the existing Command Radius game rather than the reduced
multiplayer prototype. Every browser receives a normal commander seat and runs
the same construction, economy, research, production, deployment, aircraft,
missile, electronic-warfare, directed-energy, automation, AI, combat, and
victory systems used by local skirmish.

## Match startup

After every human readies and the host presses Start, the lobby assigns each
browser a seat and opens a deterministic network session:

```text
index.html?network=1&room=ROOM&player=1&humans=0,1&commanders=3&map=large&seed=77
```

- `player` is the commander controlled by this browser.
- `humans` prevents human seats from running local AI.
- `commanders` is the total number of human plus AI commanders.
- `map` selects the existing Standard or Large world.
- `seed` initializes the shared deterministic random stream before setup.

The lobby stores the Colyseus reconnection token in session storage. The full
game page uses it to reclaim the same room and commander seat after navigation.

## Synchronization model

The Colyseus room owns the 30 Hz match clock and the canonical command order.
Human actions are serialized, assigned a monotonic sequence number and a future
simulation tick, and broadcast to every browser. Each browser applies that
ordered batch immediately before the same fixed update. AI and random outcomes
therefore advance from the same initial state and seed.

The command bridge covers player-visible simulation mutations, including:

- placement, voluntary demolition, settlement and onsite upgrades;
- unit, convoy, drone, engineer, and advanced-infantry production;
- research and vehicle, aircraft, passenger, convoy, and loadout configuration;
- ground, air, drone, scheduled, and automated deployments;
- EW headings, missile silos and launches, energy controls and orbital strikes;
- hive modes, engineering automation, and synchronized pause state.

The room retains the complete command history for the match. A browser that
finishes loading later requests that history before catching up to the current
server tick.

## Validation

```powershell
npm run build
npm run test:game
# with npm run dev active in another terminal
npm run test:lobby-live
```

`test:lobby-live` creates two clients, starts a full-engine match, and verifies
that both receive the same descriptor, clock, player seat, sequence, and command.

Periodic state hashes and recovery snapshots are the next hardening step for
long internet sessions. The current command lead time absorbs ordinary EC2
latency, while deterministic replay handles normal page-load and reconnect gaps.
