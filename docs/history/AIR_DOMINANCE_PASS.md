# Air Dominance Doctrine Pass

## Scope
Implemented Doctrine 8: Air Dominance on top of Drone Warfare Polish 4 / the latest ground-corridor fixes.

## Doctrine Research immediate effects
- Airbase maintained manned-aircraft capacity: 7 -> 10.
- Landed aircraft turnaround rate: +30% (turnaround duration divided by 1.30).
- Loyal Wingman Airbase storage continues to derive from aircraft capacity, so 14 -> 20 immediately; the +2 Airbase-capacity SR later produces 24 LW capacity.

## Super Fighter Jet
Base:
- $750
- 650 HP
- 380 max speed
- 40 sec endurance
- 30 sec training
- 15 sec turnaround
- 6 flares
- 8 configurable missiles
- 400 attack range
- 600 aircraft detection range

### Fighter mission behavior
- Player-configured A2A/A2G payload is snapshotted when training starts.
- A2G remaining => Strike mode has priority.
- Strike area is radius 75 centered on the deployment coordinate. Buildings touching the area and ground units inside it are valid dynamic targets.
- Fighter returns when the area is clear, but can turn back if a fresh ground target enters while it still has A2G payload and sufficient return endurance.
- During Strike mode, enemy aircraft entering attack range may still receive A2A fire without pulling the Fighter away from its ground mission.
- Once A2G is depleted and A2A remains, Fighter changes to 800-radius Patrol mode around the mission coordinate.
- Aircraft are detected within the Fighter's current detection range; Fighter closes until missile range.
- Maximum two active A2A missiles launched by one Fighter at one target at a time.
- Empty payload or insufficient safe-return endurance forces RTB.
- Launch cadence: one missile per 0.3 sec and only when sufficiently oriented toward the target.

### Fighter weapons
A2A:
- 300 damage
- homing
- speed 380
- single target

A2G:
- 400 base damage
- AOE radius 85
- hits ground units/buildings
- non-homing snapshot strike
- projectile speed 520 is currently an isolated provisional implementation value because no A2G projectile speed was defined.

## Flares
Used by Fighter and Paratrooper Plane:
- Two are ejected per defensive burst, one from each side.
- Each travels outward at speed 250.
- Lifetime 2 sec.
- Triggered automatically when a homing projectile targeting the aircraft enters radius 60.
- Cannot be hit.
- Aggro priority is Flare > Loyal Wingman > manned aircraft.
- When the selected flare expires, the homing projectile resumes the target it was chasing immediately before flare diversion.

## Fighter SR tree
1. Unlock Super Fighter Jet
   - A: -15% Fighter cost -> -50% Fighter training time
   - B: +25% A2G damage -> +20 sec endurance -> +4 missile payload
   - C: +15% speed -> +2 flares -> +20% detection range -> +2 flares -> missile range = current detection range -> reactive Stealth Fighter

Reactive Stealth Fighter:
- hidden until attack;
- attacking reveals it;
- being actively targeted reveals it;
- re-stealths after 2 sec without attacking or being targeted;
- generic Revealed status overrides stealth for future EW integration.

Fully researched Fighter-specific values before the common aircraft branch:
- speed 437
- endurance 60 sec
- payload 12
- detection 720
- detection-range strike 720
- flares 10
- A2G damage 500

## Paratrooper Plane
Base:
- $800 airframe
- 500 HP
- speed 320
- 40 sec endurance
- 20 sec training
- 18 passengers
- 6 flares
- turnaround: 1 sec per soldier actually deployed on the previous sortie

Behavior:
- Saved Basic/Elite passenger composition is snapshotted when training starts.
- Drops passengers at deployment coordinate and RTBs.
- HP below 40% causes immediate emergency drop while retaining the original mission coordinate for the troops.
- Troops descend for 1 second.
- On landing, troops receive a normal move order toward the original destination and may react to distractions normally.
- Landed paratroopers have one-way stealth: hidden until their first attack, after which they cannot re-stealth.

Reusable payload economy:
- Initial aircraft package includes the configured troops in its training purchase.
- If a plane returns without dropping its troops, those same persistent passenger records remain onboard and no new payment occurs.
- If its passengers were deployed, the returning airframe attempts to repurchase its saved passenger composition. The airframe remains unavailable if funds are insufficient, preventing free repeated infantry generation.
- Turnaround timing remains based on the number actually deployed on that sortie.

Paratrooper SR tree:
- Unlock Paratrooper Plane -> +15% speed -> 0.5 sec/soldier turnaround -> +4 passengers -> +2 flares

Fully researched:
- speed 368
- passenger capacity 22
- flares 8
- 0.5 sec/soldier turnaround before the Doctrine's +30% turnaround-rate effect

## Airbase fleet branch
- +2 max maintained aircraft per Airbase: 10 -> 12 after the Doctrine immediate +3.
- -15% cost of all manned aircraft.
- +25% manned-aircraft production speed.

These common modifiers stack with Fighter-specific procurement/training research.

## Loyal Wingman compatibility
- LW storage derives from current Airbase aircraft capacity.
- AA priority remains Flare > LW > manned aircraft.
- Already-flying homing projectiles still retarget to nearby LW where applicable, but a live flare has higher priority.
- LW escort sortie caps/behavior from Drone Warfare Polish 4 remain intact.

## Research UI
- Air Dominance DR is now content-ready.
- 20 SR cards are implemented.
- Tree remains hidden until Air Dominance DR completes.
- Three left-to-right lanes: Fighter development, Paratrooper Airlift, Airbase Fleet Development.

## Validation
- `node --check game.js`: pass.
- 20 Air Dominance SR definitions/prerequisites: pass.
- 7 -> 10 -> 12 Airbase capacity: pass.
- 30% turnaround-rate doctrine effect: pass.
- Fighter stat/cost/training modifiers: pass.
- Fighter A2G launch/AOE/damage: pass.
- A2A two-active-missiles-per-target limit: pass.
- Flare pair / diversion / target resume: pass.
- 800-radius patrol target constraint: pass.
- Paratrooper normal/emergency drop, 1-sec descent and one-way stealth: pass.
- Reusable Paratrooper reload payment / persistent cargo: pass.
- Airbase training configuration snapshots and mixed Fighter/Paratrooper deployment: pass.
- AA LW priority and reactive Fighter stealth targetability: pass.
- 60-sec Air Dominance mechanics stress smoke: pass.
- Seeded 200-sec no-research comparison against pre-Air-Dominance Drone Warfare baseline: identical observable simulation snapshot.

## Fighter Mission / Flare Fix Pass

Post-release correction pass for player-reported Air Dominance issues:

- A clear A2G strike area no longer forces RTB while A2A payload remains. The Fighter transitions into patrol with any unused A2G payload retained; if a ground target later enters the strike area, strike mode resumes.
- Fighter patrol now uses free-roaming randomized waypoints inside the 800-radius patrol zone instead of a scripted circular orbit.
- Homing A2A missiles no longer require nose alignment before launch. Enemy aircraft already inside weapon range are engaged immediately, including during an A2G strike mission.
- Aircraft inside immediate weapon range can be engaged even if they sit just outside the patrol-zone boundary.
- Flare movement is explicitly ballistic/non-homing: launch velocity is stored as an immutable straight vector and reapplied during the flare's 2-second lifetime.
