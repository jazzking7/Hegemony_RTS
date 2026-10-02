'use strict';

  // ---------------------------------------------------------------------------
  // Advanced Infantry / Exosuit loadouts
  // ---------------------------------------------------------------------------
  // Loadouts are persistent player blueprints. Trained soldiers receive a deep
  // snapshot so editing a blueprint never mutates troops already built.

  const ADV_INF_CATALOG = Object.freeze({
    helmet: Object.freeze({
      sniperOptics: Object.freeze({ name:'Sniper Optics', tier:'basic', research:'aiHelmetSniperOptics', cost:4, detectionMult:1.50, rangeMult:1.25 }),
      advancedProtection: Object.freeze({ name:'Advanced Protection', tier:'basic', research:'aiHelmetAdvancedProtection', cost:4, reduction:0.15 }),
      targetingAssistance: Object.freeze({ name:'Advanced Targeting Assistance', tier:'basic', research:'aiHelmetTargeting', cost:4, critRate:0.05 }),
      hawkeyeOptics: Object.freeze({ name:'Hawkeye Optics', tier:'elite', research:'aiHelmetHawkeye', cost:8, detectionMult:2.00, rangeMult:1.50 }),
      comprehensiveProtection: Object.freeze({ name:'Comprehensive Protection', tier:'elite', research:'aiHelmetComprehensive', cost:8, reduction:0.25, hp:100 }),
      enemyAnalysis: Object.freeze({ name:'Advanced Enemy Analysis & Targeting Assistance', tier:'elite', research:'aiHelmetEnemyAnalysis', cost:8, critRate:0.10, critDamage:0.25 })
    }),
    body: Object.freeze({
      highSurvivability: Object.freeze({ name:'High Survivability', tier:'basic', research:'aiBodySurvivability', cost:4, hp:50 }),
      compositeArmour: Object.freeze({ name:'Composite Armour', tier:'basic', research:'aiBodyComposite', cost:4, armoured:true }),
      nullificator: Object.freeze({ name:'Nullificator', tier:'basic', research:'aiBodyNullificator', cost:4, nullify:0.10 }),
      extremeSurvivability: Object.freeze({ name:'Extreme Survivability', tier:'elite', research:'aiBodyExtreme', cost:8, hp:150 }),
      multilayerComposite: Object.freeze({ name:'MultiLayer Composite Armour', tier:'elite', research:'aiBodyMultilayer', cost:8, armoured:true, reduction:0.20 }),
      nullificatorElite: Object.freeze({ name:'Nullificator', tier:'elite', research:'aiBodyNullificatorElite', cost:8, nullify:0.25 })
    }),
    weapon: Object.freeze({
      machineGun: Object.freeze({ name:'Machine Gun', tier:'basic', research:'aiWeaponMachineGun', cost:6, damage:10, range:200, cooldown:1/6, projectileSpeed:900, kind:'machineGun' }),
      grenadeLauncher: Object.freeze({ name:'Anti-Armor Grenade Launcher', tier:'basic', research:'aiWeaponGrenade', cost:6, damage:100, armouredDamage:250, range:150, cooldown:1.5, projectileSpeed:520, aoe:50, kind:'grenade' }),
      shotgun: Object.freeze({ name:'Shotgun', tier:'basic', research:'aiWeaponShotgun', cost:6, damage:25, range:120, cooldown:0.75, projectileSpeed:820, pellets:5, spreadDeg:2, kind:'shotgun' }),
      railgun: Object.freeze({ name:'Railgun', tier:'basic', research:'aiWeaponRailgun', cost:6, damage:60, range:250, cooldown:1.6, projectileSpeed:1100, maxDistance:ADVANCED_INFANTRY_BALANCE.railgunMaxDistance, maxHits:ADVANCED_INFANTRY_BALANCE.railgunMaxHits, kind:'railgun' })
    }),
    boots: Object.freeze({
      swiftSpeed: Object.freeze({ name:'Swift Speed', tier:'basic', research:'aiBootSwift', cost:4, speed:0.08 }),
      antiLandmine: Object.freeze({ name:'Anti Landmine', tier:'basic', research:'aiBootAntiMine', cost:4, antiMine:true }),
      stabilizingSupport: Object.freeze({ name:'Stabilizing Support', tier:'basic', research:'aiBootStabilizer', cost:4, critRate:0.05 }),
      highEndurance: Object.freeze({ name:'High Endurance', tier:'basic', research:'aiBootEndurance', cost:4, hp:50 }),
      greaterProtection: Object.freeze({ name:'Greater Protection', tier:'basic', research:'aiBootProtection', cost:4, reduction:0.05 }),
      superfastSpeed: Object.freeze({ name:'Superfast Speed', tier:'elite', research:'aiBootSuperfast', cost:8, speed:0.20 }),
      cornerstoneStabilizer: Object.freeze({ name:'Cornerstone Stabilizer', tier:'elite', research:'aiBootCornerstone', cost:8, critRate:0.10 }),
      enhancedSurvivability: Object.freeze({ name:'Enhanced Survivability', tier:'elite', research:'aiBootSurvivability', cost:8, hp:150 }),
      greatProtection: Object.freeze({ name:'Great Protection', tier:'elite', research:'aiBootGreatProtection', cost:8, reduction:0.15, antiMine:true })
    }),
    module: Object.freeze({
      dodging: Object.freeze({ name:'Dodging', tier:'basic', research:'aiModuleDodging', cost:7, dodging:true }),
      distributed: Object.freeze({ name:'Distributed', tier:'basic', research:'aiModuleDistributed', cost:7, distributed:true }),
      healing: Object.freeze({ name:'Healing', tier:'basic', research:'aiModuleHealing', cost:7, healPerSec:0.02 }),
      conceal: Object.freeze({ name:'Conceal', tier:'basic', research:'aiModuleConceal', cost:7, conceal:true }),
      counterEW: Object.freeze({ name:'Counter-EW', tier:'basic', research:'aiModuleCounterEW', cost:7, ewResist:0.27 }),
      revanchism: Object.freeze({ name:'Revanchism', tier:'basic', research:'aiModuleRevanchism', cost:7, revanchism:true }),
      luckyStar: Object.freeze({ name:'Lucky Star', tier:'basic', research:'aiModuleLuckyStar', cost:7, critRate:0.05 }),
      madhit: Object.freeze({ name:'Madhit', tier:'basic', research:'aiModuleMadhit', cost:7, critDamage:0.10 }),
      immortal: Object.freeze({ name:'Immortal', tier:'elite', research:'aiModuleImmortal', cost:14, healPerSec:0.04 }),
      stealth: Object.freeze({ name:'Stealth', tier:'elite', research:'aiModuleStealth', cost:14, stealth:true }),
      ewResistant: Object.freeze({ name:'EW-resistant', tier:'elite', research:'aiModuleEWResistant', cost:14, ewResist:0.48 }),
      avenger: Object.freeze({ name:'Avenger', tier:'elite', research:'aiModuleAvenger', cost:14, avenger:true }),
      goldeye: Object.freeze({ name:'Goldeye', tier:'elite', research:'aiModuleGoldeye', cost:14, critRate:0.10 }),
      weakpointExploiter: Object.freeze({ name:'Weakpoint Exploiter', tier:'elite', research:'aiModuleWeakpoint', cost:14, critDamage:0.40 }),
      rampage: Object.freeze({ name:'Rampage', tier:'elite', research:'aiModuleRampage', cost:14, rampage:true })
    })
  });

  const ADV_INF_CATEGORY_LABELS = Object.freeze({ helmet:'Helmet', body:'Body Armour', weapon:'Weapon', boots:'Boots', module:'Module' });

  function getAdvancedInfantryState(playerId) {
    const player = game.players[playerId];
    if (!player) return null;
    player.advancedInfantry ||= { loadouts: [], nextLoadoutId: 1 };
    player.advancedInfantry.loadouts ||= [];
    player.advancedInfantry.nextLoadoutId ||= 1;
    return player.advancedInfantry;
  }

  function getPlayerInfantryLoadouts(playerId) {
    return getAdvancedInfantryState(playerId)?.loadouts || [];
  }

  function getOperationalSMCs(playerId) {
    return game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === 'superiorMobilizationComplex');
  }

  function hasOperationalSuperiorMobilizationComplex(playerId) {
    return getOperationalSMCs(playerId).length > 0;
  }

  function getInfantryLoadoutCapacity(playerId) {
    return getOperationalSMCs(playerId).length * ADVANCED_INFANTRY_BALANCE.loadoutsPerComplex;
  }

  function getInfantryLoadoutById(playerId, loadoutId) {
    return getPlayerInfantryLoadouts(playerId).find(row => String(row.id) === String(loadoutId)) || null;
  }

  function getInfantryLoadoutToken(playerId, loadoutId) {
    return `loadout:${playerId}:${loadoutId}`;
  }

  function parseInfantryLoadoutToken(token) {
    const m = /^loadout:(\d+):(.+)$/.exec(String(token || ''));
    return m ? { playerId:Number(m[1]), loadoutId:m[2] } : null;
  }

  function isInfantryLoadoutToken(token) { return !!parseInfantryLoadoutToken(token); }

  function registerInfantryLoadoutToken(playerId, loadoutId) {
    // Identity is encoded in the token. Command/convoy UIs opt into dynamic
    // loadout definitions explicitly instead of mutating the global base-unit
    // type array, which keeps unrelated systems stable.
    return getInfantryLoadoutToken(playerId, loadoutId);
  }

  function getInfantryEquipment(category, id) {
    return ADV_INF_CATALOG[category]?.[id] || null;
  }

  function isEquipmentAllowedForSoldier(item, soldierType) {
    return !!item && (soldierType === 'elite' || item.tier !== 'elite');
  }

  function isInfantryEquipmentUnlocked(playerId, category, id, soldierType = 'elite') {
    const item = getInfantryEquipment(category, id);
    return isEquipmentAllowedForSoldier(item, soldierType) && isResearchComplete(playerId, item.research);
  }

  function getUnlockedInfantryEquipment(playerId, category, soldierType) {
    return Object.entries(ADV_INF_CATALOG[category] || {}).filter(([, item]) => isEquipmentAllowedForSoldier(item, soldierType) && isResearchComplete(playerId, item.research));
  }

  function sanitizeLoadoutSelection(playerId, soldierType, category, value) {
    if (!value) return null;
    return isInfantryEquipmentUnlocked(playerId, category, value, soldierType) ? value : null;
  }

  function normalizeInfantryLoadout(playerId, source, existingId = null) {
    const soldierType = source?.soldierType === 'elite' ? 'elite' : 'basic';
    const weaponMax = soldierType === 'elite' ? 2 : 1;
    const moduleMax = soldierType === 'elite' ? 4 : 2;
    const weapons = [...new Set((Array.isArray(source?.weapons) ? source.weapons : [source?.weapon]).filter(Boolean))]
      .map(id => sanitizeLoadoutSelection(playerId, soldierType, 'weapon', id)).filter(Boolean).slice(0, weaponMax);
    const modules = [...new Set((source?.modules || []).filter(Boolean))]
      .map(id => sanitizeLoadoutSelection(playerId, soldierType, 'module', id)).filter(Boolean).slice(0, moduleMax);
    return {
      id: existingId ?? source?.id ?? null,
      name: String(source?.name || '').trim().slice(0, 30),
      soldierType,
      helmet: sanitizeLoadoutSelection(playerId, soldierType, 'helmet', source?.helmet),
      body: sanitizeLoadoutSelection(playerId, soldierType, 'body', source?.body),
      weapons,
      boots: sanitizeLoadoutSelection(playerId, soldierType, 'boots', source?.boots),
      modules
    };
  }

  function validateInfantryLoadout(playerId, source, existingId = null) {
    const rawWeapons = (Array.isArray(source?.weapons) ? source.weapons : [source?.weapon]).filter(Boolean);
    const rawModules = (source?.modules || []).filter(Boolean);
    if (new Set(rawWeapons).size !== rawWeapons.length) return { ok:false, reason:'The same weapon cannot be selected twice.' };
    if (new Set(rawModules).size !== rawModules.length) return { ok:false, reason:'The same module cannot be selected twice.' };
    const loadout = normalizeInfantryLoadout(playerId, source, existingId);
    if (!loadout.name) return { ok:false, reason:'Give the loadout a name.' };
    const dupe = getPlayerInfantryLoadouts(playerId).find(row => String(row.id) !== String(existingId ?? '') && row.name.toLowerCase() === loadout.name.toLowerCase());
    if (dupe) return { ok:false, reason:'Loadout names must be unique.' };
    if (!existingId && getPlayerInfantryLoadouts(playerId).length >= getInfantryLoadoutCapacity(playerId)) return { ok:false, reason:'Build another Superior Mobilization Complex to gain three more loadout slots.' };
    return { ok:true, loadout };
  }

  function saveInfantryLoadout(playerId, source, existingId = null) {
    const state = getAdvancedInfantryState(playerId);
    if (!state || !isResearchComplete(playerId, 'aiUnlockComplex')) return { ok:false, reason:'Superior Infantry configuration is not unlocked.' };
    const result = validateInfantryLoadout(playerId, source, existingId);
    if (!result.ok) return result;
    const loadout = clonePlain(result.loadout);
    if (existingId != null) {
      const index = state.loadouts.findIndex(row => String(row.id) === String(existingId));
      if (index < 0) return { ok:false, reason:'Loadout no longer exists.' };
      loadout.id = state.loadouts[index].id;
      state.loadouts[index] = loadout;
    } else {
      loadout.id = state.nextLoadoutId++;
      state.loadouts.push(loadout);
    }
    registerInfantryLoadoutToken(playerId, loadout.id);
    return { ok:true, loadout };
  }

  function deleteInfantryLoadout(playerId, loadoutId) {
    const state = getAdvancedInfantryState(playerId);
    const index = state?.loadouts.findIndex(row => String(row.id) === String(loadoutId)) ?? -1;
    if (index < 0) return false;
    state.loadouts.splice(index, 1);
    return true;
  }

  function getLoadoutItemList(loadout) {
    if (!loadout) return [];
    const rows = [];
    if (loadout.helmet) rows.push(['helmet', loadout.helmet]);
    if (loadout.body) rows.push(['body', loadout.body]);
    for (const id of loadout.weapons || []) rows.push(['weapon', id]);
    if (loadout.boots) rows.push(['boots', loadout.boots]);
    for (const id of loadout.modules || []) rows.push(['module', id]);
    return rows;
  }

  function getInfantryLoadoutExtraCost(loadout) {
    return getLoadoutItemList(loadout).reduce((sum, [category,id]) => sum + (getInfantryEquipment(category,id)?.cost || 0), 0);
  }

  function getInfantryLoadoutTrainingCost(playerId, loadout) {
    if (!loadout) return Infinity;
    return getUnitCost(playerId, loadout.soldierType) + getInfantryLoadoutExtraCost(loadout);
  }

  function getInfantryLoadoutConfigurationSnapshot(playerId, loadout) {
    if (!loadout) return null;
    return {
      advancedInfantry: true,
      loadoutId: loadout.id,
      loadoutName: loadout.name,
      soldierType: loadout.soldierType,
      helmet: loadout.helmet || null,
      body: loadout.body || null,
      weapons: [...(loadout.weapons || [])],
      boots: loadout.boots || null,
      modules: [...(loadout.modules || [])],
      extraCost: getInfantryLoadoutExtraCost(loadout)
    };
  }

  function getAdvancedInfantryConfig(entityOrConfig) {
    const config = entityOrConfig?.configuration || entityOrConfig;
    return config?.advancedInfantry ? config : null;
  }

  function isAdvancedInfantryUnit(unit) {
    return !!(unit?.kind === 'unit' && INFANTRY_UNIT_TYPES.includes(unit.type) && getAdvancedInfantryConfig(unit));
  }

  function hasAdvancedInfantryModule(entity, id) {
    return !!getAdvancedInfantryConfig(entity)?.modules?.includes(id);
  }

  function getAdvancedInfantryFlatHp(entityOrConfig) {
    const config = getAdvancedInfantryConfig(entityOrConfig);
    if (!config) return 0;
    let hp = 0;
    for (const [category,id] of getLoadoutItemList(config)) hp += getInfantryEquipment(category,id)?.hp || 0;
    return hp;
  }

  function getAdvancedInfantrySpeedMultiplier(unit) {
    const config = getAdvancedInfantryConfig(unit);
    if (!config) return 1;
    let bonus = getInfantryEquipment('boots', config.boots)?.speed || 0;
    if (hasAdvancedInfantryModule(unit, 'rampage') && unit.hp / Math.max(1, unit.maxHp) < 0.30) bonus += 0.10;
    return 1 + bonus;
  }

  function getAdvancedInfantryRangeMultiplier(unit) {
    const config = getAdvancedInfantryConfig(unit);
    return config ? (getInfantryEquipment('helmet', config.helmet)?.rangeMult || 1) : 1;
  }

  function getAdvancedInfantryCooldownMultiplier(unit) {
    if (!isAdvancedInfantryUnit(unit)) return 1;
    return hasAdvancedInfantryModule(unit, 'rampage') && unit.hp / Math.max(1, unit.maxHp) < 0.30 ? (1 / 1.10) : 1;
  }

  function getAdvancedInfantryDetectionMultiplier(unit) {
    const config = getAdvancedInfantryConfig(unit);
    return config ? (getInfantryEquipment('helmet', config.helmet)?.detectionMult || 1) : 1;
  }

  function getAdvancedInfantryDamageIntakeMultiplier(unit, armorPiercing = false) {
    const config = getAdvancedInfantryConfig(unit);
    if (!config) return 1;
    let mult = 1;
    const helmet = getInfantryEquipment('helmet', config.helmet);
    const body = getInfantryEquipment('body', config.body);
    const boots = getInfantryEquipment('boots', config.boots);
    if (helmet?.reduction) mult *= (1 - helmet.reduction);
    if (body?.reduction) mult *= (1 - body.reduction);
    if (boots?.reduction) mult *= (1 - boots.reduction);
    if (!armorPiercing && body?.armoured) mult *= (1 - ARMORED_BASE_DAMAGE_REDUCTION);
    return mult;
  }

  function advancedInfantryHasArmouredProperty(unit) {
    const config = getAdvancedInfantryConfig(unit);
    return !!(config && getInfantryEquipment('body', config.body)?.armoured);
  }

  function advancedInfantryIgnoresLandmines(unit) {
    const config = getAdvancedInfantryConfig(unit);
    return !!(config && getInfantryEquipment('boots', config.boots)?.antiMine);
  }

  function getAdvancedInfantryNullifyChance(unit) {
    const config = getAdvancedInfantryConfig(unit);
    return config ? clamp(getInfantryEquipment('body', config.body)?.nullify || 0, 0, 1) : 0;
  }

  function advancedInfantryNullifiesHit(unit) {
    const chance = getAdvancedInfantryNullifyChance(unit);
    return chance > 0 && Math.random() < chance;
  }

  function getAdvancedInfantryEWResistance(unit) {
    const config = getAdvancedInfantryConfig(unit);
    if (!config) return 0;
    let chance = 0;
    for (const module of config.modules || []) chance += getInfantryEquipment('module', module)?.ewResist || 0;
    return clamp(chance, 0, 1);
  }

  function advancedInfantryRejectsEW(unit) {
    const chance = getAdvancedInfantryEWResistance(unit);
    return chance > 0 && Math.random() < chance;
  }

  function getAdvancedInfantryCritStats(unit) {
    if (!unit?.alive || !INFANTRY_UNIT_TYPES.includes(unit.type) || !isResearchComplete(unit.playerId, 'advancedInfantry')) return { rate:0, damage:0 };
    let rate = ADVANCED_INFANTRY_BALANCE.baseCritRate;
    let damage = ADVANCED_INFANTRY_BALANCE.baseCritDamage;
    const config = getAdvancedInfantryConfig(unit);
    if (config) {
      for (const [category,id] of getLoadoutItemList(config)) {
        const item = getInfantryEquipment(category,id);
        rate += item?.critRate || 0;
        damage += item?.critDamage || 0;
      }
      if (hasAdvancedInfantryModule(unit, 'rampage') && unit.hp / Math.max(1, unit.maxHp) < 0.30) { rate += 0.05; damage += 0.10; }
    }
    if ((unit.revanchismBuffUntil || 0) > game.time) { rate += 0.05; damage += 0.10; }
    if ((unit.avengerBuffUntil || 0) > game.time) { rate += 0.10; damage += 0.20; }
    return { rate:clamp(rate,0,1), damage:Math.max(0,damage) };
  }

  function applyAdvancedInfantryCritical(unit, damage) {
    const stats = getAdvancedInfantryCritStats(unit);
    if (stats.rate <= 0 || Math.random() >= stats.rate) return { damage, critical:false };
    return { damage: damage * (1 + stats.damage), critical:true };
  }

  function getAdvancedInfantryWeaponProfiles(unit) {
    const config = getAdvancedInfantryConfig(unit);
    if (!config?.weapons?.length) return [];
    const rangeMult = getAdvancedInfantryRangeMultiplier(unit);
    const rampage = hasAdvancedInfantryModule(unit, 'rampage') && unit.hp / Math.max(1, unit.maxHp) < 0.30;
    return config.weapons.map((id,index) => {
      const item = getInfantryEquipment('weapon', id);
      if (!item) return null;
      return {
        ...item,
        id,
        slot:index,
        damage:getEntityStatFromBase(unit, 'damage', item.damage),
        armouredDamage:Number.isFinite(item.armouredDamage) ? getEntityStatFromBase(unit, 'damage', item.armouredDamage) : null,
        range:getEntityStatFromBase(unit, 'range', item.range) * rangeMult,
        cooldown:getEntityStatFromBase(unit, 'cooldown', item.cooldown) / (rampage ? 1.10 : 1)
      };
    }).filter(Boolean);
  }

  function getAdvancedInfantryAggregateWeaponProfile(unit) {
    const profiles = getAdvancedInfantryWeaponProfiles(unit);
    if (!profiles.length) return null;
    return {
      damage: Math.max(...profiles.map(row => row.damage || 0)),
      range: Math.max(...profiles.map(row => row.range || 0)),
      cooldown: Math.min(...profiles.map(row => row.cooldown || 1)),
      projectileSpeed: Math.max(...profiles.map(row => row.projectileSpeed || 700)),
      advancedInfantryMultiWeapon:true
    };
  }

  function markAdvancedInfantryAttack(unit) {
    if (!unit) return;
    unit.lastAttackAt = game.time;
    if (hasAdvancedInfantryModule(unit, 'stealth')) unit.advancedInfantryStealthed = false;
  }

  function pushAdvancedInfantryProjectile(projectile) {
    if (game.projectiles.length >= MAX_PROJECTILES) return false;
    game.projectiles.push(projectile);
    return true;
  }

  function fireAdvancedInfantryWeapon(unit, target, profile) {
    if (!unit?.alive || !target?.alive || !profile) return false;
    const d = distance(unit, target);
    if (d > profile.range + (target.radius || 0)) return false;
    unit.advancedWeaponCooldowns ||= {};
    if ((unit.advancedWeaponCooldowns[profile.slot] || 0) > 0) return false;
    let baseDamage = advancedInfantryHasArmouredProperty(target) && Number.isFinite(profile.armouredDamage) ? profile.armouredDamage : profile.damage;
    const energyMult = typeof getEnergyFieldAttackMultiplier === 'function' ? getEnergyFieldAttackMultiplier(unit) : 1;
    const dx = target.x - unit.x, dy = target.y - unit.y;
    const n = normalize(dx,dy);
    unit.angle = Math.atan2(dy,dx);
    unit.advancedWeaponCooldowns[profile.slot] = profile.cooldown;
    markAdvancedInfantryAttack(unit);

    if (profile.kind === 'shotgun') {
      for (let i=0;i<profile.pellets;i++) {
        const offset = (i - (profile.pellets-1)/2) * profile.spreadDeg * Math.PI / 180;
        const a = unit.angle + offset;
        const crit = applyAdvancedInfantryCritical(unit, baseDamage * energyMult);
        pushAdvancedInfantryProjectile({ kind:'advancedShotgunPellet', playerId:unit.playerId, x:unit.x+n.x*(unit.radius+3), y:unit.y+n.y*(unit.radius+3), vx:Math.cos(a)*profile.projectileSpeed, vy:Math.sin(a)*profile.projectileSpeed, damage:crit.damage, critical:crit.critical, life:profile.range/profile.projectileSpeed + 0.18, maxDistance:profile.range, startX:unit.x, startY:unit.y, sourceUnitId:unit.id });
      }
      return true;
    }

    if (profile.kind === 'railgun') {
      const crit = applyAdvancedInfantryCritical(unit, baseDamage * energyMult);
      return pushAdvancedInfantryProjectile({ kind:'advancedRailgun', playerId:unit.playerId, x:unit.x+n.x*(unit.radius+3), y:unit.y+n.y*(unit.radius+3), vx:n.x*profile.projectileSpeed, vy:n.y*profile.projectileSpeed, damage:crit.damage, critical:crit.critical, life:profile.maxDistance/profile.projectileSpeed, maxDistance:profile.maxDistance, startX:unit.x, startY:unit.y, hitIds:[], hitsRemaining:profile.maxHits, sourceUnitId:unit.id });
    }

    const crit = applyAdvancedInfantryCritical(unit, baseDamage * energyMult);
    if (profile.kind === 'grenade') {
      return pushAdvancedInfantryProjectile({ kind:'advancedGrenade', playerId:unit.playerId, x:unit.x+n.x*(unit.radius+3), y:unit.y+n.y*(unit.radius+3), vx:n.x*profile.projectileSpeed, vy:n.y*profile.projectileSpeed, targetId:target.id, damageNormal:getEntityStatFromBase(unit,'damage',100)*energyMult*(crit.critical?(1+getAdvancedInfantryCritStats(unit).damage):1), damageArmoured:getEntityStatFromBase(unit,'damage',250)*energyMult*(crit.critical?(1+getAdvancedInfantryCritStats(unit).damage):1), critical:crit.critical, aoe:profile.aoe, life:d/profile.projectileSpeed+0.35, sourceUnitId:unit.id });
    }
    return pushAdvancedInfantryProjectile({ kind:'bullet', playerId:unit.playerId, x:unit.x+n.x*(unit.radius+3), y:unit.y+n.y*(unit.radius+3), vx:n.x*profile.projectileSpeed, vy:n.y*profile.projectileSpeed, targetId:target.id, damage:crit.damage, critical:crit.critical, aoe:0, life:d/profile.projectileSpeed+0.25, sourceType:'advancedInfantry' });
  }

  function fireAdvancedInfantryWeapons(unit, target) {
    let fired = false;
    for (const profile of getAdvancedInfantryWeaponProfiles(unit)) if (fireAdvancedInfantryWeapon(unit,target,profile)) fired = true;
    return fired;
  }

  function explodeAdvancedInfantryGrenade(projectile, x, y) {
    pushEffect({ type:'explosion', x, y, radius:projectile.aoe, life:0.45, maxLife:0.45 });
    unitGrid.queryCircle(x,y,projectile.aoe,queryScratchA);
    for (const target of queryScratchA) {
      if (!target.alive || target.playerId===projectile.playerId || target.airborne || target.garrisoned) continue;
      const d = Math.hypot(target.x-x,target.y-y);
      const falloff = clamp(1-d/projectile.aoe,0.25,1);
      const damage = (advancedInfantryHasArmouredProperty(target) || getEntityStat(target,'damageReduction',0)>0 ? projectile.damageArmoured : projectile.damageNormal) * falloff;
      applyDamage(target, damage, projectile.playerId);
    }
    buildingGrid.queryCircle(x,y,projectile.aoe,queryScratchB);
    for (const target of queryScratchB) {
      if (!target.alive || target.playerId===projectile.playerId || target.type==='landmine') continue;
      const d=Math.hypot(target.x-x,target.y-y), falloff=clamp(1-d/projectile.aoe,0.25,1);
      applyDamage(target, projectile.damageNormal*falloff, projectile.playerId);
    }
  }

  function updateAdvancedInfantryProjectile(projectile, dt) {
    projectile.x += projectile.vx*dt; projectile.y += projectile.vy*dt; projectile.life -= dt;
    if (projectile.kind === 'advancedGrenade') {
      const target=findEntityById(projectile.targetId);
      if (!target?.alive || target.playerId===projectile.playerId) return 'remove';
      if (Math.hypot(target.x-projectile.x,target.y-projectile.y)<=target.radius+8 || projectile.life<=0) { explodeAdvancedInfantryGrenade(projectile,projectile.x,projectile.y); return 'remove'; }
      return 'keep';
    }
    const radius = projectile.kind === 'advancedRailgun' ? 7 : 5;
    unitGrid.queryCircle(projectile.x,projectile.y,20,queryScratchA);
    for (const target of queryScratchA) {
      if (!target.alive || target.playerId===projectile.playerId || target.airborne || target.garrisoned || projectile.hitIds?.includes(target.id)) continue;
      if (Math.hypot(target.x-projectile.x,target.y-projectile.y)>target.radius+radius) continue;
      applyDamage(target,projectile.damage,projectile.playerId);
      if (projectile.kind === 'advancedRailgun') {
        projectile.hitIds.push(target.id); projectile.hitsRemaining--;
        if (projectile.hitsRemaining<=0) return 'remove';
      } else return 'remove';
    }
    buildingGrid.queryCircle(projectile.x,projectile.y,18,queryScratchB);
    for (const target of queryScratchB) {
      if (!target.alive || target.playerId===projectile.playerId || target.type==='landmine' || projectile.hitIds?.includes(target.id)) continue;
      if (Math.hypot(target.x-projectile.x,target.y-projectile.y)>target.radius+radius) continue;
      applyDamage(target,projectile.damage,projectile.playerId);
      if (projectile.kind === 'advancedRailgun') {
        projectile.hitIds.push(target.id); projectile.hitsRemaining--;
        if (projectile.hitsRemaining<=0) return 'remove';
      } else return 'remove';
    }
    if (projectile.life<=0 || Math.hypot(projectile.x-projectile.startX,projectile.y-projectile.startY) >= (projectile.maxDistance||Infinity)) return 'remove';
    return 'keep';
  }

  function isAdvancedInfantryConcealedFrom(target, attacker) {
    if (!target?.alive || !hasAdvancedInfantryModule(target,'conceal') || hasStatus(target,'revealed')) return false;
    const range=getAttackerTargetingRange(attacker);
    if (range<=0) return true;
    return distance(target,attacker)>range*ADVANCED_INFANTRY_BALANCE.concealRangeFraction;
  }

  function isAdvancedInfantryFullyStealthed(target) {
    return !!(target?.alive && hasAdvancedInfantryModule(target,'stealth') && !hasStatus(target,'revealed') && target.advancedInfantryStealthed);
  }

  function updateAdvancedInfantry(dt) {
    for (const unit of game.units) {
      if (!unit.alive || !INFANTRY_UNIT_TYPES.includes(unit.type)) continue;
      if (isAdvancedInfantryUnit(unit)) {
        const healing = (unit.configuration.modules||[]).reduce((sum,id)=>sum+(getInfantryEquipment('module',id)?.healPerSec||0),0);
        if (healing>0 && unit.hp<unit.maxHp) unit.hp=Math.min(unit.maxHp,unit.hp+unit.maxHp*healing*dt);
        unit.advancedWeaponCooldowns ||= {};
        for (const key of Object.keys(unit.advancedWeaponCooldowns)) unit.advancedWeaponCooldowns[key]=Math.max(0,unit.advancedWeaponCooldowns[key]-dt);
        if (hasAdvancedInfantryModule(unit,'stealth')) {
          if (unit.advancedInfantryStealthed == null) unit.advancedInfantryStealthed = true;
          if (!unit.advancedInfantryStealthed && !hasStatus(unit,'revealed') && game.time-Math.max(unit.lastAttackAt||-99,unit.lastHitAt||-99)>=ADVANCED_INFANTRY_BALANCE.stealthResetSeconds) unit.advancedInfantryStealthed=true;
        }
      }
    }
  }

  function applyAdvancedInfantryDeathEffects(unit) {
    if (!isAdvancedInfantryUnit(unit)) return;
    const modules=unit.configuration.modules||[];
    const applyBuff=(radius,kind)=>{
      unitGrid.queryCircle(unit.x,unit.y,radius,queryScratchC);
      for (const ally of queryScratchC) {
        if (!ally.alive || ally.playerId!==unit.playerId || !INFANTRY_UNIT_TYPES.includes(ally.type) || ally.id===unit.id) continue;
        if (kind==='revanchism') ally.revanchismBuffUntil=Math.max(ally.revanchismBuffUntil||0,game.time+ADVANCED_INFANTRY_BALANCE.revanchismDuration);
        else ally.avengerBuffUntil=Math.max(ally.avengerBuffUntil||0,game.time+ADVANCED_INFANTRY_BALANCE.avengerDuration);
      }
    };
    if (modules.includes('revanchism') && Math.random()<0.10) applyBuff(50,'revanchism');
    if (modules.includes('avenger') && Math.random()<0.25) applyBuff(100,'avenger');
  }

  function applyAdvancedInfantrySteering(unit, steer, separationScale=1) {
    if (!isAdvancedInfantryUnit(unit)) return steer;
    let {x,y}=steer;
    if (hasAdvancedInfantryModule(unit,'distributed')) {
      unitGrid.queryCircle(unit.x,unit.y,52,queryScratchC);
      let checked=0;
      for (const other of queryScratchC) {
        if (other===unit || !other.alive || other.playerId!==unit.playerId || other.airborne || !INFANTRY_UNIT_TYPES.includes(other.type) || checked++>10) continue;
        const dx=unit.x-other.x,dy=unit.y-other.y,d=Math.hypot(dx,dy)||1;
        if (d<46) { const strength=(1-d/46)*0.48*separationScale; x+=(dx/d)*strength; y+=(dy/d)*strength; }
      }
    }
    if (hasAdvancedInfantryModule(unit,'dodging')) {
      const lateral=Math.sin(game.time*9.5+(unit.instanceId||unit.id)*0.71)*0.34;
      x += -steer.y*lateral; y += steer.x*lateral;
    }
    return {x,y};
  }

  function getStoredInfantryLoadoutCount(facility, loadoutId) {
    if (!facility?.storedUnits) return 0;
    return facility.storedUnits.filter(r=>r.lifecycleState===LIFECYCLE_STATES.STORED && String(r.configuration?.loadoutId)===String(loadoutId) && r.configuration?.advancedInfantry).length;
  }

  function getSMCStoredCount(complex) { return complex?.storedUnits?.filter(r=>r.lifecycleState===LIFECYCLE_STATES.STORED).length || 0; }

  function getAdvancedInfantryQueueCount(facility, loadoutId) {
    let n=0;
    for(let i=0;i<(facility?.queue?.length||0);i++) if(String(facility.queueBuildConfigs?.[i]?.loadoutId)===String(loadoutId)) n++;
    return n;
  }

  function queueInfantryLoadoutTraining(facility, loadoutId, amount=1, options={}) {
    if (!facility?.alive || !['militaryBase','superiorMobilizationComplex'].includes(facility.type)) return 0;
    const loadout=getInfantryLoadoutById(facility.playerId,loadoutId);
    if (!loadout || !hasOperationalSuperiorMobilizationComplex(facility.playerId)) return 0;
    if (facility.type==='superiorMobilizationComplex' && facility.queue.length>=60) return 0;
    const config=getInfantryLoadoutConfigurationSnapshot(facility.playerId,loadout);
    const cost=getInfantryLoadoutTrainingCost(facility.playerId,loadout);
    let queued=0;
    const cap=amount==='max'?60:Math.max(0,Math.floor(Number(amount)||0));
    for(let i=0;i<cap && facility.queue.length<60;i++) {
      if (getGroundFacilityStoredCount(facility)+facility.queue.length>=getGroundFacilityStorageCapacity(facility)) break;
      if (game.players[facility.playerId].money<cost) break;
      game.players[facility.playerId].money-=cost;
      facility.queue.push(loadout.soldierType);
      facility.queuePaidCosts.push(cost);
      facility.queueBuildConfigs.push(clonePlain(config));
      facility.queueMeta.push({ advancedInfantry:true, loadoutId:loadout.id });
      queued++;
    }
    if (queued && facility.playerId===PLAYER_ID && game.selected===facility && !options.silent) renderSelectionPanel();
    return queued;
  }

  function advancedInfantryOptionHtml(playerId,category,soldierType,selected='') {
    const options=[`<option value="">NONE / DEFAULT</option>`];
    for(const [id,item] of getUnlockedInfantryEquipment(playerId,category,soldierType)) options.push(`<option value="${id}" ${selected===id?'selected':''}>${escapeHtml(item.name)} · +$${item.cost}</option>`);
    return options.join('');
  }

  function renderInfantryLoadoutTrainingRows(facility) {
    const loadouts=getPlayerInfantryLoadouts(facility.playerId);
    if (!loadouts.length) return `<div class="research-note">No Exosuit loadouts configured yet.</div>`;
    const online=hasOperationalSuperiorMobilizationComplex(facility.playerId);
    return `<div class="infantry-loadout-training-list">${loadouts.map(loadout=>{
      const stored=getStoredInfantryLoadoutCount(facility,loadout.id), cost=getInfantryLoadoutTrainingCost(facility.playerId,loadout), queued=getAdvancedInfantryQueueCount(facility,loadout.id);
      return `<div class="train-row infantry-loadout-train"><div class="train-copy"><strong>${escapeHtml(loadout.name)} <small>${loadout.soldierType.toUpperCase()}</small></strong><span>${moneyText(cost)} · stored ${stored} · queued ${queued}</span></div><div class="quick-buttons"><button data-ai-train-loadout="${loadout.id}" data-ai-train-amount="10" ${online?'':'disabled'}>10</button><button data-ai-train-loadout="${loadout.id}" data-ai-train-amount="5" ${online?'':'disabled'}>5</button><button data-ai-train-loadout="${loadout.id}" data-ai-train-amount="1" ${online?'':'disabled'}>1</button></div></div>`;
    }).join('')}</div>`;
  }

  function renderSuperiorMobilizationComplexPanel(complex) {
    const playerId=complex.playerId, state=getAdvancedInfantryState(playerId), capacity=getInfantryLoadoutCapacity(playerId), stored=getSMCStoredCount(complex);
    let html=`<div class="stat-block"><div class="stat-row"><span>Loadout designs</span><strong>${state.loadouts.length} / ${capacity}</strong></div><div class="stat-row"><span>Infantry storage</span><strong>${stored} / ${ADVANCED_INFANTRY_BALANCE.complexStorageCapacity}</strong></div><div class="stat-row"><span>Training queue</span><strong>${complex.queue.length} / 60</strong></div></div>`;
    if(complex.playerId!==PLAYER_ID) return html;
    html+=`<div class="section-label">SUPER INFANTRY TRAINING</div>${renderInfantryLoadoutTrainingRows(complex)}`;
    html+=`<div class="section-label">EXOSUIT LOADOUTS</div><div class="infantry-loadout-list">${state.loadouts.map(l=>`<div class="infantry-loadout-card"><div><strong>${escapeHtml(l.name)}</strong><span>${l.soldierType.toUpperCase()} · +$${getInfantryLoadoutExtraCost(l)} equipment</span></div><div><button data-ai-edit-loadout="${l.id}">EDIT</button><button data-ai-delete-loadout="${l.id}">DELETE</button></div></div>`).join('')||'<div class="research-note">No loadouts saved.</div>'}</div>`;
    const canCreate=state.loadouts.length<capacity;
    html+=`<div class="section-label">${game.advancedInfantryEditingLoadoutId?'EDIT':'NEW'} LOADOUT</div><div class="infantry-loadout-editor">
      <label><span>Name</span><input data-ai-loadout-name type="text" maxlength="30" placeholder="e.g. Breaker Team" /></label>
      <label><span>Soldier</span><select data-ai-loadout-soldier><option value="basic">NORMAL SOLDIER</option><option value="elite">ELITE SOLDIER</option></select></label>
      <label><span>Helmet</span><select data-ai-loadout-helmet>${advancedInfantryOptionHtml(playerId,'helmet','basic')}</select></label>
      <label><span>Body Armour</span><select data-ai-loadout-body>${advancedInfantryOptionHtml(playerId,'body','basic')}</select></label>
      <label><span>Weapon 1</span><select data-ai-loadout-weapon="0">${advancedInfantryOptionHtml(playerId,'weapon','basic')}</select></label>
      <label data-ai-elite-only><span>Weapon 2</span><select data-ai-loadout-weapon="1">${advancedInfantryOptionHtml(playerId,'weapon','elite')}</select></label>
      <label><span>Boots</span><select data-ai-loadout-boots>${advancedInfantryOptionHtml(playerId,'boots','basic')}</select></label>
      ${[0,1,2,3].map(i=>`<label data-ai-module-row="${i}"><span>Module ${i+1}</span><select data-ai-loadout-module="${i}">${advancedInfantryOptionHtml(playerId,'module',i<2?'basic':'elite')}</select></label>`).join('')}
      <div class="infantry-loadout-editor-actions"><button class="action-button compact" data-ai-save-loadout ${canCreate||game.advancedInfantryEditingLoadoutId?'':'disabled'}>SAVE LOADOUT</button><button class="action-button compact" data-ai-clear-loadout>CLEAR</button></div>
      <div class="research-note">Normal: 1 weapon / 2 modules. Elite: 2 distinct weapons / 4 distinct modules and can use Basic or Elite equipment. Editing affects future production only.</div>
    </div>`;
    return html;
  }

  function readInfantryLoadoutEditor() {
    return {
      name:els.selectionContent.querySelector('[data-ai-loadout-name]')?.value||'',
      soldierType:els.selectionContent.querySelector('[data-ai-loadout-soldier]')?.value||'basic',
      helmet:els.selectionContent.querySelector('[data-ai-loadout-helmet]')?.value||null,
      body:els.selectionContent.querySelector('[data-ai-loadout-body]')?.value||null,
      weapons:[...els.selectionContent.querySelectorAll('[data-ai-loadout-weapon]')].map(el=>el.value).filter(Boolean),
      boots:els.selectionContent.querySelector('[data-ai-loadout-boots]')?.value||null,
      modules:[...els.selectionContent.querySelectorAll('[data-ai-loadout-module]')].map(el=>el.value).filter(Boolean)
    };
  }

  function populateInfantryLoadoutEditor(loadout) {
    if(!loadout) return;
    const set=(sel,val)=>{const el=els.selectionContent.querySelector(sel); if(el) el.value=val||'';};
    set('[data-ai-loadout-name]',loadout.name); set('[data-ai-loadout-soldier]',loadout.soldierType); refreshInfantryLoadoutEditorOptions(loadout);
    set('[data-ai-loadout-helmet]',loadout.helmet); set('[data-ai-loadout-body]',loadout.body); set('[data-ai-loadout-boots]',loadout.boots);
    [...els.selectionContent.querySelectorAll('[data-ai-loadout-weapon]')].forEach((el,i)=>el.value=loadout.weapons?.[i]||'');
    [...els.selectionContent.querySelectorAll('[data-ai-loadout-module]')].forEach((el,i)=>el.value=loadout.modules?.[i]||'');
  }

  function refreshInfantryLoadoutDuplicateOptions() {
    const weaponSelects = [...els.selectionContent.querySelectorAll('[data-ai-loadout-weapon]')].filter(el => el.closest('label')?.style.display !== 'none');
    const moduleSelects = [...els.selectionContent.querySelectorAll('[data-ai-loadout-module]')].filter(el => el.closest('label')?.style.display !== 'none');
    const apply = selects => {
      const picked = selects.map(el => el.value).filter(Boolean);
      selects.forEach(select => {
        for (const option of select.options) {
          if (!option.value) { option.disabled = false; continue; }
          option.disabled = option.value !== select.value && picked.includes(option.value);
        }
      });
    };
    apply(weaponSelects); apply(moduleSelects);
  }

  function refreshInfantryLoadoutEditorOptions(source=null) {
    const soldierType=els.selectionContent.querySelector('[data-ai-loadout-soldier]')?.value||source?.soldierType||'basic';
    const map=[['helmet','[data-ai-loadout-helmet]'],['body','[data-ai-loadout-body]'],['boots','[data-ai-loadout-boots]']];
    for(const [cat,sel] of map){const el=els.selectionContent.querySelector(sel);if(!el)continue;const old=source?.[cat]||el.value;el.innerHTML=advancedInfantryOptionHtml(PLAYER_ID,cat,soldierType,old);el.value=old||'';}
    [...els.selectionContent.querySelectorAll('[data-ai-loadout-weapon]')].forEach((el,i)=>{const old=source?.weapons?.[i]||el.value;el.innerHTML=advancedInfantryOptionHtml(PLAYER_ID,'weapon',soldierType,old);el.value=old||'';el.closest('label').style.display=(soldierType==='elite'||i===0)?'':'none';});
    [...els.selectionContent.querySelectorAll('[data-ai-loadout-module]')].forEach((el,i)=>{const old=source?.modules?.[i]||el.value;el.innerHTML=advancedInfantryOptionHtml(PLAYER_ID,'module',soldierType,old);el.value=old||'';el.closest('label').style.display=(soldierType==='elite'||i<2)?'':'none';});
    refreshInfantryLoadoutDuplicateOptions();
  }

  function bindAdvancedInfantryPanelEvents(entity) {
    if(!entity?.alive || entity.playerId!==PLAYER_ID) return;
    els.selectionContent.querySelectorAll('[data-ai-train-loadout]').forEach(btn=>btn.addEventListener('click',()=>queueInfantryLoadoutTraining(entity,btn.dataset.aiTrainLoadout,Number(btn.dataset.aiTrainAmount)||1)));
    if(entity.type!=='superiorMobilizationComplex') return;
    els.selectionContent.querySelector('[data-ai-loadout-soldier]')?.addEventListener('change',()=>refreshInfantryLoadoutEditorOptions());
    els.selectionContent.querySelectorAll('[data-ai-loadout-weapon], [data-ai-loadout-module]').forEach(select => select.addEventListener('change', refreshInfantryLoadoutDuplicateOptions));
    els.selectionContent.querySelector('[data-ai-save-loadout]')?.addEventListener('click',()=>{
      const editing=game.advancedInfantryEditingLoadoutId||null, result=saveInfantryLoadout(PLAYER_ID,readInfantryLoadoutEditor(),editing);
      if(!result.ok){notify(result.reason,'warning',3);return;} game.advancedInfantryEditingLoadoutId=null; notify(`${result.loadout.name} loadout saved.`,'good',2.5); renderSelectionPanel();
    });
    els.selectionContent.querySelector('[data-ai-clear-loadout]')?.addEventListener('click',()=>{game.advancedInfantryEditingLoadoutId=null;renderSelectionPanel();});
    els.selectionContent.querySelectorAll('[data-ai-edit-loadout]').forEach(btn=>btn.addEventListener('click',()=>{game.advancedInfantryEditingLoadoutId=btn.dataset.aiEditLoadout;renderSelectionPanel();setTimeout(()=>populateInfantryLoadoutEditor(getInfantryLoadoutById(PLAYER_ID,btn.dataset.aiEditLoadout)),0);}));
    els.selectionContent.querySelectorAll('[data-ai-delete-loadout]').forEach(btn=>btn.addEventListener('click',()=>{if(deleteInfantryLoadout(PLAYER_ID,btn.dataset.aiDeleteLoadout)){if(String(game.advancedInfantryEditingLoadoutId)===String(btn.dataset.aiDeleteLoadout))game.advancedInfantryEditingLoadoutId=null;renderSelectionPanel();}}));
    if(game.advancedInfantryEditingLoadoutId) setTimeout(()=>populateInfantryLoadoutEditor(getInfantryLoadoutById(PLAYER_ID,game.advancedInfantryEditingLoadoutId)),0); else refreshInfantryLoadoutEditorOptions();
  }

  function getAdvancedInfantryDefinitionLabel(playerId, token) {
    const parsed=parseInfantryLoadoutToken(token); if(!parsed||parsed.playerId!==playerId)return null;
    return getInfantryLoadoutById(playerId,parsed.loadoutId)?.name||null;
  }

  function getAdvancedInfantryDefinitionBaseType(playerId, token) {
    const parsed=parseInfantryLoadoutToken(token); if(!parsed||parsed.playerId!==playerId)return null;
    return getInfantryLoadoutById(playerId,parsed.loadoutId)?.soldierType||null;
  }

  function getAdvancedInfantryDefinitionCost(playerId, token) {
    const parsed=parseInfantryLoadoutToken(token); if(!parsed||parsed.playerId!==playerId)return Infinity;
    return getInfantryLoadoutTrainingCost(playerId,getInfantryLoadoutById(playerId,parsed.loadoutId));
  }


  function getPlayerGroundDefinitionTypes(playerId) {
    return [...GROUND_UNIT_TYPES, ...getPlayerInfantryLoadouts(playerId).map(l => getInfantryLoadoutToken(playerId,l.id))];
  }

  function getGroundDefinitionBaseType(playerId, type) {
    return isInfantryLoadoutToken(type) ? getAdvancedInfantryDefinitionBaseType(playerId,type) : type;
  }

  function getGroundDefinitionName(playerId, type) {
    if (!isInfantryLoadoutToken(type)) return UNITS[type]?.name || type;
    const parsed=parseInfantryLoadoutToken(type), l=parsed&&getInfantryLoadoutById(playerId,parsed.loadoutId);
    return l ? `${l.name} (${l.soldierType === 'elite' ? 'Elite' : 'Normal'})` : 'Missing Loadout';
  }

  function getGroundDefinitionDescription(playerId, type) {
    if (!isInfantryLoadoutToken(type)) return UNITS[type]?.description || '';
    const parsed=parseInfantryLoadoutToken(type), l=parsed&&getInfantryLoadoutById(playerId,parsed.loadoutId);
    return l ? `Exosuit loadout · +$${getInfantryLoadoutExtraCost(l)} equipment` : 'Unavailable loadout';
  }

  function getGroundDefinitionCost(playerId, type) {
    if (!isInfantryLoadoutToken(type)) return getTrainingPackageCost(playerId,type,TRANSPORT_UNIT_TYPES.includes(type)?getVehicleBuildConfiguration(playerId,type):null);
    return getAdvancedInfantryDefinitionCost(playerId,type);
  }

  function getGroundDefinitionAvailable(facility, type) {
    if (!facility?.alive) return 0;
    if (!isInfantryLoadoutToken(type)) return facility.storage?.[type] || 0;
    const parsed=parseInfantryLoadoutToken(type); if(!parsed||parsed.playerId!==facility.playerId)return 0;
    return getStoredInfantryLoadoutCount(facility,parsed.loadoutId);
  }

  function takeGroundDefinitionRecord(facility, type) {
    if (!isInfantryLoadoutToken(type)) return takeStoredUnit(facility,type,null);
    const parsed=parseInfantryLoadoutToken(type), l=parsed&&getInfantryLoadoutById(facility.playerId,parsed.loadoutId);
    if(!l)return null;
    return takeStoredUnit(facility,l.soldierType,getInfantryLoadoutToken(facility.playerId,l.id));
  }

  function queueGroundDefinitionTraining(facility, type, amount=1, options={}) {
    if (isInfantryLoadoutToken(type)) {
      const parsed=parseInfantryLoadoutToken(type); if(!parsed||parsed.playerId!==facility.playerId)return 0;
      return queueInfantryLoadoutTraining(facility,parsed.loadoutId,amount);
    }
    if (facility.playerId===PLAYER_ID && !options.silent) { trainUnits(facility,type,amount); return amount; }
    return 0;
  }
