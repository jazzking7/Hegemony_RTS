# Drone Warfare Pass

This pass implements Doctrine 2: Drone Warfare on top of the movement/corridor-fixed RTS baseline. Existing locked-doctrine gameplay remains unchanged until Drone Warfare is researched.

## Doctrine Research

Drone Warfare is content-ready and can be researched through the existing DR system. Completing the doctrine immediately unlocks the Hive Turret mode selector between the existing UGV Patrol mode and Search & Destroy mode.

## Specialized Research Tree

The Drone Warfare tree contains 26 SR cards and follows the established $100 / 60-second SR rules.

### Root
- Unlock Drone Hub

### Loitering Munition branch
- Unlock Loitering Munition
- +15% movement speed
- +30% damage

Cost / production sub-branch:
- Cost $5 -> $4
- Build time -30% of base
- Cost $4 -> $2
- Build time -30% of base again (total -60% of base)

AOE sub-branch:
- Small AOE: 80 base AOE damage, radius 20
- +25% base AOE radius
- Last-Ditch Effort: destruction releases the researched AOE instead of simply disappearing
- +15% base AOE radius and +20% base AOE damage

Survivability sub-branch:
- +100% HP
- Dispersed Swarm: nearby friendly Loitering Munitions gently spread apart instead of bunching into a tight cluster
- Evasive Maneuver: controlled zigzag movement
- Stealthy Killer: proximity stealth; enemies cannot target the LM until it enters half of that attacker's attack range unless Revealed

### Loyal Wingman branch
- Unlock Loyal Wingman
- +20% endurance
- 10% build discount
- +1 payload
- +1 maximum Loyal Wingman per sortie (3 -> 4)
- +1 payload
- +1 maximum Loyal Wingman per sortie (4 -> 5)

### Drone logistics branch
- +25% storage capacity for all drone types
- Mass Production
- +20% drone production rate

Mass Production buttons are [100] [50] [25] [10] [5] [1]. Batch discounts are 15%, 12%, 9%, 6%, 3%, and 0% respectively. A batch button is disabled when either the full batch does not fit in remaining storage/network capacity or the player cannot afford the whole batch. The selected quantity is never silently truncated to obtain a higher discount.

## Drone Hub

- Cost: $800
- HP: 2000
- Base Loitering Munition storage: 200
- Base Loyal Wingman temporary storage: 10
- Only Drone Hubs can build drones
- Drone Hubs can directly deploy Loitering Munitions
- Loyal Wingmen cannot launch from a Drone Hub; they must operate from an Airbase
- Finished Loyal Wingmen automatically transfer into available Airbase Wingman storage when possible

With the +25% storage SR:
- LM capacity: 200 -> 250
- Hub LW capacity: 10 -> 12
- A 7-aircraft Airbase LW capacity: 14 -> 17

## Loitering Munition

Base values:
- Cost: $5
- HP: 15
- Single-target contact damage: 250
- Base build time: 0.15 sec
- Fast low-altitude drone movement
- Ground units and ground defenses can target it
- AA Towers ignore it
- It can fly over friendly structures

Behavior:
- Deploys toward a designated coordinate
- Acquires nearby enemy entities using normal opportunistic behavior
- Charges the selected enemy and detonates on physical contact
- Applies the single-target contact strike and researched AOE, then destroys itself
- If it reaches its destination without a target, it self-destructs; destination detonation only deals AOE once the AOE SR is unlocked
- It is single-use

Research scaling:
- +30% general LM damage changes contact damage from 250 to 325 and contributes to AOE scaling
- Initial researched AOE becomes 104 after that +30% general damage modifier
- Final AOE branch produces 120 AOE damage with radius 28
- +100% HP changes 15 -> 30 HP
- Both -30% build-time nodes are additive from the 0.15 sec base: 0.15 -> 0.105 -> 0.060 sec
- The final +20% drone production-rate SR changes that 0.060 sec to 0.050 sec

The proximity-stealth mode is separate from future permanent stealth and attack/re-stealth behavior, but all are designed to be suppressed by the shared Revealed/EW mechanism later.

## Loyal Wingman

Base values:
- Cost: $400
- HP: 300
- Max catch-up speed: 350
- Endurance: 40 sec
- Payload: 1 short-range air-to-ground missile
- Missile damage: 250
- Missile attack range: 250
- Build time: 4 sec
- Landing turnaround: 10 sec

Storage / deployment:
- Built in Drone Hubs
- Normally transferred to and operated from Airbases
- Airbase LW capacity is separate from normal aircraft bays and equals aircraft capacity x2
- A 7-aircraft Airbase therefore supports 14 Loyal Wingmen before storage research
- Aircraft deployments expose a Bring Unmanned Escorts option with 1 or 2 escorts per aircraft
- Escort launch is limited by ready Wingmen actually available at that Airbase

Flight behavior:
- Each Wingman is assigned a master aircraft
- It follows the master's formation using the master's actual velocity as the formation baseline. In formation it matches the master's speed; 350 is only a catch-up/repositioning ceiling
- It launches its own payload when the mission coordinate enters missile range
- It triggers air defense
- When an AA missile is approaching its master, an available Wingman can retarget that missile onto itself
- Air-Defense Towers prioritize Loyal Wingmen over manned aircraft while an LW is in range; already-flying AA missiles also retarget to the nearest LW that enters a 100-unit proximity radius
- Because the hostile AA missile is genuinely retargeted, the master aircraft's existing evasion logic naturally stops reacting once no missile is still targeting it
- When the master returns, a Wingman with sufficient endurance and remaining payload may continue the strike before returning
- It returns to an Airbase for the 10-second turnaround; if no Airbase can accept it, compatible Drone Hub storage / existing reserve behavior is used

Research scaling:
- Endurance: 40 -> 48 sec
- Cost: $400 -> $360 after the 10% discount
- Payload: 1 -> 2 -> 3 missiles
- Max Loyal Wingmen per sortie: 3 -> 4 -> 5

## Hive Turret Search & Destroy mode

Drone Warfare DR immediately enables a Hive mode selector:

- UGV Patrol: preserves the existing three-Hunter behavior
- Search & Destroy: launches free waves of six Hive Loitering Munitions

Search & Destroy rules:
- Six free LMs per wave; no Drone Hub inventory or player money is consumed
- Hive LMs inherit the player's researched LM movement, damage, AOE, HP, dispersal, evasive, proximity-stealth, and Last-Ditch effects
- Hive-specific endurance is 10 seconds
- A new wave cannot begin until all six members of the previous wave are gone
- Once the wave is fully gone, a 2-second cooldown begins, then the next six are launched
- Endurance expiration simply removes the LM unless Last-Ditch Effort is researched, in which case the researched AOE is released on destruction

## Lifecycle / destruction behavior

The existing persistent-identity / Capital Reserve rules were extended to drones:
- Voluntarily removing an Airbase preserves stationed Loyal Wingmen and active airborne escorts survive
- Destroying an Airbase destroys physically stationed Loyal Wingmen; airborne Wingmen survive and lose the invalid home assignment
- Voluntarily removing a Drone Hub preserves stored drones through compatible reserve/recovery behavior
- Destroying a Drone Hub destroys drones physically stored inside it
- Persistent HP/identity records are retained through valid storage transfers

## Rendering / UI

- Drone Hub has a dedicated building silhouette rather than the generic circle renderer
- Loitering Munitions use a small dart-like visual
- Loyal Wingmen use a broad delta/flying-wing silhouette that is visually distinct from normal aircraft
- Wingman air-ground missiles have a distinct projectile treatment
- Drone Warfare receives its own left-to-right, doctrine-gated research tree using the same uniform-card/connector language as the other implemented doctrines
- Drone Hub production shows storage/network counts and Mass Production buttons with impossible quantities visibly disabled
- Airbase deployment exposes the escort checkbox and escort-count selector only when Loyal Wingmen are available/unlocked
- Hive Turret exposes its mode selector after Drone Warfare DR completes

## Regression / stress validation

Validated in the synthetic browser regression harness and direct JavaScript checks:
- Drone Warfare DR and all 26 unique SR definitions / prerequisite relationships
- LM / LW / Drone Hub base balance values
- LM cost 5 -> 4 -> 2
- LM build time 0.15 -> 0.105 -> 0.060 -> 0.050 sec
- LM movement, damage, AOE, radius, HP, dispersal, proximity stealth, Last-Ditch behavior
- AA Towers ignore low-altitude LMs
- Final LM contact + researched AOE damage against an unarmored structure
- Drone storage 200 -> 250, Hub LW 10 -> 12, Airbase LW 14 -> 17
- Whole-batch money/storage gating and bulk-discount arithmetic
- LW $400 -> $360, 40 -> 48 sec endurance, payload 1 -> 3, sortie cap 3 -> 5
- AA-missile retargeting from master to Wingman
- Wingman payload launch and return lifecycle
- Hive Search & Destroy: six free drones, 10-second endurance, two-second inter-wave cooldown
- Voluntary vs destructive Airbase and Drone Hub semantics
- Stored drone HP synchronization after durability research
- 30-second heavy stress scenario with 200 researched LMs plus a full 7-aircraft / 14-Wingman air package, with no invalid HP/position state or entity-cap failure
- Seeded 200-second no-research comparison against the pre-Drone-Warfare movement-fixed baseline produced an identical observable simulation snapshot, confirming that locked Drone Warfare does not perturb ordinary gameplay

