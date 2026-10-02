# AI Macro / Large Map Pass

This pass fixes the macro regression introduced by the previous AI humanization work and adds an optional battlefield with 50% larger dimensions.

## Root-cause fix

The previous AI savings model could deadlock itself:

- the cost of the next desired structure was reserved,
- then that same reserve was added again to the affordability test for buying the structure,
- research/training/upgrades could repeatedly spend the small amount above the reserve,
- so the AI could hover below its own purchase threshold for long periods.

The macro budget now protects a small completion buffer and does not double-count the target purchase itself.

## Macro behavior

Economy/building decisions remain fast. Humanization is applied only to major offensive orders.

- Economy and construction planners run roughly once per second when not under heavy pressure.
- The opening economy expands to several Cities quickly.
- Megacity savings are protected from cheap upgrades/training until the purchase completes.
- Megacities are deliberately repeated until the current economic target is satisfied.
- Defense demand scales with income and game time.
- Defense anchors can be the Capital or valuable settlements.
- Rich researched AIs immediately convert unlocked doctrines into real infrastructure.
- Military Base and Airbase counts scale upward with sustained income.
- Research remains important but no longer gets first claim on every cash packet.
- An anti-idle watchdog forces a macro reevaluation if a solvent AI has not built/upgraded for too long.

AI commanders also have light macro personality biases (growth, fortress, balanced, pressure) so they do not all use identical economic/defensive pacing.

## Offensive pacing

Major attack orders remain humanized rather than machine-gunned:

- successful major waves are followed by a personality-dependent regroup/reassessment delay,
- failed/no-force attack checks retry sooner,
- defensive reactions, production and economy are not slowed by this attack cadence.

## Debug telemetry

Debug mode exposes `getAIMacroTelemetry(player)`, including:

- current personality,
- money and income,
- settlement/defense counts,
- last macro action and timestamp,
- current macro idle duration,
- last build-placement failure,
- current major-attack timer.

This is intentionally debug-only and does not add normal gameplay UI clutter.

## Map size

Battle Setup now offers:

- **Standard:** 3600 × 2200 world units.
- **Large:** 5400 × 3300 world units.

Large therefore increases both dimensions by exactly 50% (2.25× total area). Starting layouts scale with the map dimensions, so commanders are meaningfully farther apart rather than merely receiving empty space on one edge.

Spatial hashes, pathfinding grids, minimap/world rendering, coordinate clamping and camera bounds use the selected world dimensions.

## Regression coverage

`tests/ai-macro-map-smoke.js` covers:

- exact Standard/Large world dimensions,
- navigation-grid resizing,
- scaled starting locations,
- large-map Megacity/economy/defense growth,
- macro-action activity,
- cash-rich doctrine-facility adoption.
