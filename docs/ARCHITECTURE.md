# Command Radius — Runtime Architecture

This build intentionally remains a dependency-free classic-script web game so `index.html` can still be launched directly from disk. The old monolithic `game.js` has been split by responsibility without changing simulation order or gameplay semantics.

## Load model

`index.html` loads classic scripts in explicit dependency order. Do not convert these files to ES modules unless the launch/deployment model is intentionally changed later.

## Module ownership

### `js/config/`
- `definitions.js` — world constants, balance constants, building/unit definitions.
- `research.js` — doctrine, SR and OU definitions plus research-facing element references.

### `js/core/`
- `metadata.js` — definition tags/capabilities/status metadata.
- `core-systems.js` — modifiers, research runtime, statuses, generic stat resolution and shared utilities.
- `state-lifecycle.js` — game state, entity creation, persistent unit identities, containment/storage/Capital Reserve, facility lifecycle.
- `setup.js` — skirmish reset/start layouts and starting bases.

### `js/systems/`
- `navigation.js` — spatial hash, exact corridor checks, coarse A*, path data.
- `camera.js` — coordinate conversion, zoom and camera movement.
- `building-placement.js` — placement validation and construction.
- `deployment.js` — A-key deployment flow and deployment execution.
- `command-automation.js` — Focused Mission, Scheduled Deployment, Advanced Coordination Center Bandwidth and persistent Automated Warfare routines.
- `electronic-warfare.js` — directional EW emitters, Radar detection/vulnerability, Jamming modifiers/shutdown and temporary Spoofing order overrides.
- `economy-production.js` — income, settlement upgrades, queues, training, Hive production/modes.
- `special-units.js` — Fortress builders/garrison, Advanced Engineers, Loitering Munitions, Loyal Wingmen.
- `unit-movement.js` — general unit updates, path requests, corridor steering, stuck recovery, spatial rebuild/compaction.

### `js/combat/`
- `combat-projectiles-aircraft.js` — targeting, damage, projectiles, AA, flares, Bombers, Fighters, Paratrooper planes and shared air-combat behavior.

### `js/ai/`
- `ai.js` — AI economy, construction, research specialization/diversification, unlocked-content adoption, training, threat response and attacks.

### `js/ui/`
- `ui-construction.js` — build/selection/configuration DOM construction.
- `research-ui.js` — research modal/tree rendering and live progress.
- `input-hud.js` — HUD refresh and keyboard/pointer input handlers.

### `js/render/`
- `rendering.js` — all Canvas battlefield/minimap/entity/effect rendering.

### `js/runtime/`
- `update.js` — authoritative fixed-step simulation ordering.
- `events.js` — DOM event wiring and optional `?debug=1` test/debug API.
- `loop.js` — requestAnimationFrame driver, 30 Hz fixed-step accumulator and HUD cadence.

## Simulation ordering

`runtime/update.js` is intentionally small and should remain the canonical simulation order. Changing that order can change gameplay even when individual functions are unchanged.

Current fixed-step order:

1. camera / marker state
2. invalid-state cull
3. spatial hashes
4. path requests
5. economy
6. research
7. production
8. command / automation routines
9. engineering complexes
10. Hives
11. Fortresses
12. AI
13. electronic warfare
14. building combat
15. statuses
16. units
17. projectiles
18. effects
19. dead-entity compaction

## Multiplayer direction

The modular split is preparation, not yet a networking rewrite. The desired future boundary is:

`UI -> serializable command -> authoritative simulation -> state/snapshot -> renderer`

For a future Flask/Socket.IO backend, simulation modules should migrate server-side before UI/render modules. Avoid putting new authoritative game rules directly inside DOM event callbacks; put them in simulation functions that the UI calls.

## Rules for future development

- Preserve the fixed-step simulation order unless deliberately changing behavior.
- Put balance/data in `config`, not scattered conditionals.
- Reuse tags/capabilities/modifiers/statuses instead of growing type-specific checks where practical.
- Keep rendering/UI non-authoritative.
- Keep random game behavior centralized/controllable when new randomness is added so server-authoritative or deterministic testing remains possible later.
- Run `node tests/regression.js` after changes.
