'use strict';

  // ---------------------------------------------------------------------------
  // Definition metadata / architecture primitives
  // ---------------------------------------------------------------------------
  // Tags describe what an entity *is*; capabilities describe what it can do.
  // Existing gameplay still owns its current behavior. New systems should query
  // this metadata instead of growing repeated hard-coded type lists.
  const DEFINITION_METADATA = {
    buildings: {
      militaryBase: { tags: ['structure', 'utility', 'production', 'ground-production', 'storage'], capabilities: { trainsUnits: true, storesUnits: true } },
      superiorMobilizationComplex: { tags: ['structure', 'utility', 'production', 'ground-production', 'storage', 'advanced-infantry'], capabilities: { trainsUnits: true, storesUnits: true, configuresInfantryLoadouts: true, onsiteUpgradeable: true } },
      advancedEngineeringComplex: { tags: ['structure', 'utility', 'engineering', 'production', 'storage'], capabilities: { trainsEngineers: true, storesUnits: true, dispatchesEngineers: true, onsiteUpgradeable: true } },
      researchCenter: { tags: ['structure', 'utility', 'research', 'research-provider'], capabilities: { providesResearchSlots: true, onsiteUpgradeable: true } },
      militaryCommand: { tags: ['structure', 'utility', 'command', 'unique'], capabilities: { providesPlayerModifiers: true, managesConvoys: true, managesScheduledDeployments: true } },
      advancedCoordinationCenter: { tags: ['structure', 'utility', 'command', 'automation'], capabilities: { managesAutomatedWarfare: true, onsiteUpgradeable: true } },
      airbase: { tags: ['structure', 'utility', 'production', 'air-production', 'storage'], capabilities: { trainsUnits: true, storesUnits: true, servicesAircraft: true, storesWingmen: true } },
      droneHub: { tags: ['structure', 'utility', 'production', 'drone-production', 'storage'], capabilities: { trainsDrones: true, storesDrones: true, deploysDrones: true } },
      missileLaunchSite: { tags: ['structure', 'utility', 'missile-battery', 'production', 'storage'], capabilities: { producesMissiles: true, storesMissiles: true, launchesStrategicMissiles: true, onsiteUpgradeable: true } },
      energyGenerator: { tags: ['structure', 'utility', 'energy', 'power-generation'], capabilities: { generatesPower: true, onsiteUpgradeable: true } },
      orbitalBeamSystem: { tags: ['structure', 'utility', 'defense', 'energy', 'orbital-strike'], capabilities: { consumesPower: true, launchesOrbitalStrike: true, onsiteUpgradeable: true } },
      energyFieldNode: { tags: ['structure', 'utility', 'energy', 'energy-field'], capabilities: { consumesPower: true, projectsEnergyField: true, onsiteUpgradeable: true } },
      deathRayTower: { tags: ['structure', 'defense', 'energy', 'beam-weapon', 'ground-defense'], capabilities: { consumesPower: true, attacksGround: true, attacksLoiteringMunitions: true, onsiteUpgradeable: true } },
      radarStation: { tags: ['structure', 'utility', 'electronic-warfare', 'radar'], capabilities: { directionalEmitter: true, detectsStealth: true, onsiteUpgradeable: true } },
      jammingStation: { tags: ['structure', 'utility', 'electronic-warfare', 'jammer'], capabilities: { directionalEmitter: true, appliesStatus: true, onsiteUpgradeable: true } },
      spoofingStation: { tags: ['structure', 'utility', 'electronic-warfare', 'spoofing'], capabilities: { directionalEmitter: true, appliesStatus: true, onsiteUpgradeable: true } },
      fortress: { tags: ['structure', 'utility', 'fortress', 'build-radius', 'garrison'], capabilities: { extendsBuildRadius: true, garrisonsUnits: true } },
      city: { tags: ['structure', 'utility', 'economy', 'settlement'], capabilities: { generatesIncome: true, onsiteUpgradeable: true } },
      megacity: { tags: ['structure', 'utility', 'economy', 'settlement'], capabilities: { generatesIncome: true, onsiteUpgradeable: true } },
      machineGun: { tags: ['structure', 'defense', 'turret', 'ground-defense'], capabilities: { attacksGround: true } },
      cannon: { tags: ['structure', 'defense', 'turret', 'ground-defense', 'aoe'], capabilities: { attacksGround: true } },
      mortar: { tags: ['structure', 'defense', 'turret', 'ground-defense', 'aoe', 'crowd-control'], capabilities: { attacksGround: true, appliesStatus: true } },
      landmine: { tags: ['structure', 'defense', 'trap', 'aoe'], capabilities: { attacksGround: true, appliesStatus: true } },
      hive: { tags: ['structure', 'defense', 'autonomous'], capabilities: { controlsHunters: true } },
      airDefense: { tags: ['structure', 'defense', 'air-defense', 'missile'], capabilities: { attacksAir: true } },
      capital: { tags: ['structure', 'core', 'capital', 'build-radius'], capabilities: { extendsBuildRadius: true } }
    },
    units: {
      basic: { tags: ['unit', 'ground', 'infantry', 'trainable'], capabilities: { movement: 'ground', attacks: true } },
      elite: { tags: ['unit', 'ground', 'infantry', 'elite-infantry', 'trainable'], capabilities: { movement: 'ground', attacks: true } },
      tank: { tags: ['unit', 'ground', 'mechanized', 'armored', 'armored-vehicle', 'trainable'], capabilities: { movement: 'ground', attacks: true } },
      spg: { tags: ['unit', 'ground', 'mechanized', 'armored', 'armored-vehicle', 'artillery', 'trainable'], capabilities: { movement: 'ground', attacks: true } },
      apc: { tags: ['unit', 'ground', 'mechanized', 'armored', 'armored-vehicle', 'transport', 'aggro-attractor', 'trainable'], capabilities: { movement: 'ground', transport: true, attractsAggro: true } },
      ifv: { tags: ['unit', 'ground', 'mechanized', 'armored', 'armored-vehicle', 'transport', 'aggro-attractor', 'trainable'], capabilities: { movement: 'ground', attacks: true, transport: true, attractsAggro: true, configurableWeapon: true } },
      hiveSoldier: { tags: ['unit', 'ground', 'autonomous', 'hive-hunter'], capabilities: { movement: 'ground', attacks: true } },
      loiteringMunition: { tags: ['unit', 'drone', 'low-altitude', 'suicide', 'disposable'], capabilities: { movement: 'lowAir', attacks: true, ignoresFriendlyBuildings: true } },
      loyalWingman: { tags: ['unit', 'air', 'aircraft', 'drone', 'reusable-aircraft', 'escort'], capabilities: { movement: 'air', attacks: true, returnsToBase: true, divertsAAMissiles: true } },
      bomber: { tags: ['unit', 'air', 'aircraft', 'manned-aircraft', 'reusable-aircraft', 'trainable'], capabilities: { movement: 'air', attacks: true, returnsToBase: true } },
      superFighter: { tags: ['unit', 'air', 'aircraft', 'manned-aircraft', 'reusable-aircraft', 'fighter', 'trainable'], capabilities: { movement: 'air', attacks: true, returnsToBase: true, usesFlares: true, configurablePayload: true } },
      paratrooperPlane: { tags: ['unit', 'air', 'aircraft', 'manned-aircraft', 'reusable-aircraft', 'transport', 'trainable'], capabilities: { movement: 'air', returnsToBase: true, usesFlares: true, transport: true, configurablePayload: true } },
      advancedEngineer: { tags: ['unit', 'ground', 'engineer', 'repair', 'trainable'], capabilities: { movement: 'ground', repairsBuildings: true, returnsToBase: true } }
    }
  };

  for (const [type, meta] of Object.entries(DEFINITION_METADATA.buildings)) {
    if (!BUILDINGS[type]) continue;
    BUILDINGS[type].tags = Object.freeze([...(meta.tags || [])]);
    BUILDINGS[type].capabilities = Object.freeze({ ...(meta.capabilities || {}) });
  }
  for (const [type, meta] of Object.entries(DEFINITION_METADATA.units)) {
    if (!UNITS[type]) continue;
    UNITS[type].tags = Object.freeze([...(meta.tags || [])]);
    UNITS[type].capabilities = Object.freeze({ ...(meta.capabilities || {}) });
  }

  const STATUS_DEFINITIONS = Object.freeze({
    // Current baseline behavior: Mortars and Landmines use a full temporary stun.
    // The intended future Mortar Slow / upgraded Immobilize can reuse this engine
    // without changing the status lifecycle or stacking rules.
    stunned: Object.freeze({
      stacking: 'refresh',
      blocksUnitUpdate: true,
      renderEffect: 'stun'
    }),
    revealed: Object.freeze({ stacking: 'refresh' }),
    jammed: Object.freeze({ stacking: 'refresh' }),
    spoofed: Object.freeze({ stacking: 'refresh' })
  });

  const BUILDING_PLAYER_MODIFIERS = Object.freeze({
    militaryCommand: Object.freeze([
      Object.freeze({ stat: 'trainingTimeMultiplier', operation: 'multiply', value: 0.70 })
    ])
  });

