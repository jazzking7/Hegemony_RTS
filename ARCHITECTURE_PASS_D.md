# Architecture Pass D — Modularization / Stabilization

## Goal

Break the ~474 KB `game.js` monolith into maintainable responsibility-based classic scripts while preserving all behavior and preserving direct double-click `index.html` launching.

## Baseline

Air Dominance Fix 2:
- baseline `game.js` SHA-256: `198806f56033e260ecbfe40d10641971f58409e16ba5a3341e826e4a9f64868c`
- baseline ZIP SHA-256: `fdcdac6de006cf54397a270ee2fa55b953094c3e75d9ef3c4b2f650896bc5be0`

## Changes

- Replaced the monolithic runtime with 22 responsibility-based classic-script modules under `js/`.
- Preserved the exact original load/execution ordering through explicit script tags in `index.html`.
- Kept the project dependency-free and compatible with direct `file://` launching.
- Moved historical implementation notes under `docs/history/`.
- Added `docs/ARCHITECTURE.md` and `docs/TESTING.md`.
- Added permanent Node regression harness under `tests/`.
- Hoisted the static 8-direction A* neighbor table out of `NavigationGrid.findPath()` so path searches no longer recreate that array on every request. Neighbor ordering/numeric values are unchanged.

## Behavioral validation

Before the small A* allocation optimization, concatenating the extracted module bodies in load order reproduced the original monolith body byte-for-byte.

A seeded 200-second skirmish was then executed in both:
- the untouched Air Dominance Fix 2 monolith; and
- the modular Architecture Pass D runtime.

The meaningful simulation snapshot matched exactly: time, players/economy, buildings, units, HP, positions, orders, queues, projectiles, effects and live entity counts.

After the A* allocation cleanup, the same direct baseline comparison still matched exactly.

Permanent regression suite also passes.

## Deliberately not changed

- no balance changes;
- no AI behavior changes;
- no update-order changes;
- no rendering redesign;
- no pathfinding/collision behavior changes;
- no research/doctrine changes;
- no conversion to frameworks, npm, TypeScript, ES modules or a server.
