# AI & Baseline Economy Pass

This pass builds on Architecture Pass D without changing the modular load model or requiring a server. `index.html` remains directly launchable from disk.

## Economy

- Every living Capital now generates **$100/min**.
- City and Megacity income is unchanged and stacks on top of Capital income.
- This guarantees a minimum recovery income as long as the Capital survives.

## Military Base recovery

- If an AI loses its final Military Base, rebuilding a Military Base becomes an economic emergency.
- While no Military Base exists, the AI stops discretionary economy development, research purchases and unit training.
- It saves until it can afford the $200 Military Base, then immediately attempts to rebuild one inside its Capital construction radius.
- Other existing Military Base expansion logic is unchanged once at least one Base exists again.

## AI research

AI players use the same research runtime as the human player:

- same DR escalation ($500, $1,000, $2,000, ...),
- same 100-second DR duration,
- same $100 / 60-second SR rules,
- same research slots,
- same prerequisite graph,
- same Research Center slots and provider-specific Advanced Engineering bonuses,
- same global Doctrine/SR modifiers.

Only doctrines whose gameplay content is currently implemented are eligible for AI selection.

### Specialization and diversification

1. The AI randomly chooses an implemented Doctrine.
2. After the DR completes, it chooses a tech-tree lane and preferentially works toward the end of that branch.
3. Spare research slots may work on other currently eligible SRs instead of remaining idle.
4. A doctrine is considered substantially specialized after the AI has:
   - completed at least **4 SRs** in that doctrine, and
   - fully completed at least **one tech-tree lane/branch**.
5. After that checkpoint, the AI becomes eligible to research another random implemented Doctrine while continuing to develop its older doctrines.

This is intentionally simple. It produces specialization without hard-coded AI personality classes.

## Adoption of researched content

Unlocked content is added to generic AI pools rather than requiring a separate strategy controller for every SR.

### Buildings

The AI can construct unlocked:

- Advanced Engineering Complex,
- Research Center,
- Drone Hub.

Its existing Airbase, Military Base and defense construction logic remains intact.

### Units

- APC and IFV join Military Base production after unlock.
- IFVs use both MG and Grenade configurations once the Grenade Launcher option is researched.
- Advanced Engineering Complexes autonomously build toward a modest Engineer staff.
- Drone Hubs produce Loitering Munitions and occasional Loyal Wingmen after unlock.
- Super Fighters and Paratrooper Planes join Airbase production after unlock.
- Existing Bombers continue to be produced.

AI transports and aircraft use the same player configuration, package costs, passenger identity, capacity and aircraft lifecycle systems as human-built units.

### Deployment

- Ground attacks already iterate the shared ground-unit list, so researched APCs/IFVs naturally join AI offensives.
- AI air sorties can now include Bombers, Super Fighters and Paratrooper Planes.
- Available Loyal Wingmen may escort those manned sorties under the same sortie-cap rules.
- Stored Loitering Munitions are deployed in attack waves from Drone Hubs.
- Once Drone Warfare unlocks Hive Search & Destroy, some AI Hives automatically use that mode while others remain UGV Hives for mixed defenses.

## Performance / maintainability

No high-frequency tactical planner was added. Research decisions remain throttled to a low-frequency strategic timer, while existing build/train/attack timers remain separate. This keeps the AI inexpensive relative to movement/combat simulation and preserves the module boundaries introduced in Architecture Pass D.

## Regression coverage

`node tests/regression.js` now permanently covers:

- Capital baseline income,
- last-Military-Base recovery,
- AI DR → SR progression,
- specialization checkpoint semantics,
- unlocked doctrine-facility construction,
- unlocked advanced-unit production,
- existing research constants,
- Armored damage reduction,
- homing-AA cleanup,
- finite 200-second simulation state,
- deterministic AI/economy baseline signature including research state.
