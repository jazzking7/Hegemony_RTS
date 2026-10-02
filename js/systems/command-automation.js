'use strict';

  // ---------------------------------------------------------------------------
  // Advanced Command & Automation
  // ---------------------------------------------------------------------------
  // This module owns Focused Mission state, Scheduled Deployments and the
  // bandwidth-limited automated-warfare runtime. UI code only creates/edits
  // definitions and calls these simulation functions.

  const COMMAND_GROUND_TYPES = [...GROUND_UNIT_TYPES];
  const COMMAND_AIR_TYPES = [...MANNED_AIRCRAFT_TYPES];

  function getCommandGroundTypes(playerId, source = null) {
    const live = typeof getPlayerGroundDefinitionTypes === 'function' ? getPlayerGroundDefinitionTypes(playerId) : [...COMMAND_GROUND_TYPES];
    const saved = Object.keys(source || {}).filter(type => typeof isInfantryLoadoutToken === 'function' && isInfantryLoadoutToken(type));
    return [...new Set([...live, ...saved])];
  }

  function getCommandAutomationState(playerId) {
    const player = game.players[playerId];
    if (!player) return null;
    player.commandAutomation ||= {};
    player.commandAutomation.scheduledDeployment ||= {
      name: 'Scheduled Deployment', waits: [5, 5],
      nodes: [0, 1, 2].map(() => ({ domain: 'ground', focused: false, ground: Object.fromEntries(COMMAND_GROUND_TYPES.map(type => [type, 0])), air: Object.fromEntries(COMMAND_AIR_TYPES.map(type => [type, 0])), escortsPerAircraft: 0 }))
    };
    player.commandAutomation.scheduledExecutions ||= [];
    return player.commandAutomation;
  }

  function normalizeCommandComposition(source, types) {
    return Object.fromEntries(types.map(type => [type, Math.max(0, Math.floor(Number(source?.[type]) || 0))]));
  }

  function normalizeScheduledDeployment(playerId, source = null) {
    const state = getCommandAutomationState(playerId);
    const current = source || state?.scheduledDeployment || {};
    const multi = isResearchComplete(playerId, 'caMultiDomain');
    const nodes = [0, 1, 2].map(index => {
      const row = current.nodes?.[index] || {};
      const domain = multi && row.domain === 'air' ? 'air' : 'ground';
      return {
        domain,
        focused: domain === 'ground' && !!row.focused,
        ground: normalizeCommandComposition(row.ground, getCommandGroundTypes(playerId, row.ground)),
        air: normalizeCommandComposition(row.air, COMMAND_AIR_TYPES),
        escortsPerAircraft: domain === 'air' ? clamp(Math.floor(Number(row.escortsPerAircraft) || 0), 0, Math.max(0, getLoyalWingmanSortieCap(playerId))) : 0,
        // Internal staging hint written by TRAIN REQUIRED UNITS. It is deliberately
        // not player-facing; if the facility disappears, launch logic falls back
        // to any compatible facility that has the full node ready.
        facilityId: row.facilityId ?? null
      };
    });
    return {
      name: String(current.name || 'Scheduled Deployment').trim().slice(0, 28) || 'Scheduled Deployment',
      waits: [0, 1].map(index => clamp(Number(current.waits?.[index]) || 0, 0, 600)),
      nodes
    };
  }

  function setScheduledDeployment(playerId, schedule) {
    const state = getCommandAutomationState(playerId);
    if (!state) return false;
    state.scheduledDeployment = normalizeScheduledDeployment(playerId, schedule);
    return true;
  }

  function getScheduleNodeCount(node) {
    if (!node) return 0;
    const composition = node[node.domain] || {};
    return Object.values(composition).reduce((sum, amount) => sum + Math.max(0, Math.floor(Number(amount) || 0)), 0);
  }

  function getGroundCompositionEntityCount(playerId, composition) {
    let total = 0;
    for (const type of getCommandGroundTypes(playerId, composition)) {
      const amount = Math.max(0, Math.floor(Number(composition?.[type]) || 0));
      total += amount;
      if (TRANSPORT_UNIT_TYPES.includes(type) && amount > 0) {
        const config = getVehicleBuildConfiguration(playerId, type);
        total += amount * getVehiclePassengerCount(config);
      }
    }
    return total;
  }

  function getScheduledDeploymentTotal(schedule) {
    return (schedule?.nodes || []).reduce((sum, node) => sum + getScheduleNodeCount(node), 0);
  }

  function isScheduledDeploymentGroundOnly(schedule) {
    return (schedule?.nodes || []).every(node => getScheduleNodeCount(node) <= 0 || node.domain === 'ground');
  }

  function getScheduledTrainingDiscount(playerId) {
    return isResearchComplete(playerId, 'caScheduledDiscount') ? 0.05 : 0;
  }

  function getScheduledTrainingTimeMultiplier(playerId) {
    return isResearchComplete(playerId, 'caScheduledSpeed') ? 0.90 : 1;
  }

  function getFocusedTravelSpeedBonus(playerId) {
    let bonus = 0;
    if (isResearchComplete(playerId, 'caFocusedSpeed1')) bonus += 0.05;
    if (isResearchComplete(playerId, 'caFocusedSpeed2')) bonus += 0.10;
    return bonus;
  }

  function getFocusedArrivalDamageBonus(playerId) {
    let bonus = 0;
    if (isResearchComplete(playerId, 'caFocusedDamage1')) bonus += 0.05;
    if (isResearchComplete(playerId, 'caFocusedDamage2')) bonus += 0.10;
    return bonus;
  }

  function applyFocusedMission(unit, targetX, targetY) {
    if (!unit?.alive) return false;
    unit.focusedMission = true;
    unit.focusedMissionX = targetX;
    unit.focusedMissionY = targetY;
    unit.focusedMissionRadius = COMMAND_AUTOMATION_BALANCE.focusedArrivalRadius;
    unit.orderX = targetX;
    unit.orderY = targetY;
    unit.hasOrder = true;
    unit.target = null;
    const speedBonus = getFocusedTravelSpeedBonus(unit.playerId);
    if (speedBonus > 0) setModifierSource(unit, 'command:focusedTravel', [{ stat: 'speed', operation: 'addPercent', value: speedBonus }]);
    return true;
  }

  function completeFocusedMission(unit) {
    if (!unit?.focusedMission) return false;
    unit.focusedMission = false;
    removeModifierSource(unit, 'command:focusedTravel');
    const damageBonus = getFocusedArrivalDamageBonus(unit.playerId);
    if (damageBonus > 0) setModifierSource(unit, 'command:focusedArrival', [{ stat: 'damage', operation: 'addPercent', value: damageBonus }]);
    unit.focusedMissionCompleted = true;
    return true;
  }

  function getAdvancedCoordinationCenterLimit(playerId) {
    return isResearchComplete(playerId, 'caACC2') ? 2 : 1;
  }

  function getCoordinationCenterBandwidth(center) {
    if (!center?.alive || center.type !== 'advancedCoordinationCenter') return 0;
    let value = COMMAND_AUTOMATION_BALANCE.defaultBandwidth;
    if (isResearchComplete(center.playerId, 'caBandwidth1')) value++;
    if (isResearchComplete(center.playerId, 'caBandwidth2')) value++;
    return value;
  }

  function getCoordinationCenterUsedBandwidth(center) {
    return (center?.automatedWarfare || []).filter(routine => !routine.cancelled).length;
  }

  function getTheaterDeploymentCap(playerId) {
    return isResearchComplete(playerId, 'caTheaterCap') ? COMMAND_AUTOMATION_BALANCE.theaterUpgradedDeploymentCap : COMMAND_AUTOMATION_BALANCE.theaterBaseDeploymentCap;
  }

  function getTheaterTrainingTimeMultiplier(playerId) {
    let reduction = 0;
    if (isResearchComplete(playerId, 'caTheaterSpeed1')) reduction += 0.08;
    if (isResearchComplete(playerId, 'caTheaterSpeed2')) reduction += 0.08;
    return Math.max(0.05, 1 - reduction);
  }

  function getTheaterCostMultiplier(playerId) {
    let discount = 0;
    if (isResearchComplete(playerId, 'caTheaterCost1')) discount += 0.05;
    if (isResearchComplete(playerId, 'caTheaterCost2')) discount += 0.05;
    return Math.max(0, 1 - discount);
  }

  function getAerialAutomationTrainingTimeMultiplier(playerId) {
    let reduction = 0;
    if (isResearchComplete(playerId, 'caAirSpeed1')) reduction += 0.08;
    if (isResearchComplete(playerId, 'caAirSpeed2')) reduction += 0.08;
    return Math.max(0.05, 1 - reduction);
  }

  function getAerialAutomationCostMultiplier(playerId) {
    return isResearchComplete(playerId, 'caAirCost1') ? 0.95 : 1;
  }

  function getAutomationInitiationMultiplier(playerId) {
    let discount = 0;
    if (isResearchComplete(playerId, 'caInitiationDiscount1')) discount += 0.10;
    if (isResearchComplete(playerId, 'caInitiationDiscount2')) discount += 0.15;
    return Math.max(0, 1 - discount);
  }

  function getMatureRoutineModifiers(routine) {
    const playerId = routine?.playerId;
    if (playerId == null || (routine.deploymentsMade || 0) < 2) return [];
    const researched = routine.kind === 'theater' ? isResearchComplete(playerId, 'caTheaterMature') : isResearchComplete(playerId, 'caAirMature');
    if (!researched) return [];
    return [
      { stat: 'damage', operation: 'addPercent', value: 0.12 },
      { stat: 'bombDamage', operation: 'addPercent', value: 0.12 },
      { stat: 'airToAirMissileDamage', operation: 'addPercent', value: 0.12 },
      { stat: 'airToGroundMissileDamage', operation: 'addPercent', value: 0.12 },
      { stat: 'missileDamage', operation: 'addPercent', value: 0.12 }
    ];
  }

  function tagAutomationUnit(unit, routine) {
    if (!unit?.alive || !routine) return;
    unit.automationRoutineId = routine.id;
    const mature = getMatureRoutineModifiers(routine);
    if (mature.length) setModifierSource(unit, 'automation:matureWarfront', mature);
    if (routine.kind === 'areaDenial' || routine.kind === 'routineFlight') {
      if (isResearchComplete(unit.playerId, 'caAirTurnaround')) setModifierSource(unit, `automation:turnaround:${routine.id}`, [{ stat: 'turnaroundTimeMultiplier', operation: 'multiply', value: 0.80 }]);
    }
  }

  function tagAutomationRecord(record, routine) {
    if (!record || !routine) return;
    const mature = getMatureRoutineModifiers(routine);
    if (!mature.length) return;
    record.persistentModifierSources ||= [];
    record.persistentModifierSources = record.persistentModifierSources.filter(([sourceId]) => sourceId !== 'automation:matureWarfront');
    record.persistentModifierSources.push(['automation:matureWarfront', mature.map(mod => ({ ...mod }))]);
    for (const cargo of record.cargoRecords || []) tagAutomationRecord(cargo, routine);
  }

  function consumeAutomationTurnaroundMultiplier(unit) {
    const multiplier = Math.max(0.05, getEntityStat(unit, 'turnaroundTimeMultiplier', 1));
    for (const sourceId of [...(unit?.modifierSources?.keys?.() || [])]) {
      if (String(sourceId).startsWith('automation:turnaround:')) removeModifierSource(unit, sourceId);
    }
    return multiplier;
  }

  function getUnitBuildConfigurationForCommand(playerId, type) {
    if (TRANSPORT_UNIT_TYPES.includes(type)) return getVehicleBuildConfiguration(playerId, type);
    if (type === 'superFighter' || type === 'paratrooperPlane') return getAircraftBuildConfiguration(playerId, type);
    return null;
  }

  function getCommandUnitPackageCost(playerId, type) {
    if (typeof isInfantryLoadoutToken === 'function' && isInfantryLoadoutToken(type)) return getGroundDefinitionCost(playerId, type);
    return getTrainingPackageCost(playerId, type, getUnitBuildConfigurationForCommand(playerId, type));
  }

  function getCompositionCost(playerId, composition, types) {
    let total = 0;
    for (const type of types) total += Math.max(0, Math.floor(Number(composition?.[type]) || 0)) * getCommandUnitPackageCost(playerId, type);
    return total;
  }

  function getScheduleSetCost(playerId, schedule) {
    let total = 0;
    for (const node of schedule?.nodes || []) {
      total += node.domain === 'air' ? getCompositionCost(playerId, node.air, COMMAND_AIR_TYPES) : getCompositionCost(playerId, node.ground, getCommandGroundTypes(playerId, node.ground));
      if (node.domain === 'air') {
        const aircraft = COMMAND_AIR_TYPES.reduce((sum, type) => sum + (node.air?.[type] || 0), 0);
        total += Math.min(getLoyalWingmanSortieCap(playerId), aircraft * Math.max(0, node.escortsPerAircraft || 0)) * getUnitCost(playerId, 'loyalWingman');
      }
    }
    return total;
  }

  function getRoutineSetCost(playerId, spec) {
    if (!spec) return 0;
    if (spec.kind === 'theater') {
      if (spec.templateType === 'scheduled') return getScheduleSetCost(playerId, spec.schedule);
      return getCompositionCost(playerId, spec.composition, getCommandGroundTypes(playerId, spec.composition));
    }
    let total = getCompositionCost(playerId, spec.composition, COMMAND_AIR_TYPES);
    const aircraft = COMMAND_AIR_TYPES.reduce((sum, type) => sum + Math.max(0, Math.floor(Number(spec.composition?.[type]) || 0)), 0);
    const escorts = Math.min(getLoyalWingmanSortieCap(playerId), aircraft * Math.max(0, Math.floor(Number(spec.escortsPerAircraft) || 0)));
    total += escorts * getUnitCost(playerId, 'loyalWingman');
    return total;
  }

  function ensureQueueArrays(facility) {
    facility.queuePaidCosts ||= [];
    facility.queueBuildConfigs ||= [];
    facility.queueMeta ||= [];
  }

  function queueCommandUnit(facility, type, options = {}) {
    const isLoadout = typeof isInfantryLoadoutToken === 'function' && isInfantryLoadoutToken(type);
    const player = game.players[facility?.playerId];
    if (!facility?.alive || !player?.alive) return false;
    if (isGroundMilitaryFacility(facility) && facility.queue.length >= 60) return false;
    let queueType = type;
    let configuration = null;
    let loadout = null;
    if (isLoadout) {
      const parsed = parseInfantryLoadoutToken(type);
      loadout = parsed && parsed.playerId === facility.playerId ? getInfantryLoadoutById(facility.playerId, parsed.loadoutId) : null;
      if (!loadout || !isGroundMilitaryFacility(facility) || !hasOperationalSuperiorMobilizationComplex(facility.playerId)) return false;
      queueType = loadout.soldierType;
      configuration = getInfantryLoadoutConfigurationSnapshot(facility.playerId, loadout);
    } else {
      if (!UNITS[type] || !isTrainingFacilityFor(facility, type) || !isDefinitionUnlocked(facility.playerId, 'unit', type)) return false;
      if (facility.type === 'airbase' && getAirbaseAvailableSlots(facility) <= 0) return false;
      if (facility.type === 'droneHub' && type === 'loyalWingman' && getLoyalWingmanNetworkRoom(facility.playerId) <= 0) return false;
      configuration = getUnitBuildConfigurationForCommand(facility.playerId, type);
    }
    const baseCost = isLoadout ? getInfantryLoadoutTrainingCost(facility.playerId, loadout) : getTrainingPackageCost(facility.playerId, type, configuration);
    const cost = Math.max(0, Math.round(baseCost * Math.max(0, Number(options.costMultiplier) || 1) * 100) / 100);
    if (player.money + 1e-9 < cost) return false;
    player.money -= cost;
    ensureQueueArrays(facility);
    facility.queue.push(queueType);
    facility.queuePaidCosts.push(cost);
    facility.queueBuildConfigs.push(clonePlain(configuration));
    facility.queueMeta.push({
      source: options.source || 'command',
      routineId: options.routineId || null,
      trainingTimeMultiplier: Math.max(0.05, Number(options.trainingTimeMultiplier) || 1),
      ...(isLoadout ? { advancedInfantry:true, loadoutId:loadout.id } : {})
    });
    return true;
  }

  function countQueuedType(facility, type) {
    if (typeof isInfantryLoadoutToken === 'function' && isInfantryLoadoutToken(type)) {
      const parsed = parseInfantryLoadoutToken(type);
      return (facility?.queueBuildConfigs || []).reduce((sum, config) => sum + (config?.advancedInfantry && parsed && String(config.loadoutId) === String(parsed.loadoutId) ? 1 : 0), 0);
    }
    return (facility?.queue || []).reduce((sum, row, index) => sum + (row === type && !facility.queueBuildConfigs?.[index]?.advancedInfantry ? 1 : 0), 0);
  }

  function countStoredAcrossBases(playerId, type) {
    return game.buildings.reduce((sum, base) => sum + (base.alive && base.playerId === playerId && isGroundMilitaryFacility(base) ? getGroundDefinitionAvailable(base, type) : 0), 0);
  }

  function countAircraftCommitmentByType(base, type) {
    return getAirbaseReadyCount(base, type) + getAirbaseCoolingCount(base, type) + getAirbaseAssignedActiveCount(base, type) + getAirbaseQueuedAircraftCount(base, type);
  }

  function findQueueMilitaryBase(playerId, preferredId = null) {
    const bases = game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === 'militaryBase' && b.queue.length < 60);
    if (preferredId) {
      const preferred = bases.find(b => b.id === preferredId);
      if (preferred) return preferred;
    }
    return bases.sort((a, b) => a.queue.length - b.queue.length || a.id - b.id)[0] || null;
  }

  function findQueueAirbase(playerId, preferredId = null, type = null) {
    const bases = game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === 'airbase' && (!type || getAirbaseAvailableSlots(b) > 0));
    if (preferredId) {
      const preferred = bases.find(b => b.id === preferredId);
      if (preferred) return preferred;
    }
    return bases.sort((a, b) => getAirbaseAircraftCommitment(a) - getAirbaseAircraftCommitment(b) || a.id - b.id)[0] || null;
  }

  function findQueueDroneHub(playerId) {
    return game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === 'droneHub' && getDroneHubNetworkRoom(b, 'loyalWingman') > 0).sort((a, b) => a.queue.length - b.queue.length || a.id - b.id)[0] || null;
  }

  function getScheduledAirNodeEscortCount(playerId, node) {
    const aircraft = COMMAND_AIR_TYPES.reduce((sum, type) => sum + Math.max(0, Math.floor(Number(node?.air?.[type]) || 0)), 0);
    return Math.min(getLoyalWingmanSortieCap(playerId), aircraft * Math.max(0, Math.floor(Number(node?.escortsPerAircraft) || 0)));
  }

  function trainScheduledDeployment(playerId) {
    if (!hasResearchCapability(playerId, 'scheduledDeployment')) return { ok: false, reason: 'Scheduled Deployment is locked.' };
    const state = getCommandAutomationState(playerId);
    const schedule = normalizeScheduledDeployment(playerId, state?.scheduledDeployment);
    if (!getScheduledDeploymentTotal(schedule)) return { ok: false, reason: 'Scheduled Deployment has no configured units.' };
    const player = game.players[playerId];
    const discount = 1 - getScheduledTrainingDiscount(playerId);
    const timeMultiplier = getScheduledTrainingTimeMultiplier(playerId);
    let queued = 0;

    // Ground nodes are consumptive deployments, so TRAIN REQUIRED UNITS stages
    // the sum of every ground node in one Military Base. This avoids the old
    // failure mode where a schedule could be "fully trained" in aggregate while
    // its inventory was fragmented across several Bases and no single node could
    // ever launch.
    const groundNodes = schedule.nodes.filter(node => node.domain === 'ground' && getScheduleNodeCount(node) > 0);
    if (groundNodes.length) {
      const groundBase = findQueueMilitaryBase(playerId);
      if (!groundBase) return { ok: false, reason: 'No Military Base is available to stage the Scheduled Deployment.' };
      const groundTypes = [...new Set(groundNodes.flatMap(node => getCommandGroundTypes(playerId, node.ground)))];
      const groundNeeds = Object.fromEntries(groundTypes.map(type => [type, 0]));
      for (const node of groundNodes) {
        node.facilityId = groundBase.id;
        for (const type of groundTypes) groundNeeds[type] += node.ground[type] || 0;
      }
      for (const type of groundTypes) {
        let missing = Math.max(0, groundNeeds[type] - getGroundDefinitionAvailable(groundBase, type) - countQueuedType(groundBase, type));
        while (missing-- > 0) {
          if (!queueCommandUnit(groundBase, type, { source: 'scheduled', costMultiplier: discount, trainingTimeMultiplier: timeMultiplier })) break;
          queued++;
        }
      }
    }

    // Aircraft are reusable. Air nodes therefore do not blindly sum every
    // sortie (which would massively over-train aircraft); nodes are greedily
    // staged onto Airbases and each Airbase maintains the maximum composition
    // required by the nodes assigned to it. If two nodes need incompatible
    // fleets whose combined types exceed capacity, another Airbase is used.
    const airNodes = schedule.nodes.filter(node => node.domain === 'air' && getScheduleNodeCount(node) > 0);
    const airbases = game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === 'airbase').sort((a, b) => a.id - b.id);
    const airPlans = new Map();
    for (const node of airNodes) {
      const nodeAircraft = COMMAND_AIR_TYPES.reduce((sum, type) => sum + (node.air[type] || 0), 0);
      if (nodeAircraft > getAirbaseAircraftCapacity(playerId)) return { ok: false, reason: `A Scheduled Deployment air node exceeds the ${getAirbaseAircraftCapacity(playerId)}-aircraft Airbase capacity.` };
      const nodeWingmen = getScheduledAirNodeEscortCount(playerId, node);
      let best = null;
      for (const base of airbases) {
        const current = airPlans.get(base.id) || { requirements: Object.fromEntries(COMMAND_AIR_TYPES.map(type => [type, 0])), wingmen: 0 };
        const next = Object.fromEntries(COMMAND_AIR_TYPES.map(type => [type, Math.max(current.requirements[type] || 0, node.air[type] || 0)]));
        const total = COMMAND_AIR_TYPES.reduce((sum, type) => sum + next[type], 0);
        if (total > getAirbaseAircraftCapacity(playerId)) continue;
        const nextWingmen = Math.max(current.wingmen || 0, nodeWingmen);
        if (nextWingmen > getAirbaseWingmanCapacity(base)) continue;
        const extra = COMMAND_AIR_TYPES.reduce((sum, type) => sum + Math.max(0, next[type] - countAircraftCommitmentByType(base, type)), 0);
        const score = extra * 1000 + getAirbaseAircraftCommitment(base);
        if (!best || score < best.score || (score === best.score && base.id < best.base.id)) best = { base, next, nextWingmen, score };
      }
      if (!best) return { ok: false, reason: 'No Airbase has enough capacity to stage an air node in this Scheduled Deployment.' };
      node.facilityId = best.base.id;
      airPlans.set(best.base.id, { requirements: best.next, wingmen: best.nextWingmen });
    }

    for (const [baseId, plan] of airPlans) {
      const base = game.entityById.get(baseId);
      if (!base?.alive) continue;
      for (const type of COMMAND_AIR_TYPES) {
        let missing = Math.max(0, (plan.requirements[type] || 0) - countAircraftCommitmentByType(base, type));
        while (missing-- > 0) {
          if (!queueCommandUnit(base, type, { source:'scheduled', costMultiplier: discount, trainingTimeMultiplier: timeMultiplier })) break;
          queued++;
        }
      }
    }

    // Wingmen are networked between Drone Hubs and Airbases, so only the
    // maximum simultaneously staged requirement across assigned Airbases must
    // exist in the network. Launch-time transfer moves them to the selected base.
    const totalWingmenNeeded = [...airPlans.values()].reduce((sum, plan) => sum + (plan.wingmen || 0), 0);
    const currentWingmen = game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === 'airbase').reduce((sum,b)=>sum+getAirbaseWingmanCommitment(b),0)
      + game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === 'droneHub').reduce((sum,b)=>sum+getDroneHubStoredCount(b,'loyalWingman')+getDroneHubQueuedCount(b,'loyalWingman'),0);
    let wingMissing = Math.max(0, totalWingmenNeeded - currentWingmen);
    while (wingMissing-- > 0) {
      const hub = findQueueDroneHub(playerId);
      if (!hub || !queueCommandUnit(hub, 'loyalWingman', { source:'scheduled', costMultiplier: discount, trainingTimeMultiplier: timeMultiplier })) break;
      queued++;
    }

    // Persist the internal facility staging hints so the subsequent launch uses
    // the same inventories that TRAIN REQUIRED UNITS prepared.
    state.scheduledDeployment = schedule;
    if (playerId === PLAYER_ID) notify(`${queued} Scheduled Deployment unit${queued === 1 ? '' : 's'} added to production. Existing staged units were counted first.`, queued ? 'good' : 'warning', 3);
    return { ok: queued > 0, queued };
  }

  function militaryBaseHasComposition(base, composition) {
    return isGroundMilitaryFacility(base) && getCommandGroundTypes(base.playerId, composition).every(type => getGroundDefinitionAvailable(base, type) >= Math.max(0, Math.floor(Number(composition?.[type]) || 0)));
  }

  function airbaseHasSortie(base, composition, escortsPerAircraft = 0) {
    if (!base?.alive || base.type !== 'airbase') return false;
    for (const type of COMMAND_AIR_TYPES) if (getAirbaseReadyCount(base, type) < Math.max(0, Math.floor(Number(composition?.[type]) || 0))) return false;
    const aircraft = COMMAND_AIR_TYPES.reduce((sum, type) => sum + Math.max(0, Math.floor(Number(composition?.[type]) || 0)), 0);
    const escorts = Math.min(getLoyalWingmanSortieCap(base.playerId), aircraft * Math.max(0, Math.floor(Number(escortsPerAircraft) || 0)));
    return getAirbaseReadyWingmanCount(base) >= escorts;
  }

  function applyAssaultZone(unit, x, y) {
    if (!unit?.alive) return;
    unit.assaultZoneX = x;
    unit.assaultZoneY = y;
    unit.assaultZoneRadius = COMMAND_AUTOMATION_BALANCE.transportAssaultRadius;
    unit.transportReleaseOrder = false;
    unit.hasOrder = false;
  }

  function launchGroundComposition(base, composition, targetX, targetY, options = {}) {
    if (!militaryBaseHasComposition(base, composition)) return 0;
    const playerId = base.playerId;
    const groundTypes = getCommandGroundTypes(playerId, composition);
    const selectedRecords = Object.fromEntries(groundTypes.map(type => [type, []]));
    for (const type of groundTypes) {
      const amount = Math.max(0, Math.floor(Number(composition?.[type]) || 0));
      for (let i = 0; i < amount; i++) {
        const record = takeGroundDefinitionRecord(base, type);
        if (!record) break;
        selectedRecords[type].push(record);
      }
    }
    if (options.routine) for (const type of groundTypes) for (const record of selectedRecords[type]) tagAutomationRecord(record, options.routine);
    const passengerPool = [];
    for (const type of groundTypes) {
      const baseType = getGroundDefinitionBaseType(playerId, type);
      if (!INFANTRY_UNIT_TYPES.includes(baseType)) continue;
      passengerPool.push(...selectedRecords[type]);
      selectedRecords[type] = [];
    }
    for (const type of TRANSPORT_UNIT_TYPES) {
      for (const vehicleRecord of selectedRecords[type] || []) {
        while (passengerPool.length && (vehicleRecord.cargoRecords?.length || 0) < getTransportCapacityForType(playerId, type)) loadCargoRecord(vehicleRecord, passengerPool.shift(), playerId);
      }
    }
    for (const record of passengerPool) {
      const key = record.variantId && selectedRecords[record.variantId] ? record.variantId : record.type;
      (selectedRecords[key] ||= []).push(record);
    }
    let launched = 0;
    let spawnIndex = 0;
    for (const type of groundTypes) {
      for (const record of selectedRecords[type] || []) {
        const ring = 46 + Math.floor(spawnIndex / 12) * 18;
        const angle = (spawnIndex % 12) / 12 * Math.PI * 2;
        const unit = createUnitFromRecord(record, base.x + Math.cos(angle) * ring, base.y + Math.sin(angle) * ring);
        if (!unit) { restoreStoredUnit(base, record); continue; }
        const isTransport = TRANSPORT_UNIT_TYPES.includes(record.type);
        unit.orderX = targetX + (options.focused || isTransport ? 0 : rand(-35,35));
        unit.orderY = targetY + (options.focused || isTransport ? 0 : rand(-35,35));
        if (isTransport) { unit.transportMissionX = targetX; unit.transportMissionY = targetY; }
        unit.hasOrder = true;
        if (options.focused) applyFocusedMission(unit, targetX, targetY);
        if (options.routine) tagAutomationUnit(unit, options.routine);
        launched++; spawnIndex++;
      }
    }
    return launched;
  }

  function launchAirSortie(base, composition, targetX, targetY, options = {}) {
    const escortsPerAircraft = Math.max(0, Math.floor(Number(options.escortsPerAircraft) || 0));
    if (!airbaseHasSortie(base, composition, escortsPerAircraft)) return 0;
    const playerId = base.playerId;
    const requested = COMMAND_AIR_TYPES.reduce((sum, type) => sum + (composition[type] || 0), 0);
    let escortRemaining = Math.min(getLoyalWingmanSortieCap(playerId), requested * escortsPerAircraft);
    let launched = 0;
    const masters = [];
    let spawnIndex = 0;
    let areaTargets = options.areaTargets || [];

    for (const type of COMMAND_AIR_TYPES) {
      const amount = Math.max(0, Math.floor(Number(composition?.[type]) || 0));
      for (let i = 0; i < amount; i++) {
        const record = takeReadyAircraft(base, type);
        if (!record) break;
        const a = spawnIndex++ / Math.max(1, requested) * Math.PI * 2;
        let unit = null;
        if (type === 'bomber') {
          const strikeTarget = options.areaDenial && areaTargets.length ? areaTargets[(i + launched) % areaTargets.length] : null;
          const bx = strikeTarget?.x ?? targetX;
          const by = strikeTarget?.y ?? targetY;
          unit = createUnitFromRecord(record, base.x + Math.cos(a)*54, base.y + Math.sin(a)*54, { homeAirbaseId:base.id, bombTargetX:bx, bombTargetY:by, airMissionState:'outbound', bombReleased:false });
        } else if (type === 'superFighter') {
          const missiles = normalizeFighterMissileConfiguration(playerId, record.configuration?.missiles);
          unit = createUnitFromRecord(record, base.x + Math.cos(a)*58, base.y + Math.sin(a)*58, {
            homeAirbaseId:base.id, bombTargetX:targetX, bombTargetY:targetY,
            airMissionState: options.areaDenial ? 'fighterPatrol' : (missiles.airToGround > 0 ? 'fighterStrike' : missiles.airToAir > 0 ? 'fighterPatrol' : 'returning'),
            fighterMissionX:targetX, fighterMissionY:targetY,
            fighterA2ARemaining:missiles.airToAir, fighterA2GRemaining:missiles.airToGround, payloadRemaining:missiles.airToAir+missiles.airToGround,
            enduranceRemaining:getDefinitionPlayerStat(playerId,'unit','superFighter','endurance',AIR_DOMINANCE_BALANCE.fighterEndurance),
            flareCharges:Math.max(0,Math.floor(getDefinitionPlayerStat(playerId,'unit','superFighter','flares',AIR_DOMINANCE_BALANCE.fighterFlares))),
            fighterMissileCooldown:0, fighterPatrolAngle:rand(0,Math.PI*2), fighterStealthed:isResearchComplete(playerId,'adStealthFighter'), lastAttackAt:-99,lastTargetedAt:-99,
            fighterPatrolRadiusOverride: options.areaDenial ? COMMAND_AUTOMATION_BALANCE.areaDenialRadius : undefined,
            fighterStrikeRadiusOverride: options.areaDenial ? COMMAND_AUTOMATION_BALANCE.areaDenialRadius : undefined
          });
        } else if (type === 'paratrooperPlane') {
          const passengerCount = record.cargoRecords?.length || 0;
          unit = createUnitFromRecord(record, base.x + Math.cos(a)*60, base.y + Math.sin(a)*60, {
            homeAirbaseId:base.id, bombTargetX:targetX,bombTargetY:targetY, airMissionState:passengerCount>0?'outbound':'returning',
            paratrooperMissionX:targetX, paratrooperMissionY:targetY, payloadRemaining:passengerCount, sortiePassengerCount:passengerCount, passengersDropped:0,
            enduranceRemaining:AIR_DOMINANCE_BALANCE.paratrooperEndurance,
            flareCharges:Math.max(0,Math.floor(getDefinitionPlayerStat(playerId,'unit','paratrooperPlane','flares',AIR_DOMINANCE_BALANCE.paratrooperFlares)))
          });
        }
        if (unit) {
          if (options.routine) tagAutomationUnit(unit, options.routine);
          masters.push(unit); launched++;
        } else { base.bomberBay.push(record); syncAirbaseStoredCount(base); }
      }
    }

    for (const master of masters) {
      if (escortRemaining <= 0) break;
      const desired = Math.min(escortsPerAircraft, escortRemaining, getAirbaseReadyWingmanCount(base));
      for (let i=0;i<desired;i++) {
        const record=takeReadyWingman(base); if(!record) break;
        const escort=launchLoyalWingmanEscort(base,record,master,i,desired);
        if (escort) { if(options.routine) tagAutomationUnit(escort,options.routine); escortRemaining--; }
        else base.loyalWingmanBay.push(record);
      }
      syncAirbaseWingmen(base);
    }
    return launched;
  }

  function findScheduleFacility(playerId, node) {
    const preferred = node?.facilityId != null ? game.entityById.get(node.facilityId) : null;
    if (node.domain === 'air') {
      const candidates = game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === 'airbase');
      if (preferred?.alive && preferred.playerId === playerId && preferred.type === 'airbase') candidates.sort((a, b) => (a.id === preferred.id ? -1 : b.id === preferred.id ? 1 : a.id - b.id));
      const aircraft = COMMAND_AIR_TYPES.reduce((sum, type) => sum + Math.max(0, Math.floor(Number(node.air?.[type]) || 0)), 0);
      const escorts = Math.min(getLoyalWingmanSortieCap(playerId), aircraft * Math.max(0, Math.floor(Number(node.escortsPerAircraft) || 0)));
      for (const base of candidates) {
        if (!COMMAND_AIR_TYPES.every(type => getAirbaseReadyCount(base, type) >= Math.max(0, Math.floor(Number(node.air?.[type]) || 0)))) continue;
        transferWingmenToAirbase(base, Math.max(0, escorts - getAirbaseReadyWingmanCount(base)));
        if (airbaseHasSortie(base, node.air, node.escortsPerAircraft)) return base;
      }
      return null;
    }
    if (preferred?.alive && preferred.playerId === playerId && isGroundMilitaryFacility(preferred) && militaryBaseHasComposition(preferred, node.ground)) return preferred;
    return game.buildings.find(b => b.alive && b.playerId === playerId && isGroundMilitaryFacility(b) && militaryBaseHasComposition(b, node.ground)) || null;
  }

  function startScheduledDeployment(playerId, targetX, targetY, scheduleSource = null, options = {}) {
    if (!hasResearchCapability(playerId, 'scheduledDeployment')) return { ok:false, reason:'Scheduled Deployment is locked.' };
    const state=getCommandAutomationState(playerId);
    const schedule=normalizeScheduledDeployment(playerId,scheduleSource||state.scheduledDeployment);
    if (!getScheduledDeploymentTotal(schedule)) return {ok:false,reason:'Scheduled Deployment is empty.'};
    game.scheduleExecutionId = game.scheduleExecutionId || 1;
    const execution={ id:`sched-${playerId}-${game.scheduleExecutionId++}`, playerId, schedule:clonePlain(schedule), targetX,targetY,currentNode:0,nextAt:game.time, routineId:options.routineId||null };
    state.scheduledExecutions.push(execution);
    if(playerId===PLAYER_ID && !options.silent) notify(`${schedule.name} initiated. Nodes will launch as their wait timers and full inventories permit.`,'good',3);
    return {ok:true,execution};
  }

  function updateScheduledDeployments(dt) {
    for (const player of game.players) {
      const state=getCommandAutomationState(player.id); if(!state?.scheduledExecutions?.length) continue;
      for (let i=state.scheduledExecutions.length-1;i>=0;i--) {
        const exec=state.scheduledExecutions[i];
        if(game.time+1e-9 < exec.nextAt) continue;
        const node=exec.schedule.nodes[exec.currentNode];
        if(!node){state.scheduledExecutions.splice(i,1);continue;}
        if(getScheduleNodeCount(node)<=0){ exec.currentNode++; exec.nextAt=game.time+(exec.schedule.waits[exec.currentNode-1]||0); continue; }
        const facility=findScheduleFacility(player.id,node); if(!facility) continue;
        const launched=node.domain==='air'
          ? launchAirSortie(facility,node.air,exec.targetX,exec.targetY,{escortsPerAircraft:node.escortsPerAircraft})
          : launchGroundComposition(facility,node.ground,exec.targetX,exec.targetY,{focused:node.focused});
        if(launched<=0) continue;
        const launchedIndex=exec.currentNode;
        exec.currentNode++;
        if(exec.currentNode>=exec.schedule.nodes.length){state.scheduledExecutions.splice(i,1); if(player.id===PLAYER_ID) notify(`${exec.schedule.name} completed.`,'good',2.2); continue;}
        exec.nextAt=game.time+(exec.schedule.waits[launchedIndex]||0);
      }
    }
  }

  function getRoutineById(routineId) {
    for (const center of game.buildings) {
      if(!center.alive || center.type!=='advancedCoordinationCenter') continue;
      const routine=(center.automatedWarfare||[]).find(row=>row.id===routineId&&!row.cancelled); if(routine) return routine;
    }
    return null;
  }

  function getRoutineBoundFacility(routine) {
    const facility=findEntityById(routine?.facilityId);
    if(!facility?.alive || facility.playerId!==routine.playerId) return null;
    if(routine.kind==='theater' && !isGroundMilitaryFacility(facility)) return null;
    if((routine.kind==='areaDenial'||routine.kind==='routineFlight')&&facility.type!=='airbase') return null;
    return facility;
  }

  function createAutomatedWarfare(center, spec) {
    if(!center?.alive || center.type!=='advancedCoordinationCenter'||!hasResearchCapability(center.playerId,'automatedWarfare')) return {ok:false,reason:'Advanced Coordination unavailable.'};
    if(getCoordinationCenterUsedBandwidth(center)>=getCoordinationCenterBandwidth(center)) return {ok:false,reason:'No Bandwidth available.'};
    const facility=findEntityById(spec?.facilityId);
    if(!facility?.alive||facility.playerId!==center.playerId) return {ok:false,reason:'Bound facility unavailable.'};
    if(spec.kind==='theater'&&!isGroundMilitaryFacility(facility)) return {ok:false,reason:'Theater Routine requires a ground military facility.'};
    if((spec.kind==='areaDenial'||spec.kind==='routineFlight')&&facility.type!=='airbase') return {ok:false,reason:'Aerial Automated Warfare requires an Airbase.'};
    if(spec.kind==='areaDenial'&&(spec.composition?.paratrooperPlane||0)>0) return {ok:false,reason:'Paratrooper Planes cannot join Area Denial.'};
    if(spec.kind==='areaDenial'||spec.kind==='routineFlight') {
      const primaryCount=COMMAND_AIR_TYPES.reduce((sum,type)=>sum+Math.max(0,Math.floor(Number(spec.composition?.[type])||0)),0);
      if(primaryCount<1) return {ok:false,reason:'Aerial automation requires at least one manned aircraft.'};
      if(primaryCount>getAirbaseAircraftCapacity(center.playerId)) return {ok:false,reason:`Sortie exceeds this player's ${getAirbaseAircraftCapacity(center.playerId)}-aircraft Airbase capacity.`};
      const escorts=Math.min(getLoyalWingmanSortieCap(center.playerId),primaryCount*Math.max(0,Math.floor(Number(spec.escortsPerAircraft)||0)));
      if(escorts>getAirbaseWingmanCapacity(facility)) return {ok:false,reason:'Sortie Loyal Wingman requirement exceeds this Airbase capacity.'};
    }
    if(spec.kind==='theater') {
      if(spec.templateType==='scheduled') {
        if(!isScheduledDeploymentGroundOnly(spec.schedule)) return {ok:false,reason:'Multi-domain Scheduled Deployments cannot be used in Automated Warfare.'};
        if((spec.schedule?.nodes||[]).some(node=>getGroundCompositionEntityCount(center.playerId,node.ground)>getTheaterDeploymentCap(center.playerId))) return {ok:false,reason:`A scheduled node exceeds the ${getTheaterDeploymentCap(center.playerId)}-unit Theater limit.`};
      } else if(getGroundCompositionEntityCount(center.playerId,spec.composition)>getTheaterDeploymentCap(center.playerId)) return {ok:false,reason:`Theater deployments are limited to ${getTheaterDeploymentCap(center.playerId)} units.`};
    }
    const baseCost=getRoutineSetCost(center.playerId,spec);
    if(baseCost<=0) return {ok:false,reason:'Routine definition has no units.'};
    const fee=Math.max(0,Math.round(baseCost*getAutomationInitiationMultiplier(center.playerId)*100)/100);
    const player=game.players[center.playerId]; if(player.money+1e-9<fee) return {ok:false,reason:'Insufficient funds for initiation fee.'};
    player.money-=fee;
    game.automationId=(game.automationId||1);
    const routine={
      id:`aw-${game.automationId++}`, playerId:center.playerId, centerId:center.id, facilityId:facility.id, kind:spec.kind,
      name:spec.name||({theater:'Theater Routine',areaDenial:'Area Denial / Suppression',routineFlight:'Routine Flights'}[spec.kind]||'Automated Warfare'),
      targetX:clamp(Number(spec.targetX)||0,0,WORLD.width), targetY:clamp(Number(spec.targetY)||0,0,WORLD.height),
      templateType:spec.templateType||null, composition:clonePlain(spec.composition||{}), focused:!!spec.focused,
      schedule:spec.schedule?clonePlain(normalizeScheduledDeployment(center.playerId,spec.schedule)):null,
      escortsPerAircraft:Math.max(0,Math.floor(Number(spec.escortsPerAircraft)||0)), paused:false,cancelled:false, deploymentsMade:0,
      currentScheduleNode:0,nextScheduleAt:game.time, createdAt:game.time, initiationFee:fee
    };
    center.automatedWarfare ||= []; center.automatedWarfare.push(routine);
    if(center.playerId===PLAYER_ID) notify(`${routine.name} initiated for ${moneyText(fee)}. Bandwidth ${getCoordinationCenterUsedBandwidth(center)} / ${getCoordinationCenterBandwidth(center)}.`,'good',3.2);
    return {ok:true,routine,fee};
  }

  function pauseAutomatedWarfare(center,routineId,paused=true){const routine=(center?.automatedWarfare||[]).find(r=>r.id===routineId&&!r.cancelled);if(!routine)return false;routine.paused=!!paused;return true;}
  function cancelAutomatedWarfare(center,routineId){const routine=(center?.automatedWarfare||[]).find(r=>r.id===routineId&&!r.cancelled);if(!routine)return false;routine.cancelled=true;return true;}

  function queueMissingGroundForRoutine(routine,base,composition){
    const playerId=routine.playerId; const costMul=getTheaterCostMultiplier(playerId); const timeMul=getTheaterTrainingTimeMultiplier(playerId);
    for(const type of getCommandGroundTypes(playerId, composition)){
      const need=Math.max(0,Math.floor(Number(composition?.[type])||0));
      const available=getGroundDefinitionAvailable(base,type)+countQueuedType(base,type);
      let missing=Math.max(0,need-available);
      while(missing-->0){if(!queueCommandUnit(base,type,{source:'theater',routineId:routine.id,costMultiplier:costMul,trainingTimeMultiplier:timeMul}))break;}
    }
  }

  function getRoutineGroundNode(routine){
    if(routine.templateType!=='scheduled') return {ground:routine.composition,focused:routine.focused};
    const nodes=(routine.schedule?.nodes||[]).filter(node=>node.domain==='ground'&&getScheduleNodeCount(node)>0);
    if(!nodes.length)return null;
    const idx=Math.min(routine.currentScheduleNode||0,nodes.length-1); return nodes[idx];
  }

  function updateTheaterRoutine(routine,base){
    const node=getRoutineGroundNode(routine); if(!node)return;
    if(routine.templateType==='scheduled' && game.time+1e-9 < (routine.nextScheduleAt||0)) return;
    queueMissingGroundForRoutine(routine,base,node.ground);
    if(!militaryBaseHasComposition(base,node.ground))return;
    const launched=launchGroundComposition(base,node.ground,routine.targetX,routine.targetY,{focused:!!node.focused,routine}); if(!launched)return;
    routine.deploymentsMade++;
    if(routine.templateType==='scheduled'){
      const nodes=(routine.schedule?.nodes||[]).filter(n=>n.domain==='ground'&&getScheduleNodeCount(n)>0);
      const current=routine.currentScheduleNode||0; const originalIndex=(routine.schedule.nodes||[]).indexOf(nodes[current]);
      routine.currentScheduleNode=(current+1)%nodes.length;
      routine.nextScheduleAt=game.time+(routine.schedule.waits?.[originalIndex]||0);
    }
  }

  function collectAreaDenialTargets(routine){
    const out=[]; const r=COMMAND_AUTOMATION_BALANCE.areaDenialRadius;
    for(const b of game.buildings){if(!b.alive||b.playerId===routine.playerId||b.type==='landmine')continue;if(Math.hypot(b.x-routine.targetX,b.y-routine.targetY)<=r+b.radius)out.push(b);}
    for(const u of game.units){if(!u.alive||u.playerId===routine.playerId||u.airborne||u.parachuting)continue;if(Math.hypot(u.x-routine.targetX,u.y-routine.targetY)<=r+u.radius)out.push(u);}
    return out;
  }

  function getAerialRoutineDesiredWingmen(routine){
    const aircraft=COMMAND_AIR_TYPES.reduce((sum,type)=>sum+Math.max(0,Math.floor(Number(routine.composition?.[type])||0)),0);
    return Math.min(getLoyalWingmanSortieCap(routine.playerId),aircraft*Math.max(0,Math.floor(Number(routine.escortsPerAircraft)||0)));
  }

  function transferWingmenToAirbase(base,needed){
    if(!base?.alive||base.type!=='airbase'||needed<=0)return 0; let moved=0;
    for(const other of game.buildings){
      if(moved>=needed)break;
      if(!other.alive||other.playerId!==base.playerId||other.id===base.id)continue;
      if(other.type==='airbase'){
        while(moved<needed&&getAirbaseAvailableWingmanSlots(base)>0){const idx=(other.loyalWingmanBay||[]).findIndex(r=>(r.readyAt||0)<=game.time);if(idx<0)break;const [record]=other.loyalWingmanBay.splice(idx,1);if(storeWingmanAtAirbase(base,record,0))moved++;else{other.loyalWingmanBay.push(record);break;}}
      }else if(other.type==='droneHub'){
        while(moved<needed&&getAirbaseAvailableWingmanSlots(base)>0){const record=takeStoredDrone(other,'loyalWingman');if(!record)break;if(storeWingmanAtAirbase(base,record,0))moved++;else{storeDroneAtHub(other,record,0);break;}}
      }
    }
    return moved;
  }

  function getActiveAerialRoutinesForBase(base) {
    const out = [];
    for (const center of game.buildings) {
      if (!center.alive || center.playerId !== base.playerId || center.type !== 'advancedCoordinationCenter') continue;
      for (const row of center.automatedWarfare || []) {
        if (!row.cancelled && !row.paused && row.facilityId === base.id && (row.kind === 'areaDenial' || row.kind === 'routineFlight')) out.push(row);
      }
    }
    return out;
  }

  function getAggregateAerialQuota(base, type) {
    return getActiveAerialRoutinesForBase(base).reduce((sum, row) => sum + (row.kind === 'areaDenial' && type === 'paratrooperPlane' ? 0 : Math.max(0, Math.floor(Number(row.composition?.[type]) || 0))), 0);
  }

  function getAggregateAerialWingmanQuota(base) {
    return getActiveAerialRoutinesForBase(base).reduce((sum, row) => sum + getAerialRoutineDesiredWingmen(row), 0);
  }

  function getPendingAerialWingmenForBase(base) {
    const ids = new Set(getActiveAerialRoutinesForBase(base).map(row => row.id));
    let count = 0;
    for (const hub of game.buildings) {
      if (!hub.alive || hub.playerId !== base.playerId || hub.type !== 'droneHub') continue;
      for (let i = 0; i < (hub.queue || []).length; i++) if (hub.queue[i] === 'loyalWingman' && ids.has(hub.queueMeta?.[i]?.routineId)) count++;
    }
    return count;
  }

  function ensureAerialQuota(routine,base){
    const timeMul=getAerialAutomationTrainingTimeMultiplier(routine.playerId),costMul=getAerialAutomationCostMultiplier(routine.playerId);
    for(const type of COMMAND_AIR_TYPES){
      if(routine.kind==='areaDenial'&&type==='paratrooperPlane')continue;
      const desired=getAggregateAerialQuota(base,type); let missing=Math.max(0,desired-countAircraftCommitmentByType(base,type));
      while(missing-->0){if(!queueCommandUnit(base,type,{source:'aerialAutomation',routineId:routine.id,costMultiplier:costMul,trainingTimeMultiplier:timeMul}))break;}
    }
    const desiredWingmen=getAggregateAerialWingmanQuota(base); transferWingmenToAirbase(base,Math.max(0,desiredWingmen-getAirbaseWingmanCommitment(base)));
    let missingWing=Math.max(0,desiredWingmen-getAirbaseWingmanCommitment(base)-getPendingAerialWingmenForBase(base));
    while(missingWing-->0){const hub=findQueueDroneHub(routine.playerId);if(!hub||!queueCommandUnit(hub,'loyalWingman',{source:'aerialAutomation',routineId:routine.id,costMultiplier:costMul,trainingTimeMultiplier:timeMul}))break;}
  }

  function updateAerialRoutine(routine,base){
    ensureAerialQuota(routine,base);
    if(!airbaseHasSortie(base,routine.composition,routine.escortsPerAircraft))return;
    let areaTargets=[];
    if(routine.kind==='areaDenial'){
      areaTargets=collectAreaDenialTargets(routine);
      const fighterCount=Math.max(0,routine.composition?.superFighter||0), bomberCount=Math.max(0,routine.composition?.bomber||0);
      if(bomberCount>0&&!areaTargets.length)return;
    }
    const launched=launchAirSortie(base,routine.composition,routine.targetX,routine.targetY,{escortsPerAircraft:routine.escortsPerAircraft,routine,areaDenial:routine.kind==='areaDenial',areaTargets});
    if(launched>0)routine.deploymentsMade++;
  }

  function updateAutomatedWarfare(dt){
    for(const center of game.buildings){
      if(!center.alive||center.type!=='advancedCoordinationCenter'||!center.automatedWarfare?.length)continue;
      if(game.time+1e-9<(center.nextAutomationTick||0))continue;
      center.nextAutomationTick=game.time+0.35;
      for(const routine of center.automatedWarfare){
        if(routine.cancelled||routine.paused)continue;
        const facility=getRoutineBoundFacility(routine); if(!facility){routine.paused=true;routine.pauseReason='BOUND FACILITY LOST';continue;}
        if(routine.kind==='theater')updateTheaterRoutine(routine,facility); else updateAerialRoutine(routine,facility);
      }
      center.automatedWarfare=center.automatedWarfare.filter(r=>!r.cancelled);
    }
  }


  function findAssaultZoneTarget(unit) {
    if (!unit?.alive || !Number.isFinite(unit.assaultZoneRadius) || unit.assaultZoneRadius <= 0) return null;
    const cx = unit.assaultZoneX, cy = unit.assaultZoneY, radius = unit.assaultZoneRadius;
    let best = null, bestD2 = Infinity;
    unitGrid.queryCircle(cx, cy, radius + 40, queryScratchC);
    for (const other of queryScratchC) {
      if (!isValidTarget(other, unit) || other.airborne || other.parachuting) continue;
      if (Math.hypot(other.x - cx, other.y - cy) > radius + other.radius) continue;
      const d2 = distSq(unit, other);
      if (d2 < bestD2) { bestD2 = d2; best = other; }
    }
    buildingGrid.queryCircle(cx, cy, radius + 90, queryScratchB);
    for (const other of queryScratchB) {
      if (!isValidTarget(other, unit) || other.type === 'landmine') continue;
      if (Math.hypot(other.x - cx, other.y - cy) > radius + other.radius) continue;
      const d2 = distSq(unit, other);
      if (d2 < bestD2) { bestD2 = d2; best = other; }
    }
    return best;
  }

  function updateCommandAutomation(dt){
    updateScheduledDeployments(dt);
    updateAutomatedWarfare(dt);
  }
