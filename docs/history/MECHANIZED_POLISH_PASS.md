# Mechanized Warfare Polish Pass

This build refines research UX, mechanized movement/combat behavior, and selection UI without changing the doctrine tree structure.

## Research
- Capital has 2 shared DR/SR slots.
- R opens Research during a skirmish.
- A doctrine tech tree is hidden until its DR is completed. Future doctrine tree sections inherit this through `data-doctrine-tree`.
- Research structural DOM is no longer rebuilt on a timer; live progress is updated separately so horizontal tree scroll does not reset.
- Active DR/SR progress and researching tech cards show live percent, remaining time, and progress bars.
- Mechanized tech cards use brighter/larger text and stronger connectors.

## Mechanized behavior / balance
- APC: 650 base HP, 88 base speed.
- IFV: 680 base HP, 84 base speed.
- Stronger Engine: +15% Armoured Vehicle speed.
- Armored property: 20% normal damage reduction; Better Armour raises this to 30%; armor-piercing bypasses it.
- Dismounted APC/IFV infantry inherit the transport destination and ignore distractions until reaching it, then resume normal nearby target acquisition.
- IFVs with a destination order keep moving toward it and fire opportunistically at in-range enemies without stopping/diverting.

## Selection UI
- Remove Structure is lower, compact, and red-outlined.

## Regression
- Syntax check passed.
- Research slots: 2.
- Tree hidden before Mechanized DR / visible after.
- 12 Mechanized tech cards retained.
- Horizontal tree scroll preserved across structural render.
- 10 seconds into a 60-second SR displays 17% live progress.
- Base armored vehicle hit: 100 -> 80 damage; Better Armour: 100 -> 70 damage.
- Stronger Engine Tank speed: 48 -> 55.2.
- Emergency APC dismount inherits destination/focused disembark order.
- IFV fires while moving toward active destination.
- R opens Research.
- Seeded 60-second no-research simulation matches previous build in observable gameplay state.

## Passenger dismount order correction
- Troops released from APCs/IFVs still inherit the transport's destination.
- The inherited destination is an ordinary move order, not a Focused order.
- Dismounted troops may acquire, chase, and attack nearby enemies while travelling.
- After the distraction is resolved, their original destination order remains and they continue toward it.
