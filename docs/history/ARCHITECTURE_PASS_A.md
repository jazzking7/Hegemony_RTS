# Architecture Pass A

This pass introduces reusable architecture underneath the existing RTS without intentionally changing gameplay balance or user-facing behavior.

## Baseline

- Source ZIP SHA-256: `18d3fad7e04d3cd037c84dad377318720f3b6066bbc2084bab0915624b4c7392`
- Baseline `game.js` SHA-256: `d0e0c6bfe42187330fbb841f44b1d9fdd50f7003b16973b66daaa7f405d8501b`
- Architecture Pass A `game.js` SHA-256: `aa4924fd6204b0c4d0e5ecd88c1e09ba27e5e068bdfba99c630e2c098f40b121`

## Added foundations

### Definition metadata

Existing `BUILDINGS` and `UNITS` definitions now expose lightweight `tags` and `capabilities` metadata. Existing gameplay code is intentionally left in place for now. New systems can gradually query metadata instead of adding more repeated type-specific conditionals.

Examples:

- Tank / SPG: `mechanized`
- Basic / Elite: `infantry`
- Bomber: `air`, `aircraft`, `reusable-aircraft`
- Military Base: `production`, `ground-production`, `storage`
- Airbase: `air-production`, `storage`
- Military Command Center: `command`, `unique`

No unconfirmed armor/penetration semantics are activated in this pass.

### Cached modifier pipeline

Players and entities now support named modifier sources. Modifiers support:

- `add`
- `multiply`
- `override`
- lower/upper clamps
- optional filtering by entity kind, type, required tags, or any matching tag

Resolved values are cached and invalidated only when a modifier source changes.

The Military Command Center is the first existing mechanic migrated to this system. While one is alive, it contributes a `trainingTimeMultiplier × 0.70` modifier. Destroying/removing it unregisters that modifier immediately.

`getTrainingMultiplier(playerId, unitType)` now resolves through this modifier pipeline, preserving the exact existing 30%-faster training behavior while allowing future doctrine modifiers to target categories such as `mechanized`.

### Status lifecycle

Entities now have a generic status container with reusable helpers:

- apply status
- remove status
- query active status
- query remaining duration
- tick/expire statuses

Default behavior for the implemented `stunned` status is **refresh, not magnitude stacking**. Reapplying a 2-second stun while 1.5 seconds remain resets it to 2 seconds; it does not become 3.5 seconds.

The legacy numeric `unit.stunned` field remains as a synchronized compatibility/debug mirror, but gameplay behavior now queries the status system.

### Existing crowd control migrated

The current baseline Mortar still applies its existing full 2-second stun. This pass does **not** silently change it to the intended future `Slow -40% for 2s` design note.

The existing Landmine 0.35-second stun is also routed through the status system.

Status ticking happens after building combat and before unit behavior. This preserves the old fixed-step timing for Landmines while also preserving Mortar projectile timing.

## Deliberately not implemented yet

This pass does not add:

- Doctrinal Research / Specialized Research / Onsite Upgrades
- new Doctrine content
- APC / IFV
- Endurance / Payload
- new air mission states
- Capital reserve / generic contained-unit lifecycle
- Super Infantry loadouts
- armor / armor penetration behavior
- intended Mortar Slow / upgraded Immobilize behavior
- Electronic Warfare statuses

Those systems can now be built on top of the new primitives without first restructuring existing combat/training logic.

## Regression checks completed

- `node --check game.js` passes.
- Modifier metadata lookup verified.
- Military Command Center lifecycle verified: training multiplier `1.00 -> 0.70 -> 1.00` across create/destroy.
- Training timing verified: Basic Soldier completes after the same effective `1.1 × 0.70 = 0.77s` time.
- Status refresh behavior verified: repeated same status refreshes duration without stacking magnitude/duration additively.
- Generic damage-to-status path verified.
- 40-second fixed-step simulation smoke test passes with no invalid live HP and no entity-count drift.
- Seeded deterministic 200-second simulation compared against the untouched baseline and produced an identical gameplay snapshot: player state, money, AI progression state, live building/unit identities, HP, positions, orders, storage, queues, projectiles, and effects all matched.

## Next architectural pass

Architecture Pass B should introduce the research state model:

1. player research slots
2. active/completed research records
3. Doctrine Research (DR)
4. Specialized Research (SR)
5. per-entity Onsite Upgrade (OU) records
6. unlock checks separated from mechanic behavior
7. Capital limited research capacity
8. future doctrine-locked Research Center slot contribution

The goal remains incremental migration rather than a rewrite.
