# Architecture Pass C — Entity Lifecycle, Storage & Containment

This pass builds on Architecture Pass B and is intentionally focused on lifecycle/containment plumbing rather than new Doctrine content. APC, IFV, Super Infantry, Paratrooper Plane, Drone Hub, and other future content are **not** implemented here.

## Goals

- Give stored/contained units persistent identities without replacing the current lightweight simulation model.
- Create a Capital Reserve state for entities evacuated from voluntarily removed structures.
- Implement voluntary non-Capital structure removal with no normal refund.
- Preserve existing destructive-loss behavior separately from voluntary removal.
- Prepare reusable identity/state semantics for future cargo, garrisons, aircraft, and configurable units.

## Lifecycle states

`LIFECYCLE_STATES` now defines:

- `ACTIVE`
- `STORED`
- `CARGO`
- `GARRISONED`
- `TURNAROUND`
- `CAPITAL_RESERVE`
- `DESTROYED`

A battlefield entity still has its short-lived runtime `id`. Units/airframes now also have a persistent `instanceId` that survives storage and redeployment.

## Persistent unit records

Military Base storage now uses identity-bearing `storedUnits` records underneath the existing `storage[type]` counters. The counters remain as compatibility/UI mirrors so existing screens and calculations do not need to be rewritten at once.

A unit record currently preserves:

- persistent `instanceId`
- unit type / player
- lifecycle state
- HP / max HP
- On-site Upgrade identities
- configuration payload (reserved for future configured entities)
- variant identity (reserved for future loadouts)
- persistent OU/config modifier sources
- origin facility type
- aircraft `readyAt` where applicable

Ground deployment and Fortress builder mobilization now consume records and create active units from them. If activation fails, the record is restored to storage.

## Bomber identity

The existing seven-airframe Airbase commitment model is preserved. `bomberBay` entries are now persistent airframe records rather than anonymous `{ hp, readyAt }` objects.

Landing an active Bomber converts that same airframe identity back into a `TURNAROUND` record. Once its existing 15-second timer has elapsed, the record becomes `STORED`/ready. Persistent HP/configuration/OU information is retained.

## Capital Reserve

Each player now owns `capitalReserve`.

Voluntarily removing a structure evacuates contained built entities into this inactive state. Compatible newly created facilities automatically recover applicable reserve records:

- ground troops -> Military Base
- Bombers -> Airbase, subject to existing Airbase capacity

If no compatible facility exists, records remain inactive in the Capital Reserve. The Capital selection panel and top force HUD expose reserve counts.

## Voluntary structure removal

All player-owned non-Capital structures now expose **REMOVE STRUCTURE — NO STRUCTURE REFUND**.

Normal removal:

- gives no refund;
- evacuates Military Base stored troops;
- evacuates stationed Airbase airframes;
- leaves airborne Bombers alive and clears the removed home-base assignment;
- evacuates an operational Fortress garrison;
- detaches still-active Fortress construction builders instead of teleporting them;
- cancels that structure's queued production and fully refunds every unfinished paid unit in that queue;
- removes the structure without invoking destructive-loss semantics.

Queued training is paid up front. If its production structure is voluntarily removed, every queue entry that has not completed training yet is cancelled and refunded at its full unit cost. This includes the currently-progressing first queue item; partial progress does not reduce the refund. Completed stored units are not refunded—they evacuate through the Capital Reserve instead.

## Destruction remains different

This pass does **not** convert combat destruction into evacuation.

In particular, destroying an Airbase still destroys physically stationed/cooling Bombers exactly as before. Airborne Bombers survive and lose their invalid home-base assignment. Destroying a Fortress still releases its surviving garrison according to the existing behavior.

## Future Advanced Engineering refund support

Buildings now track `totalInvestedCost`. Settlement upgrade costs and future OU costs contribute to it. `removeBuilding(building, { refundRate })` supports a caller-provided refund rate, while the normal UI always uses zero.

This prepares the confirmed Advanced Engineer rule (60% of total cost on removal) without unlocking or implementing Advanced Engineering itself.

## Compatibility / performance strategy

Contained records are not live battlefield entities and do not count against the 1000 active-entity target. Existing `storage` counters remain available to old UI/AI code as synchronized mirrors. No per-frame global record resolver was introduced.

## Regression verification

- `node --check game.js` passes.
- Persistent identity round-trip verified (`STORED -> ACTIVE -> STORED`) including HP/configuration preservation.
- Military Base removal/rebuild evacuation and recovery verified.
- Airbase voluntary removal/rebuild verified, including preserved airframe identities.
- Airborne Bomber survival/home invalidation verified.
- Fortress garrison evacuation/recovery verified.
- Destructive Airbase loss still destroys stationed airframes rather than evacuating them.
- Turnaround records transition back to ready storage correctly.
- Seeded 200-second simulation snapshot is identical to Architecture Pass B for existing gameplay state (economy, AI, entities, HP, positions/orders, queues, projectiles, effects).

## Next phase

With lifecycle/containment established, the next feature phase can implement **Mechanized Warfare** (APC/IFV + doctrine immediate modifiers + vehicle configuration foundation) without inventing separate passenger identity/storage rules.
