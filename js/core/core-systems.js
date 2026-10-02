'use strict';

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const distSq = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };
  const distance = (a, b) => Math.sqrt(distSq(a, b));
  const rand = (min, max) => min + Math.random() * (max - min);
  const choose = arr => arr[(Math.random() * arr.length) | 0];
  const moneyText = n => `$${Math.floor(n).toLocaleString()}`;

  function normalize(dx, dy) {
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length, length };
  }

  function swapRemove(array, index) {
    array[index] = array[array.length - 1];
    array.pop();
  }

  function entityCount() {
    return game.liveEntityCount;
  }

  function pushEffect(effect) {
    if (game.effects.length >= MAX_EFFECTS) game.effects.shift();
    game.effects.push(effect);
  }

  function getDefinition(kind, type) {
    return kind === 'building' ? BUILDINGS[type] : kind === 'unit' ? UNITS[type] : null;
  }

  function getEntityDefinition(entity) {
    return entity ? getDefinition(entity.kind, entity.type) : null;
  }

  function definitionHasTag(kind, type, tag) {
    return !!getDefinition(kind, type)?.tags?.includes(tag);
  }

  function entityHasTag(entity, tag) {
    return !!getEntityDefinition(entity)?.tags?.includes(tag);
  }

  function entityHasCapability(entity, capability) {
    return !!getEntityDefinition(entity)?.capabilities?.[capability];
  }

  function modifierContext(kind, type) {
    const def = getDefinition(kind, type);
    return { kind, type, tags: def?.tags || [] };
  }

  function modifierMatches(modifier, context) {
    if (!modifier || !context) return true;
    if (modifier.targetKinds?.length && !modifier.targetKinds.includes(context.kind)) return false;
    if (modifier.targetTypes?.length && !modifier.targetTypes.includes(context.type)) return false;
    if (modifier.targetTags?.length) {
      for (const tag of modifier.targetTags) if (!context.tags?.includes(tag)) return false;
    }
    if (modifier.anyTargetTags?.length && !modifier.anyTargetTags.some(tag => context.tags?.includes(tag))) return false;
    return true;
  }

  function invalidateModifierCache(owner) {
    if (!owner) return;
    owner.modifierRevision = (owner.modifierRevision || 0) + 1;
    owner.modifierCache?.clear();
  }

  function setModifierSource(owner, sourceId, modifiers) {
    if (!owner || !sourceId) return false;
    owner.modifierSources ||= new Map();
    owner.modifierCache ||= new Map();
    const list = Array.isArray(modifiers) ? modifiers.filter(Boolean).map(mod => ({ ...mod })) : [];
    if (!list.length) return removeModifierSource(owner, sourceId);
    owner.modifierSources.set(sourceId, list);
    invalidateModifierCache(owner);
    return true;
  }

  function removeModifierSource(owner, sourceId) {
    if (!owner?.modifierSources?.delete(sourceId)) return false;
    invalidateModifierCache(owner);
    return true;
  }

  function resolveModifierSources(baseValue, stat, context, sourceMaps) {
    let additive = 0;
    let additivePercent = 0;
    let multiplier = 1;
    let overrideValue = null;
    let minimum = -Infinity;
    let maximum = Infinity;

    for (const sourceMap of sourceMaps) {
      if (!sourceMap) continue;
      for (const modifiers of sourceMap.values()) {
        for (const modifier of modifiers) {
          if (modifier.stat !== stat || !modifierMatches(modifier, context) || !Number.isFinite(modifier.value)) continue;
          switch (modifier.operation) {
            case 'add': additive += modifier.value; break;
            case 'addPercent': additivePercent += modifier.value; break;
            case 'multiply': multiplier *= modifier.value; break;
            case 'override': overrideValue = modifier.value; break;
            case 'min': minimum = Math.max(minimum, modifier.value); break;
            case 'max': maximum = Math.min(maximum, modifier.value); break;
            default: break;
          }
        }
      }
    }

    let value = overrideValue === null ? (baseValue + additive) * (1 + additivePercent) * multiplier : overrideValue;
    value = Math.max(minimum, Math.min(maximum, value));
    return value;
  }

  function getPlayerModifiedStat(playerId, stat, baseValue = 0, context = { kind: null, type: null, tags: [] }) {
    const player = game.players[playerId];
    if (!player) return baseValue;
    const key = `${stat}|${context.kind || ''}|${context.type || ''}|${baseValue}`;
    const revision = player.modifierRevision || 0;
    const cached = player.modifierCache?.get(key);
    if (cached?.revision === revision) return cached.value;
    const value = resolveModifierSources(baseValue, stat, context, [player.modifierSources]);
    player.modifierCache ||= new Map();
    player.modifierCache.set(key, { revision, value });
    return value;
  }

  function getEntityStat(entity, stat, fallback = 0) {
    if (!entity) return fallback;
    const def = getEntityDefinition(entity);
    const baseValue = Number.isFinite(def?.[stat]) ? def[stat] : fallback;
    const player = game.players[entity.playerId];
    const playerRevision = player?.modifierRevision || 0;
    const entityRevision = entity.modifierRevision || 0;
    const key = `${stat}|${baseValue}`;
    const dynamicFragmentSlow = stat === 'speed' && entity.kind === 'unit' && !entity.airborne && typeof getFragmentedZoneSlow === 'function';
    const dynamicDeathRaySlow = stat === 'speed' && entity.kind === 'unit' && !entity.airborne && typeof getDeathRaySlow === 'function';
    const dynamicAdvancedInfantry = entity.kind === 'unit' && typeof isAdvancedInfantryUnit === 'function' && isAdvancedInfantryUnit(entity) && (stat === 'speed' || stat === 'range' || stat === 'hp' || stat === 'detectionRange' || stat === 'cooldown');
    const cached = entity.modifierCache?.get(key);
    if (!dynamicFragmentSlow && !dynamicDeathRaySlow && !dynamicAdvancedInfantry && cached?.playerRevision === playerRevision && cached?.entityRevision === entityRevision) return cached.value;
    const context = modifierContext(entity.kind, entity.type);
    let value = resolveModifierSources(baseValue, stat, context, [player?.modifierSources, entity.modifierSources]);
    if (dynamicFragmentSlow) value = Math.max(0, value - baseValue * getFragmentedZoneSlow(entity));
    if (dynamicDeathRaySlow) value = Math.max(0, value - baseValue * getDeathRaySlow(entity));
    if (dynamicAdvancedInfantry) {
      if (stat === 'hp') value += getAdvancedInfantryFlatHp(entity);
      else if (stat === 'speed') value *= getAdvancedInfantrySpeedMultiplier(entity);
      else if (stat === 'range') value *= getAdvancedInfantryRangeMultiplier(entity);
      else if (stat === 'detectionRange') value *= getAdvancedInfantryDetectionMultiplier(entity);
      else if (stat === 'cooldown') value *= getAdvancedInfantryCooldownMultiplier(entity);
    }
    entity.modifierCache ||= new Map();
    if (!dynamicFragmentSlow && !dynamicDeathRaySlow && !dynamicAdvancedInfantry) entity.modifierCache.set(key, { playerRevision, entityRevision, value });
    return value;
  }

  function getDefinitionPlayerStat(playerId, kind, type, stat, fallback = 0) {
    const def = getDefinition(kind, type);
    const baseValue = Number.isFinite(def?.[stat]) ? def[stat] : fallback;
    return getPlayerModifiedStat(playerId, stat, baseValue, modifierContext(kind, type));
  }

  function getUnitCost(playerId, type) {
    const def = UNITS[type];
    if (!def) return Infinity;
    let baseCost = def.cost;
    if (type === 'loiteringMunition') {
      if (isResearchComplete(playerId, 'dwLMCost2')) baseCost = 2;
      else if (isResearchComplete(playerId, 'dwLMCost1')) baseCost = 4;
    }
    const multiplier = Math.max(0, getDefinitionPlayerStat(playerId, 'unit', type, 'unitCostMultiplier', 1));
    return Math.max(0, Math.round(baseCost * multiplier * 100) / 100);
  }

  function getUnitTrainingTime(playerId, type) {
    const def = UNITS[type];
    if (!def) return Infinity;
    let baseTime = def.trainTime;
    if (type === 'loiteringMunition') {
      let reduction = 0;
      if (isResearchComplete(playerId, 'dwLMBuildSpeed1')) reduction += 0.30;
      if (isResearchComplete(playerId, 'dwLMBuildSpeed2')) reduction += 0.30;
      baseTime = Math.max(0.01, def.trainTime * (1 - reduction));
    }
    return Math.max(0.01, baseTime * getTrainingMultiplier(playerId, type));
  }


  function getAirbaseAircraftCapacity(playerId) {
    let cap = AIRBASE_BASE_AIRCRAFT_CAP;
    if (isDoctrineUnlocked(playerId, 'airDominance')) cap += 3;
    if (isResearchComplete(playerId, 'adAirbaseCapacity')) cap += 2;
    return cap;
  }

  function getAircraftTurnaroundSpeedMultiplier(playerId) {
    return isDoctrineUnlocked(playerId, 'airDominance') ? 1.30 : 1;
  }

  function getAircraftTurnaroundSeconds(playerId, type, deployedSoldiers = 0) {
    let base = BOMBER_TURNAROUND_SECONDS;
    if (type === 'loyalWingman') base = DRONE_WARFARE_BALANCE.loyalWingmanTurnaround;
    else if (type === 'superFighter') base = AIR_DOMINANCE_BALANCE.fighterTurnaround;
    else if (type === 'paratrooperPlane') {
      const perSoldier = isResearchComplete(playerId, 'adParaTurnaround') ? 0.5 : AIR_DOMINANCE_BALANCE.paratrooperTurnaroundPerSoldier;
      base = Math.max(0, Math.floor(deployedSoldiers || 0)) * perSoldier;
    }
    return base / getAircraftTurnaroundSpeedMultiplier(playerId);
  }

  function getFighterPayloadCapacity(playerId) {
    return Math.max(0, Math.floor(getDefinitionPlayerStat(playerId, 'unit', 'superFighter', 'payload', AIR_DOMINANCE_BALANCE.fighterPayload)));
  }

  function getParatrooperCapacity(playerId) {
    return Math.max(0, Math.floor(getDefinitionPlayerStat(playerId, 'unit', 'paratrooperPlane', 'transportCapacity', AIR_DOMINANCE_BALANCE.paratrooperCapacity)));
  }

  function normalizeFighterMissileConfiguration(playerId, source = null) {
    const player = game.players[playerId];
    const capacity = getFighterPayloadCapacity(playerId);
    const current = source || player?.airConfig?.fighterMissiles || { airToAir: Math.floor(capacity / 2), airToGround: capacity - Math.floor(capacity / 2) };
    let a2a = Math.max(0, Math.floor(Number(current.airToAir) || 0));
    let a2g = Math.max(0, Math.floor(Number(current.airToGround) || 0));
    if (a2a + a2g > capacity) {
      const excess = a2a + a2g - capacity;
      a2g = Math.max(0, a2g - excess);
      if (a2a + a2g > capacity) a2a = Math.max(0, capacity - a2g);
    }
    return { airToAir: a2a, airToGround: a2g };
  }

  function setFighterMissileConfiguration(playerId, configuration) {
    const player = game.players[playerId];
    if (!player) return false;
    player.airConfig ||= {};
    player.airConfig.fighterMissiles = normalizeFighterMissileConfiguration(playerId, configuration);
    return true;
  }

  function normalizeParatrooperComposition(playerId, source = null) {
    const player = game.players[playerId];
    const capacity = getParatrooperCapacity(playerId);
    const current = source || player?.airConfig?.paratrooperComposition || { basic: capacity, elite: 0 };
    const result = { basic: 0, elite: 0 };
    let remaining = capacity;
    for (const type of INFANTRY_UNIT_TYPES) {
      const desired = Math.max(0, Math.floor(Number(current[type]) || 0));
      const amount = Math.min(remaining, desired);
      result[type] = amount;
      remaining -= amount;
    }
    return result;
  }

  function setParatrooperComposition(playerId, composition) {
    const player = game.players[playerId];
    if (!player) return false;
    player.airConfig ||= {};
    player.airConfig.paratrooperComposition = normalizeParatrooperComposition(playerId, composition);
    return true;
  }

  function getAircraftBuildConfiguration(playerId, type) {
    if (type === 'superFighter') return { missiles: normalizeFighterMissileConfiguration(playerId) };
    if (type === 'paratrooperPlane') return { passengerComposition: normalizeParatrooperComposition(playerId) };
    return null;
  }

  function getParatrooperPassengerCount(configuration) {
    return INFANTRY_UNIT_TYPES.reduce((sum, type) => sum + Math.max(0, Math.floor(Number(configuration?.passengerComposition?.[type]) || 0)), 0);
  }

  const DRONE_BATCH_LEVELS = Object.freeze([
    Object.freeze({ amount: 100, discount: 0.15 }),
    Object.freeze({ amount: 50, discount: 0.12 }),
    Object.freeze({ amount: 25, discount: 0.09 }),
    Object.freeze({ amount: 10, discount: 0.06 }),
    Object.freeze({ amount: 5, discount: 0.03 }),
    Object.freeze({ amount: 1, discount: 0 })
  ]);

  function getLoyalWingmanSortieCap(playerId) {
    return Math.max(0, Math.floor(getDefinitionPlayerStat(playerId, 'unit', 'loyalWingman', 'sortieCap', DRONE_WARFARE_BALANCE.loyalWingmanSortieCap)));
  }

  function getDroneBatchDiscount(playerId, amount) {
    if (!isResearchComplete(playerId, 'dwMassProduction')) return 0;
    const match = DRONE_BATCH_LEVELS.find(level => level.amount === amount);
    return match?.discount || 0;
  }

  function getDroneBatchCost(playerId, type, amount) {
    amount = Math.max(0, Math.floor(Number(amount) || 0));
    const raw = getUnitCost(playerId, type) * amount;
    return Math.round(raw * (1 - getDroneBatchDiscount(playerId, amount)) * 100) / 100;
  }

  function getLoyalWingmanNetworkRoom(playerId) {
    let room = 0;
    let queued = 0;
    for (const building of game.buildings) {
      if (!building.alive || building.playerId !== playerId) continue;
      if (building.type === 'airbase') room += getAirbaseAvailableWingmanSlots(building);
      else if (building.type === 'droneHub') {
        room += Math.max(0, getDroneHubCapacity(building, 'loyalWingman') - getDroneHubStoredCount(building, 'loyalWingman'));
        queued += getDroneHubQueuedCount(building, 'loyalWingman');
      }
    }
    return Math.max(0, room - queued);
  }

  function getDroneHubNetworkRoom(hub, type) {
    if (!hub?.alive || hub.type !== 'droneHub') return 0;
    const queued = getDroneHubQueuedCount(hub, type);
    if (type === 'loiteringMunition') {
      return Math.max(0, getDroneHubCapacity(hub, type) - getDroneHubStoredCount(hub, type) - queued);
    }
    if (type === 'loyalWingman') return getLoyalWingmanNetworkRoom(hub.playerId);
    return 0;
  }

  function canQueueDroneBatch(hub, type, amount) {
    if (!hub?.alive || hub.type !== 'droneHub' || !DRONE_UNIT_TYPES.includes(type)) return false;
    if (!isDefinitionUnlocked(hub.playerId, 'unit', type)) return false;
    amount = Math.max(0, Math.floor(Number(amount) || 0));
    if (!amount || getDroneHubNetworkRoom(hub, type) < amount) return false;
    return game.players[hub.playerId].money + 1e-9 >= getDroneBatchCost(hub.playerId, type, amount);
  }

  function getTransportCapacityForType(playerId, type) {
    if (!TRANSPORT_UNIT_TYPES.includes(type)) return 0;
    return Math.max(0, Math.floor(getDefinitionPlayerStat(playerId, 'unit', type, 'transportCapacity', UNITS[type]?.transportCapacity || 0)));
  }

  function getVehiclePassengerComposition(playerId, type) {
    if (!TRANSPORT_UNIT_TYPES.includes(type)) return {};
    const player = game.players[playerId];
    player.vehicleConfig ||= { ifvTurret: 'machineGun', passengerComposition: {} };
    player.vehicleConfig.passengerComposition ||= {};
    const defaults = type === 'apc' ? { basic: 8, elite: 0 } : { basic: 12, elite: 0 };
    const source = player.vehicleConfig.passengerComposition[type] || defaults;
    const capacity = getTransportCapacityForType(playerId, type);
    const result = Object.fromEntries(INFANTRY_UNIT_TYPES.map(infantryType => [infantryType, 0]));
    let remaining = capacity;
    for (const infantryType of INFANTRY_UNIT_TYPES) {
      const desired = Math.max(0, Math.floor(Number(source[infantryType]) || 0));
      const amount = Math.min(desired, remaining);
      result[infantryType] = amount;
      remaining -= amount;
    }
    return result;
  }

  function setVehiclePassengerComposition(playerId, type, composition) {
    if (!TRANSPORT_UNIT_TYPES.includes(type)) return false;
    const player = game.players[playerId];
    if (!player) return false;
    const capacity = getTransportCapacityForType(playerId, type);
    const normalized = Object.fromEntries(INFANTRY_UNIT_TYPES.map(infantryType => [infantryType, 0]));
    let remaining = capacity;
    for (const infantryType of INFANTRY_UNIT_TYPES) {
      const desired = Math.max(0, Math.floor(Number(composition?.[infantryType]) || 0));
      const amount = Math.min(desired, remaining);
      normalized[infantryType] = amount;
      remaining -= amount;
    }
    player.vehicleConfig ||= { ifvTurret: 'machineGun', passengerComposition: {} };
    player.vehicleConfig.passengerComposition ||= {};
    player.vehicleConfig.passengerComposition[type] = normalized;
    return true;
  }

  function getVehicleBuildConfiguration(playerId, type) {
    if (!TRANSPORT_UNIT_TYPES.includes(type)) return null;
    const player = game.players[playerId];
    return {
      turret: type === 'ifv' && player?.vehicleConfig?.ifvTurret === 'grenade' && isResearchComplete(playerId, 'mwIFVGrenade') ? 'grenade' : 'machineGun',
      passengerComposition: getVehiclePassengerComposition(playerId, type)
    };
  }

  function getVehiclePassengerCount(configuration) {
    return INFANTRY_UNIT_TYPES.reduce((sum, type) => sum + Math.max(0, Math.floor(Number(configuration?.passengerComposition?.[type]) || 0)), 0);
  }

  function getTrainingPackageCost(playerId, type, buildConfiguration = null) {
    let total = getUnitCost(playerId, type);
    if (buildConfiguration?.advancedInfantry) total += Math.max(0, Number(buildConfiguration.extraCost) || 0);
    if (!TRANSPORT_UNIT_TYPES.includes(type) && type !== 'paratrooperPlane') return total;
    const config = buildConfiguration || (type === 'paratrooperPlane' ? getAircraftBuildConfiguration(playerId, type) : getVehicleBuildConfiguration(playerId, type));
    for (const infantryType of INFANTRY_UNIT_TYPES) {
      total += Math.max(0, Math.floor(Number(config?.passengerComposition?.[infantryType]) || 0)) * getUnitCost(playerId, infantryType);
    }
    return total;
  }

  function createConfiguredPassengerRecords(playerId, configuration) {
    const cargo = [];
    for (const infantryType of INFANTRY_UNIT_TYPES) {
      const amount = Math.max(0, Math.floor(Number(configuration?.passengerComposition?.[infantryType]) || 0));
      for (let i = 0; i < amount; i++) {
        const record = createUnitRecord(infantryType, playerId, { lifecycleState: LIFECYCLE_STATES.CARGO, originFacilityType: 'militaryBase' });
        if (record) cargo.push(record);
      }
    }
    return cargo;
  }

  function getTransportCapacity(unit) {
    return unit?.alive ? Math.max(0, Math.floor(getEntityStat(unit, 'transportCapacity', 0))) : 0;
  }

  function getEntityStatFromBase(entity, stat, baseValue) {
    if (!entity) return baseValue;
    const player = game.players[entity.playerId];
    return resolveModifierSources(baseValue, stat, modifierContext(entity.kind, entity.type), [player?.modifierSources, entity.modifierSources]);
  }

  function getUnitWeaponProfile(unit) {
    const def = UNITS[unit?.type];
    if (!def) return null;
    if (typeof getAdvancedInfantryAggregateWeaponProfile === 'function') {
      const advanced = getAdvancedInfantryAggregateWeaponProfile(unit);
      if (advanced) return advanced;
    }
    if (unit.type === 'ifv') {
      const turret = unit.configuration?.turret === 'grenade' && isResearchComplete(unit.playerId, 'mwIFVGrenade') ? 'grenade' : 'machineGun';
      const weapon = MECHANIZED_UNIT_BALANCE.ifv[turret] || MECHANIZED_UNIT_BALANCE.ifv.machineGun;
      return {
        ...def,
        damage: getEntityStatFromBase(unit, 'damage', weapon.damage),
        range: getEntityStatFromBase(unit, 'range', weapon.range),
        cooldown: getEntityStatFromBase(unit, 'cooldown', weapon.cooldown),
        projectileSpeed: weapon.projectileSpeed,
        aoe: weapon.aoe || 0,
        turret
      };
    }
    let damage = getEntityStat(unit, 'damage', def.damage || 0);
    if (unit.type === 'hiveSoldier' && unit.parentHiveId) {
      const hive = game.entityById.get(unit.parentHiveId);
      if (hive?.alive) damage *= getEntityStat(hive, 'hiveHunterDamageMultiplier', 1);
    }
    return {
      ...def,
      damage,
      range: getEntityStat(unit, 'range', def.range || 0),
      cooldown: getEntityStat(unit, 'cooldown', def.cooldown || 0)
    };
  }

  function getResearchDefinition(researchId) {
    return DOCTRINE_RESEARCH[researchId] || SPECIALIZED_RESEARCH[researchId] || null;
  }

  function getResearchProviders(playerId) {
    const player = game.players[playerId];
    if (!player?.alive || !player.capital?.alive) return [];
    const providers = [{
      id: `capital:${player.capital.id}`,
      type: 'capital',
      buildingId: player.capital.id,
      name: 'Capital',
      slots: CAPITAL_RESEARCH_SLOTS
    }];
    for (const building of game.buildings) {
      if (!building.alive || building.playerId !== playerId || building.type !== 'researchCenter') continue;
      providers.push({
        id: `researchCenter:${building.id}`,
        type: 'researchCenter',
        buildingId: building.id,
        name: `Research Center #${building.id}`,
        slots: 3 + (isResearchComplete(playerId, 'aeRCSlot') ? 1 : 0)
      });
    }
    return providers;
  }

  function getResearchProvider(playerId, providerId = null) {
    const providers = getResearchProviders(playerId);
    if (!providers.length) return null;
    if (providerId) {
      const found = providers.find(provider => provider.id === providerId);
      if (found) return found;
    }
    return providers[0];
  }

  function getResearchProviderActiveCount(playerId, providerId) {
    const player = game.players[playerId];
    if (!player?.research) return 0;
    return (player.research.active || []).filter(record => record.providerId === providerId).length;
  }

  function getResearchProviderAvailableSlots(playerId, providerId) {
    const provider = getResearchProvider(playerId, providerId);
    if (!provider) return 0;
    return Math.max(0, provider.slots - getResearchProviderActiveCount(playerId, provider.id));
  }

  function getAvailableResearchProvider(playerId) {
    return getResearchProviders(playerId)
      .filter(provider => getResearchProviderAvailableSlots(playerId, provider.id) > 0)
      .sort((a, b) => (a.type === 'capital' ? -1 : 1) - (b.type === 'capital' ? -1 : 1) || a.buildingId - b.buildingId)[0] || null;
  }

  function getResearchSlotCount(playerId) {
    return getResearchProviders(playerId).reduce((sum, provider) => sum + provider.slots, 0);
  }

  function getResearchTimeMultiplier(playerId, providerId = null) {
    let multiplier = Math.max(0.05, getPlayerModifiedStat(playerId, 'researchTimeMultiplier', 1, { kind: 'player', type: 'research', tags: ['research'] }));
    // Research bonuses are player-wide. Research Centers contribute slots, not a
    // separate speed domain, so Capital and RC-backed slots use identical speed.
    if (isResearchComplete(playerId, 'aeRCSpeed1')) multiplier *= 0.90;
    if (isResearchComplete(playerId, 'aeRCSpeed2')) multiplier *= 0.90;
    return Math.max(0.05, multiplier);
  }

  function getResearchCostMultiplier(playerId, providerId = null) {
    let multiplier = Math.max(0, getPlayerModifiedStat(playerId, 'researchCostMultiplier', 1, { kind: 'player', type: 'research', tags: ['research'] }));
    if (isResearchComplete(playerId, 'aeRCCost')) multiplier *= 0.85;
    return Math.max(0, multiplier);
  }

  function getDoctrineResearchStartedCount(playerId, excludeResearchId = null) {
    const player = game.players[playerId];
    if (!player?.research) return 0;
    let count = 0;
    for (const id of player.research.completed || []) {
      if (id !== excludeResearchId && DOCTRINE_RESEARCH[id]) count++;
    }
    for (const record of player.research.active || []) {
      if (record.id !== excludeResearchId && record.kind === 'DR') count++;
    }
    return count;
  }

  function getResearchCost(playerId, researchId, providerId = null) {
    const def = getResearchDefinition(researchId);
    const player = game.players[playerId];
    if (!def || !player || !Number.isFinite(def.cost)) return null;
    const activeRecord = player.research?.active?.find(record => record.id === researchId);
    if (activeRecord && Number.isFinite(activeRecord.costPaid)) return activeRecord.costPaid;
    const completedRecord = player.research?.completedMeta?.get(researchId);
    if (completedRecord && Number.isFinite(completedRecord.costPaid)) return completedRecord.costPaid;
    const baseCost = def.kind === 'DR'
      ? DOCTRINE_RESEARCH_BASE_COST * Math.pow(2, getDoctrineResearchStartedCount(playerId, researchId))
      : def.cost;
    return Math.max(0, Math.round(baseCost * getResearchCostMultiplier(playerId, providerId)));
  }

  function getResearchDuration(playerId, researchId, providerId = null) {
    const def = getResearchDefinition(researchId);
    if (!def || !Number.isFinite(def.duration)) return null;
    return Math.max(FIXED_DT, def.duration * getResearchTimeMultiplier(playerId, providerId));
  }

  function isResearchComplete(playerId, researchId) {
    return !!game.players[playerId]?.research?.completed?.has(researchId);
  }

  function isDoctrineUnlocked(playerId, doctrineId) {
    return !!game.players[playerId]?.research?.unlockedDoctrines?.has(doctrineId);
  }

  function hasResearchCapability(playerId, capabilityId) {
    return !!game.players[playerId]?.research?.unlockedCapabilities?.has(capabilityId);
  }

  function isResearchActive(playerId, researchId) {
    return !!game.players[playerId]?.research?.active?.some(record => record.id === researchId);
  }

  function meetsResearchRequirements(playerId, def) {
    if (!def) return false;
    const requirements = def.requirements || {};
    if (requirements.doctrine && !isDoctrineUnlocked(playerId, requirements.doctrine)) return false;
    if (requirements.research?.some(id => !isResearchComplete(playerId, id))) return false;
    return true;
  }

  function canStartResearch(playerId, researchId, providerId = null) {
    const player = game.players[playerId];
    const def = getResearchDefinition(researchId);
    if (!player?.alive || !player.capital?.alive) return { ok: false, reason: 'Capital unavailable' };
    if (!def) return { ok: false, reason: 'Unknown research' };
    if (isResearchComplete(playerId, researchId)) return { ok: false, reason: 'Already completed' };
    if (isResearchActive(playerId, researchId)) return { ok: false, reason: 'Already researching' };
    if (def.configured === false || !Number.isFinite(def.cost) || !Number.isFinite(def.duration)) return { ok: false, reason: 'Research parameters pending' };
    if (def.kind === 'DR' && def.contentReady === false) return { ok: false, reason: 'Doctrine content pending' };
    if (!meetsResearchRequirements(playerId, def)) return { ok: false, reason: 'Prerequisite locked' };
    const provider = getAvailableResearchProvider(playerId);
    if (!provider) return { ok: false, reason: 'No shared research slot available' };
    const cost = getResearchCost(playerId, researchId);
    if (!Number.isFinite(cost) || player.money < cost) return { ok: false, reason: 'Insufficient funds' };
    return { ok: true, cost, duration: getResearchDuration(playerId, researchId), provider };
  }

  function startResearch(playerId, researchId, providerId = null) {
    const player = game.players[playerId];
    const def = getResearchDefinition(researchId);
    const check = canStartResearch(playerId, researchId, providerId);
    if (!check.ok || !player || !def) return check;
    player.money -= check.cost;
    player.research.active.push({
      id: researchId, kind: def.kind, startedAt: game.time, progress: 0, duration: check.duration, costPaid: check.cost,
      providerId: check.provider.id, providerType: check.provider.type, providerName: check.provider.name
    });
    if (playerId === PLAYER_ID) {
      notify(`${def.name} research started in the shared research pool.`, 'good', 2.5);
      renderResearchModal();
    }
    return { ok: true, provider: check.provider };
  }

  function syncPlayerUnitDurability(playerId) {
    const syncRecord = record => {
      if (!record || record.kind !== 'unit' || !UNITS[record.type]) return;
      const equipmentHp = record.configuration?.advancedInfantry && typeof getAdvancedInfantryFlatHp === 'function' ? getAdvancedInfantryFlatHp(record.configuration) : 0;
      const nextMax = Math.max(1, getDefinitionPlayerStat(playerId, 'unit', record.type, 'hp', UNITS[record.type].hp) + equipmentHp);
      const previousMax = Math.max(1, Number.isFinite(record.maxHp) ? record.maxHp : UNITS[record.type].hp);
      const ratio = clamp((Number.isFinite(record.hp) ? record.hp : previousMax) / previousMax, 0, 1);
      record.maxHp = nextMax;
      record.hp = Math.max(1, nextMax * ratio);
      for (const cargo of record.cargoRecords || []) syncRecord(cargo);
    };
    for (const unit of game.units) {
      if (!unit.alive || unit.playerId !== playerId) continue;
      const nextMax = Math.max(1, getEntityStat(unit, 'hp', UNITS[unit.type]?.hp || unit.maxHp || 1));
      const previousMax = Math.max(1, unit.maxHp || nextMax);
      const ratio = clamp(unit.hp / previousMax, 0, 1);
      unit.maxHp = nextMax;
      unit.hp = Math.max(1, nextMax * ratio);
    }
    for (const building of game.buildings) {
      if (!building.alive || building.playerId !== playerId) continue;
      for (const record of building.storedUnits || []) syncRecord(record);
      for (const record of building.bomberBay || []) syncRecord(record);
      for (const record of building.loyalWingmanBay || []) syncRecord(record);
      for (const record of building.droneBay || []) syncRecord(record);
      for (const record of building.engineerBay || []) syncRecord(record);
    }
    for (const record of game.players[playerId]?.capitalReserve || []) syncRecord(record);
  }

  function activateResearchCompletion(player, def) {
    if (!player || !def) return;
    if (def.kind === 'DR') player.research.unlockedDoctrines.add(def.id);
    if (def.kind === 'SR') player.research.unlockedSpecializations.add(def.id);
    if (Array.isArray(def.immediateModifiers) && def.immediateModifiers.length) {
      setModifierSource(player, `research:${def.kind}:${def.id}`, def.immediateModifiers);
    }
    for (const capability of def.immediateCapabilities || []) player.research.unlockedCapabilities.add(capability);
    syncPlayerUnitDurability(player.id);
    refreshPlayerOnsiteUpgrades(player.id);
    refreshBuildButtons();
  }

  function completeResearch(playerId, researchId, options = {}) {
    const player = game.players[playerId];
    const def = getResearchDefinition(researchId);
    if (!player || !def || isResearchComplete(playerId, researchId)) return false;
    const activeRecord = player.research.active?.find(record => record.id === researchId) || null;
    const completionCost = Number.isFinite(options.costPaid) ? options.costPaid : (Number.isFinite(activeRecord?.costPaid) ? activeRecord.costPaid : getResearchCost(playerId, researchId));
    const completionDuration = Number.isFinite(activeRecord?.duration) ? activeRecord.duration : getResearchDuration(playerId, researchId);
    player.research.completed.add(researchId);
    player.research.completedMeta ||= new Map();
    player.research.completedMeta.set(researchId, {
      completedAt: game.time,
      costPaid: completionCost,
      duration: completionDuration,
      providerId: activeRecord?.providerId || null,
      providerName: activeRecord?.providerName || null
    });
    activateResearchCompletion(player, def);
    if (!options.keepActive) player.research.active = player.research.active.filter(record => record.id !== researchId);
    if (playerId === PLAYER_ID) {
      if (!options.silent) notify(`${def.name} research completed.`, 'good', 4);
      if (els.researchModal && !els.researchModal.classList.contains('hidden')) renderResearchModal();
    }
    return true;
  }

  function reassignResearchProvider(player, record) {
    if (!player?.alive || !record) return null;
    const candidates = getResearchProviders(player.id).filter(provider => provider.id !== record.providerId && getResearchProviderAvailableSlots(player.id, provider.id) > 0);
    if (!candidates.length) return null;
    const provider = candidates[0];
    const completionFraction = Number.isFinite(record.duration) && record.duration > 0 ? clamp(record.progress / record.duration, 0, 1) : 0;
    const nextDuration = getResearchDuration(player.id, record.id);
    record.providerId = provider.id;
    record.providerType = provider.type;
    record.providerName = provider.name;
    if (Number.isFinite(nextDuration)) {
      record.duration = nextDuration;
      record.progress = nextDuration * completionFraction;
    }
    if (player.id === PLAYER_ID) notify(`${getResearchDefinition(record.id)?.name || 'Research'} moved to another available research slot.`, 'warning', 3);
    return provider;
  }

  function updateResearch(dt) {
    for (const player of game.players) {
      if (!player.alive || !player.research?.active?.length) continue;
      if (!player.capital?.alive) continue;
      const completed = [];
      for (const record of player.research.active) {
        let provider = getResearchProvider(player.id, record.providerId);
        if (!provider || provider.id !== record.providerId) provider = reassignResearchProvider(player, record);
        if (!provider) continue;
        record.progress += dt;
        if (record.progress + 1e-9 >= record.duration) completed.push(record.id);
      }
      for (const researchId of completed) completeResearch(player.id, researchId);
    }
  }

  function hasOnsiteUpgrade(entity, upgradeId) {
    if (upgradeId === 'genericOU') return (entity?.onsiteUpgradeLevel || 0) > 0;
    return !!entity?.onsiteUpgrades?.has(upgradeId);
  }

  function isCombatBuilding(buildingOrType) {
    const type = typeof buildingOrType === 'string' ? buildingOrType : buildingOrType?.type;
    return !!type && BUILDINGS[type]?.category === 'defense';
  }

  function getOnsiteUpgradeLevel(building) {
    return Math.max(0, Math.floor(Number(building?.onsiteUpgradeLevel) || 0));
  }

  function getOnsiteUpgradeEffectScale(playerId) {
    let scale = 1;
    if (isResearchComplete(playerId, 'aeOUBetter1')) scale += 0.50;
    if (isResearchComplete(playerId, 'aeOUBetter2')) scale += 0.50;
    return scale;
  }

  function getOnsiteUpgradeCeiling(playerId) {
    let ceiling = isDoctrineUnlocked(playerId, 'advancedEngineering')
      ? ADVANCED_ENGINEERING_BALANCE.ouAdvancedCeiling
      : ADVANCED_ENGINEERING_BALANCE.ouBaseCeiling;
    if (isResearchComplete(playerId, 'aeOUCeiling')) ceiling += 3;
    return ceiling;
  }

  function getOnsiteUpgradeCostRate(playerId) {
    let rate = isDoctrineUnlocked(playerId, 'advancedEngineering')
      ? ADVANCED_ENGINEERING_BALANCE.ouAdvancedCostRate
      : ADVANCED_ENGINEERING_BALANCE.ouBaseCostRate;
    if (isResearchComplete(playerId, 'aeOUCheaper')) rate *= 0.85;
    return rate;
  }

  function getOnsiteUpgradeCost(building) {
    if (!building?.alive || building.kind !== 'building' || building.type === 'capital') return null;
    const baseCost = BUILDINGS[building.type]?.cost;
    if (!Number.isFinite(baseCost) || baseCost <= 0) return null;
    return Math.max(1, Math.round(baseCost * getOnsiteUpgradeCostRate(building.playerId)));
  }

  function getOnsiteUpgradeRecoveryRate(playerId) {
    let recovery = isResearchComplete(playerId, 'aeOURecovery')
      ? ADVANCED_ENGINEERING_BALANCE.ouImprovedRecovery
      : ADVANCED_ENGINEERING_BALANCE.ouBaseRecovery;
    const betterCount = (isResearchComplete(playerId, 'aeOUBetter1') ? 1 : 0) + (isResearchComplete(playerId, 'aeOUBetter2') ? 1 : 0);
    recovery += ADVANCED_ENGINEERING_BALANCE.ouBaseRecovery * 0.50 * betterCount;
    return recovery;
  }

  function refreshBuildingOnsiteModifiers(building, options = {}) {
    if (!building?.alive || building.kind !== 'building') return;
    const level = getOnsiteUpgradeLevel(building);
    if (level <= 0) {
      removeModifierSource(building, 'ou:generic-levels');
      return;
    }
    const scale = getOnsiteUpgradeEffectScale(building.playerId);
    if (isCombatBuilding(building)) {
      const gain = ADVANCED_ENGINEERING_BALANCE.ouBaseDamageGain * scale * level;
      setModifierSource(building, 'ou:generic-levels', [
        { stat: 'damage', operation: 'addPercent', value: gain },
        { stat: 'missileDamage', operation: 'addPercent', value: gain },
        { stat: 'hiveHunterDamageMultiplier', operation: 'addPercent', value: gain }
      ]);
    } else {
      const gain = ADVANCED_ENGINEERING_BALANCE.ouBaseHpGain * scale * level;
      setModifierSource(building, 'ou:generic-levels', [{ stat: 'hp', operation: 'addPercent', value: gain }]);
    }
    if (!isCombatBuilding(building)) {
      const nextMax = Math.max(1, getEntityStat(building, 'hp', BUILDINGS[building.type]?.hp || building.maxHp || 1));
      building.maxHp = nextMax;
      if (options.fillToMax) building.hp = nextMax;
      else building.hp = Math.min(building.hp, nextMax);
    }
  }

  function refreshPlayerOnsiteUpgrades(playerId) {
    for (const building of game.buildings) {
      if (building.alive && building.playerId === playerId && getOnsiteUpgradeLevel(building) > 0) refreshBuildingOnsiteModifiers(building);
    }
  }

  function canApplyBuildingOnsiteUpgrade(building, options = {}) {
    const player = building ? game.players[building.playerId] : null;
    if (!building?.alive || building.kind !== 'building' || !player?.alive || building.type === 'capital') return { ok: false, reason: 'OU unavailable' };
    if (building.ouReservedBy && building.ouReservedBy !== options.engineerId) return { ok: false, reason: 'OU already in progress' };
    const level = getOnsiteUpgradeLevel(building);
    const ceiling = getOnsiteUpgradeCeiling(building.playerId);
    if (level >= ceiling) return { ok: false, reason: 'OU ceiling reached' };
    const cost = getOnsiteUpgradeCost(building);
    if (!Number.isFinite(cost)) return { ok: false, reason: 'OU unavailable' };
    if (!options.skipFunds && player.money < cost) return { ok: false, reason: 'Insufficient funds' };
    return { ok: true, cost, level, ceiling };
  }

  function commitBuildingOnsiteUpgrade(building, costPaid = 0) {
    if (!building?.alive) return { ok: false, reason: 'Building unavailable' };
    const previousMax = Math.max(1, building.maxHp || BUILDINGS[building.type]?.hp || 1);
    building.onsiteUpgradeLevel = getOnsiteUpgradeLevel(building) + 1;
    if (costPaid > 0) building.totalInvestedCost = (building.totalInvestedCost || BUILDINGS[building.type]?.cost || 0) + costPaid;
    refreshBuildingOnsiteModifiers(building);
    const recovery = previousMax * getOnsiteUpgradeRecoveryRate(building.playerId);
    building.hp = Math.min(building.maxHp, building.hp + recovery);
    return { ok: true, level: building.onsiteUpgradeLevel, recovery };
  }

  function applyBuildingOnsiteUpgrade(building) {
    const check = canApplyBuildingOnsiteUpgrade(building);
    if (!check.ok) return check;
    const player = game.players[building.playerId];
    player.money -= check.cost;
    const result = commitBuildingOnsiteUpgrade(building, check.cost);
    if (!result.ok) {
      player.money += check.cost;
      return result;
    }
    if (building.playerId === PLAYER_ID) notify(`${BUILDINGS[building.type].name} OU ${result.level}/${check.ceiling} completed.`, 'good', 2.7);
    return { ...result, cost: check.cost };
  }

  // Legacy single-ID OU API remains available for future specialized upgrades.
  function canApplyOnsiteUpgrade(entity, upgradeId) {
    if (upgradeId === 'genericOU') return canApplyBuildingOnsiteUpgrade(entity);
    const def = ONSITE_UPGRADES[upgradeId];
    const player = entity ? game.players[entity.playerId] : null;
    if (!entity?.alive || !player?.alive || !def) return { ok: false, reason: 'Upgrade unavailable' };
    if (hasOnsiteUpgrade(entity, upgradeId)) return { ok: false, reason: 'Already installed' };
    if (def.requirements?.research && !isResearchComplete(entity.playerId, def.requirements.research)) return { ok: false, reason: 'Required SR not completed' };
    if (def.targetKinds?.length && !def.targetKinds.includes(entity.kind)) return { ok: false, reason: 'Invalid target' };
    if (def.targetTypes?.length && !def.targetTypes.includes(entity.type)) return { ok: false, reason: 'Invalid target' };
    const cost = Number.isFinite(def.cost) ? Math.max(0, Math.round(def.cost)) : null;
    if (cost === null) return { ok: false, reason: 'Upgrade parameters pending' };
    if (player.money < cost) return { ok: false, reason: 'Insufficient funds' };
    return { ok: true, cost };
  }

  function applyOnsiteUpgrade(entity, upgradeId) {
    if (upgradeId === 'genericOU') return applyBuildingOnsiteUpgrade(entity);
    const check = canApplyOnsiteUpgrade(entity, upgradeId);
    if (!check.ok) return check;
    const def = ONSITE_UPGRADES[upgradeId];
    const player = game.players[entity.playerId];
    player.money -= check.cost;
    entity.totalInvestedCost = (entity.totalInvestedCost || getEntityDefinition(entity)?.cost || 0) + check.cost;
    entity.onsiteUpgrades.add(upgradeId);
    if (Array.isArray(def.modifiers) && def.modifiers.length) setModifierSource(entity, `ou:${upgradeId}`, def.modifiers);
    return { ok: true };
  }

  function isDefinitionUnlocked(playerId, kind, type) {
    const def = getDefinition(kind, type);
    const requirement = def?.researchRequirement;
    if (!requirement) return true;
    if (requirement.doctrine && !isDoctrineUnlocked(playerId, requirement.doctrine)) return false;
    if (requirement.research && !isResearchComplete(playerId, requirement.research)) return false;
    return true;
  }

  function registerBuildingPlayerModifiers(building) {
    const modifiers = BUILDING_PLAYER_MODIFIERS[building?.type];
    if (!building?.alive || !modifiers?.length) return;
    const player = game.players[building.playerId];
    if (player) setModifierSource(player, `building:${building.id}`, modifiers);
  }

  function unregisterBuildingPlayerModifiers(building) {
    if (!building || !BUILDING_PLAYER_MODIFIERS[building.type]) return;
    removeModifierSource(game.players[building.playerId], `building:${building.id}`);
  }

  function statusModifierSourceId(statusId) {
    return `status:${statusId}`;
  }

  function applyStatus(entity, statusId, duration, source = null, options = {}) {
    if (!entity?.alive || !statusId || !Number.isFinite(duration) || duration <= 0) return false;
    const definition = STATUS_DEFINITIONS[statusId];
    if (!definition) return false;
    entity.statuses ||= new Map();
    const existing = entity.statuses.get(statusId);
    const stacking = options.stacking || definition.stacking || 'refresh';
    let remaining = duration;
    if (existing) {
      if (stacking === 'extend') remaining = existing.remaining + duration;
      else if (stacking === 'replace') remaining = duration;
      else remaining = Math.max(existing.remaining, duration);
    }
    const status = {
      id: statusId,
      remaining,
      source,
      appliedAt: game.time,
      definition,
      modifiers: options.modifiers || definition.modifiers || null
    };
    entity.statuses.set(statusId, status);
    if (status.modifiers?.length) setModifierSource(entity, statusModifierSourceId(statusId), status.modifiers);
    // Keep this legacy debug field synchronized during the migration. No gameplay
    // logic depends on it anymore.
    if (statusId === 'stunned' && 'stunned' in entity) entity.stunned = remaining;
    return true;
  }

  function removeStatus(entity, statusId) {
    if (!entity?.statuses?.delete(statusId)) return false;
    removeModifierSource(entity, statusModifierSourceId(statusId));
    if (statusId === 'stunned' && 'stunned' in entity) entity.stunned = 0;
    return true;
  }

  function hasStatus(entity, statusId) {
    return (entity?.statuses?.get(statusId)?.remaining || 0) > 0;
  }

  function getStatusRemaining(entity, statusId) {
    return Math.max(0, entity?.statuses?.get(statusId)?.remaining || 0);
  }

  function updateEntityStatuses(entity, dt) {
    if (!entity?.alive || !entity.statuses?.size) {
      if (entity && 'stunned' in entity && entity.stunned > 0) entity.stunned = 0;
      return;
    }
    for (const [statusId, status] of [...entity.statuses]) {
      status.remaining = Math.max(0, status.remaining - dt);
      if (statusId === 'stunned' && 'stunned' in entity) entity.stunned = status.remaining;
      if (status.remaining <= 0) removeStatus(entity, statusId);
    }
  }

  function updateStatuses(dt) {
    for (const building of game.buildings) if (building.alive && building.statuses?.size) updateEntityStatuses(building, dt);
    for (const unit of game.units) if (unit.alive && unit.statuses?.size) updateEntityStatuses(unit, dt);
  }

  function normalizeStatusEffect(effect) {
    if (!effect) return null;
    if (Number.isFinite(effect) && effect > 0) return { id: 'stunned', duration: effect };
    if (effect.id && Number.isFinite(effect.duration) && effect.duration > 0) return effect;
    return null;
  }

  function applyStatusEffect(target, effect, source = null) {
    const normalized = normalizeStatusEffect(effect);
    if (!normalized) return false;
    return applyStatus(target, normalized.id, normalized.duration, source, normalized);
  }

