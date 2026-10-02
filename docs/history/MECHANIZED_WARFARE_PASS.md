# Mechanized Warfare Implementation Pass

This pass implements Doctrine 1's confirmed gameplay architecture and Specialized Research tree on top of Architecture Pass C.

## Confirmed Doctrine immediate effects

Completing `mechanizedWarfare` now activates:

- **+30% mechanized training speed** — Tank, SPG, APC and IFV training time uses a `0.70` multiplier.
- **+15% final mechanized damage** — applied as the final `1.15x` damage multiplier to mechanized weapons.
- **Vehicle Configuration** capability — Military Bases expose the vehicle-configuration section once the doctrine is active.

Doctrine Research is now live: the first DR started costs **$500**, and every subsequent DR doubles in base cost ($1,000, $2,000, $4,000, ...). Each DR takes **100 seconds** before research-speed modifiers. Only Mechanized Warfare is currently content-ready; later doctrines remain blocked as `CONTENT PENDING` until their gameplay is implemented.

## Specialized Research tree

All 12 confirmed Mechanized Warfare SR nodes are registered with exact prerequisites. Every SR currently costs **$100** and takes **60 seconds** before research modifiers.

### APC line

`Unlock APC` → `Increased Survivability` (+30% APC HP) → `Increased Mobility` (+10% APC movement speed)

From Increased Mobility:

- **Branch A:** `Unlock IFV` → `Increased Damage` (+25% IFV damage) → `Increased Survivability` (+30% IFV HP) → `Grenade Launcher`
- **Branch B:** `Extra Passenger` (+2 APC soldiers) → `Mobile Fortress` (+100% APC HP)

### Armoured Vehicle line

`Better Armour` → `Stronger Engine` → `Torrent of Steel`

- **Better Armour:** Armoured Vehicle damage reduction increases from the default 20% to 30%.
- **Stronger Engine:** +5% movement speed to Tank, SPG, APC and IFV.
- **Torrent of Steel:** -20% build/training cost to Tank, SPG, APC and IFV.

Percentage HP/speed bonuses using `addPercent` add against the base stat. Therefore APC +30% HP and +100% HP resolve to **230% of base HP**, not 260%.

## Armored property

Tank, SPG, APC and IFV are now tagged `armored` / `armored-vehicle` and have the confirmed default **20% reduction to normal incoming damage**.

The damage pipeline also accepts an `armorPiercing` flag for future AP weapons. AP bypasses the armor reduction; no new AP weapon/technology was invented in this pass.

## APC

Implemented behavior:

- research-gated behind `Unlock APC`
- armored vehicle
- base capacity **8 soldiers**
- `Extra Passenger` raises capacity to **10**
- selected infantry in the same Military Base deployment automatically fill selected APC/IFV passenger capacity before spawning independently
- passengers remain persistent unit records in lifecycle state `CARGO`
- unloads passengers when the transport reaches its deployment destination
- automatically emergency-unloads passengers when post-hit HP drops below **30%**
- attracts enemy target acquisition while inside the attacker's acquisition scan
- APC itself does not acquire/attack targets

## IFV

Implemented behavior:

- research-gated behind `Unlock IFV`
- armored vehicle
- base capacity **12 soldiers**
- same destination and <30% HP unloading rules as APC
- same aggro-attraction behavior as APC
- default **Machine Gun Turret**
- `Grenade Launcher` SR unlocks the alternative **Grenade Turret**
- vehicle configuration is persisted on the individual IFV record and survives storage/deployment lifecycle transitions

The Military Base vehicle-configuration interface now controls both the default IFV turret and the passenger composition used by **newly trained APCs/IFVs**. Existing vehicle identities and already-queued build packages are not silently rewritten when defaults change.

## IFV Grenade Turret

The Grenade Turret uses a slower-firing, harder-hitting medium-AOE projectile profile. It uses the existing tracked-shell rule: the intended direct target receives full listed damage, while nearby secondary targets receive radial falloff.

## Persistent cargo identity

Transport passengers are not recreated as anonymous units. Their existing `instanceId`, HP, configuration, OU data, and persistent modifier sources are carried as unit records while inside the transport and restored when unloaded.

Cargo is also included in persistent durability synchronization for future global HP research.

## Passenger build packages

APC and IFV passenger composition is now editable from the Military Base vehicle-configuration section. Current configurable passenger types are Basic Soldier and Elite Soldier.

- APC defaults to 8 Basic Soldiers.
- IFV defaults to 12 Basic Soldiers.
- The editor enforces the vehicle's current capacity; Extra Passenger raises APC capacity from 8 to 10 without silently changing the saved composition.
- Training an APC/IFV charges **vehicle price + configured passenger prices**.
- Passenger identities are created when the vehicle finishes training and are immediately stored inside that vehicle as `CARGO`; they do not appear as loose Military Base storage.
- The turret/passenger configuration is snapshotted when training begins, so later editor changes do not mutate queued vehicles.
- The vehicle's normal train timer is currently the package timer; no additional passenger-production-time rule has been defined.

## Cost/refund correctness

Training queues now keep a parallel `queuePaidCosts` record. This is necessary because `Torrent of Steel` changes actual purchase price.

If a structure is voluntarily removed:

- every unfinished unit receives a full refund of the **actual price paid**
- a discounted Tank bought for $40 refunds $40, not its $50 base price
- partially progressed first queue items still receive the full paid-price refund

## Research UI

The Capital research modal now contains a dedicated **Mechanized Warfare Tech Tree** section showing:

- APC trunk
- IFV branch A
- APC branch B
- Armoured Vehicle development line

Tech cards are uniform in size, linked by visible connector lines, and progress visually from **left to right**. Every card displays its $100 cost and 60-second research time; prerequisites continue to gate each branch.

## Provisional base unit balance

The design confirms APC/IFV roles, capacities and upgrade percentages but does not yet define their base money/HP/speed/weapon/train-time values. Playable base values are therefore isolated in one `MECHANIZED_UNIT_BALANCE` constant so they can be changed without touching mechanics.

Current provisional values:

| Unit | Cost | HP | Speed | Train time | Capacity |
| --- | ---: | ---: | ---: | ---: | ---: |
| APC | $45 | 520 | 62 | 2.9s | 8 |
| IFV | $65 | 540 | 58 | 3.4s | 12 |

Current provisional IFV weapon profiles:

- Machine Gun: 18 base damage, 175 range, 0.34s cooldown.
- Grenade: 46 base damage, 185 range, 1.15s cooldown, 52 AOE radius.

These numbers are **not treated as finalized design**; the mechanics and research percentages are the confirmed part.

## Regression/testing performed

- `node --check game.js` passes.
- 12 Mechanized SR definitions and 12 research-tree UI nodes verified.
- APC/IFV locked before SR and unlocked after their respective SR completions.
- Doctrine mechanized training multiplier verified at `0.70`.
- Tank doctrine damage verified at `62 × 1.15 = 71.3`.
- Default armor verified: 100 normal damage causes 80 HP loss.
- Better Armour verified: 100 normal damage causes 70 HP loss.
- APC capacity verified `8 → 10` after Extra Passenger.
- APC HP verified `520 → 676` after +30%, and `1196` after +30% +100% additive bonuses.
- APC speed verified with +10% APC mobility +5% Stronger Engine.
- Torrent of Steel Tank cost verified `50 → 40`.
- Discounted unfinished queue refund verified at the actual $40 paid price.
- IFV machine-gun and grenade damage modifiers verified with +25% IFV damage and +15% final doctrine damage.
- Grenade projectile damages secondary clustered targets through AOE.
- Deployment test verified `1 APC + 8 soldiers` creates one active APC with eight `CARGO` records; destination unloading restores all eight active soldiers.
- <30% HP emergency unload verified.
- Aggro-attraction target preference verified.
- 30-second researched-mechanized simulation smoke passed with no invalid HP / entity-limit violations.
- 200-second ordinary skirmish smoke with no research passed; APC/IFV remain absent while locked.

## Still intentionally pending

- Final APC/IFV base balance values.
- AI doctrine/research decision-making. AI currently continues to use the existing non-research force mix because the general AI research phase has not yet been implemented.
- Additional vehicle configurations beyond the confirmed IFV Machine Gun / Grenade choice.

## Latest validation additions

- DR progression verified at `$500 → $1,000 → $2,000`; content-pending doctrines remain non-purchasable until implemented.
- SR balance verified at `$100 / 60s` with prerequisites enforced.
- APC package snapshot verified with a `3 Basic + 5 Elite` configuration: the completed APC contains exactly eight persistent cargo records even after the default composition is changed while it is training.
- IFV package refund verified with `4 Basic + 8 Elite`: voluntary Military Base removal refunds the exact combined package price paid for the unfinished vehicle.
- Research tree renderer verified to contain 12 uniform tech cards using line/fork connectors and no legacy arrow separators.
- A seeded 100-second no-research simulation remains byte-for-byte equivalent in observable gameplay state to the previous Mechanized Warfare build.

---

## Mechanized Warfare polish / research UX pass

The following refinements are now part of the current build:

- Capital research capacity is **2 shared DR/SR slots**.
- Press **R** during a skirmish to open the Research interface.
- A Doctrine's Specialized Research tree is hidden until that Doctrine's DR is completed. Research sections use `data-doctrine-tree` so future doctrine trees inherit the same visibility rule.
- The Research interface no longer rebuilds its entire tree on a timer. Active DR/SR percentages, remaining time, and progress bars update live without resetting horizontal scroll position.
- Mechanized SR cards remain uniform left-to-right cards, with larger/brighter typography and stronger connector visibility.
- `Stronger Engine` is now **+15% Armoured Vehicle movement speed** instead of +5%.
- The default **Armored** property remains a real **20% normal incoming-damage reduction**. `Better Armour` increases this to 30%. Armor-piercing damage bypasses the reduction.
- APC base balance is now **650 HP / 88 speed**.
- IFV base balance is now **680 HP / 84 speed**.
- Troops unloading from APC/IFV inherit the transport's destination. If unloaded before arrival (including emergency unload), they ignore nearby distractions until reaching that destination, then resume normal local target acquisition.
- IFVs with an active destination order do not stop or divert to fight. They continue toward the destination and fire opportunistically at enemies already in weapon range while moving.
- The voluntary Remove Structure action is now visually separated lower in the selection panel, compact, and outlined red.

### Regression checks for this polish pass

- Capital slots resolve to `2`.
- Mechanized tree hidden before DR and visible immediately after Mechanized Warfare completes.
- All 12 Mechanized SR cards remain present after unlock.
- Tech-tree horizontal scroll survives structural research UI refreshes.
- A 10-second sample of a 60-second SR displays `17%` live progress in both Active Research and the SR card.
- Tank normal 100-damage hit resolves to **80 damage** with base Armor and **70 damage** after Better Armour.
- Stronger Engine resolves Tank speed `48 -> 55.2` (+15%).
- Emergency APC unload preserves the APC destination and focused disembark order.
- IFV test confirms simultaneous destination movement and firing.
- R hotkey opens Research.
- Seeded 60-second no-research simulation remains identical to the previous Mechanized Warfare build in observable gameplay state.
