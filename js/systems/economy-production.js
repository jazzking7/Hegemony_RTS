'use strict';

  // ---------------------------------------------------------------------------
  // Economy, training, Hive turret
  // ---------------------------------------------------------------------------
  function calculateIncome(playerId) {
    let total = game.players[playerId]?.capital?.alive ? CAPITAL_INCOME_PER_MINUTE : 0;
    for (const b of game.buildings) {
      if (b.alive && b.playerId === playerId && (b.type === 'city' || b.type === 'megacity')) {
        total += getBuildingIncome(b);
      }
    }
    return total;
  }

  function updateEconomy(dt) {
    for (const player of game.players) {
      if (!player.alive) continue;
      player.money += calculateIncome(player.id) / 60 * dt;
    }
  }

  function updateTraining(dt) {
    for (const base of game.buildings) {
      if (!base.alive || (base.type !== 'militaryBase' && base.type !== 'superiorMobilizationComplex' && base.type !== 'airbase' && base.type !== 'advancedEngineeringComplex' && base.type !== 'droneHub')) continue;
      if (base.type === 'airbase') {
        serviceParatrooperReloads(base);
        syncAirbaseStoredCount(base);
      }
      if (!base.queue.length) continue;
      const type = base.queue[0];
      const queuedBuildConfiguration = clonePlain(base.queueBuildConfigs?.[0] ?? null);
      const queuedMeta = base.queueMeta?.[0] || null;
      if (queuedBuildConfiguration?.advancedInfantry && !hasOperationalSuperiorMobilizationComplex(base.playerId)) continue;
      if ((base.type === 'militaryBase' || base.type === 'superiorMobilizationComplex') && getGroundFacilityAvailableStorage(base) <= 0) continue;
      base.queueProgress += dt;
      const effectiveTrainTime = getUnitTrainingTime(base.playerId, type) * Math.max(0.05, Number(queuedMeta?.trainingTimeMultiplier) || 1);
      if (base.queueProgress >= effectiveTrainTime) {
        base.queueProgress -= effectiveTrainTime;
        base.queue.shift();
        base.queuePaidCosts?.shift();
        base.queueBuildConfigs?.shift();
        base.queueMeta?.shift();
        if (base.type === 'airbase' && MANNED_AIRCRAFT_TYPES.includes(type)) {
          base.bomberBay ||= [];
          const configuration = queuedBuildConfiguration || getAircraftBuildConfiguration(base.playerId, type);
          const cargoRecords = type === 'paratrooperPlane' ? createConfiguredPassengerRecords(base.playerId, configuration) : [];
          const hp = getDefinitionPlayerStat(base.playerId, 'unit', type, 'hp', UNITS[type].hp);
          // The queue item already counted against the Airbase's shared manned-aircraft cap;
          // completion simply turns it into a ready persistent airframe record.
          base.bomberBay.push(createUnitRecord(type, base.playerId, {
            lifecycleState: LIFECYCLE_STATES.STORED,
            hp, maxHp: hp,
            configuration,
            cargoRecords,
            readyAt: game.time,
            originFacilityType: 'airbase'
          }));
          syncAirbaseStoredCount(base);
        } else if (base.type === 'droneHub' && DRONE_UNIT_TYPES.includes(type)) {
          const record = createUnitRecord(type, base.playerId, {
            lifecycleState: LIFECYCLE_STATES.STORED,
            hp: getDefinitionPlayerStat(base.playerId, 'unit', type, 'hp', UNITS[type].hp),
            maxHp: getDefinitionPlayerStat(base.playerId, 'unit', type, 'hp', UNITS[type].hp),
            readyAt: game.time,
            originFacilityType: 'droneHub'
          });
          if (record) {
            const stored = type === 'loyalWingman' ? storeBuiltWingman(base, record) : storeDroneAtHub(base, record, 0);
            if (!stored) addToCapitalReserve(base.playerId, record, type === 'loyalWingman' ? 'droneNetwork' : 'droneHub');
          }
          redistributeLoyalWingmen(base.playerId);
        } else if (base.type === 'advancedEngineeringComplex' && type === 'advancedEngineer') {
          const record = createUnitRecord('advancedEngineer', base.playerId, {
            lifecycleState: LIFECYCLE_STATES.STORED,
            hp: getDefinitionPlayerStat(base.playerId, 'unit', 'advancedEngineer', 'hp', UNITS.advancedEngineer.hp),
            maxHp: getDefinitionPlayerStat(base.playerId, 'unit', 'advancedEngineer', 'hp', UNITS.advancedEngineer.hp),
            originFacilityType: 'advancedEngineeringComplex'
          });
          if (record) storeEngineerRecord(base, record, 0);
        } else {
          const configuration = queuedBuildConfiguration?.advancedInfantry
            ? queuedBuildConfiguration
            : TRANSPORT_UNIT_TYPES.includes(type)
              ? (queuedBuildConfiguration || getVehicleBuildConfiguration(base.playerId, type))
              : null;
          const cargoRecords = TRANSPORT_UNIT_TYPES.includes(type) ? createConfiguredPassengerRecords(base.playerId, configuration) : [];
          if (configuration?.advancedInfantry && INFANTRY_UNIT_TYPES.includes(type)) {
            const maxHp = getDefinitionPlayerStat(base.playerId, 'unit', type, 'hp', UNITS[type].hp) + getAdvancedInfantryFlatHp(configuration);
            createAndStoreUnit(base, type, {
              configuration,
              variantId: getInfantryLoadoutToken(base.playerId, configuration.loadoutId),
              hp:maxHp, maxHp,
              cargoRecords
            });
          } else {
            createAndStoreUnit(base, type, { configuration, cargoRecords });
          }
        }
        if (base.playerId === PLAYER_ID) notify(`${UNITS[type].name} ready and stored at the ${base.type === 'airbase' ? 'Airbase' : base.type === 'advancedEngineeringComplex' ? 'Engineering Complex' : base.type === 'droneHub' ? 'drone network' : base.type === 'superiorMobilizationComplex' ? 'Mobilization Complex' : 'Military Base'}.`, 'good', 2.3);
      }
    }
  }

  function setHiveMode(hive, mode, options = {}) {
    if (!hive?.alive || hive.type !== 'hive' || (hive.playerId !== PLAYER_ID && !options.allowAI)) return false;
    if (mode === 'searchDestroy' && !hasResearchCapability(hive.playerId, 'hiveSearchDestroyMode')) return false;
    const next = mode === 'searchDestroy' ? 'searchDestroy' : 'ugv';
    if (hive.hiveMode === next) return true;
    for (const id of hive.hiveChildren || []) {
      const child = game.entityById.get(id);
      if (child?.alive) markEntityDead(child, false);
    }
    hive.hiveChildren = [];
    hive.hiveTargetId = null;
    hive.hiveRespawn = 0;
    hive.hiveMode = next;
    hive.hiveDroneWaveActive = false;
    hive.hiveDroneWaveCooldownUntil = game.time;
    if (hive.playerId === PLAYER_ID) notify(`Hive mode set to ${next === 'searchDestroy' ? 'SEARCH & DESTROY' : 'UGV PATROL'}.`, 'good', 2.3);
    if (game.selected === hive) renderSelectionPanel();
    return true;
  }

  function spawnHiveDroneWave(hive) {
    if (!hive?.alive || hive.type !== 'hive' || entityCount() > MAX_ENTITIES - DRONE_WARFARE_BALANCE.hiveDroneWaveSize) return 0;
    const enemy = findClosestEnemy(hive, getEntityStat(hive, 'range', BUILDINGS.hive.range), true);
    let spawned = 0;
    for (let i = 0; i < DRONE_WARFARE_BALANCE.hiveDroneWaveSize; i++) {
      const angle = i / DRONE_WARFARE_BALANCE.hiveDroneWaveSize * Math.PI * 2;
      const missionRadius = enemy?.alive ? 0 : getEntityStat(hive, 'range', BUILDINGS.hive.range) * 0.72;
      const missionX = enemy?.alive ? enemy.x : clamp(hive.x + Math.cos(angle) * missionRadius, 8, WORLD.width - 8);
      const missionY = enemy?.alive ? enemy.y : clamp(hive.y + Math.sin(angle) * missionRadius, 8, WORLD.height - 8);
      const unit = createUnit('loiteringMunition', hive.playerId, hive.x + Math.cos(angle) * (hive.radius + 14), hive.y + Math.sin(angle) * (hive.radius + 14), {
        parentHiveId: hive.id,
        hiveGenerated: true,
        droneEnduranceRemaining: DRONE_WARFARE_BALANCE.hiveLoiteringEndurance,
        droneMissionX: missionX,
        droneMissionY: missionY,
        orderX: missionX,
        orderY: missionY,
        hasOrder: true,
        lowAltitudeDrone: true
      });
      if (unit) {
        if (enemy?.alive) unit.target = enemy;
        hive.hiveChildren.push(unit.id);
        spawned++;
      }
    }
    hive.hiveDroneWaveActive = spawned > 0;
    return spawned;
  }

  function updateHives(dt) {
    for (const hive of game.buildings) {
      if (!hive.alive || hive.type !== 'hive') continue;
      hive.hiveChildren = hive.hiveChildren.filter(id => game.entityById.get(id)?.alive);

      if (hive.hiveMode === 'searchDestroy' && hasResearchCapability(hive.playerId, 'hiveSearchDestroyMode')) {
        if (hive.hiveChildren.length > 0) {
          hive.hiveDroneWaveActive = true;
          continue;
        }
        if (hive.hiveDroneWaveActive) {
          hive.hiveDroneWaveActive = false;
          hive.hiveDroneWaveCooldownUntil = game.time + DRONE_WARFARE_BALANCE.hiveDroneWaveCooldown;
        }
        if (game.time >= (hive.hiveDroneWaveCooldownUntil || 0)) spawnHiveDroneWave(hive);
        continue;
      }

      // Default UGV patrol mode: the Hive itself owns the expensive long-range
      // detection; its three hunters share the assigned target.
      if (game.time >= hive.nextScan) {
        const enemy = findClosestEnemy(hive, getEntityStat(hive, 'range', BUILDINGS.hive.range), false);
        hive.hiveTargetId = enemy?.id || null;
        hive.nextScan = game.time + 0.18 + (hive.id % 7) * 0.025;
        for (let i = 0; i < hive.hiveChildren.length; i++) {
          const hunter = game.entityById.get(hive.hiveChildren[i]);
          if (!hunter?.alive) continue;
          if (enemy) {
            hunter.target = enemy;
            hunter.orderX = enemy.x;
            hunter.orderY = enemy.y;
            hunter.hasOrder = true;
          } else {
            hunter.target = null;
            const angle = i / Math.max(1, hive.hiveChildren.length) * Math.PI * 2 + hive.id * 0.17;
            hunter.orderX = hive.x + Math.cos(angle) * 95;
            hunter.orderY = hive.y + Math.sin(angle) * 95;
            hunter.hasOrder = true;
          }
        }
      }

      if (hive.hiveChildren.length > 0) {
        hive.hiveRespawn = 0;
        continue;
      }
      if (hive.hiveRespawn <= 0) hive.hiveRespawn = 5;
      hive.hiveRespawn -= dt;
      if (hive.hiveRespawn <= 0 && entityCount() <= MAX_ENTITIES - 3) {
        const enemy = hive.hiveTargetId ? game.entityById.get(hive.hiveTargetId) : findClosestEnemy(hive, getEntityStat(hive, 'range', BUILDINGS.hive.range), false);
        for (let i = 0; i < 3; i++) {
          const angle = i / 3 * Math.PI * 2;
          const unit = createUnit('hiveSoldier', hive.playerId, hive.x + Math.cos(angle) * 42, hive.y + Math.sin(angle) * 42, {
            parentHiveId: hive.id,
            hivePatrolIndex: i
          });
          if (unit) {
            if (enemy?.alive && distance(enemy, hive) <= getEntityStat(hive, 'range', BUILDINGS.hive.range)) {
              unit.target = enemy;
              unit.orderX = enemy.x;
              unit.orderY = enemy.y;
            } else {
              unit.orderX = hive.x + Math.cos(angle) * 95;
              unit.orderY = hive.y + Math.sin(angle) * 95;
            }
            unit.hasOrder = true;
            hive.hiveChildren.push(unit.id);
          }
        }
      }
    }
  }

