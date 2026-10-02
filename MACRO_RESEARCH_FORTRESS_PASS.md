# Macro / Research / Fortress Adjustment Pass

## Shared research pool
- Research Center hard cap: **2 per player**.
- Capital and Research Center slots form one shared research pool.
- Starting research no longer asks the player to choose a research facility; the runtime automatically assigns the next free shared slot.
- Capital-backed and Research-Center-backed work use the same player-wide research speed/cost modifiers.
- Advanced Engineering Research Center SR bonuses now apply globally:
  - Research Acceleration I: global speed bonus.
  - Research Economy: global research-cost reduction.
  - Expanded RC Capacity: +1 slot to each Research Center.
  - Research Acceleration II: additional global speed bonus.
- Provider IDs remain internal bookkeeping only so active work can be reassigned if a Research Center is destroyed.

## Fortress construction normalization
Fortress construction now has two valid paths.

### Infantry construction
- Ten stored infantry may establish the normal construction convoy.
- Basic Soldiers, Elite Soldiers, and named Advanced Infantry / Exosuit loadout variants all count.
- Loadout identity is preserved on dispatched builders.
- The existing ten-infantry construction/garrison behavior remains available.

### Advanced Engineer construction
- No infantry garrison is required when the site is established with Advanced Engineers available.
- Each Advanced Engineer contributes **2% completion per second**.
- Contributions stack linearly:
  - 1 Engineer = 50 seconds from 0%.
  - 2 Engineers = 25 seconds.
  - 5 Engineers = 10 seconds.
- Engineer construction does not create a Fortress garrison; Engineers return to normal engineering work when construction finishes.

## Military Base storage
- Military Base stored-unit capacity is now a hard **80 ground units**.
- The cap is enforced in the shared storage API, not only in the manual Train button.
- Training pauses while a ground facility is full instead of producing an overflow unit.
- Convoys, AI production, returning units, Capital Reserve recovery, and Advanced Infantry variants all respect the same capacity path.
- Superior Mobilization Complex remains at its existing 200-infantry capacity.

## AI macro and humanized command tempo
The AI was rebalanced in two directions rather than receiving a blanket speed/strength increase.

### Stronger macro
- More deliberate City / Megacity expansion and settlement upgrades.
- Higher sustained-income targets before discretionary spending.
- More production capacity as income rises.
- Larger layered-defense targets and defense placement around valuable economic anchors as well as the Capital.
- Savings reserves prevent production/optional construction from consuming every dollar intended for economic expansion.
- Research becomes part of the macro budget once the economy is healthy, and saved research money gets first claim before optional economy/build clicks.
- AI can still rebuild its last Military Base immediately as an emergency priority.

### Less superhuman offensive throughput
- Threat evaluation remains responsive, but defensive response orders have a longer reaction cooldown.
- Successful major offensive waves now pause roughly **22–34 seconds** before another major attack decision.
- Failed/no-force attack attempts retry after roughly **9–15 seconds**.
- The AI prefers larger consolidated waves instead of chaining many new offensive decisions back-to-back.
- Economy, production, research, rebuilding, and defensive maintenance are not artificially slowed to the same degree.

## Verification
Added `tests/macro-research-fortress-smoke.js` covering:
- two-Research-Center cap and shared/global research modifiers;
- automatic free-slot assignment across Capital/Research Centers;
- Exosuit loadout recognition by Fortress construction;
- five-Engineer no-garrison Fortress completion at the specified rate;
- Military Base 80-unit hard cap and full-storage training pause;
- seeded AI economy/defense development plus throttled major attack planner.

All legacy doctrine/UI smoke suites and the deterministic architecture regression pass on this build.
