# Missile & Advanced Battery Pass

Implemented on top of the EW stats-updated build.

## Doctrine immediate effect
- Missile & Advanced Battery DR grants the existing Air-Defense Tower homing missiles a proximity fuse.
- Trigger distance: 40.
- Airburst radius: 50.
- Airburst damage uses the tower projectile's actual current missile damage, uniformly across the radius.
- Air Defense Towers can acquire hostile strategic missiles as aerial threats.

## Missile Launch Site
- Utility building: $2,000, 1,000 HP.
- Default build cap: 1; research can raise this to 2.
- Default: 4 independently operated silos and 4 missile storage slots.
- Silo count can research to 6; storage can research to 8 and then 12.
- Each silo has its own independent production/reload pipeline.
- Base silo missile build time: 20s. Base physical reload time: 15s.
- A correct missile already in storage skips the 20s build portion and only performs the reload.
- Silos can be independently activated/deactivated and independently configured for missile type.
- Changing a silo configuration does not replace the missile currently building/loading/loaded; the new choice applies to the next replenish cycle after that missile is fired.
- Total committed missiles per MLS cannot exceed storage capacity + silo capacity.

## Stockpile
- Separate FIFO stockpile production queue.
- Click a missile type to enqueue that exact missile.
- Base stockpile fill time: 20s.
- Research reduces fill time to 18s then 16s.
- Final stockpile research enables two parallel production slots consuming the same FIFO queue.

## Aiming and firing
- Select an MLS and enter Aiming Mode.
- Number keys 1–6 select a physical silo when available.
- With no silo explicitly selected, firing walks through the lowest-numbered active loaded silo first.
- Space fires immediately at the current pointer position.
- Clicking the battlefield places an X confirmation mark; confirmation fires the chosen missile.
- Shots outside the loaded missile's researched maximum range are rejected.

## Missiles
- Conventional: $300, range 1300, AOE 150, damage 450, speed 700.
- Hypersonic: $800, range 1700, AOE 180, damage 800, speed 1500.
- High-Explosive: $800, range 1500, AOE 250, damage 450, speed 700.
- Incendiary: $700, range 1500, AOE 150, damage 500, speed 700.
- Strategic missiles are one-use aerial entities with 1 HP and can be intercepted by Air Defense, Jamming, or Spoofing.

## Persistent zones
### Fragmented Zone
- Base radius 100, duration 20s.
- Prevents building placement.
- Enemy ground units suffer -10% movement speed.
- Fragmented Zone slowdown does not stack with another Fragmented Zone.
- Slowdowns from unrelated sources do stack additively; e.g. base Jamming -25% plus Fragmented -10% = -35%.

### Burning Zone
- Base radius 100, duration 10s.
- Affects enemy ground units and buildings.
- Base DOT: 5% max HP/s, capped at 100 HP/s.
- Incendiary damage SRs raise this to 5.5% capped at 110 HP/s, then 6% capped at 120 HP/s.
- Base incoming attack vulnerability: +50%.
- Same Burning Zone effect does not stack; strongest applicable value is used.
- Aircraft, drones, and strategic missiles ignore terrain-zone effects.

## Electronic warfare
- Friendly EW never harms friendly missiles.
- Jamming uses the existing drone/guided-missile shutdown probability against strategic missiles.
- Jamming never reduces strategic missile flight speed.
- Spoofing can permanently redirect a strategic missile to a false forward coordinate.
- Spoofed missiles do not reacquire their original target and cannot be spoofed into a U-turn.
- Existing EW anti-stacking probability throttling applies.

## Research
- Full A–G Specialized Research tree implemented: Hypersonic, HE, Incendiary, missile economy, stockpile, silo/site expansion, and global missile performance.
- Percentage upgrades use the confirmed additive interpretation.

## AI
- AI research now treats Missile & Advanced Battery as implemented content.
- AI can build researched Missile Launch Sites, activate/configure silos, use limited stockpile production, and fire loaded strategic missiles at valid hostile targets inside missile range.

## Validation
Passing suites:
- Architecture regression suite, including deterministic 200-second simulation signature.
- Command & Automation smoke/stress suite.
- Electronic Warfare smoke/stress suite.
- Missile & Advanced Battery smoke suite covering independent silos, FIFO/parallel stockpile production, zones, cross-source slowdown stacking, EW behavior, Air Defense interception/proximity fuse, and AI adoption.


## Missile Battery UI / Balance Polish
- Missile Launch Site now has a dedicated hardened launch-compound battlefield sprite instead of the generic circular building fallback.
- Missile research UI now renders `Unlock Missile Launch Site` once as the common root, with A–G as seven branches from that root.
- All strategic missiles receive +300 base range and +200 base damage.
- MLS selection UI was redesigned around explicit silo status, production progress, stockpile FIFO, active stockpile lines, and compact missile build controls.
- Selection affordability now refreshes continuously while money changes, so newly affordable actions enable without reselecting the building.
- Missile aiming mode is now a dedicated fire-control view: ordinary HUD/minimap are hidden, silo status and current missile remain visible, X-mark confirmation is in the aiming HUD, and Esc exits.

## UI live-refresh correction
- Removed the 0.16s full `renderSelectionPanel()` rebuild from `updateHUD()`.
- Added targeted selection live-state refresh for affordability, HP, training availability, onsite upgrades, MLS silo progress, stockpile production, FIFO queue, and MLS missile-production affordability.
- Full selection-panel renders are now reserved for user actions or true structural changes (for example research adding a new MLS silo/stockpile production slot).
- This prevents hover flicker, preserves input/hover state, and avoids repeated DOM/event-listener reconstruction.
- Added `tests/ui-live-refresh.js` to guard immediate affordability updates without DOM replacement.
