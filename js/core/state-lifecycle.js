'use strict';

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  const game = {
    started: false,
    paused: true,
    over: false,
    time: 0,
    id: 1,
    unitInstanceId: 1,
    players: [],
    buildings: [],
    units: [],
    projectiles: [],
    effects: [],
    entityById: new Map(),
    liveEntityCount: 0,
    pathQueue: [],
    urgentPathQueue: [],
    selected: null,
    buildMode: null,
    continuousBuild: false,
    buildMenuCategory: 'utility',
    attackTarget: null,
    chosenBaseId: null,
    deploymentPrefs: { mode: 'facility', globalCategory: 'ground', lastFacilityId: null, bringUnmannedEscorts: false, escortsPerAircraft: 1 },
    researchProviderSelectionId: null,
    researchSelectedDoctrine: null,
    coordinatePicker: null,
    ewAimingBuildingId: null,
    missileAimingSiteId: null,
    missileAimSiloIndex: null,
    missileAimTarget: null,
    energyAimingSystemId: null,
    energyAimTarget: null,
    energyFields: [],
    energyFieldRevision: 0,
    energyFieldSignature: '',
    missileZones: [],
    attackAmounts: { basic: 0, elite: 0, tank: 0, spg: 0, apc: 0, ifv: 0, bomber: 0, superFighter: 0, paratrooperPlane: 0, loiteringMunition: 0 },
    bringUnmannedEscorts: false,
    escortsPerAircraft: 1,
    buildingGridDirty: true,
    notificationUntil: 0,
    aiClock: 0,
    enemyCount: 2,
    mapSize: 'standard',
    stressSpawned: false,
    camera: { x: 760, y: 1100, zoom: 0.72, targetZoom: 0.72 },
    mouse: { x: 0, y: 0, worldX: 0, worldY: 0, inside: false },
    drag: {
      active: false, pointerId: null, button: 0,
      startX: 0, startY: 0, lastX: 0, lastY: 0,
      moved: false, ignoreNextClick: false
    },
    keys: new Set()
  };

  function isGroundMilitaryFacility(facility) {
    return !!facility?.alive && (facility.type === 'militaryBase' || facility.type === 'superiorMobilizationComplex');
  }

  function makePlayer(id, name, isAI) {
    return {
      id,
      name,
      isAI,
      color: PLAYER_COLORS[id],
      dark: PLAYER_DARK[id],
      money: id === PLAYER_ID ? 900 : 850,
      alive: true,
      capital: null,
      capitalReserve: [],
      convoys: [
        { name: 'Convoy 1', basic: 0, elite: 0, tank: 0, spg: 0, apc: 0, ifv: 0 },
        { name: 'Convoy 2', basic: 0, elite: 0, tank: 0, spg: 0, apc: 0, ifv: 0 },
        { name: 'Convoy 3', basic: 0, elite: 0, tank: 0, spg: 0, apc: 0, ifv: 0 }
      ],
      vehicleConfig: {
        ifvTurret: 'machineGun',
        passengerComposition: {
          apc: { basic: 8, elite: 0 },
          ifv: { basic: 12, elite: 0 }
        }
      },
      droneConfig: {
        preferredEscortsPerAircraft: 1
      },
      advancedInfantry: {
        loadouts: [],
        nextLoadoutId: 1
      },
      airConfig: {
        fighterMissiles: { airToAir: 4, airToGround: 4 },
        paratrooperComposition: { basic: 18, elite: 0 }
      },
      commandAutomation: {
        scheduledDeployment: {
          name: 'Scheduled Deployment',
          waits: [5, 5],
          nodes: [0, 1, 2].map(() => ({ domain: 'ground', focused: false, ground: { basic: 0, elite: 0, tank: 0, spg: 0, apc: 0, ifv: 0 }, air: { bomber: 0, superFighter: 0, paratrooperPlane: 0 }, escortsPerAircraft: 0 }))
        },
        scheduledExecutions: []
      },
      modifierSources: new Map(),
      modifierRevision: 0,
      modifierCache: new Map(),
      research: {
        active: [],
        completed: new Set(),
        completedMeta: new Map(),
        unlockedDoctrines: new Set(),
        unlockedSpecializations: new Set(),
        unlockedCapabilities: new Set()
      },
      ai: {
        buildTimer: rand(2.8, 5.2),
        trainTimer: rand(0.7, 1.4),
        attackTimer: rand(18, 28),
        thinkTimer: rand(0.45, 0.9),
        economyTimer: rand(1.6, 2.8),
        researchTimer: rand(1.1, 2.0),
        researchFocusDoctrine: null,
        researchLaneFocus: {},
        doctrineBuildCycle: 0,
        threatUntil: 0,
        threatX: 0,
        threatY: 0,
        threatStrength: 0,
        responseCooldown: 0,
        emergencyBuildCooldown: 0,
        saveTarget: null,
        advancedCycle: 0,
        macroIdleTime: 0,
        lastMacroActionTime: 0,
        lastMacroAction: 'opening',
        lastBuildFailure: '',
        macroActions: 0
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Unit identity / lifecycle / containment
  // ---------------------------------------------------------------------------
  // Battlefield entity IDs are short-lived runtime handles. instanceId is the
  // persistent identity of a unit/airframe while it moves between ACTIVE,
  // STORED, GARRISONED, TURNAROUND, CARGO, and CAPITAL_RESERVE states.
  function nextUnitInstanceId() {
    return game.unitInstanceId++;
  }

  function clonePlain(value) {
    if (value == null) return value;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (_) { /* fall through */ }
    }
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }

  function serializePersistentModifierSources(entity) {
    const rows = [];
    if (!entity?.modifierSources) return rows;
    for (const [sourceId, modifiers] of entity.modifierSources.entries()) {
      if (!sourceId.startsWith('ou:') && !sourceId.startsWith('config:') && !sourceId.startsWith('automation:')) continue;
      rows.push([sourceId, modifiers.map(mod => ({ ...mod }))]);
    }
    return rows;
  }

  function createUnitRecord(type, playerId, options = {}) {
    const def = UNITS[type];
    if (!def) return null;
    return {
      instanceId: options.instanceId ?? nextUnitInstanceId(),
      kind: 'unit',
      type,
      playerId,
      lifecycleState: options.lifecycleState || LIFECYCLE_STATES.STORED,
      hp: clamp(Number.isFinite(options.hp) ? options.hp : getDefinitionPlayerStat(playerId, 'unit', type, 'hp', def.hp), 1, Number.isFinite(options.maxHp) ? options.maxHp : getDefinitionPlayerStat(playerId, 'unit', type, 'hp', def.hp)),
      maxHp: Number.isFinite(options.maxHp) ? options.maxHp : getDefinitionPlayerStat(playerId, 'unit', type, 'hp', def.hp),
      onsiteUpgrades: Array.isArray(options.onsiteUpgrades) ? [...options.onsiteUpgrades] : [],
      configuration: clonePlain(options.configuration ?? null),
      variantId: options.variantId ?? null,
      persistentModifierSources: Array.isArray(options.persistentModifierSources) ? clonePlain(options.persistentModifierSources) : [],
      cargoRecords: Array.isArray(options.cargoRecords) ? clonePlain(options.cargoRecords) : [],
      readyAt: Number.isFinite(options.readyAt) ? options.readyAt : 0,
      reloadPending: !!options.reloadPending,
      originFacilityType: options.originFacilityType ?? null
    };
  }

  function recordFromUnit(unit, lifecycleState = LIFECYCLE_STATES.STORED, options = {}) {
    if (!unit || unit.kind !== 'unit') return null;
    return createUnitRecord(unit.type, unit.playerId, {
      instanceId: unit.instanceId,
      lifecycleState,
      hp: unit.hp,
      maxHp: unit.maxHp,
      onsiteUpgrades: [...(unit.onsiteUpgrades || [])],
      configuration: unit.configuration ?? null,
      variantId: unit.variantId ?? null,
      persistentModifierSources: serializePersistentModifierSources(unit),
      cargoRecords: clonePlain(unit.cargoRecords || []),
      readyAt: options.readyAt,
      reloadPending: !!options.reloadPending,
      originFacilityType: options.originFacilityType ?? null
    });
  }

  function restorePersistentUnitModifiers(unit, record) {
    if (!unit || !record) return;
    for (const [sourceId, modifiers] of record.persistentModifierSources || []) {
      setModifierSource(unit, sourceId, modifiers);
    }
  }

  function createUnitFromRecord(record, x, y, options = {}) {
    if (!record || record.kind !== 'unit' || !UNITS[record.type]) return null;
    const unit = createUnit(record.type, record.playerId, x, y, {
      instanceId: record.instanceId,
      hp: clamp(Number.isFinite(record.hp) ? record.hp : UNITS[record.type].hp, 1, Number.isFinite(record.maxHp) ? record.maxHp : UNITS[record.type].hp),
      maxHp: Number.isFinite(record.maxHp) ? record.maxHp : UNITS[record.type].hp,
      lifecycleState: LIFECYCLE_STATES.ACTIVE,
      onsiteUpgrades: new Set(record.onsiteUpgrades || []),
      configuration: clonePlain(record.configuration ?? null),
      variantId: record.variantId ?? null,
      cargoRecords: clonePlain(record.cargoRecords || []),
      ...options
    });
    if (unit) restorePersistentUnitModifiers(unit, record);
    return unit;
  }

  function syncGroundStorageCounts(base) {
    if (!base || (base.type !== 'militaryBase' && base.type !== 'superiorMobilizationComplex')) return;
    base.storedUnits ||= [];
    for (const type of GROUND_UNIT_TYPES) base.storage[type] = 0;
    for (const record of base.storedUnits) {
      if (record?.lifecycleState === LIFECYCLE_STATES.STORED && GROUND_UNIT_TYPES.includes(record.type) && !record.variantId) {
        base.storage[record.type] = (base.storage[record.type] || 0) + 1;
      }
    }
  }

  function getGroundFacilityStorageCapacity(base) {
    if (!base?.alive) return 0;
    if (base.type === 'militaryBase') return MILITARY_BASE_STORAGE_CAPACITY;
    if (base.type === 'superiorMobilizationComplex') return ADVANCED_INFANTRY_BALANCE.complexStorageCapacity;
    return 0;
  }

  function getGroundFacilityStoredCount(base) {
    if (!base?.alive || !['militaryBase','superiorMobilizationComplex'].includes(base.type)) return 0;
    base.storedUnits ||= [];
    return base.storedUnits.reduce((sum, record) => sum + (record?.lifecycleState === LIFECYCLE_STATES.STORED ? 1 : 0), 0);
  }

  function getGroundFacilityAvailableStorage(base) {
    return Math.max(0, getGroundFacilityStorageCapacity(base) - getGroundFacilityStoredCount(base));
  }

  function storeUnitRecord(base, record) {
    if (!base?.alive || !['militaryBase','superiorMobilizationComplex'].includes(base.type) || !record || !GROUND_UNIT_TYPES.includes(record.type) || record.playerId !== base.playerId) return false;
    if (base.type === 'superiorMobilizationComplex' && !INFANTRY_UNIT_TYPES.includes(record.type)) return false;
    if (getGroundFacilityAvailableStorage(base) <= 0) return false;
    base.storedUnits ||= [];
    record.lifecycleState = LIFECYCLE_STATES.STORED;
    record.originFacilityType = base.type;
    base.storedUnits.push(record);
    syncGroundStorageCounts(base);
    return true;
  }

  function createAndStoreUnit(base, type, options = {}) {
    const record = createUnitRecord(type, base.playerId, { ...options, lifecycleState: LIFECYCLE_STATES.STORED, originFacilityType: base.type });
    return record && storeUnitRecord(base, record) ? record : null;
  }

  function takeStoredUnit(base, type, variantId = null) {
    if (!base?.alive || !['militaryBase','superiorMobilizationComplex'].includes(base.type)) return null;
    base.storedUnits ||= [];
    const index = base.storedUnits.findIndex(record => record?.type === type && record.lifecycleState === LIFECYCLE_STATES.STORED && (variantId == null ? !record.variantId : String(record.variantId) === String(variantId)));
    if (index < 0) return null;
    const [record] = base.storedUnits.splice(index, 1);
    syncGroundStorageCounts(base);
    return record;
  }

  function restoreStoredUnit(base, record) {
    return storeUnitRecord(base, record);
  }

  function getDroneStorageMultiplier(playerId) {
    return isResearchComplete(playerId, 'dwStorage') ? 1.25 : 1;
  }

  function getDroneHubCapacity(hub, type) {
    if (!hub?.alive || hub.type !== 'droneHub') return 0;
    const multiplier = getDroneStorageMultiplier(hub.playerId);
    const base = type === 'loiteringMunition' ? DRONE_WARFARE_BALANCE.hubLoiteringCapacity
      : type === 'loyalWingman' ? DRONE_WARFARE_BALANCE.hubWingmanCapacity : 0;
    return Math.floor(base * multiplier);
  }

  function syncDroneHubCounts(hub) {
    if (!hub || hub.type !== 'droneHub') return;
    hub.droneBay ||= [];
    hub.storage.loiteringMunition = 0;
    hub.storage.loyalWingman = 0;
    for (const record of hub.droneBay) {
      if (!record || !DRONE_UNIT_TYPES.includes(record.type)) continue;
      record.lifecycleState = (record.readyAt || 0) > game.time ? LIFECYCLE_STATES.TURNAROUND : LIFECYCLE_STATES.STORED;
      hub.storage[record.type] = (hub.storage[record.type] || 0) + 1;
    }
  }

  function getDroneHubStoredCount(hub, type) {
    if (!hub?.alive || hub.type !== 'droneHub') return 0;
    syncDroneHubCounts(hub);
    return hub.storage[type] || 0;
  }

  function getDroneHubQueuedCount(hub, type) {
    if (!hub?.alive || hub.type !== 'droneHub') return 0;
    return (hub.queue || []).reduce((sum, queuedType) => sum + (queuedType === type ? 1 : 0), 0);
  }

  function getAirbaseWingmanCapacity(base) {
    if (!base?.alive || base.type !== 'airbase') return 0;
    const aircraftCapacity = getAirbaseAircraftCapacity(base.playerId);
    return Math.floor(aircraftCapacity * DRONE_WARFARE_BALANCE.airbaseWingmanCapacityPerAircraft * getDroneStorageMultiplier(base.playerId));
  }

  function getAirbaseActiveWingmanCount(base) {
    if (!base?.alive || base.type !== 'airbase') return 0;
    let count = 0;
    for (const unit of game.units) if (unit.alive && unit.type === 'loyalWingman' && unit.homeAirbaseId === base.id) count++;
    return count;
  }

  function syncAirbaseWingmen(base) {
    if (!base || base.type !== 'airbase') return;
    base.loyalWingmanBay ||= [];
    for (const record of base.loyalWingmanBay) {
      record.lifecycleState = (record.readyAt || 0) > game.time ? LIFECYCLE_STATES.TURNAROUND : LIFECYCLE_STATES.STORED;
      record.originFacilityType = 'airbase';
    }
  }

  function getAirbaseReadyWingmanCount(base) {
    if (!base?.alive || base.type !== 'airbase') return 0;
    syncAirbaseWingmen(base);
    return (base.loyalWingmanBay || []).reduce((sum, record) => sum + ((record.readyAt || 0) <= game.time ? 1 : 0), 0);
  }

  function getAirbaseCoolingWingmanCount(base) {
    if (!base?.alive || base.type !== 'airbase') return 0;
    syncAirbaseWingmen(base);
    return (base.loyalWingmanBay || []).reduce((sum, record) => sum + ((record.readyAt || 0) > game.time ? 1 : 0), 0);
  }

  function getAirbaseWingmanCommitment(base) {
    if (!base?.alive || base.type !== 'airbase') return 0;
    return (base.loyalWingmanBay?.length || 0) + getAirbaseActiveWingmanCount(base);
  }

  function getAirbaseAvailableWingmanSlots(base) {
    return Math.max(0, getAirbaseWingmanCapacity(base) - getAirbaseWingmanCommitment(base));
  }

  function storeDroneAtHub(hub, record, readyAt = 0) {
    if (!hub?.alive || hub.type !== 'droneHub' || !record || !DRONE_UNIT_TYPES.includes(record.type) || record.playerId !== hub.playerId) return false;
    hub.droneBay ||= [];
    if (getDroneHubStoredCount(hub, record.type) >= getDroneHubCapacity(hub, record.type)) return false;
    record.lifecycleState = readyAt > game.time ? LIFECYCLE_STATES.TURNAROUND : LIFECYCLE_STATES.STORED;
    record.readyAt = readyAt || 0;
    record.originFacilityType = 'droneHub';
    hub.droneBay.push(record);
    syncDroneHubCounts(hub);
    return true;
  }

  function takeStoredDrone(hub, type) {
    if (!hub?.alive || hub.type !== 'droneHub') return null;
    hub.droneBay ||= [];
    const index = hub.droneBay.findIndex(record => record?.type === type && (record.readyAt || 0) <= game.time);
    if (index < 0) return null;
    const [record] = hub.droneBay.splice(index, 1);
    syncDroneHubCounts(hub);
    return record;
  }

  function storeWingmanAtAirbase(base, record, readyAt = 0) {
    if (!base?.alive || base.type !== 'airbase' || !record || record.type !== 'loyalWingman' || record.playerId !== base.playerId) return false;
    if (getAirbaseAvailableWingmanSlots(base) <= 0) return false;
    base.loyalWingmanBay ||= [];
    record.lifecycleState = readyAt > game.time ? LIFECYCLE_STATES.TURNAROUND : LIFECYCLE_STATES.STORED;
    record.readyAt = readyAt || 0;
    record.originFacilityType = 'airbase';
    base.loyalWingmanBay.push(record);
    syncAirbaseWingmen(base);
    return true;
  }

  function takeReadyWingman(base) {
    if (!base?.alive || base.type !== 'airbase') return null;
    base.loyalWingmanBay ||= [];
    const index = base.loyalWingmanBay.findIndex(record => (record.readyAt || 0) <= game.time);
    if (index < 0) return null;
    const [record] = base.loyalWingmanBay.splice(index, 1);
    syncAirbaseWingmen(base);
    return record;
  }

  function findWingmanStorageAirbase(playerId, excludeId = null) {
    return game.buildings
      .filter(b => b.alive && b.playerId === playerId && b.type === 'airbase' && b.id !== excludeId && getAirbaseAvailableWingmanSlots(b) > 0)
      .sort((a, b) => a.id - b.id)[0] || null;
  }

  function findWingmanStorageHub(playerId) {
    return game.buildings
      .filter(b => b.alive && b.playerId === playerId && b.type === 'droneHub' && getDroneHubStoredCount(b, 'loyalWingman') < getDroneHubCapacity(b, 'loyalWingman'))
      .sort((a, b) => a.id - b.id)[0] || null;
  }

  function storeBuiltWingman(originHub, record) {
    const airbase = findWingmanStorageAirbase(originHub.playerId);
    if (airbase && storeWingmanAtAirbase(airbase, record, 0)) return true;
    if (storeDroneAtHub(originHub, record, 0)) return true;
    const alternateHub = game.buildings
      .filter(b => b.alive && b.playerId === originHub.playerId && b.type === 'droneHub' && b.id !== originHub.id && getDroneHubStoredCount(b, 'loyalWingman') < getDroneHubCapacity(b, 'loyalWingman'))
      .sort((a, b) => a.id - b.id)[0] || null;
    return alternateHub ? storeDroneAtHub(alternateHub, record, 0) : false;
  }

  function redistributeLoyalWingmen(playerId) {
    const airbases = game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === 'airbase');
    if (!airbases.length) return 0;
    let moved = 0;
    for (const hub of game.buildings) {
      if (!hub.alive || hub.playerId !== playerId || hub.type !== 'droneHub') continue;
      hub.droneBay ||= [];
      for (let i = hub.droneBay.length - 1; i >= 0; i--) {
        const record = hub.droneBay[i];
        if (record?.type !== 'loyalWingman') continue;
        const target = airbases.find(base => getAirbaseAvailableWingmanSlots(base) > 0);
        if (!target) break;
        hub.droneBay.splice(i, 1);
        if (storeWingmanAtAirbase(target, record, record.readyAt || 0)) moved++;
        else hub.droneBay.push(record);
      }
      syncDroneHubCounts(hub);
    }
    return moved;
  }

  function addToCapitalReserve(playerId, record, originFacilityType = null) {
    const player = game.players[playerId];
    if (!player || !record) return false;
    record.playerId = playerId;
    record.lifecycleState = LIFECYCLE_STATES.CAPITAL_RESERVE;
    if (originFacilityType) record.originFacilityType = originFacilityType;
    player.capitalReserve ||= [];
    player.capitalReserve.push(record);
    return true;
  }

  function getCapitalReserveCount(playerId, type = null) {
    const reserve = game.players[playerId]?.capitalReserve || [];
    return reserve.reduce((sum, record) => sum + (!type || record.type === type ? 1 : 0), 0);
  }

  function reserveFacilityTypeForRecord(record) {
    if (!record) return null;
    if (MANNED_AIRCRAFT_TYPES.includes(record.type)) return 'airbase';
    if (record.type === 'loyalWingman') return 'droneNetwork';
    if (record.type === 'loiteringMunition') return 'droneHub';
    if (record.type === 'advancedEngineer') return 'advancedEngineeringComplex';
    if (GROUND_UNIT_TYPES.includes(record.type)) return record.variantId ? 'infantryNetwork' : 'militaryBase';
    return record.originFacilityType || null;
  }

  function getEngineeringComplexCapacity(complex) {
    if (!complex?.alive || complex.type !== 'advancedEngineeringComplex') return 0;
    return Math.max(0, Math.floor(getEntityStat(complex, 'engineerCapacity', ADVANCED_ENGINEERING_BALANCE.engineerBaseCapacity)));
  }

  function getEngineeringComplexActiveCount(complex) {
    if (!complex?.alive || complex.type !== 'advancedEngineeringComplex') return 0;
    let count = 0;
    for (const unit of game.units) if (unit.alive && unit.type === 'advancedEngineer' && unit.homeComplexId === complex.id) count++;
    return count;
  }

  function getEngineeringComplexCommitment(complex) {
    if (!complex?.alive || complex.type !== 'advancedEngineeringComplex') return 0;
    return (complex.engineerBay?.length || 0) + getEngineeringComplexActiveCount(complex) + (complex.queue || []).filter(type => type === 'advancedEngineer').length;
  }

  function storeEngineerRecord(complex, record, readyAt = 0) {
    if (!complex?.alive || complex.type !== 'advancedEngineeringComplex' || !record || record.type !== 'advancedEngineer' || record.playerId !== complex.playerId) return false;
    if (getEngineeringComplexCommitment(complex) >= getEngineeringComplexCapacity(complex)) return false;
    complex.engineerBay ||= [];
    record.lifecycleState = (readyAt || 0) > game.time ? LIFECYCLE_STATES.TURNAROUND : LIFECYCLE_STATES.STORED;
    record.readyAt = readyAt || 0;
    record.originFacilityType = 'advancedEngineeringComplex';
    record.hp = record.maxHp = getDefinitionPlayerStat(record.playerId, 'unit', 'advancedEngineer', 'hp', UNITS.advancedEngineer.hp);
    complex.engineerBay.push(record);
    return true;
  }

  function recoverCapitalReserve(playerId, preferredFacility = null) {
    const player = game.players[playerId];
    if (!player?.alive || !player.capitalReserve?.length) return 0;
    let recovered = 0;
    const remaining = [];
    for (const record of player.capitalReserve) {
      const required = reserveFacilityTypeForRecord(record);
      const facilities = required === 'infantryNetwork'
        ? game.buildings.filter(b => b.alive && b.playerId === playerId && (b.type === 'militaryBase' || b.type === 'superiorMobilizationComplex'))
        : game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === required);
      if (preferredFacility?.alive && preferredFacility.playerId === playerId && (preferredFacility.type === required || (required === 'infantryNetwork' && ['militaryBase','superiorMobilizationComplex'].includes(preferredFacility.type)))) {
        const idx = facilities.indexOf(preferredFacility);
        if (idx > 0) { facilities.splice(idx, 1); facilities.unshift(preferredFacility); }
      }
      let moved = false;
      if (required === 'militaryBase' || required === 'infantryNetwork') {
        for (const target of facilities) {
          if (storeUnitRecord(target, record)) { moved = true; break; }
        }
      } else if (required === 'airbase') {
        const target = facilities.find(base => getAirbaseAvailableSlots(base) > 0);
        if (target) {
          target.bomberBay ||= [];
          record.lifecycleState = (record.readyAt || 0) > game.time ? LIFECYCLE_STATES.TURNAROUND : LIFECYCLE_STATES.STORED;
          record.originFacilityType = 'airbase';
          target.bomberBay.push(record);
          syncAirbaseStoredCount(target);
          moved = true;
        }
      } else if (required === 'droneHub') {
        const target = facilities.find(hub => getDroneHubStoredCount(hub, record.type) < getDroneHubCapacity(hub, record.type));
        if (target) moved = storeDroneAtHub(target, record, record.readyAt || 0);
      } else if (required === 'droneNetwork') {
        const airbase = game.buildings.find(b => b.alive && b.playerId === playerId && b.type === 'airbase' && getAirbaseAvailableWingmanSlots(b) > 0);
        const hub = game.buildings.find(b => b.alive && b.playerId === playerId && b.type === 'droneHub' && getDroneHubStoredCount(b, 'loyalWingman') < getDroneHubCapacity(b, 'loyalWingman'));
        if (airbase) moved = storeWingmanAtAirbase(airbase, record, record.readyAt || 0);
        else if (hub) moved = storeDroneAtHub(hub, record, record.readyAt || 0);
      } else if (required === 'advancedEngineeringComplex') {
        const target = facilities.find(complex => getEngineeringComplexCommitment(complex) < getEngineeringComplexCapacity(complex));
        if (target) moved = storeEngineerRecord(target, record, record.readyAt || 0);
      }
      if (moved) recovered++;
      else remaining.push(record);
    }
    player.capitalReserve = remaining;
    return recovered;
  }

  function deactivateUnitToReserve(unit, originFacilityType = null) {
    if (!unit?.alive || unit.kind !== 'unit') return null;
    const record = recordFromUnit(unit, LIFECYCLE_STATES.CAPITAL_RESERVE, { originFacilityType });
    if (!record) return null;
    if (!addToCapitalReserve(unit.playerId, record, originFacilityType)) return null;
    markEntityDead(unit, false, LIFECYCLE_STATES.CAPITAL_RESERVE);
    return record;
  }

  function createBuilding(type, playerId, x, y, options = {}) {
    if (game.liveEntityCount >= MAX_ENTITIES) return null;
    const def = BUILDINGS[type];
    const building = {
      id: game.id++,
      kind: 'building',
      type,
      playerId,
      x,
      y,
      radius: def.radius,
      hp: getDefinitionPlayerStat(playerId, 'building', type, 'hp', def.hp),
      maxHp: getDefinitionPlayerStat(playerId, 'building', type, 'hp', def.hp),
      alive: true,
      cooldown: rand(0, def.cooldown || 0),
      angle: rand(0, Math.PI * 2),
      level: 1,
      storage: { basic: 0, elite: 0, tank: 0, spg: 0, apc: 0, ifv: 0, bomber: 0, superFighter: 0, paratrooperPlane: 0, loiteringMunition: 0, loyalWingman: 0 },
      storedUnits: [],
      bomberBay: [],
      loyalWingmanBay: [],
      droneBay: [],
      engineerBay: [],
      engineerDesiredCount: 0,
      engineerAutoOUEnabled: false,
      engineerOUPriority: 'defense',
      automatedWarfare: [],
      queue: [],
      queuePaidCosts: [],
      queueBuildConfigs: [],
      queueMeta: [],
      queueProgress: 0,
      hiveChildren: [],
      hiveRespawn: 0,
      hiveTargetId: null,
      hiveMode: 'ugv',
      hiveDroneWaveCooldownUntil: 0,
      aaMissileIds: [],
      nextAABatchAt: 0,
      ewHeading: ['radarStation','jammingStation','spoofingStation'].includes(type)
        ? (Number.isFinite(options.ewHeading) ? options.ewHeading : rand(0, Math.PI * 2)) : 0,
      ewNextEmissionAt: ['radarStation','jammingStation','spoofingStation'].includes(type)
        ? game.time + rand(0.04, ELECTRONIC_WARFARE_BALANCE.baseFrequency) : Infinity,
      ewLastEmissionAt: -Infinity,
      missileSilos: type === 'missileLaunchSite' ? [] : null,
      missileStockpile: type === 'missileLaunchSite' ? [] : null,
      missileStockpileQueue: type === 'missileLaunchSite' ? [] : null,
      missileStockpileJobs: type === 'missileLaunchSite' ? [] : null,
      constructionState: type === 'fortress' ? 'operational' : null,
      constructionProgress: type === 'fortress' ? 20 : 0,
      builderIds: [],
      garrisonIds: [],
      fortressTargetId: null,
      hidden: type === 'landmine',
      selectedPulse: 0,
      nextScan: game.time + rand(0.02, 0.18),
      createdAt: game.time,
      totalInvestedCost: def.cost || 0,
      statuses: new Map(),
      modifierSources: new Map(),
      modifierRevision: 0,
      modifierCache: new Map(),
      onsiteUpgrades: new Set(),
      onsiteUpgradeLevel: 0,
      ouReservedBy: null,
      ...options
    };
    game.buildings.push(building);
    game.entityById.set(building.id, building);
    game.liveEntityCount++;
    registerBuildingPlayerModifiers(building);
    navGrid.markDirty();
    game.buildingGridDirty = true;
    if (type === 'capital') game.players[playerId].capital = building;
    // A newly available compatible facility can reactivate units/airframes that
    // were evacuated to the Capital Reserve by voluntary structure removal.
    if (type === 'militaryBase' || type === 'superiorMobilizationComplex' || type === 'airbase' || type === 'advancedEngineeringComplex' || type === 'droneHub') recoverCapitalReserve(playerId, building);
    if (type === 'airbase' || type === 'droneHub') redistributeLoyalWingmen(playerId);
    if (type === 'missileLaunchSite' && typeof ensureMissileLaunchSiteState === 'function') ensureMissileLaunchSiteState(building);
    return building;
  }

  function createUnit(type, playerId, x, y, options = {}) {
    if (game.liveEntityCount >= MAX_ENTITIES) return null;
    const def = UNITS[type];
    const initialMaxHp = getDefinitionPlayerStat(playerId, 'unit', type, 'hp', def.hp);
    const unit = {
      id: game.id++,
      kind: 'unit',
      type,
      playerId,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: def.radius,
      hp: initialMaxHp,
      maxHp: initialMaxHp,
      alive: true,
      instanceId: options.instanceId ?? nextUnitInstanceId(),
      lifecycleState: LIFECYCLE_STATES.ACTIVE,
      configuration: null,
      variantId: null,
      cargoRecords: [],
      target: null,
      orderX: x,
      orderY: y,
      hasOrder: false,
      cooldown: rand(0, def.cooldown),
      // Legacy mirror for debug/render compatibility; status logic lives in statuses.
      stunned: 0,
      statuses: new Map(),
      modifierSources: new Map(),
      modifierRevision: 0,
      modifierCache: new Map(),
      onsiteUpgrades: new Set(),
      angle: 0,
      parentHiveId: null,
      parentFortressId: null,
      fortressBuilderSiteId: null,
      fortressPatrolIndex: 0,
      garrisoned: false,
      airborne: MANNED_AIRCRAFT_TYPES.includes(type) || type === 'loyalWingman',
      lowAltitudeDrone: type === 'loiteringMunition',
      airMissionState: (MANNED_AIRCRAFT_TYPES.includes(type) || type === 'loyalWingman') ? 'idle' : null,
      homeAirbaseId: null,
      bombTargetX: x,
      bombTargetY: y,
      bombReleased: false,
      masterAircraftId: null,
      escortIndex: 0,
      escortCount: 0,
      payloadRemaining: type === 'loyalWingman' ? Math.max(0, Math.floor(getDefinitionPlayerStat(playerId, 'unit', 'loyalWingman', 'payload', DRONE_WARFARE_BALANCE.loyalWingmanPayload))) : 0,
      enduranceRemaining: type === 'loyalWingman' ? getDefinitionPlayerStat(playerId, 'unit', 'loyalWingman', 'endurance', DRONE_WARFARE_BALANCE.loyalWingmanEndurance)
        : type === 'superFighter' ? getDefinitionPlayerStat(playerId, 'unit', 'superFighter', 'endurance', AIR_DOMINANCE_BALANCE.fighterEndurance)
        : type === 'paratrooperPlane' ? getDefinitionPlayerStat(playerId, 'unit', 'paratrooperPlane', 'endurance', AIR_DOMINANCE_BALANCE.paratrooperEndurance) : 0,
      fighterA2ARemaining: 0,
      fighterA2GRemaining: 0,
      fighterMissionX: x,
      fighterMissionY: y,
      fighterMissileCooldown: 0,
      fighterPatrolAngle: 0,
      fighterStealthed: type === 'superFighter' && isResearchComplete(playerId, 'adStealthFighter'),
      lastAttackAt: -99,
      lastTargetedAt: -99,
      flareCharges: type === 'superFighter' ? Math.max(0, Math.floor(getDefinitionPlayerStat(playerId, 'unit', 'superFighter', 'flares', AIR_DOMINANCE_BALANCE.fighterFlares)))
        : type === 'paratrooperPlane' ? Math.max(0, Math.floor(getDefinitionPlayerStat(playerId, 'unit', 'paratrooperPlane', 'flares', AIR_DOMINANCE_BALANCE.paratrooperFlares))) : 0,
      flareBurstCooldown: 0,
      paratrooperMissionX: x,
      paratrooperMissionY: y,
      passengersDropped: 0,
      sortiePassengerCount: 0,
      parachuting: false,
      parachuteLandAt: 0,
      stealthUntilAttack: false,
      droneEnduranceRemaining: Infinity,
      droneMissionX: x,
      droneMissionY: y,
      hiveGenerated: false,
      droneDetonating: false,
      lastHitAt: -99,
      destroyedAt: Infinity,
      detourX: x,
      detourY: y,
      detourUntil: 0,
      detourObstacleId: null,
      detourSide: ((game.id * 1103515245) & 1) ? 1 : -1,
      nextPathCheck: game.time + rand(0.02, 0.18),
      nextTargetScan: game.time + rand(0.02, 0.22),
      path: null,
      pathIndex: 0,
      pathVersion: 0,
      pathGoalX: x,
      pathGoalY: y,
      pathQueued: false,
      pendingPathGoalX: x,
      pendingPathGoalY: y,
      repathAfter: 0,
      pathFailCount: 0,
      phaseUntil: 0,
      stuckTime: 0,
      hardStuckTime: 0,
      gapAssistUntil: 0,
      progressCheckAt: game.time + 0.45,
      progressX: x,
      progressY: y,
      lastGoalDistance: Infinity,
      lastNavDistance: Infinity,
      reachedNearestGoal: false,
      ...options
    };
    game.units.push(unit);
    game.entityById.set(unit.id, unit);
    game.liveEntityCount++;
    return unit;
  }

  function notify(text, tone = '', duration = 3.5) {
    els.notification.textContent = text;
    els.notification.className = `notification ${tone}`.trim();
    game.notificationUntil = game.time + duration;
  }

