# Structure Visuals + Ground Movement Collision Fix

This pass addresses the Advanced Engineering building silhouettes and the recurring ground-unit orbit/spin behavior seen with Advanced Engineers and previously with Hive Hunters.

## Building visuals

- Advanced Engineering Complex now has a dedicated wide industrial/workshop silhouette with service bays, gear core and maintenance-arm details.
- Research Center now has a dedicated octagonal laboratory silhouette with side wings, research core and antenna/radar detail.
- Neither building falls through to the generic circular structure renderer anymore.

## Root cause of Engineer orbiting

The old local movement layer began repelling units from a structure roughly 38 pixels before the structure's hard collision shell. Advanced Engineers needed to get substantially closer than that to enter repair or docking range. The movement goal therefore pulled them toward the structure while collision steering simultaneously pushed them away, causing orbiting/spinning.

## Movement changes

- The minimum building placement spacing is now represented by one shared constant (`BUILDING_PLACEMENT_GAP = 14`).
- Ground collision uses a unit-specific soft shell that guarantees a narrow navigable lane at the minimum legal building spacing.
  - Small units keep essentially their full physical clearance.
  - Larger vehicles are allowed limited visual overlap with building edges so they can still pass through the guaranteed gap.
- Coarse navigation marks the actual structure footprint plus a small margin rather than expanding every structure for the largest ground unit.
- Local building avoidance begins much closer to the structure (`16px` soft margin instead of `38px`).
- Units deliberately approaching a building as their goal (repair, dock, attack/interaction) are not repelled by that same target building. Exact collision still prevents crossing the structure core.
- Obstacle avoidance now adds a deterministic tangent/sidestep component when a building is directly ahead. This prevents radial repulsion from cancelling the desired movement vector and making the unit rotate in place.

## Validation

Targeted regression harness verifies:

- Advanced Engineer reaches a damaged building and begins repairing.
- Engineer enters valid repair range instead of orbiting outside it.
- Idle Engineer returns to and docks in the Advanced Engineering Complex.
- Tank-sized ground unit passes between two Cities placed at the exact minimum legal building spacing.
- Small unit sent head-on toward an obstacle sidesteps and continues instead of spinning in place.
- 200-second seeded skirmish smoke test has no invalid HP/positions/velocities and remains under the entity cap.
