# Drone Warfare Polish 1

This patch applies the post-release Drone Warfare corrections requested after the first doctrine pass.

## Loyal Wingman formation speed
- Wingman escort formation now uses the master's actual velocity as its baseline.
- When correctly in formation, the Wingman matches the master's speed and direction.
- The Wingman's 350 movement speed remains only as a catch-up/repositioning ceiling when formation error opens up.

## New Loitering Munition SR: Dispersed Swarm
The survivability branch is now:

`+100% HP -> Dispersed Swarm -> Evasive Maneuver -> Stealthy Killer`

Dispersed Swarm gives nearby friendly Loitering Munitions a light local separation bias. It broadens a swarm without overriding its mission/target direction. Hive-generated Loitering Munitions inherit it automatically through the normal LM research capability path.

## Loyal Wingman rendering
The Loyal Wingman no longer uses a conventional aircraft/fighter silhouette. It now uses a broad delta/flying-wing drone profile with no tail/fuselage-like outline, making it immediately distinguishable from Bombers and future normal aircraft.

## Hive Search & Destroy
- Inter-wave cooldown reduced from 6 seconds to 2 seconds.
- The cooldown still begins only after every Loitering Munition in the previous six-drone wave is gone.

## Research tree
Drone Warfare now contains 26 SR cards. The new Dispersed Swarm card is required before Evasive Maneuver.
