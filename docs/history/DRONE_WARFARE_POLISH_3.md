# Drone Warfare Polish 3

## Loyal Wingman evasion
- Loyal Wingmen now perform the same radial + perpendicular jink behavior used by manned Bombers whenever a hostile homing AA missile is actively locked onto them.
- Evasion temporarily overrides formation direction, then the escort controller returns the Wingman to formation when the threat clears.
- During `escortReturn`, evasive steering is still capped to the escorted master's current speed so the Wingman cannot return home faster than its manned aircraft.
- During ordinary escort flight, the Wingman may use its 350 catch-up ceiling while evading and then reforms on the master.

## Escort capacity UI / deployment
- The researched Loyal Wingman sortie cap is also the per-aircraft assignment cap.
- Default: max 3 per aircraft / max 3 per sortie.
- Expanded Sortie I: max 4 per aircraft / max 4 per sortie.
- Expanded Sortie II: max 5 per aircraft / max 5 per sortie.
- The Airbase deployment UI dynamically displays selector buttons from 1 through the current cap.
- The sortie-wide cap still takes precedence across multiple manned aircraft.
- The player's preferred escort count is preserved and clamped to the currently researched limit whenever the deployment interface opens.

## Regression notes
- AA Tower LW-first targeting and the 100-unit in-flight AA retarget rule remain unchanged.
- Loyal Wingman cost remains $400 base / $360 after Economical Wingman.
- Payload behavior and 3→4→5 sortie progression remain unchanged.
