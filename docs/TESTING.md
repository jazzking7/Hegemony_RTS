# Regression Testing

The game still has no runtime dependencies. The test harness uses Node's built-in `vm` module and a lightweight fake DOM/Canvas so simulation code can run headlessly.

Run:

```bash
node tests/regression.js
node tests/command-smoke.js
node tests/ew-smoke.js
node tests/workflow-ux-smoke.js
node tests/ai-macro-map-smoke.js
```

Current permanent coverage checks include:

- modular runtime boot and debug API availability;
- Capital baseline income, AI Military Base recovery, AI research progression and unlocked-content adoption;
- Capital/DR/SR research baseline constants;
- Armored 20% normal-damage reduction;
- lethal AA + companion homing-missile cleanup;
- Advanced Command & Automation research definitions, Focused modifiers, Scheduled training, ACC Bandwidth/initiation semantics and transport assault zones;
- Electronic Warfare research/geometry, Radar/Jamming/Spoofing effects, probability anti-stacking and a fully researched mixed-EW stress run;
- finite HP/position invariants over a seeded 200-second skirmish;
- a deterministic 200-second no-research state signature.

The deterministic signature is deliberately strict. If a future feature intentionally changes baseline gameplay, update the expected signature only after reviewing the state diff and confirming the change is intentional.

Architecture Pass D was also compared directly against the Air Dominance Fix 2 monolith under the same seeded 200-second simulation; the meaningful simulation snapshots matched exactly after modularization and the behavior-neutral A* allocation cleanup.

`tests/command-smoke.js` is the doctrine-focused integration suite. It additionally checks launch-based Scheduled timers, Mature War Front beginning on deployment #3, Paratrooper destination assault state, and a 180-second concurrent Theater/Aerial automation stress run.

`tests/ew-smoke.js` is the Doctrine 5 integration suite. It checks all 49 SR definitions, final EW stats, target-level probability throttling across overlapping stations, guided-missile/drone shutdown, building range suppression, temporary spoof-order restoration, AI EW adoption and a 120-second fully researched mixed-combat stress simulation.

## UX navigation smoke
Run `node tests/ux-navigation-smoke.js` to verify doctrine navigation, tech-tree edge scrolling, T-to-MLS selection, and Automated Warfare coordinate picking.


## Workflow / deployment UX smoke
Run `node tests/workflow-ux-smoke.js` to verify the consolidated deployment/build-menu pass: Global Overview aggregation and multi-facility sourcing, Military Base + Superior Mobilization Complex ground-facility recognition, Exosuit loadout deployment identity, match-scoped deployment preferences, Continuous Build wiring, Utility/Defense menu tabs, left-menu hover collapse, and empty-selection right-panel hiding.


## AI macro / map-size smoke
Run `node tests/ai-macro-map-smoke.js` to verify the AI regression fix and map selector: exact 3600×2200 / 5400×3300 dimensions, world-navigation resizing, scaled start layouts, active Megacity/economy/defense growth on the Large map, macro telemetry, and rich-AI doctrine-facility adoption.


## Capital AA / infantry balance smoke
Run `node tests/capital-aa-infantry-balance-smoke.js` to verify the Capital four-missile emergency AA salvo, 20% air-delivered damage resistance, and the latest Advanced Infantry regeneration/equipment-cost rebalance.
