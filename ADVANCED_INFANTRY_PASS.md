# Advanced Infantry Pass

This pass implements Doctrine 9: Advanced Infantry on top of the Direct Energy Warfare build.

## Doctrine immediate effects
- Basic Soldier and Elite Soldier receive +50% damage and +50% max HP.
- Basic/Elite infantry gain critical hits: 5% base Crit Rate and +50% base Crit Damage.
- The doctrine multiplier applies to default attacks and Exosuit weapon base damage.

## Superior Mobilization Complex
- Utility building: $2,000, 1,000 HP, no build cap.
- Each operational Complex contributes 3 global player loadout slots and stores up to 200 infantry.
- Loadout names are globally unique; identical equipment under different names remains a distinct deployment identity.
- Loadout designs persist when Complexes are lost. Existing soldiers are unaffected; configured production pauses while no operational Complex exists.
- Military Bases and Superior Mobilization Complexes can train configured infantry.
- Spawned/stored troops carry immutable configuration snapshots, so later blueprint edits affect future production only.

## Exosuit loadouts
Normal Soldier: 1 Helmet, 1 Body Armour, 1 Weapon, 1 Boots, 2 Modules.
Elite Soldier: 1 Helmet, 1 Body Armour, 2 distinct independently firing Weapons, 1 Boots, 4 distinct Modules. Elite may use Basic or Elite equipment.

Equipment price is added to the underlying soldier training cost: Basic helmet/body/boots +$4, Elite helmet/body/boots +$8, shared weapons +$6, Basic modules +$7, Elite modules +$14.

### Weapons
- Machine Gun: 6 rounds/s, 10 base damage, range 200.
- Anti-Armor Grenade Launcher: 1 shot / 1.5s, range 150, 100 normal / 250 versus Armoured, radius-50 AOE.
- Shotgun: 5 pellets, 2-degree separation, 25 damage/pellet, 0.75s volleys, range 120.
- Railgun: 60 damage, 1.6s, target acquisition range 250; projectile travels up to 500 and can hit the initial target + 1 additional enemy.
- Elite dual weapons keep independent cooldowns and only activate when their own range is satisfied.
- Empty weapon selection preserves the soldier's normal default attack pattern.

## Defensive/combat layering
- Equipment damage reductions multiply rather than add.
- Armoured remains its own 20% layer and AP bypasses only that armor layer.
- Energy Field reduction remains a separate layer.
- Nullificator rolls on direct damaging hits only, not environmental burn ticks.
- Crit behavior: MG bullets roll separately; Shotgun pellets roll separately; Railgun rolls once per projectile and preserves the crit state through penetration; Grenade rolls once for the explosion.

## Modules
- Healing (2% max HP/s) and Immortal (4% max HP/s) stack.
- Counter-EW (+27%) and EW-resistant (+48%) stack additively, capped at 100%.
- Revanchism: 10% death proc, radius 50, +5% Crit Rate / +10% Crit Damage for 10s.
- Avenger: 25% death proc, radius 100, +10% Crit Rate / +20% Crit Damage for 10s.
- Revanchism and Avenger stack with each other; same-source buffs refresh duration instead of stacking.
- Rampage below 30% HP: +10% movement speed, +10% attack speed, +5% Crit Rate, +10% Crit Damage; it turns off again if healing crosses the threshold.
- Conceal uses proximity-stealth acquisition behavior; Stealth uses full attack-breaking/re-stealth behavior.
- Dodging adds actual lateral zigzag steering; Distributed adds stronger local infantry separation.
- Duplicate exact modules/weapons cannot be equipped.

## Research
- Unlock Superior Mobilization Complex is the root SR.
- Research is displayed as five component pools: Helmet, Body Armour, Weapon, Boots, Module.
- Basic equipment SR: $100 / 60s.
- Elite equipment SR: $250 / 60s.
- Weapons are shared equipment and use the Basic $100 / 60s research cost.

## Deployment / persistence integration
Named loadout identities work through:
- Military Base and Superior Mobilization Complex storage
- direct deployment
- APC/IFV cargo records
- convoy definitions/training
- Scheduled Deployments
- Theater automated warfare
- Capital Reserve evacuation/recovery

Configured soldiers retain their variant/configuration snapshots through these transitions.

## AI
AI players that research Advanced Infantry build a Superior Mobilization Complex, create conservative Basic/Elite loadouts from researched equipment, and train configured infantry without random duplicate-equipment spam.

## Verification
Passing suites after this pass:
- `tests/advanced-infantry-smoke.js`
- `tests/command-smoke.js`
- `tests/directed-energy-smoke.js`
- `tests/missile-smoke.js`
- `tests/ew-smoke.js`
- `tests/ui-live-refresh.js`
- `tests/ux-navigation-smoke.js`
- `tests/regression.js`

The 200-second deterministic AI/economy baseline was intentionally updated after Doctrine 9 became content-ready and AI-usable; repeated runs produce the same new signature.
