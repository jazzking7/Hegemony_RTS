# Electronic Warfare & Recon — Implementation Pass

This pass implements Doctrine 5 on top of the modular Advanced Command & Automation baseline without changing unrelated gameplay.

## Shared directional EW emitter

Radar, Jamming and Spoofing Stations share one directional-emitter model:

- station heading defines the centerline;
- emission angle is total cone width;
- range defines the cone length;
- waves are instantaneous periodic cone scans (no projectile/wave entity is created);
- the coverage cone is rendered only while the player is actively aiming the antenna;
- antenna rotation is instant on click.

All three stations cost **$1500**, have **600 HP**, and are utility buildings.

## Probability anti-stacking

Probabilistic EW is target-throttled per hostile player/effect. Ten overlapping stations do not generate ten independent rolls. The target receives at most one eligible check per effective emission interval, using the strongest applicable researched chance and fastest applicable scan interval from that EW network.

Deterministic overlapping effects do not add together. The strongest active value applies and its duration is refreshed.

## Radar Station

Base:

- 15° emission angle
- 850 range
- 0.66 s scan interval
- 35% chance per eligible scan to reveal a stealthed target for 2 s
- non-stealthed targets are detected immediately
- detected/revealed targets inside the active cone take +25% damage from that Radar owner's attacks
- vulnerability does not stack by tower

Fully researched:

- 35° emission angle
- 1224 range
- 0.48 s scan interval
- +75% damage received while validly detected in coverage

Radar affects ground units, air units and buildings. Existing stealth types are respected; `Revealed` temporarily defeats them.

## Jamming Station

Base:

- 15° emission angle
- 750 range
- 0.66 s scan interval
- 25% movement slowdown for 2 s
- 25% attack/detection/range reduction for 2 s
- 30% shutdown chance against drones
- the same shutdown chance applies to guided missiles

Fully researched:

- 35° emission angle
- 1080 range
- 0.48 s scan interval
- 40% movement slowdown
- 45% range reduction
- 46% drone/guided-missile shutdown chance

Jamming range reduction applies to relevant ground/air units and buildings, including defensive-weapon ranges and opposing EW emission range. Successful guided-missile shutdown removes the projectile immediately and preserves AA active-missile accounting.

## Spoofing Station

Base:

- 15° emission angle
- 800 range
- 0.66 s scan interval
- 16% deception chance
- successful deception lasts 2 s

Fully researched:

- 35° emission angle
- 1152 range
- 0.48 s scan interval
- 30% deception chance

A successfully spoofed mobile unit/aircraft temporarily travels toward a harmless fake coordinate and cannot perform offensive targeting/attacks during the deception. Its real order/mission is preserved rather than overwritten, so after 2 s it resumes the original mission. Static buildings are scanned by EW generally but are not spoofed because they have no movement order to corrupt.

## Research

Electronic Warfare & Recon is now an implemented Doctrine and can be selected by both the player and AI. It contains **49 SR cards**:

- Radar Station: 17
- Jamming Station: 16
- Spoofing Station: 16

All SRs use the existing global **$100 / 60 s** SR rules and remain hidden until the Doctrine DR is completed.

## AI

The existing AI research system may now select Electronic Warfare & Recon. Once facilities are unlocked, Radar/Jamming/Spoofing Stations enter the AI's generic construction pool. AI EW antennas periodically orient toward the nearest living enemy Capital.

## Validation

Run:

```bash
node tests/regression.js
node tests/command-smoke.js
node tests/ew-smoke.js
```

EW-specific coverage verifies:

- all 49 research nodes and prerequisite trees;
- final Radar/Jamming/Spoofing numerical stats;
- Radar vulnerability and stealth reveal;
- target-level probability anti-stacking across ten overlapping stations;
- Jamming slow/range effects and expiration;
- drone and guided-missile shutdown;
- building and opposing-EW range suppression;
- temporary Spoof order override/restoration;
- directional cone geometry and research UI rendering;
- AI facility adoption/antenna direction;
- a 120-second fully researched mixed EW combat stress simulation.

The normal AI/economy deterministic baseline was updated because Electronic Warfare is intentionally now available to AI research. The new 200-second baseline hash is stable across repeated runs.

A separate 200-second comparison with AI research disabled produced an identical simulation hash between the pre-EW baseline and this build, confirming that EW infrastructure does not alter ordinary gameplay when the Doctrine is absent.
