COMMAND RADIUS — OFFLINE RTS PROTOTYPE
======================================
Air warfare / expeditionary fortress revision 7.1

HOW TO RUN
1. Extract the folder if it is inside a ZIP file.
2. Double-click index.html.
3. Choose 1–4 enemy commanders and Standard (3600×2200) or Large (5400×3300) map size on the opening menu.
4. Click BEGIN SKIRMISH.
5. The game runs locally in a modern desktop browser. No server, npm, imports, installation, or network connection are required.

CONTROLS
- Left click: select a friendly building / place a selected building.
- Drag the battlefield with left, middle, or right mouse button: pan the camera.
- A: create a deployment order at the current mouse location.
- In the deployment window, choose a Ground Base or Airbase as the source.
- WASD or arrow keys: move the camera.
- Mouse at screen edge: pan camera.
- Mouse wheel: zoom.
- Escape: cancel construction or close the deployment menu.
- Space: pause/resume.
- F8: optional one-time 300-unit local stress test.

NEW IN REVISION 7.1 — BOMBER OPERATIONS
- Bomber HP is now 350. Air-Defense missiles deal 175 damage each, so two direct missile hits destroy a full-health Bomber.
- A Bomber below 60% HP flies at 65% of its normal speed. Damaged aircraft also show a small smoke trail.
- Each Airbase can maintain a maximum of 7 Bomber airframes total. The cap includes ready Bombers, Bombers in their 15-second landing turnaround, Bombers in training, and Bombers currently airborne with a slot reserved at that Airbase.
- Once an Airbase has seven committed Bombers, it cannot train another one until one of those Bombers is destroyed and frees a slot.
- Each landed Bomber has its own 15-second turnaround cooldown. Cooling aircraft cannot be deployed.
- Bomber damage is persistent across sorties; landing/turnaround does not silently restore HP.
- If an Airbase is destroyed, every Bomber physically stationed or cooling inside that Airbase is destroyed with it.
- Bombers already airborne when their Airbase is destroyed survive. After completing their strike they look for another friendly Airbase with a genuinely free airframe slot.
- If no Airbase has room, returning Bombers recover to/orbit around the Capital and are unavailable for deployment.
- Stranded Bombers automatically claim a free slot and fly to a new/available Airbase when capacity appears. They then complete the normal 15-second turnaround before becoming deployable again.

REVISION 7 — AIRBASE / BOMBERS
- Airbase costs $500 and Bomber costs $100.
- Bombers deploy through the normal A-key coordinate deployment interface by selecting an Airbase.
- A deployed Bomber flies directly toward the chosen coordinates, drops one high-damage, high-AOE bomb, then returns.
- Bomber bomb: 650 base damage with a 175-radius explosion.
- Bombers ignore ground collision/pathfinding and actively jink away from nearby hostile homing missiles.
- Ordinary ground troops, ground turrets, Hive Hunters, and Fortress garrisons cannot directly acquire Bombers.

AIR-DEFENSE TOWER
- Air-Defense Tower costs $300.
- It detects hostile Bombers within a 650-unit radius.
- It launches a batch of two homing missiles at incoming aircraft.
- Each missile deals 175 damage on a direct hit.
- Missiles continuously steer toward their assigned aircraft and expire after six seconds if they hit nothing.
- The tower cannot launch another pair while missiles from its current batch are still active.

FORTRESS
- Fortress costs $1000 and has 1500 HP when complete.
- A Fortress site may be established anywhere on the battlefield.
- Starting one requires at least 10 stored ground military units.
- Ten stored troops physically travel to the site and construction begins when all ten arrive.
- Construction takes 20 seconds.
- When complete, the builders become the permanent Fortress garrison and behave as territorial hunters around the Fortress.
- Garrison casualties are permanent; the Fortress does not create free replacements.
- A completed Fortress provides a 340-unit local construction radius for normal utility and defense buildings.

AI SUPPORT
- AI commanders can construct Airbases, train Bombers, launch strikes against high-value infrastructure, and build Air-Defense Towers.
- AI Bomber production now obeys the same seven-airframe per-Airbase limit and landing turnaround rules as the player.
- AI economy logic continues to build/upgrade Cities and Megacities and save for advanced structures.

REVISION 6 / 6.1 FEATURES RETAINED
- Opening battle setup supports 1–4 AI enemies.
- Explosive tracked shells (Tank/SPG) deal full direct damage to their intended target while secondary targets receive AOE falloff.
- Elite Soldiers and SPGs use distinct silhouettes.
- Hive Turrets actively assign enemies inside the full Hive detection radius to their hunters.
- Military Command Center costs $500, is limited to one per player, accelerates training by 30%, enables MAX / 10 / 5 / 1 controls, and supports three named convoy presets.
- Cities and Megacities have five levels. Each upgrade costs 50% of original construction cost and multiplies current income by 1.5.

IMPLEMENTATION / PERFORMANCE NOTES
- Canvas rendering instead of one DOM element per battlefield entity.
- 30 Hz fixed-step simulation with a strict catch-up limit.
- Spatial hashing for local targeting, mines, collision avoidance, Hive/Fortress detection, AA aircraft detection, and AI threat sensing.
- Static building spatial hash rebuilds only when necessary.
- Bombers bypass ground A* and building collision completely.
- Bomber bays use compact per-aircraft records only while aircraft are landed; airborne Bombers remain normal active entities.
- AA missiles are projectiles, not full simulation entities, and have a hard six-second lifetime.
- Time-sliced coarse-grid A* is reserved for obstructed ground movement.
- Destroyed entities are invalidated immediately and compacted shortly afterward.
- Projectile/effect arrays and active entities have hard safety caps.
- Hard active-entity cap of 1000 across units and buildings.
- No external libraries, frameworks, web fonts, images, or network requests.

ARCHITECTURE PASS A — NON-GAMEPLAY FOUNDATION
- Added definition tags/capabilities for gradual removal of repeated type-specific checks.
- Added cached player/entity modifier sources. The Military Command Center's existing 30% faster training is now the first live modifier-system user.
- Added a generic refresh-by-default status lifecycle. Existing Mortar and Landmine stun behavior is routed through it without changing current balance.
- The intended future Mortar Slow/Immobilize redesign is intentionally not activated yet.
- See docs/history/ARCHITECTURE_PASS_A.md for implementation boundaries and regression results.

MECHANIZED WARFARE IMPLEMENTATION PASS
--------------------------------------
Doctrine 1's confirmed mechanics and full 12-node SR tree are now wired into the research/modifier/lifecycle architecture. APC/IFV transport behavior, armored damage reduction, aggro attraction, IFV turret configuration, and mechanized research modifiers are implemented. See docs/history/MECHANIZED_WARFARE_PASS.md for exact behavior, tests, and the deliberately isolated provisional APC/IFV base balance values. Doctrine Research now starts at $500 and doubles for each subsequent DR, with a 100s duration. Mechanized SR items cost $100 and take 60s. APC/IFV passenger-composition build packages are configurable at Military Bases, and the research tree uses uniform left-to-right connected cards. Capital now has 2 research slots; Doctrine tech trees stay hidden until their DR is completed; R opens Research; research progress updates live without resetting tech-tree scroll position. APC/IFV mobility/durability and IFV fire-on-move behavior were also refined.

ADVANCED ENGINEERING IMPLEMENTATION PASS
----------------------------------------
Doctrine 3 is now implemented. Generic repeatable OU is live for buildings; Advanced Engineering improves OU cost/ceiling and grants 60% voluntary-removal investment recovery. The Advanced Engineering Complex trains persistent autonomous Engineers with endurance, rest, repair, auto-replenishment, and optional State-wide Auto OU. Research Centers are doctrine-locked $1200 research providers with dedicated slots and provider-specific research bonuses. The complete 21-node Advanced Engineering SR tree is wired. See docs/history/ADVANCED_ENGINEERING_PASS.md for exact rules, provisional balance values, edge-case behavior, and regression results.


ARCHITECTURE PASS D — MODULAR RUNTIME
-------------------------------------
- The previous ~474 KB game.js monolith has been split into responsibility-based scripts under js/.
- index.html still uses ordinary classic script tags and remains directly launchable by double-click; there are still no runtime dependencies, imports, npm steps, or server requirements.
- Runtime ownership is documented in docs/ARCHITECTURE.md.
- Permanent headless regression tests are in tests/ and can be run with: node tests/regression.js
- The modular build was compared against the Air Dominance Fix 2 monolith in the same seeded 200-second simulation and produced an identical meaningful simulation snapshot.
- A small behavior-neutral A* optimization reuses the static navigation-neighbor table instead of reallocating it on every path search.
- See ARCHITECTURE_PASS_D.md for validation details and baseline hashes.

AI / BASELINE ECONOMY PASS
---------------------------
- Every living Capital now guarantees $100/min income, stacking with City/Megacity income.
- AI commanders treat loss of their final Military Base as a recovery emergency and save until they can rebuild it.
- AI commanders now use the same Doctrine/SR research system as the player, specialize into tech-tree branches, and diversify into new Doctrines after meaningful branch progress.
- Researched buildings and units automatically join generic AI construction/training/deployment pools, including Mechanized vehicles, Engineering facilities/Engineers, Drone systems, Fighters and Paratrooper planes.
- See AI_ECONOMY_PASS.md for exact AI rules and regression coverage.


ADVANCED COMMAND & AUTOMATION IMPLEMENTATION PASS
--------------------------------------------------
- Doctrine 7 now unlocks Focused Mission and Scheduled Deployment immediately on DR completion.
- Focused deployments ignore distractions until entering the 150-radius destination area; their SR branch adds travel speed and permanent post-arrival damage bonuses.
- Military Command Center now designs/trains 3-node Scheduled Deployments with launch-based wait timers and optional Multi-domain Ground/Air nodes.
- Advanced Coordination Center costs $1500, provides Bandwidth, and sustains Theater Routine, Area Denial/Suppression, or Routine Flights.
- Ground routines consume stored units first, automatically train missing force components, and repeatedly launch toward their assigned coordinate.
- Aerial routines are Airbase-bound and use exact sortie definitions plus quota management that counts ready, airborne, turnaround and queued airframes.
- Destination-unloaded APC/IFV/Paratrooper passengers now hold a 200-radius local assault zone; early unloads keep the original move-to-destination behavior with normal distractions.
- Drone Hub now supports manual production quantities in addition to quick/bulk controls.
- See COMMAND_AUTOMATION_PASS.md for exact SR behavior, the provisional ACC HP value, AI adoption rules and regression coverage.


ELECTRONIC WARFARE & RECON IMPLEMENTATION PASS
-----------------------------------------------
- Doctrine 5 now unlocks directional Radar, Jamming and Spoofing Stations; each costs $1500 and has 600 HP.
- EW coverage is a rotatable cone. The cone is shown only while aiming the antenna; scan waves themselves are never rendered.
- Radar detects ordinary targets, can reveal stealth for 2 seconds, and increases damage received by valid targets inside coverage.
- Jamming temporarily slows units, reduces relevant attack/detection/emission ranges for units and buildings, and can shut down drones or guided missiles.
- Spoofing temporarily redirects mobile enemies toward a false coordinate for 2 seconds while preserving their real mission for automatic recovery afterward.
- Probabilistic EW is target-throttled: overlapping towers improve coverage but do not multiply reveal/shutdown/spoof rolls. Strongest applicable effects win and non-probability effects do not stack.
- The full 49-card EW SR tree and AI research/build adoption are implemented.
- See ELECTRONIC_WARFARE_PASS.md and tests/ew-smoke.js for exact values, interactions and validation.
