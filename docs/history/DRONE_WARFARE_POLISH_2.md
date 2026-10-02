# Drone Warfare Polish 2

## Loyal Wingman combat/logistics correction

- Loyal Wingman base cost is now **$400**. The 10% discount SR reduces it to **$360**.
- A sortie must contain at least one manned aircraft; Loyal Wingmen cannot launch as a standalone sortie.
- Loyal Wingman sortie cap starts at **3**. The two former missile-diversion-cap SR cards now each add +1 maximum LW per sortie, producing **3 -> 4 -> 5**.
- The existing 1/2 escorts-per-aircraft selector remains, but the sortie-wide cap always wins.

## Air-defense priority

- Air-Defense Towers always choose a Loyal Wingman before any manned aircraft when at least one LW is inside tower range.
- Already-flying homing AA missiles continuously check a **100-unit proximity radius**. If an enemy LW enters that radius, the missile immediately retargets to the nearest LW, even if it was already chasing a manned aircraft.
- The older master-specific missile-diversion-cap behavior has been removed.

## Payload firing

- Loyal Wingmen fire their air-ground missile payload directly at the designated mission coordinate as soon as it enters the **250-unit missile range**. No enemy entity lock is required.
- Payload remains 1 by default and rises to 2 and then 3 via SR.
- A short launch flash was added so missile release is visually obvious.

## Return behavior

- When a Loyal Wingman returns together with its escorted master, it keeps formation and is capped to the master's current speed. It therefore cannot race home faster than its escort.
- The 350 movement ceiling is still used for catch-up/repositioning and independent flight after the master is no longer available.

## Regression checks

Focused browser tests passed for:
- $400 base / $360 researched cost
- 3 -> 4 -> 5 sortie cap
- AA tower LW-first acquisition
- in-flight AA retarget within 100
- coordinate-range payload launch
- return-speed cap relative to master
- sortie-wide cap under multiple bombers
- prevention of LW-only sorties
