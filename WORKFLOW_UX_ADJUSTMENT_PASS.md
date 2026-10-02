# Workflow / UX Adjustment Pass

This pass builds on the completed Advanced Infantry doctrine and consolidates deployment, construction-menu, and loadout usability without changing the nine-doctrine roadmap.

## Advanced Infantry corrections
- Elite loadouts cannot select the same weapon twice.
- Elite loadouts cannot select the same module twice.
- Duplicate choices are prevented in the picker UI and rejected again during loadout validation.
- Healing now restores 2% max HP/s.
- Immortal now restores 4% max HP/s.
- Healing + Immortal may coexist for 6% max HP/s total.
- Incendiary Zone remains at its intended 5% max-HP/s base damage, capped at 100 DPS before its existing SR upgrades.

## Ground military facility abstraction
- Military Base and Superior Mobilization Complex are both first-class ground deployment facilities.
- Named Exosuit loadouts are exposed as normal ground deployable definitions wherever ground availability is queried.
- Individual-facility deployment shows the exact inventory of the chosen Military Base or SMC.
- Global Ground deployment aggregates inventory across all eligible Military Bases and SMCs and automatically draws the requested records across them while preserving loadout identity.
- Theater Routine and relevant Scheduled Deployment availability/source checks use the shared ground-facility abstraction. Mixed conventional compositions may still stage production through a Military Base when a requested unit cannot be trained by an SMC.

## Deployment Global Overview
The deployment dialog now supports two browsing modes:
- **Global Overview**: choose Ground, Air, or Drone and see one aggregated inventory across all matching facilities. Actual deployment automatically consumes from eligible sources until the requested force is satisfied.
- **Facilities**: retain the precise per-facility view for players who want direct source control.

Ground aggregates Military Bases + SMCs, Air aggregates Airbases, and Drone aggregates Drone Hubs.

## Match-scoped deployment preferences
Within the current match the interface remembers:
- Global Overview vs Facilities mode;
- the last Global category;
- the last individual facility;
- Include Loyal Wingmen;
- Loyal Wingmen-per-aircraft value.

These preferences reset when a new match is created and are not written to browser persistence.

## Continuous Build
- The left construction menu includes a checkable Continuous Build option.
- When enabled, a successful placement keeps the same building selected for another placement.
- Temporary invalid placement or insufficient money does not silently exit build mode.
- `Esc` or the visible Cancel control explicitly ends placement mode.

## Construction menu organization
- Utility and Defense are separate cached submenus selected by top-level `[UTILITY] [DEFENSE]` controls.
- The last accessed submenu is remembered for the current match.
- The construction menu slides mostly off-screen when not hovered/focused, leaving a roughly 54-58 px visible handle so reopening it is easy rather than pixel-hunting.
- Focusing/using menu controls keeps it open.

## Selection panel
When no entity is selected, the right-side selection/detail panel is hidden completely rather than leaving an empty shell.

## Verification
The pass adds `tests/workflow-ux-smoke.js`, covering:
- SMC + Military Base ground-facility recognition;
- Exosuit availability from both facility types;
- actual multi-facility Global Ground deployment;
- loadout/variant identity preservation;
- match-scoped deployment preference restoration;
- Healing/Immortal values and Incendiary base rate;
- Utility/Defense tabs, Continuous Build wiring, the wide collapse handle, and empty-selection panel hiding.

All existing Advanced Infantry, Command Automation, Direct Energy, Missile, EW, UI/navigation, and deterministic architecture regression suites remain green after this pass.
