# Secret Agendas

Choose **Secret Agendas** in local setup, or have the multiplayer host select it
under Victory Mode. Capital destruction still eliminates a commander. Classic
mode retains its Capital-based victory rules.

Open **MY AGENDA** during a match for your objective, named targets and progress.
Objectives are randomly assigned. Duplicates are allowed except for Opportunist
and Annihilator (one each maximum). Assignments always contain a competing pair.
Blocs do not share victories. All objectives are evaluated together at the end
of each simulation step; the first winning step ends the match and all qualifying
living commanders win together. A living Opportunist joins those winners.

| Agenda | Objective |
| --- | --- |
| Expansionist | Strictly largest uncontested territorial area for 240 continuous seconds. A tie or loss of the lead resets progress. |
| Unifier | Every zone in the assigned region, uncontested, for 240 continuous seconds. |
| Fanatic | Three assigned zones, uncontested, for 240 continuous seconds. All Fanatics share at least one target. |
| Opportunist | Survive until another agenda completes, or become the sole survivor. Neutral in assignment conflicts except against Annihilator. |
| Warmonger | Personally deliver one Capital killing blow, or two in a five-commander match. |
| Bounty Hunter | All listed commanders eliminated, regardless of killer. One target with 2–3 commanders; two with 4–5. |
| Pacifist | 900 continuous seconds with no elimination. First death resets the timer; a second death immediately eliminates the Pacifist. Agenda failures count as deaths too. |
| Starchaser | Capture each assigned target within 480 seconds. Six completed chases win; owning every zone also wins. Targets are selected from zones not currently owned; lost targets can recur. Timeout immediately eliminates the player. |
| Annihilator | Be the sole survivor, regardless of who killed opponents. All outgoing damage ×1.30, including starting forces and damage over time. Presence announced after 300 seconds without revealing identity. |

Timers use simulation time, so shared pause freezes them. A successful capture
on the deadline counts before timeout. Forced eliminations (including Pacifist
cascades) resolve before winners are collected. Eliminated commanders cannot win.

## Multiplayer authority and secrecy

Classic matches keep the existing synchronized command simulation. Agenda matches
run the complete game simulation in a server-owned VM (`AgendaMatch`), using the
same production scripts as offline play through `server/runtime/headless.cjs`.
The adapter supplies inert DOM/canvas APIs; it does not execute a render loop.

The server creates a separate cryptographically random assignment seed. Neither
that seed nor other players' agenda records/targets are sent to clients. A public
map seed remains available for the map. The public world codec uses an explicit
root-field allowlist, preserves Maps/Sets/object references and omits AI planning
state and modifier caches. Agenda records live outside that graph; Annihilator's
multiplier is applied privately when damage resolves, not as a public modifier.
Players can infer objectives from observable behavior, but cannot read opponents'
assignments from their browser's state or network messages.

The server executes orders at their assigned tick, validates actor/entity
ownership, and sends public state at 10 Hz (also after orders and at match end).
Clients render that state, interpolate unit movement, and send commands without
simulating agenda matches. Each connection receives only its own private agenda
and order results. Reconnect sends the latest world and private progress, without
replaying secret assignments or trusting client-reported objective progress.

Full-state snapshots trade bandwidth for correctness and privacy. This initial
implementation does not use snapshot deltas; large armies and concurrent rooms
need deployment-specific bandwidth/CPU profiling. Rooms and secrets remain in
memory, as before; restarting the server ends them.

## Validation

`npm run test:all` includes the agenda rules, public-state round trip, command
ownership, damage multiplier and server integration tests. `npm run test:lobby-live`
checks classic lobbies against a running server. Use `npm run test:agenda-live` for the private
agenda variant, which checks private delivery, authoritative commands and reconnect.
