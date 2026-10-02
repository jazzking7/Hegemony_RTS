# Advanced Command & Automation — Implementation Pass

This build implements Doctrine 7 on top of the modular Architecture Pass D / AI & Economy baseline. The doctrine is deliberately built as reusable command/automation state rather than UI-owned behavior so it remains suitable for a future authoritative multiplayer backend.

## Immediate Doctrine effects

### Focused Mission
- Ground deployment option available immediately after Doctrine Research.
- Units keep the assigned coordinate as absolute priority and ignore distractions until entering a 150-unit destination radius.
- Focused state then ends and normal targeting resumes.
- `Zealous Execution I/II` give +5% then +10% base damage after successful arrival (+15% total). The arrival damage modifier is permanent for those units.
- `Speedy Run I/II` give +5% then +10% movement while Focused travel is active (+15% total); this modifier is removed on arrival.

### Scheduled Deployment
- Saved convoy-like sequence of up to 3 deployment nodes and 2 wait timers.
- Wait timers start when the preceding node launches, not when it reaches the destination.
- If a timer expires before the full next node is available, the sequence waits rather than launching a partial force.
- `TRAIN REQUIRED UNITS` prepares missing units using current stored inventory first and snapshots the Scheduled-specific training metadata.
- Ground nodes use the shared ground-facility abstraction (Military Base or Superior Mobilization Complex) for availability and launch checks. Mixed conventional production may still stage through a Military Base when the requested composition includes units an SMC cannot train.
- Multi-domain Scheduling allows each node to be Ground or Air. Reusable airframes are staged by Airbase requirement rather than blindly summing every sortie, so repeated air nodes can reuse returned aircraft when appropriate.
- Mixed Ground/Air schedules remain manual/standalone and cannot be selected for Automated Warfare.

## Advanced Coordination Center

- Cost: $1,500.
- Construction is instant.
- Default build limit: 1 per player; final Coordination SR raises this to 2.
- Default Bandwidth: 1 per ACC.
- Bandwidth SRs increase each ACC to 2 then 3 Bandwidth.
- One active or paused Automated Warfare consumes one Bandwidth.
- Pause preserves the routine and Bandwidth but stops new purchases and launches; already-paid queues continue training.
- Cancel frees Bandwidth and stops future automation without recalling already-deployed forces.
- Destroying/removing an ACC ends the routines it owns; deployed forces keep their existing orders.
- **ACC HP is currently a provisional isolated balance value of 2,800 because no HP value was specified.**

## Theater Routine

- Ground-only Automated Warfare bound to one ground military facility (Military Base or Superior Mobilization Complex).
- Definition may be a custom Focused deployment, a Convoy, or an all-ground Scheduled Deployment.
- Default launch ceiling is 30 physical troops/entities; transport passengers are included when validating this ceiling. SR raises it to 40.
- Initiation fee is a separate sunk fee equal to one full normal-price force set, modified only by Automated Warfare initiation-fee SRs.
- After initiation, stored units at the bound ground facility are consumed first; only missing units are trained/purchased. Loadout infantry may be produced from either an SMC or Military Base; mixed conventional forces may stage production through a Military Base when required.
- If the economy cannot afford missing units, the routine waits and resumes automatically later.
- Production modifiers progress to +16% training speed and 10% production discount.
- Mature War Front is tracked per routine: deployment #3 and later receives +12% base damage.

## Aerial Automated Warfare

Both aerial automation types are bound to a specific Airbase and include Aircraft Quota Management.

### Area Denial / Suppression
- Exact sortie composition.
- Patrol/engagement zone radius: 500 around the designated coordinate.
- Fighters patrol/intercept inside the zone.
- Bombers repeatedly strike detected ground targets inside the zone.
- Paratrooper Planes are not eligible.
- A sortie waits until the complete specified force is available.

### Routine Flights
- Exact sortie composition.
- Repeated normal offensive air missions against the designated coordinate.
- Waits for the complete required sortie before launching again.

### Aircraft Quota Management
- Counts all relevant airframe commitments at the bound Airbase: ready/stored, airborne, RTB, turnaround and queued.
- An airframe is replaced only when genuinely missing; airborne aircraft never cause duplicate replacement orders.
- Loyal Wingman requirements are maintained through the existing Drone Hub/Airbase network.
- Production modifiers progress to +16% training speed and 5% cost discount.
- Rapid Turnover gives automated-warfare aircraft 20% faster turnaround for the affected sortie only.
- Aerial Mature War Front applies +12% base offensive damage beginning with sortie #3 of that individual routine.

## Coordination SR lane

- Initiation fee -10%.
- +1 Bandwidth per ACC.
- Further initiation fee -15% (25% total).
- +1 additional Bandwidth per ACC.
- Maximum ACC count 1 -> 2.

## Personnel transport behavior correction

APC, IFV and Paratrooper Plane passengers now distinguish early release from destination release:

- **Early release:** passengers retain the original destination, move toward it, and may engage normal distractions on the way before continuing.
- **Destination release:** passengers enter a persistent local-assault state centered on the destination with a 200-unit radius. They attack current and future hostile entities inside that zone and remain locally anchored instead of roaming away.

## Drone Hub usability

Drone Hub production now has a manual quantity input / `QUEUE AMOUNT` control for each unlocked drone type. Existing quick/bulk buttons remain intact. Bulk discounts are still only applied according to the already-researched Mass Production rules.

## AI adoption

The generic AI can build unlocked Advanced Coordination Centers. If it has available Bandwidth, it can create simple Theater Routines and aerial Area Denial routines using the same initiation fees, production queues, inventory checks and aircraft quotas as the player. No AI-only production shortcut was introduced.

## Research tree

Doctrine 7 contains 24 Specialized Research cards:
- 4 Focused Mission cards.
- 3 Scheduled Deployment cards.
- 1 ACC/Automated Warfare root unlock.
- 6 Theater Routine cards.
- 5 Aerial Automation cards.
- 5 Coordination/Bandwidth cards.

All continue to use the global SR baseline of $100 / 60 seconds.

## Validation

Run:

```bash
node tests/regression.js
node tests/command-smoke.js
```

The permanent regression suite remains green and preserves the pre-doctrine seeded baseline when Doctrine 7 is not researched. The dedicated command suite additionally verifies Focused behavior, Scheduled launch timing, schedule-specific production modifiers, ACC Bandwidth/pause/cancel behavior, Mature War Front deployment #3 behavior, destination assault zones, normal Paratrooper landing behavior, and a 180-second concurrent Theater + Area-Denial stress simulation with finite entity state.
