# Advanced Engineering — Doctrine 3 Implementation Pass

This build implements Doctrine 3: Advanced Engineering on top of the Mechanized Warfare Pass 3B baseline.

## Doctrine Research immediate effects

Completing Advanced Engineering DR activates:

- Global research time multiplier: `0.70` (the project convention for +30% research speed).
- Global research cost multiplier: `0.85` (-15%).
- Generic Onsite Upgrade (OU) cost changes from 50% to 35% of the building's base construction cost.
- Generic OU ceiling changes from 5 to 7 levels per building.
- Voluntary structure removal refunds 60% of `totalInvestedCost`.
- Queue refunds remain separate and still refund every unfinished paid training item in full.

DR base cost progression remains acquisition-order based ($500, $1,000, $2,000, ... before research-cost modifiers) and each DR has a base 100-second time.

## Generic Onsite Upgrade system

OU is available to eligible non-Capital buildings even before Advanced Engineering.

Baseline OU:

- Cost: 50% of the building's base cost.
- Maximum: 5 levels.
- Non-combat building: each level adds +20% of BASE max HP.
- Combat/defense building: each level adds +8% of BASE damage.
- Each completed OU recovers 25% of the building's PRE-UPGRADE max HP, capped at the new max HP.
- Effects are additive from the original base stat rather than compounding from the previous level.

Examples:

- 1100 HP City: OU1 = 1320 HP, OU2 = 1540 HP.
- 16 damage MG Turret: OU1 = 17.28, OU2 = 18.56.

Defense OU is routed into special damage outputs too: AA missile damage, Hive Hunter damage, and Landmine damage all inherit the defense OU multiplier.

### Advanced Engineering OU SR branch

1. Better OU Health Recovery: 25% -> 35% pre-upgrade-max recovery.
2. Better OU I: +50% of the original/base finite OU effect.
3. Cheaper OU: another 15% discount on OU cost (`current OU rate × 0.85`).
4. Better OU II: another +50% of the original/base finite OU effect.
5. Increased Ceiling: +3 levels, taking the Advanced Engineering ceiling from 7 to 10.

The two Better OU nodes are additive from the original base effect:

- Non-combat HP effect: 20% -> 30% -> 40% per level.
- Defense damage effect: 8% -> 12% -> 16% per level.
- Recovery after Better OU Health Recovery: 35% -> 47.5% -> 60%.

Existing OU levels are recalculated when Better OU research completes, so the research improves previously upgraded buildings too.

## Provisional Advanced Engineering balance

These values are intentionally isolated for easy later balancing:

- Advanced Engineering Complex: $850, 2200 HP.
- Advanced Engineer: $250, 500 HP, speed 96, train time 4.2s.
- Research Center: $1200, 1850 HP.

## Advanced Engineering Complex and Advanced Engineers

The Complex is unlocked by `Unlock Advanced Engineering Complex` and supports 5 Engineers by default.

Advanced Engineers are persistent unit identities owned by their home Complex. They are stored inside the Complex when inactive and automatically dispatch when work exists.

Baseline Engineer behavior:

- Automatically selects the nearest damaged friendly building.
- Repairs buildings only.
- Repairs 3% of the target building's max HP per second.
- 40-second active endurance.
- If there is no work, returns to the home Complex with no cooldown.
- If endurance is exhausted, returns and rests for 10 seconds.
- Any Engineer returning to the Complex is restored to 100% HP before its next sortie.
- No player dispatch command is required.

### Engineer SR branch A

- Rest Optimization: 10s -> 7s rest (-30%).
- Efficient Engineer Production: Engineer training cost -30% ($250 -> $175 with current base cost).
- Expanded Engineer Capacity I: 5 -> 6 per Complex.
- Auto-replenishment: each Complex can set its own desired Engineer count. It automatically queues replacements when below the target if funds and capacity allow.
- Expanded Engineer Capacity II: 6 -> 8 per Complex.

### Engineer SR branch B

- Speedy Dispatch: +20% Engineer movement speed.
- Highly Reliable: +20% BASE max HP and +10s endurance.
- Super Technician: repair rate becomes 4% of target max HP per second.
- High Endurance: +20s endurance and +30% BASE max HP.
- With both durability/endurance SRs, Engineers have 150% base HP (750 HP from the current 500 HP base) and 70s endurance.
- Advanced State-wide Upgrade: enables automatic OU work when there are no damaged buildings to repair.

### State-wide Auto OU

State-wide Auto OU is configured independently on each Advanced Engineering Complex.

- Toggle on/off per Complex.
- Priority can be `Defense First` or `Functional First`.
- Repair needs always take priority before an OU job starts.
- If there is nothing to repair, an idle Engineer finds an affordable eligible OU target according to the selected priority.
- The target is reserved so another Engineer cannot perform the same OU job simultaneously.
- The OU price is charged when the Engineer begins work.
- The Engineer works for 5 seconds before the OU completes.
- If the Engineer dies or the job becomes invalid before completion, the OU payment is refunded and the reservation is released.
- If insufficient money exists for any eligible OU, Engineers stay/return at their Complex instead of pointlessly deploying.

## Research Center branch

Research Centers are doctrine-locked and cost $1200 provisionally.

Each RC is a real research provider rather than a passive global modifier:

- Capital: 2 research slots.
- Each Research Center: 3 dedicated research slots by default.
- Research interface includes a provider selector, so a new DR/SR is assigned to Capital or a specific RC.
- RC-specific bonuses only apply to research assigned to that RC.

Research Center SR branch:

1. Unlock Research Center.
2. RC Research Acceleration I: +10% research speed at an RC (`duration × 0.90`).
3. RC Research Economy: -15% research cost at an RC (`cost × 0.85`).
4. Expanded RC Capacity: +1 dedicated slot per RC (3 -> 4).
5. RC Research Acceleration II: another +10% RC research speed (`duration × 0.90` again).

Advanced Engineering's global -15% cost and +30% speed also apply, so RC-specific bonuses stack with the doctrine-wide modifiers.

If an RC that owns active research is removed/destroyed, the research preserves its percentage completion and automatically reassigns to another provider with a free slot. If no slot exists, it pauses until one becomes available. It is not charged again.

## User interface

- Advanced Engineering DR is now purchasable.
- Its technology tree remains hidden until the DR is completed, like Mechanized Warfare.
- The tree contains 21 connected SR cards across the Engineer, Research Center, and OU branches.
- Advanced Engineering Complex selection UI includes Engineer capacity/status, training, Auto-replenishment controls, and State-wide Auto OU controls when researched.
- Research Center selection UI shows its dedicated slots/bonuses and can open Research with that RC preselected.
- Every eligible non-Capital building exposes its current OU level, ceiling, per-level effect, recovery percentage, price, and upgrade action.
- Under Advanced Engineering, the structure removal control reflects the 60% investment refund rule.

## Regression / validation

Validated in a synthetic Chromium document plus syntax checks:

- Generic OU baseline cost, 5-level ceiling, base-relative HP/damage growth, and recovery.
- Advanced Engineering OU 35% cost, 7-level ceiling, and 60% voluntary removal recovery.
- OU SR branch scaling, discount, recovery and final 10-level ceiling.
- Advanced Engineer cost, capacity, rest, speed, HP, repair rate and 70s final endurance.
- Automatic Engineer dispatch, repair and no-work return.
- Auto-replenishment desired-count behavior.
- Exhausted Engineer rest timing and 100% HP restoration.
- State-wide Auto OU payment timing, target reservation, 5-second completion, and interrupted-job refund.
- Research Center 3 -> 4 slots and provider-specific research bonuses.
- RC-loss research reassignment.
- Advanced Engineering tree hidden before DR and visible after DR; 21 tech cards rendered.
- AA/Hive special damage outputs inherit defense OU correctly.
- `node --check game.js` passes.
- Seeded 200-second no-research battle snapshot is identical to Mechanized Warfare Pass 3B.

## Deliberately not added

- No AI doctrine-selection/research strategy has been invented yet. AI behavior remains unchanged unless/until a doctrine AI policy is defined.
- The provisional Complex/Engineer/RC base balance values can be changed without redesigning the mechanics.
