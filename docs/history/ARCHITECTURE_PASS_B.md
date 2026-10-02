# Architecture Pass B — Research Foundation

This pass adds the reusable DR / SR / OU progression architecture without inventing undefined research balance or activating new Doctrine content.

## Design rules preserved

- **Doctrinal Research (DR)** unlocks a Doctrine. Doctrine completion is the activation point for its confirmed immediate effects/hooks.
- **Specialized Research (SR)** represents player-wide knowledge/upgrades inside a Doctrine or entity tech tree.
- **Onsite Upgrade (OU)** is not player-wide. It is applied to an individual built entity and stored on that entity.
- Identical statuses still refresh instead of stacking unless a future status explicitly says otherwise.
- The **Research Center is not a baseline building**. It belongs to Advanced Engineering and will be introduced only when that Doctrine content is implemented.

## Research state

Every player now owns a `research` state containing:

- `active` research jobs
- `completed` research IDs
- `unlockedDoctrines`
- `unlockedSpecializations`
- `unlockedCapabilities`

Research jobs support:

- shared slot limits
- upfront effective cost
- duration/progress
- prerequisite checks
- completion hooks
- player-wide research cost modifiers
- player-wide research time modifiers

The nine confirmed Doctrine identities are registered in `DOCTRINE_RESEARCH` in their intended order.

Their research **costs and times remain intentionally unset** (`configured: false`) because the design has not supplied those numbers yet. The interface displays them as `PARAMETERS PENDING` instead of inventing values.

`SPECIALIZED_RESEARCH` and `ONSITE_UPGRADES` are intentionally empty registries ready for actual definitions.

## Capital research access

The Capital now exposes an **Open Research** action and a research modal showing:

- active research / slot usage
- all nine Doctrines
- confirmed Doctrine summaries
- confirmed immediate-effect descriptions
- cost/time fields (currently blank pending balance definitions)
- research state

The design says the Capital contains limited research spots but does not specify the exact starting count. `CAPITAL_RESEARCH_SLOTS = 1` is therefore an isolated architecture default, not a claimed finalized balance value. It can be changed in one constant once the intended starting slot count is decided.

## Research Center correction

The Research Center has **not** been added to `BUILDINGS`, the construction menu, starting bases, or AI behavior.

The research-slot resolver already supports modifier sources, so the future Advanced Engineering Research Center can provide its confirmed **+3 Research Slots** without creating another research system.

A test modifier of `researchSlots + 3` correctly changes the Capital research capacity from `1 -> 4 -> 1` when added/removed.

## Unlock gates

Reusable research gates now exist for entity definitions:

- build-button availability
- authoritative building placement checks
- unit training checks

All currently implemented buildings and units remain unlocked because none have research requirements yet.

Future content can add a `researchRequirement` to its definition instead of hard-coding Doctrine checks into build/training functions.

## OU foundation

Every created building and unit now owns an independent `onsiteUpgrades` set.

The OU API supports:

- per-entity duplicate prevention
- required SR checks
- target kind/type checks
- per-entity cost
- per-entity modifier-source activation

No OU definitions are enabled yet because none have been fully specified.

## Completion hooks

Research completion supports:

- DR -> `unlockedDoctrines`
- SR -> `unlockedSpecializations`
- optional player modifier sources
- optional capability unlocks

Confirmed Doctrine immediate-effect text is recorded, but the Doctrine-specific runtime effects are intentionally not partially enabled during this architecture-only pass. Those will be connected as each Doctrine is implemented.

## Regression checks

- `node --check game.js` passes.
- Exactly 9 Doctrine definitions are registered.
- Research Center is absent from baseline `BUILDINGS`.
- Current buildings remain research-unlocked.
- Capital slot resolver returns the architecture default of 1.
- Simulated future `researchSlots + 3` modifier resolves `1 -> 4 -> 1` across add/remove.
- Unconfigured Doctrine research is correctly rejected with `Research parameters pending`.
- Forced research queue completion removes the active job, records completion, and unlocks the Doctrine.
- Created entities contain independent OU records.
- Unknown/undefined OU applications fail closed.
- Seeded deterministic **100-second** battle simulation compared against Architecture Pass A produced an identical gameplay snapshot for player state, economy, live buildings/units, HP, positions/orders, storage, queues, projectiles, and effects.

## Deliberately not implemented yet

- Doctrine research costs/times
- real SR trees
- real OU definitions
- Doctrine-specific runtime content/effects
- Research Center building
- Advanced Engineer
- AI research decisions
- entity-icon tech-tree browser
- building removal / Capital reserve behavior
- air Endurance/Payload mission framework

