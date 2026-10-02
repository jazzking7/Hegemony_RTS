'use strict';


  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------
  const MAP_SIZE_PRESETS = Object.freeze({
    standard: Object.freeze({ id: 'standard', name: 'Standard', width: 3600, height: 2200 }),
    large: Object.freeze({ id: 'large', name: 'Large', width: 5400, height: 3300 })
  });
  const WORLD = { width: MAP_SIZE_PRESETS.standard.width, height: MAP_SIZE_PRESETS.standard.height };
  function setWorldSizePreset(id = 'standard') {
    const preset = MAP_SIZE_PRESETS[id] || MAP_SIZE_PRESETS.standard;
    WORLD.width = preset.width;
    WORLD.height = preset.height;
    return preset;
  }
  const MAX_ENTITIES = 1000;
  const MAX_PROJECTILES = 2600;
  const MAX_EFFECTS = 700;
  const FIXED_DT = 1 / 30;
  const MAX_STEPS_PER_FRAME = 3;
  const PLAYER_ID = 0;
  const CAPITAL_INCOME_PER_MINUTE = 100;
  const AIRBASE_BASE_AIRCRAFT_CAP = 7;
  const BOMBER_TURNAROUND_SECONDS = 15;
  const BOMBER_DAMAGED_HP_THRESHOLD = 0.60;
  const BOMBER_DAMAGED_SPEED_MULTIPLIER = 0.65;
  const ARMORED_BASE_DAMAGE_REDUCTION = 0.20;
  const MAX_DAMAGE_REDUCTION = 0.90;
  const CAPITAL_AIR_DAMAGE_RESISTANCE = 0.20;
  const CAPITAL_EMERGENCY_AA_RANGE = 400;
  const CAPITAL_EMERGENCY_AA_SALVO = 4;
  const CAPITAL_EMERGENCY_AA_COOLDOWN = 4;

  // Mechanized Warfare base unit numbers are isolated here because the design
  // confirms the mechanics/relative upgrades but has not yet supplied final
  // production balance. These values are intentionally easy to retune without
  // touching transport, armor, research, or targeting logic.
  const MECHANIZED_UNIT_BALANCE = Object.freeze({
    apc: Object.freeze({ cost: 45, hp: 650, speed: 88, radius: 14, trainTime: 2.9, transportCapacity: 8 }),
    ifv: Object.freeze({ cost: 65, hp: 680, speed: 84, radius: 14, trainTime: 3.4, transportCapacity: 12,
      machineGun: Object.freeze({ damage: 18, range: 175, cooldown: 0.34, projectileSpeed: 820 }),
      grenade: Object.freeze({ damage: 46, range: 185, cooldown: 1.15, projectileSpeed: 520, aoe: 52 })
    })
  });

  const LIFECYCLE_STATES = Object.freeze({
    ACTIVE: 'ACTIVE',
    STORED: 'STORED',
    CARGO: 'CARGO',
    GARRISONED: 'GARRISONED',
    TURNAROUND: 'TURNAROUND',
    CAPITAL_RESERVE: 'CAPITAL_RESERVE',
    DESTROYED: 'DESTROYED'
  });

  // The Capital provides two shared DR/SR research slots. Doctrine-locked
  // research facilities can add more slots later through the modifier system.
  const CAPITAL_RESEARCH_SLOTS = 2;
  const RESEARCH_CENTER_BUILD_CAP = 2;
  const MILITARY_BASE_STORAGE_CAPACITY = 80;
  const DOCTRINE_RESEARCH_BASE_COST = 500;
  const DOCTRINE_RESEARCH_DURATION = 100;
  const SPECIALIZED_RESEARCH_COST = 100;
  const SPECIALIZED_RESEARCH_DURATION = 60;

  const ADVANCED_ENGINEERING_BALANCE = Object.freeze({
    complexCost: 850,
    complexHp: 2200,
    researchCenterCost: 1200,
    researchCenterHp: 1850,
    engineerCost: 250,
    engineerHp: 500,
    engineerSpeed: 96,
    engineerTrainTime: 4.2,
    engineerRadius: 7,
    engineerBaseCapacity: 5,
    engineerBaseEndurance: 40,
    engineerBaseRest: 10,
    engineerBaseRepairRate: 0.03,
    ouBaseCostRate: 0.50,
    ouAdvancedCostRate: 0.35,
    ouBaseCeiling: 5,
    ouAdvancedCeiling: 7,
    ouBaseHpGain: 0.20,
    ouBaseDamageGain: 0.08,
    ouBaseRecovery: 0.25,
    ouImprovedRecovery: 0.35,
    ouWorkSeconds: 5
  });

  const DRONE_WARFARE_BALANCE = Object.freeze({
    droneHubCost: 800,
    droneHubHp: 2000,
    droneHubRadius: 37,
    loiteringCost: 5,
    loiteringHp: 15,
    loiteringDamage: 250,
    loiteringSpeed: 185,
    loiteringRadius: 4,
    loiteringTrainTime: 0.15,
    loiteringScanRange: 235,
    loiteringAoeDamage: 80,
    loiteringAoeRadius: 20,
    hiveLoiteringEndurance: 10,
    hiveDroneWaveSize: 6,
    hiveDroneWaveCooldown: 2,
    loyalWingmanCost: 400,
    loyalWingmanHp: 300,
    loyalWingmanSpeed: 350,
    loyalWingmanRadius: 9,
    loyalWingmanTrainTime: 4,
    loyalWingmanEndurance: 40,
    loyalWingmanPayload: 1,
    loyalWingmanMissileDamage: 250,
    loyalWingmanMissileRange: 250,
    loyalWingmanTurnaround: 10,
    loyalWingmanSortieCap: 3,
    aaWingmanRetargetRadius: 100,
    hubLoiteringCapacity: 200,
    hubWingmanCapacity: 10,
    airbaseWingmanCapacityPerAircraft: 2
  });

  const COMMAND_AUTOMATION_BALANCE = Object.freeze({
    coordinationCenterCost: 1500,
    coordinationCenterHp: 2800,
    coordinationCenterRadius: 40,
    focusedArrivalRadius: 150,
    transportAssaultRadius: 200,
    theaterBaseDeploymentCap: 30,
    theaterUpgradedDeploymentCap: 40,
    areaDenialRadius: 500,
    defaultBandwidth: 1
  });


  const MISSILE_BATTERY_BALANCE = Object.freeze({
    launchSiteCost: 2000,
    launchSiteHp: 1000,
    launchSiteRadius: 42,
    baseSilos: 4,
    baseStorage: 4,
    siloBuildTime: 20,
    siloReloadTime: 15,
    stockpileFillTime: 20,
    fragmentedRadius: 100,
    fragmentedDuration: 20,
    fragmentedSlow: 0.10,
    burningRadius: 100,
    burningDuration: 10,
    burningDamageRate: 0.05,
    burningDamageCapPerSecond: 100,
    burningDamageVulnerability: 0.50,
    aaProximityTriggerRadius: 40,
    aaProximityBlastRadius: 50
  });

  const DIRECTED_ENERGY_BALANCE = Object.freeze({
    generatorCost: 1000,
    generatorHp: 750,
    generatorRadius: 34,
    generatorBaseRange: 600,
    generatorBasePower: 100,
    powerCostPerSecond: 0.20,

    orbitalCost: 2000,
    orbitalHp: 750,
    orbitalRadius: 36,
    orbitalPower: 60,
    orbitalRecharge: 50,
    orbitalInnerRadius: 60,
    orbitalInnerDamage: 750,
    orbitalOuterRadius: 400,
    orbitalOuterStartDamage: 500,

    nodeCost: 500,
    nodeHp: 600,
    nodeRadius: 16,
    nodePower: 25,
    nodeDensityContribution: 25,
    nodeConnectionRadius: 450,
    nodeMinSpacing: 150,
    nodeReferenceSpacing: 400,
    fieldBaseDensityCap: 8,
    fieldAbsoluteDensityCap: 12,
    fieldBaseAttackCap: 0.60,
    fieldBaseReductionCap: 0.40,

    deathRayCost: 1500,
    deathRayHp: 1000,
    deathRayRadius: 26,
    deathRayPower: 40,
    deathRayRange: 500,
    deathRayDps: 55,
    deathRayTargets: 5,
    deathRaySlow: 0.10
  });

  const ADVANCED_INFANTRY_BALANCE = Object.freeze({
    complexCost: 2000,
    complexHp: 1000,
    complexRadius: 40,
    loadoutsPerComplex: 3,
    complexStorageCapacity: 200,
    baseCritRate: 0.05,
    baseCritDamage: 0.50,
    revanchismDuration: 10,
    avengerDuration: 10,
    concealRangeFraction: 0.60,
    stealthResetSeconds: 2,
    railgunMaxDistance: 500,
    railgunMaxHits: 2
  });

  const MISSILE_TYPES = Object.freeze({
    conventional: Object.freeze({ name: 'Conventional Missile', shortName: 'CONV', cost: 300, range: 1300, aoe: 150, damage: 450, speed: 700 }),
    hypersonic: Object.freeze({ name: 'Hypersonic Missile', shortName: 'HYP', cost: 800, range: 1700, aoe: 180, damage: 800, speed: 1500 }),
    highExplosive: Object.freeze({ name: 'High-Explosive Missile', shortName: 'HE', cost: 800, range: 1500, aoe: 250, damage: 450, speed: 700 }),
    incendiary: Object.freeze({ name: 'Incendiary Missile', shortName: 'INC', cost: 700, range: 1500, aoe: 150, damage: 500, speed: 700 })
  });

  const ELECTRONIC_WARFARE_BALANCE = Object.freeze({
    stationCost: 1500,
    stationHp: 600,
    stationRadius: 32,
    baseAngleDeg: 15,
    baseFrequency: 0.66,
    radarRange: 850,
    radarRevealChance: 0.35,
    radarRevealDuration: 2,
    radarDamageVulnerability: 0.25,
    jammingRange: 750,
    jammingDuration: 2,
    jammingSlow: 0.25,
    jammingRangeReduction: 0.25,
    jammingShutdownChance: 0.30,
    spoofingRange: 800,
    spoofingDuration: 2,
    spoofingChance: 0.16
  });

  const AIR_DOMINANCE_BALANCE = Object.freeze({
    fighterCost: 750,
    fighterHp: 650,
    fighterSpeed: 380,
    fighterRadius: 12,
    fighterTrainTime: 30,
    fighterEndurance: 40,
    fighterTurnaround: 15,
    fighterFlares: 6,
    fighterPayload: 8,
    fighterAttackRange: 400,
    fighterDetectionRange: 600,
    fighterStrikeRadius: 75,
    fighterPatrolRadius: 800,
    fighterA2ADamage: 300,
    fighterA2ASpeed: 380,
    fighterA2GDamage: 400,
    fighterA2GSpeed: 520,
    fighterA2GAoe: 85,
    fighterLaunchInterval: 0.30,
    fighterFacingTolerance: 0.28,
    paratrooperCost: 800,
    paratrooperHp: 500,
    paratrooperSpeed: 320,
    paratrooperRadius: 13,
    paratrooperTrainTime: 20,
    paratrooperEndurance: 40,
    paratrooperCapacity: 18,
    paratrooperFlares: 6,
    paratrooperTurnaroundPerSoldier: 1,
    paratrooperDropSeconds: 1,
    flareSpeed: 250,
    flareLife: 2,
    flareTriggerRadius: 60,
    flareRetargetRadius: 100
  });



  const PLAYER_COLORS = ['#67f0cc', '#ff6674', '#ffbd5a', '#69a8ff', '#c884ff'];
  const PLAYER_DARK = ['#123e37', '#4a1820', '#4a3415', '#17324f', '#3d2051'];
  const PLAYER_NAMES = ['Aegis Command', 'Crimson Directorate', 'Amber Compact', 'Azure Coalition', 'Violet Assembly'];

  const BUILDINGS = {
    militaryBase: {
      name: 'Military Base', icon: '◆', category: 'utility', cost: 200,
      hp: 1800, radius: 34, description: 'Trains and stores combat units.'
    },
    superiorMobilizationComplex: {
      name: 'Superior Mobilization Complex', shortName: 'Mobilization Complex', icon: '⬢', category: 'utility', cost: ADVANCED_INFANTRY_BALANCE.complexCost,
      hp: ADVANCED_INFANTRY_BALANCE.complexHp, radius: ADVANCED_INFANTRY_BALANCE.complexRadius,
      researchRequirement: { research: 'aiUnlockComplex' },
      description: 'Configures globally named infantry Exosuit loadouts and trains/stores up to 200 configured infantry.'
    },
    advancedEngineeringComplex: {
      name: 'Advanced Engineering Complex', shortName: 'Engineering Complex', icon: '⚙', category: 'utility', cost: ADVANCED_ENGINEERING_BALANCE.complexCost,
      hp: ADVANCED_ENGINEERING_BALANCE.complexHp, radius: 38, researchRequirement: { research: 'aeUnlockComplex' },
      description: 'Trains, hosts and automatically dispatches Advanced Engineers.'
    },
    researchCenter: {
      name: 'Research Center', shortName: 'Research Center', icon: '⌬', category: 'utility', cost: ADVANCED_ENGINEERING_BALANCE.researchCenterCost,
      hp: ADVANCED_ENGINEERING_BALANCE.researchCenterHp, radius: 36, researchRequirement: { research: 'aeUnlockResearchCenter' },
      description: 'Expensive research facility adding three slots to the shared research pool. Maximum 2 per player.'
    },
    militaryCommand: {
      name: 'Military Command Center', shortName: 'Command Center', icon: '✦', category: 'utility', cost: 500,
      hp: 2400, radius: 42, description: 'One per player. Unlocks faster training, quick controls, convoy presets, and Scheduled Deployment design.'
    },
    advancedCoordinationCenter: {
      name: 'Advanced Coordination Center', shortName: 'Coordination Center', icon: '◎', category: 'utility', cost: COMMAND_AUTOMATION_BALANCE.coordinationCenterCost,
      hp: COMMAND_AUTOMATION_BALANCE.coordinationCenterHp, radius: COMMAND_AUTOMATION_BALANCE.coordinationCenterRadius,
      researchRequirement: { research: 'caUnlockCoordinationCenter' },
      description: 'Bandwidth-limited command facility that sustains automated ground and air warfare.'
    },
    airbase: {
      name: 'Airbase', icon: '✈', category: 'utility', cost: 500,
      hp: 1750, radius: 40, description: 'Maintains reusable aircraft and Loyal Wingman escorts for air operations.'
    },
    droneHub: {
      name: 'Drone Hub', icon: '◇', category: 'utility', cost: DRONE_WARFARE_BALANCE.droneHubCost,
      hp: DRONE_WARFARE_BALANCE.droneHubHp, radius: DRONE_WARFARE_BALANCE.droneHubRadius,
      researchRequirement: { research: 'dwUnlockDroneHub' },
      description: 'Mass-produces and stores drones. Deploys Loitering Munitions and supplies Loyal Wingmen to Airbases.'
    },
    missileLaunchSite: {
      name: 'Missile Launch Site', shortName: 'MLS', icon: '▲', category: 'utility', cost: MISSILE_BATTERY_BALANCE.launchSiteCost,
      hp: MISSILE_BATTERY_BALANCE.launchSiteHp, radius: MISSILE_BATTERY_BALANCE.launchSiteRadius,
      researchRequirement: { research: 'mbUnlockMLS' },
      description: 'Independent missile silos plus FIFO strategic-missile stockpile production.'
    },
    energyGenerator: {
      name: 'Energy Generator', shortName: 'Generator', icon: '⚡', category: 'utility', cost: DIRECTED_ENERGY_BALANCE.generatorCost,
      hp: DIRECTED_ENERGY_BALANCE.generatorHp, radius: DIRECTED_ENERGY_BALANCE.generatorRadius,
      researchRequirement: { doctrine: 'directedEnergy' },
      description: 'Adjustable local power source. Overlapping generator coverage pools into a shared power network.'
    },
    orbitalBeamSystem: {
      name: 'Orbital Direct-Energy Beam System', shortName: 'Orbital Beam', icon: '◎', category: 'utility', cost: DIRECTED_ENERGY_BALANCE.orbitalCost,
      hp: DIRECTED_ENERGY_BALANCE.orbitalHp, radius: DIRECTED_ENERGY_BALANCE.orbitalRadius,
      researchRequirement: { research: 'deUnlockOrbital' },
      description: 'Power-hungry global strike uplink. Recharges while powered, then calls an instantaneous orbital beam.'
    },
    energyFieldNode: {
      name: 'Energy-Field Node', shortName: 'Field Node', icon: '◇', category: 'utility', cost: DIRECTED_ENERGY_BALANCE.nodeCost,
      hp: DIRECTED_ENERGY_BALANCE.nodeHp, radius: DIRECTED_ENERGY_BALANCE.nodeRadius,
      researchRequirement: { research: 'deUnlockNodes' },
      description: 'Connects to nearby active Nodes to form closed energy fields with attack and damage-reduction bonuses.'
    },
    deathRayTower: {
      name: 'Energy Death Ray Tower', shortName: 'Death Ray', icon: 'ϟ', category: 'defense', cost: DIRECTED_ENERGY_BALANCE.deathRayCost,
      hp: DIRECTED_ENERGY_BALANCE.deathRayHp, radius: DIRECTED_ENERGY_BALANCE.deathRayRadius, range: DIRECTED_ENERGY_BALANCE.deathRayRange,
      researchRequirement: { research: 'deUnlockDeathRay' },
      description: 'Continuous multi-target ground beam. Can also burn down low-altitude Loitering Munitions.'
    },
    radarStation: {
      name: 'Radar Station', shortName: 'Radar', icon: '⌁', category: 'utility', cost: ELECTRONIC_WARFARE_BALANCE.stationCost,
      hp: ELECTRONIC_WARFARE_BALANCE.stationHp, radius: ELECTRONIC_WARFARE_BALANCE.stationRadius,
      researchRequirement: { research: 'ewUnlockRadar' },
      description: 'Directional detection antenna. Reveals stealth and marks targets for increased damage.'
    },
    jammingStation: {
      name: 'Jamming Station', shortName: 'Jammer', icon: '≋', category: 'utility', cost: ELECTRONIC_WARFARE_BALANCE.stationCost,
      hp: ELECTRONIC_WARFARE_BALANCE.stationHp, radius: ELECTRONIC_WARFARE_BALANCE.stationRadius,
      researchRequirement: { research: 'ewUnlockJamming' },
      description: 'Directional disruption antenna. Slows enemies, reduces weapon range, and may shut down drones or guided missiles.'
    },
    spoofingStation: {
      name: 'Spoofing Station', shortName: 'Spoofer', icon: '⌁', category: 'utility', cost: ELECTRONIC_WARFARE_BALANCE.stationCost,
      hp: ELECTRONIC_WARFARE_BALANCE.stationHp, radius: ELECTRONIC_WARFARE_BALANCE.stationRadius,
      researchRequirement: { research: 'ewUnlockSpoofing' },
      description: 'Directional deception antenna. Temporarily redirects hostile mobile entities toward false coordinates.'
    },
    fortress: {
      name: 'Fortress', icon: '⬟', category: 'utility', cost: 1000,
      hp: 1500, radius: 45, buildRange: 340, range: 440,
      description: 'Can be established anywhere by 10 garrison troops. Extends a local construction zone.'
    },
    city: {
      name: 'City', icon: '▥', category: 'utility', cost: 200,
      hp: 1100, radius: 29, income: 100, description: '$100 income per minute.'
    },
    megacity: {
      name: 'Megacity', icon: '▦', category: 'utility', cost: 400,
      hp: 1900, radius: 39, income: 250, description: '$250 income per minute.'
    },
    machineGun: {
      name: 'Machine Gun Turret', shortName: 'MG Turret', icon: '⌁', category: 'defense', cost: 180,
      hp: 850, radius: 21, range: 275, cooldown: 0.15, damage: 16, projectileSpeed: 900,
      description: 'Rapid fire, medium range.'
    },
    cannon: {
      name: 'Cannon Turret', icon: '◉', category: 'defense', cost: 220,
      hp: 1050, radius: 24, range: 450, cooldown: 1.35, damage: 95, aoe: 58, projectileSpeed: 650,
      description: 'Long range, high damage and splash.'
    },
    mortar: {
      name: 'Mortar Turret', icon: '⌒', category: 'defense', cost: 300,
      hp: 900, radius: 23, range: 580, minRange: 95, cooldown: 3.25, damage: 82, aoe: 105,
      statusEffect: { id: 'stunned', duration: 2 },
      description: 'Massive splash and 2-second stun.'
    },
    landmine: {
      name: 'Landmine', icon: '✣', category: 'defense', cost: 50,
      hp: 1, radius: 11, triggerRange: 34, damage: 290, aoe: 92,
      description: 'Hidden, one-use high-damage blast.'
    },
    hive: {
      name: 'Hive Turret', icon: '⬡', category: 'defense', cost: 350,
      hp: 1300, radius: 28, range: 690,
      description: 'Dispatches squads of 3 autonomous hunters.'
    },
    airDefense: {
      name: 'Air-Defense Tower', shortName: 'Air Defense', icon: '⌁', category: 'defense', cost: 300,
      hp: 1000, radius: 24, range: 650, missileDamage: 175, missileSpeed: 330, missileLife: 6,
      description: 'Launches pairs of homing missiles against hostile aircraft.'
    },
    capital: {
      name: 'Capital', icon: '★', category: 'core', cost: 0,
      hp: 5000, radius: 50, buildRange: 780, income: CAPITAL_INCOME_PER_MINUTE,
      emergencyAARange: CAPITAL_EMERGENCY_AA_RANGE, emergencyAASalvo: CAPITAL_EMERGENCY_AA_SALVO, emergencyAACooldown: CAPITAL_EMERGENCY_AA_COOLDOWN, airDamageResistance: CAPITAL_AIR_DAMAGE_RESISTANCE,
      description: 'Center of power. Generates $100/min, has emergency 4-missile anti-air defense, and takes 20% less air-delivered damage; its destruction eliminates the player.'
    }
  };

  const UNITS = {
    basic: {
      name: 'Basic Soldier', cost: 10, hp: 100, damage: 13, range: 95, speed: 76,
      cooldown: 0.62, radius: 6, trainTime: 1.1, projectileSpeed: 760,
      description: 'Standard combat infantry.'
    },
    elite: {
      name: 'Elite Soldier', cost: 18, hp: 175, damage: 22, range: 112, speed: 80,
      cooldown: 0.58, radius: 7, trainTime: 1.55, projectileSpeed: 800,
      description: 'Stronger infantry with better durability.'
    },
    tank: {
      name: 'Tank', cost: 50, hp: 680, damage: 62, range: 185, speed: 48,
      cooldown: 1.15, radius: 15, trainTime: 3.15, projectileSpeed: 620, aoe: 28,
      damageReduction: ARMORED_BASE_DAMAGE_REDUCTION,
      description: 'Very high HP, armored protection, and heavy direct fire.'
    },
    spg: {
      name: 'SPG', cost: 40, hp: 310, damage: 90, range: 370, minRange: 75, speed: 41,
      cooldown: 2.25, radius: 13, trainTime: 2.75, projectileSpeed: 480, aoe: 75,
      damageReduction: ARMORED_BASE_DAMAGE_REDUCTION,
      description: 'Long-range armored mobile artillery with splash.'
    },
    apc: {
      name: 'APC', cost: MECHANIZED_UNIT_BALANCE.apc.cost, hp: MECHANIZED_UNIT_BALANCE.apc.hp,
      damage: 0, range: 0, speed: MECHANIZED_UNIT_BALANCE.apc.speed, cooldown: 0,
      radius: MECHANIZED_UNIT_BALANCE.apc.radius, trainTime: MECHANIZED_UNIT_BALANCE.apc.trainTime, projectileSpeed: 0,
      transportCapacity: MECHANIZED_UNIT_BALANCE.apc.transportCapacity, damageReduction: ARMORED_BASE_DAMAGE_REDUCTION,
      aggroAttraction: true, researchRequirement: { research: 'mwUnlockAPC' },
      description: 'Armored troop carrier. Carries 8 soldiers, draws enemy fire, and emergency-unloads below 30% HP.'
    },
    ifv: {
      name: 'IFV', cost: MECHANIZED_UNIT_BALANCE.ifv.cost, hp: MECHANIZED_UNIT_BALANCE.ifv.hp,
      damage: MECHANIZED_UNIT_BALANCE.ifv.machineGun.damage, range: MECHANIZED_UNIT_BALANCE.ifv.machineGun.range,
      speed: MECHANIZED_UNIT_BALANCE.ifv.speed, cooldown: MECHANIZED_UNIT_BALANCE.ifv.machineGun.cooldown,
      radius: MECHANIZED_UNIT_BALANCE.ifv.radius, trainTime: MECHANIZED_UNIT_BALANCE.ifv.trainTime,
      projectileSpeed: MECHANIZED_UNIT_BALANCE.ifv.machineGun.projectileSpeed,
      transportCapacity: MECHANIZED_UNIT_BALANCE.ifv.transportCapacity, damageReduction: ARMORED_BASE_DAMAGE_REDUCTION,
      aggroAttraction: true, researchRequirement: { research: 'mwUnlockIFV' },
      description: 'Armed armored transport. Carries 12 soldiers, draws fire, and can configure its turret.'
    },
    hiveSoldier: {
      name: 'Hive Hunter', cost: 0, hp: 90, damage: 12, range: 82, speed: 104,
      cooldown: 0.52, radius: 5, trainTime: 0, projectileSpeed: 820,
      description: 'Autonomous hunter deployed by a Hive Turret.'
    },
    loiteringMunition: {
      name: 'Loitering Munition', cost: DRONE_WARFARE_BALANCE.loiteringCost, hp: DRONE_WARFARE_BALANCE.loiteringHp,
      damage: DRONE_WARFARE_BALANCE.loiteringDamage, range: 0, speed: DRONE_WARFARE_BALANCE.loiteringSpeed,
      cooldown: 0, radius: DRONE_WARFARE_BALANCE.loiteringRadius, trainTime: DRONE_WARFARE_BALANCE.loiteringTrainTime, projectileSpeed: 0,
      scanRange: DRONE_WARFARE_BALANCE.loiteringScanRange, aoeDamage: DRONE_WARFARE_BALANCE.loiteringAoeDamage, aoeRadius: DRONE_WARFARE_BALANCE.loiteringAoeRadius,
      researchRequirement: { research: 'dwUnlockLoiteringMunition' },
      description: 'Disposable low-altitude suicide drone. Very fast, fragile, and devastating on contact.'
    },
    loyalWingman: {
      name: 'Loyal Wingman', cost: DRONE_WARFARE_BALANCE.loyalWingmanCost, hp: DRONE_WARFARE_BALANCE.loyalWingmanHp,
      damage: 0, range: 0, speed: DRONE_WARFARE_BALANCE.loyalWingmanSpeed, cooldown: 0,
      radius: DRONE_WARFARE_BALANCE.loyalWingmanRadius, trainTime: DRONE_WARFARE_BALANCE.loyalWingmanTrainTime, projectileSpeed: 0,
      endurance: DRONE_WARFARE_BALANCE.loyalWingmanEndurance, payload: DRONE_WARFARE_BALANCE.loyalWingmanPayload,
      missileDamage: DRONE_WARFARE_BALANCE.loyalWingmanMissileDamage, missileRange: DRONE_WARFARE_BALANCE.loyalWingmanMissileRange,
      sortieCap: DRONE_WARFARE_BALANCE.loyalWingmanSortieCap, researchRequirement: { research: 'dwUnlockLoyalWingman' },
      description: 'Reusable unmanned aircraft escort. Adds air-ground payload and draws anti-air fire before manned aircraft.'
    },
    advancedEngineer: {
      name: 'Advanced Engineer', cost: ADVANCED_ENGINEERING_BALANCE.engineerCost, hp: ADVANCED_ENGINEERING_BALANCE.engineerHp,
      damage: 0, range: 0, speed: ADVANCED_ENGINEERING_BALANCE.engineerSpeed, cooldown: 0,
      radius: ADVANCED_ENGINEERING_BALANCE.engineerRadius, trainTime: ADVANCED_ENGINEERING_BALANCE.engineerTrainTime, projectileSpeed: 0,
      endurance: ADVANCED_ENGINEERING_BALANCE.engineerBaseEndurance, repairRate: ADVANCED_ENGINEERING_BALANCE.engineerBaseRepairRate,
      researchRequirement: { research: 'aeUnlockComplex' },
      description: 'Autonomous high-durability field engineer that repairs damaged friendly buildings.'
    },
    bomber: {
      name: 'Bomber', cost: 100, hp: 350, damage: 0, range: 0, speed: 255,
      cooldown: 0, radius: 12, trainTime: 5.2, projectileSpeed: 0,
      bombDamage: 650, bombAoe: 175,
      description: 'Fast strike aircraft. Two AA missile hits destroy it; damaged aircraft lose speed and must turn around at an Airbase.'
    },
    superFighter: {
      name: 'Super Fighter Jet', cost: AIR_DOMINANCE_BALANCE.fighterCost, hp: AIR_DOMINANCE_BALANCE.fighterHp,
      damage: 0, range: AIR_DOMINANCE_BALANCE.fighterAttackRange, speed: AIR_DOMINANCE_BALANCE.fighterSpeed,
      cooldown: 0, radius: AIR_DOMINANCE_BALANCE.fighterRadius, trainTime: AIR_DOMINANCE_BALANCE.fighterTrainTime, projectileSpeed: 0,
      endurance: AIR_DOMINANCE_BALANCE.fighterEndurance, payload: AIR_DOMINANCE_BALANCE.fighterPayload,
      flares: AIR_DOMINANCE_BALANCE.fighterFlares, detectionRange: AIR_DOMINANCE_BALANCE.fighterDetectionRange,
      researchRequirement: { research: 'adUnlockFighter' },
      description: 'Long-range multirole fighter with configurable A2A/A2G missiles, flares, endurance and patrol/strike missions.'
    },
    paratrooperPlane: {
      name: 'Paratrooper Plane', cost: AIR_DOMINANCE_BALANCE.paratrooperCost, hp: AIR_DOMINANCE_BALANCE.paratrooperHp,
      damage: 0, range: 0, speed: AIR_DOMINANCE_BALANCE.paratrooperSpeed, cooldown: 0,
      radius: AIR_DOMINANCE_BALANCE.paratrooperRadius, trainTime: AIR_DOMINANCE_BALANCE.paratrooperTrainTime, projectileSpeed: 0,
      endurance: AIR_DOMINANCE_BALANCE.paratrooperEndurance, transportCapacity: AIR_DOMINANCE_BALANCE.paratrooperCapacity,
      flares: AIR_DOMINANCE_BALANCE.paratrooperFlares, researchRequirement: { research: 'adUnlockParatrooper' },
      description: 'Reusable airborne troop transport. Drops configured infantry at the mission coordinate and emergency-drops below 40% HP.'
    }
  };

