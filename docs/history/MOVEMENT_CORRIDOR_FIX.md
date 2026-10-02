# Ground Movement Corridor Fix

This pass replaces the previous distance-based building repulsion with exact-geometry corridor movement.

## Root cause

Three systems could disagree in tight structure layouts:

1. the 48px coarse A* navigation grid could not represent a 14px legal building gap;
2. soft radial building avoidance overlapped from both sides of the gap and pushed a unit in contradictory directions;
3. unit-unit separation could shove units sideways into the building collision shells.

A unit could therefore physically fit through a corridor while navigation still told it to detour, producing edge adhesion, orbiting, wiggle loops and apparent freezing.

## Changes

- Legal building gaps are now guaranteed to be traversable by every ground unit.
- Ground/building collision uses a small shared 4px structure-edge clearance rather than requiring a full unit-radius clearance. This intentionally permits slight visual unit/building overlap.
- Exact circle/segment geometry is checked before the coarse navigation grid. If the real route fits through a gap, the unit goes straight through and any stale A* detour is discarded immediately.
- Buildings no longer repel units simply for being nearby. Avoidance activates only when the unit's short projected movement segment would actually intersect the building collision shell.
- Blocking buildings produce stable tangent steering instead of radial force cancellation.
- Unit-unit separation is substantially softened when units are inside a structure-dense corridor, allowing harmless visual overlap instead of traffic-jam deadlocks.
- Stuck detection now measures progress toward the current navigation target. Orbiting a structure is therefore correctly considered stuck even when the unit is moving continuously.
- A short `gapAssist` state further reduces only edge clearance when a unit makes no useful progress. The building core remains solid.
- Full building phasing remains only as a much later, short last-resort escape for genuinely enclosed/corrupt layouts.

## Targeted regression tests

- Tank crosses two Cities placed at the exact minimum legal 14px edge gap in a straight line with zero lateral deviation.
- 18 infantry units all cross the same minimum-width corridor under dense traffic.
- SPG crosses a tight building gap without oscillation.
- Unit started against a building edge routes around the structure and reaches its destination instead of orbiting.
- Advanced Engineer crosses a minimum-width structure corridor, reaches a damaged building and begins repairing it.
- 120-second full-skirmish smoke test completed with finite unit/building positions, velocities and HP, no stuck path queues, and entity count below the cap.
