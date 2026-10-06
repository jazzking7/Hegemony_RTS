# Full-game multiplayer migration

The first online battlefield proved the lobby, transport, fixed server tick,
validation, reconnection, AI, snapshot rendering, and EC2 packaging. It is a
small vertical slice and is not feature-equivalent to the local skirmish.

The multiplayer target is now explicit: after Start, every human must enter the
existing Command Radius battlefield, own one of its normal commanders, and use
the same construction, production, deployment, research, aircraft, missile,
electronic-warfare, automation, and victory systems.

## Completed prerequisite

The classic game previously hardcoded the local player as commander `0` and
marked every other commander as AI. The runtime now accepts deterministic
network-session parameters:

```text
index.html?network=1&player=1&humans=0,1&commanders=3&map=large&seed=77
```

- `player` selects the commander controlled by this browser.
- `humans` prevents those commander seats from running AI logic.
- `commanders` selects the total number of human plus AI commanders.
- `map` applies the same Standard/Large world presets as local play.
- `seed` installs a shared deterministic random stream before game state is
  created.

Network sessions skip the local setup overlay, create the normal full game,
and focus the camera on the assigned commander's Capital. Local file play still
defaults to commander `0` and the existing setup screen.

## Remaining synchronization work

1. Define serializable commands for every human mutation point: construction,
   building actions, production/configuration, deployment, research, aiming,
   automation, upgrades, and voluntary removal.
2. Queue commands in the Colyseus room and release them with an authoritative
   simulation tick and monotonic sequence number.
3. Apply the same ordered command batch before the same fixed step in every
   game runtime; AI and randomness then remain deterministic under the shared
   seed.
4. Send periodic canonical hashes and recovery snapshots. Pause and repair a
   client when its hash differs rather than allowing silent divergence.
5. Add late join/reload reconnection, command-rate validation, match-end
   cleanup, and long-running multi-client desync tests.

The reduced multiplayer world remains available while this migration is under
construction. It should be removed from the player-facing flow only after all
human actions are represented by the command protocol and the full-engine
desync tests pass.
