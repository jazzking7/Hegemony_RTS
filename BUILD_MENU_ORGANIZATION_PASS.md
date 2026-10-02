# Build Menu Organization Pass

## Construction visibility
- Buildings with unmet doctrine/SR requirements are no longer shown as dimmed/disabled options in the left construction menu.
- A building appears immediately when its actual research requirement is completed.
- Doctrine section headings remain hidden until at least one building belonging to that doctrine is available.

## Ordering
The existing `Utility / Defense` top-level split remains intact. Inside each tab, construction options are grouped in canonical doctrine order:
- General (baseline buildings)
- Mechanized Warfare (when/if it gains buildings)
- Drone Warfare
- Advanced Engineering
- Missile & Advanced Battery
- Electronic Warfare & Recon
- Direct Energy Warfare
- Advanced Command & Automation
- Air Dominance (when/if it gains buildings)
- Advanced Infantry

Only groups with currently available buildings are rendered visibly. Within General, economy/production infrastructure is ordered before forward infrastructure; defense options retain a readable MG → Cannon → Mortar → Mine → Hive → Air Defense progression. Doctrine-specific buildings use stable internal ordering.

## Regression
`tests/build-menu-organization-smoke.js` verifies:
- General buildings remain visible from match start.
- unresearched doctrine buildings and empty doctrine headers are hidden;
- completing an EW building SR reveals only that building and its doctrine group;
- Direct Energy's immediate Generator unlock appears when the doctrine itself completes while later SR buildings remain hidden.
