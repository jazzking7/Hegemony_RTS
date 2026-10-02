'use strict';

  // ---------------------------------------------------------------------------
  // Combat and projectiles
  // ---------------------------------------------------------------------------
  function getAttackerTargetingRange(attacker) {
    if (!attacker) return 0;
    if (attacker.kind === 'unit') return getUnitWeaponProfile(attacker)?.range || 0;
    const def = BUILDINGS[attacker.type];
    if (!def || !Number.isFinite(def.damage) && attacker.type !== 'airDefense') return 0;
    return getEntityStat(attacker, 'range', def.range || 0);
  }

  function isProximityStealthHidden(target, attacker) {
    if (!target?.alive || target.type !== 'loiteringMunition' || hasStatus(target, 'revealed')) return false;
    if (!isResearchComplete(target.playerId, 'dwLMStealth')) return false;
    const range = getAttackerTargetingRange(attacker);
    if (range <= 0) return true;
    return distance(target, attacker) > range * 0.5;
  }

  function isAirStealthHidden(target, attacker) {
    if (!target?.alive || hasStatus(target, 'revealed')) return false;
    if (target.type === 'superFighter' && target.fighterStealthed) return true;
    // Paratroopers use one-way stealth after landing: it lasts until their first
    // attack and never comes back unless a future system explicitly grants it.
    if (target.stealthUntilAttack) return true;
    return false;
  }

  function isValidTarget(target, attacker) {
    if (attacker && hasStatus(attacker, 'spoofed')) return false;
    if (!target || !target.alive || !Number.isFinite(target.hp) || target.hp <= 0) return false;
    if (game.entityById.get(target.id) !== target || target.playerId === attacker.playerId || !game.players[target.playerId]?.alive) return false;
    if (target.kind === 'building' && target.type === 'landmine') return false;
    if (target.kind === 'unit' && target.garrisoned) return false;
    if (target.kind === 'unit' && target.parachuting) return false;
    if (isProximityStealthHidden(target, attacker) || isAirStealthHidden(target, attacker)) return false;
    if (typeof isAdvancedInfantryFullyStealthed === 'function' && isAdvancedInfantryFullyStealthed(target)) return false;
    if (typeof isAdvancedInfantryConcealedFrom === 'function' && isAdvancedInfantryConcealedFrom(target, attacker)) return false;
    if (target.kind === 'unit' && target.airborne) {
      // Air-defense towers can target aircraft. Super Fighters can also engage
      // aircraft with their A2A payload; ordinary ground combat cannot.
      const fighterVsAircraft = attacker?.type === 'superFighter' && entityHasTag(target, 'aircraft');
      if (attacker?.type !== 'airDefense' && !fighterVsAircraft) return false;
    }
    return true;
  }

  function findClosestEnemyAircraft(entity, radius) {
    let bestWingman = null;
    let bestWingmanD2 = radius * radius;
    let bestManned = null;
    let bestMannedD2 = radius * radius;
    unitGrid.queryCircle(entity.x, entity.y, radius, queryScratchA);
    for (const other of queryScratchA) {
      if (!other.alive || !other.airborne || other.parachuting || !entityHasTag(other, 'aircraft') || other.playerId === entity.playerId || !Number.isFinite(other.hp) || other.hp <= 0) continue;
      if (isAirStealthHidden(other, entity)) continue;
      const d2 = distSq(entity, other);
      if (other.type === 'loyalWingman') {
        if (d2 < bestWingmanD2) { bestWingmanD2 = d2; bestWingman = other; }
      } else if (d2 < bestMannedD2) {
        bestMannedD2 = d2; bestManned = other;
      }
    }
    // Loyal Wingmen are aerial aggro-attractors: if even one is inside the
    // engagement envelope, it takes priority over every manned aircraft.
    return bestWingman || bestManned;
  }

  function findClosestEnemyWingmanAtPoint(playerId, x, y, radius) {
    let best = null;
    let bestD2 = radius * radius;
    unitGrid.queryCircle(x, y, radius, queryScratchC);
    for (const other of queryScratchC) {
      if (!other.alive || other.type !== 'loyalWingman' || !other.airborne || other.playerId === playerId || !Number.isFinite(other.hp) || other.hp <= 0) continue;
      const dx = other.x - x, dy = other.y - y, d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = other; }
    }
    return best;
  }

  function loadCargoRecord(transportRecord, passengerRecord, playerId) {
    if (!transportRecord || !passengerRecord || !TRANSPORT_UNIT_TYPES.includes(transportRecord.type) || !INFANTRY_UNIT_TYPES.includes(passengerRecord.type)) return false;
    transportRecord.cargoRecords ||= [];
    const capacity = getTransportCapacityForType(playerId, transportRecord.type);
    if (transportRecord.cargoRecords.length >= capacity) return false;
    passengerRecord.lifecycleState = LIFECYCLE_STATES.CARGO;
    transportRecord.cargoRecords.push(passengerRecord);
    return true;
  }

  function unloadCargo(transport, emergency = false) {
    if (!transport?.alive || !transport.cargoRecords?.length) return 0;
    const cargo = transport.cargoRecords.splice(0);
    let released = 0;
    for (let i = 0; i < cargo.length; i++) {
      const record = cargo[i];
      const angle = (i / Math.max(1, cargo.length)) * Math.PI * 2 + transport.angle;
      const radius = transport.radius + 14 + Math.floor(i / 8) * 10;
      const unit = createUnitFromRecord(record,
        clamp(transport.x + Math.cos(angle) * radius, 8, WORLD.width - 8),
        clamp(transport.y + Math.sin(angle) * radius, 8, WORLD.height - 8));
      if (!unit) {
        addToCapitalReserve(transport.playerId, record, 'militaryBase');
        continue;
      }
      unit.orderX = Number.isFinite(transport.transportMissionX) ? transport.transportMissionX : transport.orderX;
      unit.orderY = Number.isFinite(transport.transportMissionY) ? transport.transportMissionY : transport.orderY;
      if (!emergency) {
        // A transport that reaches its destination before unloading establishes a
        // persistent local assault zone. The passengers remain centered on the
        // destination and engage present/future enemies inside 200 radius.
        applyAssaultZone(unit, unit.orderX, unit.orderY);
      } else {
        // Early/emergency unloads retain the original destination as an ordinary
        // move order. They may fight distractions on the way, then continue.
        unit.hasOrder = Math.hypot(unit.orderX - unit.x, unit.orderY - unit.y) > 24;
        unit.transportReleaseOrder = unit.hasOrder;
      }
      released++;
    }
    if (transport.playerId === PLAYER_ID && emergency && released) {
      notify(`${UNITS[transport.type].name} emergency-unloaded ${released} passenger${released === 1 ? '' : 's'}.`, 'warning', 2.8);
    }
    return released;
  }

  function findClosestEnemy(entity, radius, includeBuildings = true) {
    let best = null;
    let bestD2 = radius * radius;
    let bestAttractor = null;
    let bestAttractorD2 = radius * radius;
    unitGrid.queryCircle(entity.x, entity.y, radius, queryScratchA);
    for (const other of queryScratchA) {
      if (!isValidTarget(other, entity)) continue;
      const d2 = distSq(entity, other);
      if (entityHasCapability(other, 'attractsAggro')) {
        if (d2 < bestAttractorD2) { bestAttractorD2 = d2; bestAttractor = other; }
      } else if (d2 < bestD2) {
        bestD2 = d2;
        best = other;
      }
    }
    // APCs/IFVs explicitly attract aggro: if one is inside the acquisition scan,
    // attackers prefer the nearest attractor over ordinary units/buildings.
    if (bestAttractor) return bestAttractor;
    if (includeBuildings) {
      buildingGrid.queryCircle(entity.x, entity.y, radius, queryScratchB);
      for (const other of queryScratchB) {
        if (!isValidTarget(other, entity)) continue;
        const d2 = distSq(entity, other);
        if (d2 < bestD2) { bestD2 = d2; best = other; }
      }
    }
    return best;
  }

  function fireWeapon(attacker, target, def, sourceType = 'unit') {
    const weaponDef = attacker?.kind === 'unit' ? getUnitWeaponProfile(attacker) : {
      ...def,
      damage: getEntityStat(attacker, 'damage', def?.damage || 0),
      cooldown: getEntityStat(attacker, 'cooldown', def?.cooldown || 0),
      range: getEntityStat(attacker, 'range', def?.range || 0)
    };
    // Only actual weapon definitions may enter projectile combat. The Hive Turret
    // has a detection range but intentionally has no direct-fire damage. Letting
    // it through here previously produced undefined damage and NaN target HP.
    let derivedDamage = weaponDef?.damage;
    if (!attacker?.alive || !isValidTarget(target, attacker) ||
        !Number.isFinite(derivedDamage) || derivedDamage <= 0) return false;

    if (typeof getEnergyFieldAttackMultiplier === 'function') derivedDamage *= getEnergyFieldAttackMultiplier(attacker);
    if (attacker.kind === 'unit' && typeof applyAdvancedInfantryCritical === 'function' && INFANTRY_UNIT_TYPES.includes(attacker.type)) {
      const crit = applyAdvancedInfantryCritical(attacker, derivedDamage);
      derivedDamage = crit.damage;
    }
    attacker.cooldown = Number.isFinite(weaponDef.cooldown) ? weaponDef.cooldown : 0;
    if (attacker.kind === 'unit' && typeof markAdvancedInfantryAttack === 'function') markAdvancedInfantryAttack(attacker);
    if (attacker.stealthUntilAttack) attacker.stealthUntilAttack = false;
    if (attacker.type === 'superFighter') { attacker.fighterStealthed = false; attacker.lastAttackAt = game.time; }
    if (game.projectiles.length >= MAX_PROJECTILES) {
      const statusEffect = weaponDef.statusEffect || null;
      if (weaponDef.aoe) explode(target.x, target.y, attacker.playerId, derivedDamage, weaponDef.aoe, statusEffect);
      else applyDamage(target, derivedDamage, attacker.playerId, statusEffect, { armorPiercing: !!weaponDef.armorPiercing });
      return true;
    }
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    attacker.angle = Math.atan2(dy, dx);

    if (attacker.type === 'mortar') {
      game.projectiles.push({
        kind: 'mortar', playerId: attacker.playerId,
        x: attacker.x, y: attacker.y,
        startX: attacker.x, startY: attacker.y,
        targetX: target.x + rand(-12, 12), targetY: target.y + rand(-12, 12),
        progress: 0, duration: 0.95, damage: derivedDamage, aoe: weaponDef.aoe, statusEffect: weaponDef.statusEffect || null, armorPiercing: !!weaponDef.armorPiercing
      });
      return true;
    }

    const n = normalize(dx, dy);
    game.projectiles.push({
      kind: weaponDef.aoe ? 'shell' : 'bullet',
      playerId: attacker.playerId,
      x: attacker.x + n.x * (attacker.radius + 4),
      y: attacker.y + n.y * (attacker.radius + 4),
      vx: n.x * (weaponDef.projectileSpeed || 700),
      vy: n.y * (weaponDef.projectileSpeed || 700),
      targetId: target.id,
      damage: derivedDamage,
      aoe: weaponDef.aoe || 0,
      armorPiercing: !!weaponDef.armorPiercing,
      life: Math.max(0.25, (Math.hypot(dx, dy) / (weaponDef.projectileSpeed || 700)) + 0.25),
      sourceType
    });
    return true;
  }

  function applyDamage(target, amount, attackerPlayerId, statusEffect = null, options = {}) {
    if (!target || !target.alive) return false;
    if (!Number.isFinite(amount) || amount <= 0) return false;

    // Fail closed if any future bug corrupts health. A malformed entity must be
    // removed rather than remain alive forever and attract every nearby attacker.
    if (!Number.isFinite(target.hp)) {
      destroyEntity(target, attackerPlayerId);
      return false;
    }

    let finalAmount = amount;
    if (target.kind === 'unit' && typeof advancedInfantryNullifiesHit === 'function' && isAdvancedInfantryUnit(target) && !options.environmentalDOT && advancedInfantryNullifiesHit(target)) {
      pushEffect({ type:'shield', x:target.x, y:target.y, radius:target.radius + 8, life:0.18, maxLife:0.18 });
      return true;
    }
    if (!options.armorPiercing && target.kind === 'unit') {
      const reduction = clamp(getEntityStat(target, 'damageReduction', 0), 0, MAX_DAMAGE_REDUCTION);
      finalAmount *= (1 - reduction);
    }
    if (target.kind === 'unit' && typeof getAdvancedInfantryDamageIntakeMultiplier === 'function' && isAdvancedInfantryUnit(target)) {
      finalAmount *= getAdvancedInfantryDamageIntakeMultiplier(target, !!options.armorPiercing);
    }
    if (typeof getEnergyFieldDamageReduction === 'function') finalAmount *= (1 - getEnergyFieldDamageReduction(target));
    finalAmount *= getRadarDamageReceivedMultiplier(target, attackerPlayerId);
    if (typeof getBurningZoneDamageReceivedMultiplier === 'function') finalAmount *= getBurningZoneDamageReceivedMultiplier(target);
    if (target.kind === 'building' && target.type === 'capital' && options.airDelivered) {
      finalAmount *= (1 - (BUILDINGS.capital.airDamageResistance || CAPITAL_AIR_DAMAGE_RESISTANCE));
    }
    target.hp -= finalAmount;
    target.lastHitAt = game.time;
    if (target.kind === 'unit' && statusEffect) applyStatusEffect(target, statusEffect, { playerId: attackerPlayerId });

    // APC/IFV crews automatically dismount before the vehicle is lost once its
    // post-hit health crosses the confirmed 30% emergency threshold.
    if (target.kind === 'unit' && TRANSPORT_UNIT_TYPES.includes(target.type) && target.cargoRecords?.length) {
      const hpRatio = target.hp / Math.max(1, target.maxHp);
      if (hpRatio < 0.30) unloadCargo(target, true);
    }
    if (target.kind === 'unit' && target.type === 'paratrooperPlane' && target.cargoRecords?.length) {
      const hpRatio = target.hp / Math.max(1, target.maxHp);
      if (hpRatio < 0.40) dropParatroopers(target, true);
    }

    if (target.hp <= 0) destroyEntity(target, attackerPlayerId);
    return true;
  }

  function explode(x, y, playerId, damage, radius, statusEffect = null, excludeEntityId = null, options = {}) {
    pushEffect({ type: 'explosion', x, y, radius, life: 0.55, maxLife: 0.55 });
    unitGrid.queryCircle(x, y, radius, queryScratchA);
    for (const target of queryScratchA) {
      if (!target.alive || target.playerId === playerId || target.id === excludeEntityId || target.airborne || target.garrisoned) continue;
      const d = Math.hypot(target.x - x, target.y - y);
      const falloff = clamp(1 - d / radius, 0.25, 1);
      applyDamage(target, damage * falloff, playerId, statusEffect, options);
    }
    buildingGrid.queryCircle(x, y, radius, queryScratchB);
    for (const target of queryScratchB) {
      if (!target.alive || target.playerId === playerId || target.type === 'landmine' || target.id === excludeEntityId) continue;
      const d = Math.hypot(target.x - x, target.y - y);
      const falloff = clamp(1 - d / radius, 0.25, 1);
      applyDamage(target, damage * falloff, playerId, null, options);
    }
  }

  function markEntityDead(entity, createDebris = true, lifecycleState = LIFECYCLE_STATES.DESTROYED) {
    if (!entity || !entity.alive) return false;
    entity.alive = false;
    if (entity.kind === 'unit') entity.lifecycleState = lifecycleState;
    entity.hp = 0;
    entity.destroyedAt = game.time;
    entity.target = null;
    entity.hasOrder = false;
    entity.vx = 0;
    entity.vy = 0;
    entity.path = null;
    entity.pathQueued = false;
    game.liveEntityCount = Math.max(0, game.liveEntityCount - 1);
    if (entity.kind === 'building') {
      unregisterBuildingPlayerModifiers(entity);
      game.buildingGridDirty = true;
      if (entity.type !== 'landmine') navGrid.markDirty();
    }

    // Projectile cleanup is handled once in updateProjectiles. Avoid scanning the
    // entire projectile array once per casualty during large explosions.
    if (createDebris) {
      pushEffect({ type: 'debris', x: entity.x, y: entity.y, radius: entity.radius * 2.2, life: 0.75, maxLife: 0.75 });
    }
    return true;
  }

  function evacuateBuildingContentsToCapital(building) {
    if (!building?.alive || building.kind !== 'building') return 0;
    let moved = 0;

    if (building.type === 'militaryBase') {
      building.storedUnits ||= [];
      for (const record of building.storedUnits.splice(0)) {
        if (addToCapitalReserve(building.playerId, record, 'militaryBase')) moved++;
      }
      syncGroundStorageCounts(building);
    }


    if (building.type === 'superiorMobilizationComplex') {
      building.storedUnits ||= [];
      for (const record of building.storedUnits.splice(0)) {
        if (addToCapitalReserve(building.playerId, record, 'infantryNetwork')) moved++;
      }
      syncGroundStorageCounts(building);
    }

    if (building.type === 'airbase') {
      building.bomberBay ||= [];
      for (const record of building.bomberBay.splice(0)) {
        if (addToCapitalReserve(building.playerId, record, 'airbase')) moved++;
      }
      for (const type of MANNED_AIRCRAFT_TYPES) building.storage[type] = 0;

      // Loyal Wingmen are maintained in a separate Airbase pool. Voluntary
      // removal preserves them just like other contained entities: they enter
      // the Capital Reserve first, then recover to another Airbase or to Drone
      // Hub storage (10 per Hub, expanded by Drone Storage research) if room is
      // available. This avoids silently deleting expensive reusable escorts.
      building.loyalWingmanBay ||= [];
      for (const record of building.loyalWingmanBay.splice(0)) {
        if (addToCapitalReserve(building.playerId, record, 'droneNetwork')) moved++;
      }

      // Airborne aircraft/escorts are not contained and therefore remain active.
      // Their former home slot disappears; their normal RTB logic will choose a
      // replacement Airbase or, for Wingmen, emergency Drone Hub storage.
      for (const unit of game.units) {
        if (!unit.alive || unit.homeAirbaseId !== building.id) continue;
        if (MANNED_AIRCRAFT_TYPES.includes(unit.type) || unit.type === 'loyalWingman') unit.homeAirbaseId = null;
      }
    }

    if (building.type === 'droneHub') {
      building.droneBay ||= [];
      for (const record of building.droneBay.splice(0)) {
        const origin = record?.type === 'loyalWingman' ? 'droneNetwork' : 'droneHub';
        if (addToCapitalReserve(building.playerId, record, origin)) moved++;
      }
      syncDroneHubCounts(building);
    }

    if (building.type === 'fortress') {
      // Operational defenders are contained by the Fortress and evacuate to the
      // Capital Reserve. Builders still en route are active troops, so removal
      // simply detaches them rather than teleporting them.
      for (const id of [...(building.garrisonIds || [])]) {
        const unit = game.entityById.get(id);
        if (unit?.alive && deactivateUnitToReserve(unit, 'militaryBase')) moved++;
      }
      for (const id of [...(building.builderIds || [])]) {
        const unit = game.entityById.get(id);
        if (!unit?.alive) continue;
        unit.parentFortressId = null;
        unit.fortressBuilderSiteId = null;
        unit.fortressBuilderArrived = false;
        unit.garrisoned = false;
        unit.lifecycleState = LIFECYCLE_STATES.ACTIVE;
        unit.target = null;
        unit.hasOrder = false;
      }
      building.garrisonIds = [];
      building.builderIds = [];
    }

    if (building.type === 'advancedEngineeringComplex') {
      building.engineerBay ||= [];
      for (const record of building.engineerBay.splice(0)) {
        if (addToCapitalReserve(building.playerId, record, 'advancedEngineeringComplex')) moved++;
      }
      for (const unit of [...game.units]) {
        if (!unit.alive || unit.type !== 'advancedEngineer' || unit.homeComplexId !== building.id) continue;
        clearEngineerOUJob(unit, true);
        if (deactivateUnitToReserve(unit, 'advancedEngineeringComplex')) moved++;
      }
    }

    return moved;
  }

  function getStructureRemovalRefundRate(playerId) {
    return isDoctrineUnlocked(playerId, 'advancedEngineering') ? 0.60 : 0;
  }

  function removeBuilding(building, options = {}) {
    if (!building?.alive || building.kind !== 'building' || building.type === 'capital') return { ok: false, reason: 'Structure cannot be removed' };
    const player = game.players[building.playerId];
    if (!player?.alive) return { ok: false, reason: 'Owner unavailable' };
    const moved = evacuateBuildingContentsToCapital(building);
    const cancelledQueue = building.queue?.length || 0;
    // Training is paid up front. Any queue entry still present has not finished,
    // including a partially progressed first item, so refund its full unit cost.
    const queueRefund = (building.queue || []).reduce((sum, type, index) => sum + (Number.isFinite(building.queuePaidCosts?.[index]) ? building.queuePaidCosts[index] : getTrainingPackageCost(building.playerId, type, building.queueBuildConfigs?.[index] || null)), 0);
    building.queue = [];
    building.queuePaidCosts = [];
    building.queueBuildConfigs = [];
    building.queueMeta = [];
    building.queueProgress = 0;
    if (queueRefund > 0) player.money += queueRefund;
    const missileQueueRefund = building.type === 'missileLaunchSite' && typeof refundMissileLaunchSiteQueues === 'function' ? refundMissileLaunchSiteQueues(building) : 0;
    if (missileQueueRefund > 0) player.money += missileQueueRefund;
    const refundRate = clamp(options.refundRate === undefined ? getStructureRemovalRefundRate(building.playerId) : (Number(options.refundRate) || 0), 0, 1);
    const investedCost = Number.isFinite(building.totalInvestedCost) ? building.totalInvestedCost : (BUILDINGS[building.type]?.cost || 0);
    const refund = Math.round(investedCost * refundRate);
    if (refund > 0) player.money += refund;
    markEntityDead(building, true);
    if (game.selected === building) setSelection(null);
    recoverCapitalReserve(building.playerId);
    refreshBuildButtons();
    if (building.playerId === PLAYER_ID) {
      const parts = [`${BUILDINGS[building.type].name} removed`];
      if (moved) parts.push(`${moved} contained ${moved === 1 ? 'entity' : 'entities'} evacuated through Capital Reserve`);
      if (cancelledQueue) parts.push(`${cancelledQueue} unfinished ${cancelledQueue === 1 ? 'unit' : 'units'} refunded ${moneyText(queueRefund)}`);
      if (refund) parts.push(`${moneyText(refund)} structure investment recovered`);
      notify(`${parts.join(' · ')}.`, moved ? 'warning' : '', 4.5);
    }
    return { ok: true, moved, cancelledQueue, queueRefund, missileQueueRefund, refund, totalRefund: queueRefund + missileQueueRefund + refund };
  }

  function destroyEntity(entity, attackerPlayerId) {
    if (entity?.kind === 'unit' && entity.alive && typeof applyAdvancedInfantryDeathEffects === 'function') applyAdvancedInfantryDeathEffects(entity);
    if (entity?.kind === 'unit' && entity.type === 'loiteringMunition' && entity.alive && !entity.droneDetonating && hasResearchCapability(entity.playerId, 'loiteringLastDitch')) {
      const aoe = getLoiteringAOE(entity);
      if (aoe.damage > 0 && aoe.radius > 0) explode(entity.x, entity.y, entity.playerId, aoe.damage, aoe.radius);
    }
    if (entity?.kind === 'unit' && entity.type === 'advancedEngineer') clearEngineerOUJob(entity, true);
    if (entity?.kind === 'building' && entity.type === 'fortress') releaseFortressGarrison(entity);
    let lostStationedAircraft = 0;
    let lostStationedWingmen = 0;
    let lostStoredDrones = 0;
    if (entity?.kind === 'building' && entity.type === 'airbase') {
      lostStationedAircraft = entity.bomberBay?.length || 0;
      lostStationedWingmen = entity.loyalWingmanBay?.length || 0;
      entity.bomberBay = [];
      entity.loyalWingmanBay = [];
      for (const type of MANNED_AIRCRAFT_TYPES) entity.storage[type] = 0;
      // Airborne bombers/Wingmen survive the base loss, but their reserved home
      // slot is invalidated so they must find another Airbase (or Hub for LW).
      for (const unit of game.units) {
        if (!unit.alive || unit.homeAirbaseId !== entity.id) continue;
        if (MANNED_AIRCRAFT_TYPES.includes(unit.type) || unit.type === 'loyalWingman') unit.homeAirbaseId = null;
      }
    }
    if (entity?.kind === 'building' && entity.type === 'droneHub') {
      lostStoredDrones = entity.droneBay?.length || 0;
      entity.droneBay = [];
      entity.storage.loiteringMunition = 0;
      entity.storage.loyalWingman = 0;
    }
    if (!markEntityDead(entity, true)) return;

    if ((lostStationedAircraft || lostStationedWingmen) && entity.playerId === PLAYER_ID) {
      const parts = [];
      if (lostStationedAircraft) parts.push(`${lostStationedAircraft} stationed manned aircraft`);
      if (lostStationedWingmen) parts.push(`${lostStationedWingmen} stationed Loyal Wingman${lostStationedWingmen === 1 ? '' : 's'}`);
      notify(`Airbase destroyed — ${parts.join(' and ')} lost.`, 'warning', 4.5);
    }
    if (lostStoredDrones && entity.playerId === PLAYER_ID) {
      notify(`Drone Hub destroyed — ${lostStoredDrones} stored drone${lostStoredDrones === 1 ? '' : 's'} lost.`, 'warning', 4.5);
    }
    if (game.selected === entity) setSelection(null);
    if (entity.kind === 'building' && entity.type === 'capital') {
      eliminatePlayer(entity.playerId, attackerPlayerId);
    }
  }

  function eliminatePlayer(playerId, attackerPlayerId) {
    const player = game.players[playerId];
    if (!player || !player.alive) return;
    player.alive = false;
    for (const b of game.buildings) {
      if (b.playerId === playerId && b.alive) markEntityDead(b, false);
    }
    for (const u of game.units) {
      if (u.playerId === playerId && u.alive) markEntityDead(u, false);
    }
    pushEffect({ type: 'shockwave', x: player.capital.x, y: player.capital.y, radius: 360, life: 1.5, maxLife: 1.5 });

    if (playerId === PLAYER_ID) {
      finishGame(false, `${game.players[attackerPlayerId]?.name || 'Enemy forces'} destroyed your capital.`);
    } else {
      notify(`${player.name} has been eliminated.`, 'good', 5);
      const enemiesAlive = game.players.filter(p => p.id !== PLAYER_ID && p.alive).length;
      if (game.players[PLAYER_ID].alive && enemiesAlive === 0) finishGame(true, 'Every enemy capital has fallen. The battlefield is secure.');
    }
  }

  function finishGame(victory, text) {
    game.over = true;
    game.paused = true;
    els.gameOverTitle.textContent = victory ? 'VICTORY' : 'DEFEAT';
    els.gameOverText.textContent = text;
    els.gameOverOverlay.classList.remove('hidden');
    els.status.textContent = victory ? 'VICTORY' : 'DEFEATED';
  }

  function isHomingAirProjectile(projectile) {
    return projectile?.kind === 'aaMissile' || projectile?.kind === 'fighterA2AMissile';
  }

  function findClosestHostileFlareAtPoint(playerId, x, y, radius) {
    let best = null;
    let bestD2 = radius * radius;
    for (const projectile of game.projectiles) {
      if (projectile.kind !== 'flare' || projectile.playerId === playerId || projectile.life <= 0) continue;
      const dx = projectile.x - x;
      const dy = projectile.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = projectile; }
    }
    return best;
  }

  function launchFlareBurst(unit) {
    if (!unit?.alive || !unit.airborne || (unit.flareCharges || 0) < 2 || game.projectiles.length > MAX_PROJECTILES - 2) return false;
    const sideX = -Math.sin(unit.angle);
    const sideY = Math.cos(unit.angle);
    for (const side of [-1, 1]) {
      game.projectiles.push({
        kind: 'flare', id: game.id++, playerId: unit.playerId, ownerAircraftId: unit.id,
        x: unit.x + sideX * side * (unit.radius + 3),
        y: unit.y + sideY * side * (unit.radius + 3),
        vx: sideX * side * AIR_DOMINANCE_BALANCE.flareSpeed,
        vy: sideY * side * AIR_DOMINANCE_BALANCE.flareSpeed,
        straightVx: sideX * side * AIR_DOMINANCE_BALANCE.flareSpeed,
        straightVy: sideY * side * AIR_DOMINANCE_BALANCE.flareSpeed,
        targetId: null, homing: false,
        life: AIR_DOMINANCE_BALANCE.flareLife,
        maxLife: AIR_DOMINANCE_BALANCE.flareLife
      });
    }
    unit.flareCharges -= 2;
    unit.flareBurstCooldown = 0.35;
    pushEffect({ type: 'flareBurst', x: unit.x, y: unit.y, radius: 26, life: 0.24, maxLife: 0.24 });
    return true;
  }

  function updateAircraftFlareDefense(unit, dt) {
    if (!unit?.alive || !unit.airborne || (unit.flareCharges || 0) < 2) return false;
    unit.flareBurstCooldown = Math.max(0, (unit.flareBurstCooldown || 0) - dt);
    if (unit.flareBurstCooldown > 0) return false;
    const triggerSq = AIR_DOMINANCE_BALANCE.flareTriggerRadius * AIR_DOMINANCE_BALANCE.flareTriggerRadius;
    for (const projectile of game.projectiles) {
      if (!isHomingAirProjectile(projectile) || projectile.playerId === unit.playerId || projectile.life <= 0 || projectile.flareTarget) continue;
      if (projectile.targetId !== unit.id) continue;
      const dx = projectile.x - unit.x;
      const dy = projectile.y - unit.y;
      if (dx * dx + dy * dy <= triggerSq) return launchFlareBurst(unit);
    }
    return false;
  }

  function markAircraftTargeted(target) {
    if (target?.alive && target.type === 'superFighter') {
      target.lastTargetedAt = game.time;
      target.fighterStealthed = false;
    }
  }

  function explodeAntiAirProximity(x, y, playerId, damage, radius) {
    pushEffect({ type: 'explosion', x, y, radius, life: 0.42, maxLife: 0.42 });
    const r2 = radius * radius;
    unitGrid.queryCircle(x, y, radius + 40, queryScratchC);
    for (const unit of queryScratchC) {
      if (!unit.alive || !unit.airborne || unit.playerId === playerId) continue;
      const dx = unit.x - x, dy = unit.y - y;
      if (dx * dx + dy * dy <= (radius + unit.radius) * (radius + unit.radius)) applyDamage(unit, damage, playerId);
    }
    for (const missile of game.projectiles) {
      if (missile.kind !== STRATEGIC_MISSILE_KIND || missile.playerId === playerId || missile.alive === false || missile.life <= 0) continue;
      const dx = missile.x - x, dy = missile.y - y;
      if (dx * dx + dy * dy <= r2) damageStrategicMissile(missile, damage, playerId);
    }
  }

  function updateHomingAirProjectile(p, dt) {
    p.life -= dt;

    // Strategic missiles are projectile targets rather than aircraft. AA homing
    // missiles track them directly and cannot be diverted by aircraft flares or
    // Loyal Wingmen because there is no pilot/guidance logic to deceive here.
    if (p.targetProjectileId != null) {
      const target = findStrategicMissileById(p.targetProjectileId);
      if (!target || target.playerId === p.playerId) {
        if (p.kind === 'aaMissile') finishAAMissile(p);
        return 'remove';
      }
      const desired = normalize(target.x - p.x, target.y - p.y);
      const turn = clamp((p.turnRate || 5) * dt, 0, 1);
      p.vx = lerp(p.vx, desired.x * p.speed, turn);
      p.vy = lerp(p.vy, desired.y * p.speed, turn);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const d = Math.hypot(target.x - p.x, target.y - p.y);
      const proximityFuse = p.kind === 'aaMissile' && hasResearchCapability(p.playerId, 'advancedAAMissileFuse');
      if (proximityFuse && d <= MISSILE_BATTERY_BALANCE.aaProximityTriggerRadius) {
        p.life = 0;
        explodeAntiAirProximity(p.x, p.y, p.playerId, p.damage, MISSILE_BATTERY_BALANCE.aaProximityBlastRadius);
        finishAAMissile(p);
        return 'remove';
      }
      if (d <= 8) {
        p.life = 0;
        damageStrategicMissile(target, p.damage, p.playerId);
        pushEffect({ type: 'explosion', x: p.x, y: p.y, radius: 32, life: 0.35, maxLife: 0.35 });
        if (p.kind === 'aaMissile') finishAAMissile(p);
        return 'remove';
      }
      if (p.life <= 0 || p.x < -80 || p.y < -80 || p.x > WORLD.width + 80 || p.y > WORLD.height + 80) {
        if (p.kind === 'aaMissile') finishAAMissile(p);
        return 'remove';
      }
      return 'keep';
    }

    if (p.flareTarget && p.flareTarget.life <= 0) {
      p.flareTarget = null;
      if (p.resumeTargetId != null) p.targetId = p.resumeTargetId;
      p.resumeTargetId = null;
    }
    if (!p.flareTarget) {
      const flare = findClosestHostileFlareAtPoint(p.playerId, p.x, p.y, AIR_DOMINANCE_BALANCE.flareRetargetRadius);
      if (flare) {
        p.resumeTargetId = p.targetId;
        p.flareTarget = flare;
      }
    }

    if (!p.flareTarget) {
      const priorityWingman = findClosestEnemyWingmanAtPoint(p.playerId, p.x, p.y, DRONE_WARFARE_BALANCE.aaWingmanRetargetRadius);
      if (priorityWingman && p.targetId !== priorityWingman.id) {
        if (p.initialTargetId == null) p.initialTargetId = p.targetId;
        p.targetId = priorityWingman.id;
      }
      let current = findEntityById(p.targetId);
      if ((!current?.alive || current.playerId === p.playerId) && p.initialTargetId != null) {
        const original = findEntityById(p.initialTargetId);
        if (original?.alive && original.airborne && original.playerId !== p.playerId) p.targetId = original.id;
      }
    }

    const target = p.flareTarget || findEntityById(p.targetId);
    if (!p.flareTarget && (!target?.alive || !target.airborne || target.playerId === p.playerId)) {
      if (p.kind === 'aaMissile') finishAAMissile(p);
      return 'remove';
    }

    if (target && target.life !== 0) {
      const desired = normalize(target.x - p.x, target.y - p.y);
      const desiredVx = desired.x * p.speed;
      const desiredVy = desired.y * p.speed;
      const turn = clamp((p.turnRate || 5) * dt, 0, 1);
      p.vx = lerp(p.vx, desiredVx, turn);
      p.vy = lerp(p.vy, desiredVy, turn);
      if (!p.flareTarget && target?.airborne) markAircraftTargeted(target);
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const entityTarget = p.flareTarget ? null : findEntityById(p.targetId);
    if (entityTarget?.alive && entityTarget.airborne && entityTarget.playerId !== p.playerId) {
      const d = Math.hypot(entityTarget.x - p.x, entityTarget.y - p.y);
      const proximityFuse = p.kind === 'aaMissile' && hasResearchCapability(p.playerId, 'advancedAAMissileFuse');
      if (proximityFuse && d <= MISSILE_BATTERY_BALANCE.aaProximityTriggerRadius) {
        p.life = 0;
        explodeAntiAirProximity(p.x, p.y, p.playerId, p.damage, MISSILE_BATTERY_BALANCE.aaProximityBlastRadius);
        finishAAMissile(p);
        return 'remove';
      }
      if (d <= entityTarget.radius + 7) {
        p.life = 0;
        applyDamage(entityTarget, p.damage, p.playerId, 0);
        pushEffect({ type: 'explosion', x: p.x, y: p.y, radius: 32, life: 0.35, maxLife: 0.35 });
        if (p.kind === 'aaMissile') finishAAMissile(p);
        return 'remove';
      }
    }
    if (p.life <= 0 || p.x < -80 || p.y < -80 || p.x > WORLD.width + 80 || p.y > WORLD.height + 80) {
      if (p.kind === 'aaMissile') finishAAMissile(p);
      return 'remove';
    }
    return 'keep';
  }

  function updateProjectiles(dt) {
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
      const p = game.projectiles[i];
      if (p.kind === STRATEGIC_MISSILE_KIND) {
        if (updateStrategicMissile(p, dt) === 'remove') swapRemove(game.projectiles, i);
        continue;
      }
      if (p.kind === 'advancedGrenade' || p.kind === 'advancedRailgun' || p.kind === 'advancedShotgunPellet') {
        if (updateAdvancedInfantryProjectile(p, dt) === 'remove') swapRemove(game.projectiles, i);
        continue;
      }
      if (p.kind === 'wingmanMissile') {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (Math.hypot(p.targetX - p.x, p.targetY - p.y) <= 14 || p.life <= 0) {
          const target = findEnemyAtPoint(p.playerId, p.targetX, p.targetY, 40);
          if (target?.alive) applyDamage(target, p.damage, p.playerId, null, { airDelivered:true });
          pushEffect({ type: 'explosion', x: p.targetX, y: p.targetY, radius: 28, life: 0.32, maxLife: 0.32 });
          swapRemove(game.projectiles, i);
        }
        continue;
      }
      if (p.kind === 'flare') {
        // Flares are ballistic decoys, never homing projectiles. Keep their
        // launch vector immutable so no targeting/steering system can make a
        // flare curve back toward (or follow) its parent aircraft.
        p.life -= dt;
        p.vx = Number.isFinite(p.straightVx) ? p.straightVx : p.vx;
        p.vy = Number.isFinite(p.straightVy) ? p.straightVy : p.vy;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.life <= 0) swapRemove(game.projectiles, i);
        continue;
      }
      if (p.kind === 'aaMissile' || p.kind === 'fighterA2AMissile') {
        if (updateHomingAirProjectile(p, dt) === 'remove') swapRemove(game.projectiles, i);
        continue;
      }
      if (p.kind === 'fighterA2GMissile') {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (Math.hypot(p.targetX - p.x, p.targetY - p.y) <= 15 || p.life <= 0) {
          const intended = findEntityById(p.targetId);
          if (intended?.alive && intended.playerId !== p.playerId && !intended.airborne && Math.hypot(intended.x - p.targetX, intended.y - p.targetY) <= intended.radius + 18) {
            applyDamage(intended, p.damage, p.playerId, null, { airDelivered:true });
            explode(p.targetX, p.targetY, p.playerId, p.damage, p.aoe, 0, intended.id, { airDelivered:true });
          } else {
            explode(p.targetX, p.targetY, p.playerId, p.damage, p.aoe, null, null, { airDelivered:true });
          }
          swapRemove(game.projectiles, i);
        }
        continue;
      }
      if (p.kind === 'mortar') {
        p.progress += dt / p.duration;
        const t = clamp(p.progress, 0, 1);
        p.x = lerp(p.startX, p.targetX, t);
        p.y = lerp(p.startY, p.targetY, t);
        if (p.progress >= 1) {
          explode(p.targetX, p.targetY, p.playerId, p.damage, p.aoe, p.statusEffect, null, { armorPiercing: !!p.armorPiercing });
          swapRemove(game.projectiles, i);
        }
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      const target = findEntityById(p.targetId);
      if (!target || !target.alive || !Number.isFinite(target.hp) || target.hp <= 0) {
        swapRemove(game.projectiles, i);
        continue;
      }
      const hitRadius = target.radius + 8;
      if (Math.hypot(target.x - p.x, target.y - p.y) <= hitRadius) {
        if (p.aoe) {
          // A tracked explosive shell has directly hit its intended target. The
          // primary target must receive the weapon's full listed damage; only
          // nearby secondary targets use radial falloff. Excluding the primary
          // from the splash pass also prevents accidental double damage.
          applyDamage(target, p.damage, p.playerId, 0, { armorPiercing: !!p.armorPiercing });
          explode(p.x, p.y, p.playerId, p.damage, p.aoe, 0, target.id, { armorPiercing: !!p.armorPiercing });
        } else {
          applyDamage(target, p.damage, p.playerId, 0, { armorPiercing: !!p.armorPiercing });
        }
        swapRemove(game.projectiles, i);
      } else if (p.life <= 0 || p.x < 0 || p.y < 0 || p.x > WORLD.width || p.y > WORLD.height) {
        if (p.aoe && p.life <= 0) explode(p.x, p.y, p.playerId, p.damage, p.aoe, 0, null, { armorPiercing: !!p.armorPiercing });
        swapRemove(game.projectiles, i);
      }
    }
  }

  function findEntityById(id) {
    return game.entityById.get(id) || null;
  }

  function finishAAMissile(p) {
    if (!p?.launcherId) return;
    const launcher = game.entityById.get(p.launcherId);
    if (!launcher || (launcher.type !== 'airDefense' && launcher.type !== 'capital')) return;
    launcher.aaActiveMissiles = Math.max(0, (launcher.aaActiveMissiles || 0) - 1);
    if (launcher.type === 'airDefense' && launcher.aaActiveMissiles === 0) {
      launcher.nextAABatchAt = Math.max(launcher.nextAABatchAt || 0, game.time + 0.35);
    }
  }

  function findClosestEnemyStrategicMissile(entity, radius) {
    let best = null;
    let bestD2 = radius * radius;
    for (const missile of game.projectiles) {
      if (missile.kind !== STRATEGIC_MISSILE_KIND || missile.playerId === entity.playerId || missile.alive === false || missile.life <= 0) continue;
      const dx = missile.x - entity.x, dy = missile.y - entity.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = missile; }
    }
    return best;
  }

  function launchAAMissile(tower, target, offset) {
    if (game.projectiles.length >= MAX_PROJECTILES) return false;
    const def = BUILDINGS.airDefense;
    const dx = target.x - tower.x;
    const dy = target.y - tower.y;
    const n = normalize(dx, dy);
    const sideX = -n.y * offset;
    const sideY = n.x * offset;
    const targetIsMissile = target.kind === STRATEGIC_MISSILE_KIND;
    game.projectiles.push({
      kind: 'aaMissile', playerId: tower.playerId, launcherId: tower.id,
      x: tower.x + n.x * (tower.radius + 8) + sideX,
      y: tower.y + n.y * (tower.radius + 8) + sideY,
      vx: n.x * def.missileSpeed, vy: n.y * def.missileSpeed,
      speed: def.missileSpeed, turnRate: 5.2,
      targetId: targetIsMissile ? null : target.id,
      initialTargetId: targetIsMissile ? null : target.id,
      targetProjectileId: targetIsMissile ? target.id : null,
      damage: getEntityStat(tower, 'missileDamage', def.missileDamage) * (typeof getEnergyFieldAttackMultiplier === 'function' ? getEnergyFieldAttackMultiplier(tower) : 1), life: def.missileLife
    });
    tower.aaActiveMissiles = (tower.aaActiveMissiles || 0) + 1;
    return true;
  }

  function updateAirDefenseTower(tower) {
    if (tower.aaActiveMissiles > 0 || game.time < (tower.nextAABatchAt || 0)) return;
    if (game.time < tower.nextScan) return;
    tower.nextScan = game.time + 0.16 + (tower.id % 7) * 0.018;
    const range = getEntityStat(tower, 'range', BUILDINGS.airDefense.range);
    const aircraft = findClosestEnemyAircraft(tower, range);
    const missile = findClosestEnemyStrategicMissile(tower, range);
    let target = aircraft;
    if (!target) target = missile;
    else if (target.type !== 'loyalWingman' && missile) {
      const ad2 = (aircraft.x - tower.x) ** 2 + (aircraft.y - tower.y) ** 2;
      const md2 = (missile.x - tower.x) ** 2 + (missile.y - tower.y) ** 2;
      if (md2 < ad2) target = missile;
    }
    if (!target) return;
    launchAAMissile(tower, target, 7);
    launchAAMissile(tower, target, -7);
  }

  function updateCapitalEmergencyAA(capital) {
    if (!capital?.alive || capital.type !== 'capital') return;
    if ((capital.aaActiveMissiles || 0) > 0 || game.time < (capital.nextAABatchAt || 0)) return;
    if (game.time < (capital.nextScan || 0)) return;
    capital.nextScan = game.time + 0.18 + (capital.id % 5) * 0.016;
    const range = BUILDINGS.capital.emergencyAARange || CAPITAL_EMERGENCY_AA_RANGE;
    const target = findClosestEnemyAircraft(capital, range);
    if (!target) return;
    const offsets = [-12, -4, 4, 12];
    let launched = 0;
    for (let i = 0; i < (BUILDINGS.capital.emergencyAASalvo || CAPITAL_EMERGENCY_AA_SALVO); i++) {
      if (launchAAMissile(capital, target, offsets[i] ?? 0)) launched++;
    }
    if (launched > 0) capital.nextAABatchAt = game.time + (BUILDINGS.capital.emergencyAACooldown || CAPITAL_EMERGENCY_AA_COOLDOWN);
  }

  function updateBuildingCombat(dt) {
    for (const b of game.buildings) {
      if (!b.alive) continue;
      b.cooldown = Math.max(0, b.cooldown - dt);

      if (b.type === 'landmine') {
        if (game.time < b.nextScan) continue;
        b.nextScan = game.time + 0.10 + (b.id % 5) * 0.012;
        unitGrid.queryCircle(b.x, b.y, getEntityStat(b, 'triggerRange', BUILDINGS.landmine.triggerRange), queryScratchA);
        const victim = queryScratchA.find(u => u.alive && !u.airborne && !u.garrisoned && u.playerId !== b.playerId && !(typeof advancedInfantryIgnoresLandmines === 'function' && advancedInfantryIgnoresLandmines(u)));
        if (victim) {
          markEntityDead(b, false);
          explode(b.x, b.y, b.playerId, getEntityStat(b, 'damage', BUILDINGS.landmine.damage) * (typeof getEnergyFieldAttackMultiplier === 'function' ? getEnergyFieldAttackMultiplier(b) : 1), BUILDINGS.landmine.aoe, { id: 'stunned', duration: 0.35 });
        }
        continue;
      }

      if (b.type === 'capital') {
        updateCapitalEmergencyAA(b);
        continue;
      }

      if (b.type === 'airDefense') {
        updateAirDefenseTower(b);
        continue;
      }

      // Hive Turrets and Fortresses deploy hunters; they are not direct-fire
      // turrets. Restrict this branch to building types with a real weapon.
      if (b.type !== 'machineGun' && b.type !== 'cannon' && b.type !== 'mortar') continue;
      const def = BUILDINGS[b.type];
      if (!Number.isFinite(def.damage) || !def.range || b.cooldown > 0) continue;
      const target = findClosestEnemy(b, getEntityStat(b, 'range', def.range), true);
      if (!target) continue;
      const d = distance(b, target);
      if (def.minRange && d < def.minRange) continue;
      fireWeapon(b, target, def, 'building');
    }
  }

  function findClosestFriendlyAirbase(unit) {
    let best = null;
    let bestD2 = Infinity;
    for (const b of game.buildings) {
      if (!b.alive || b.playerId !== unit.playerId || b.type !== 'airbase') continue;
      // A bomber may always return to its already-reserved home slot. To transfer
      // to a different Airbase, that base must genuinely have an open airframe slot.
      const reservedHere = unit.homeAirbaseId === b.id;
      if (!reservedHere && getAirbaseAvailableSlots(b) <= 0) continue;
      const d2 = distSq(unit, b);
      if (d2 < bestD2) { bestD2 = d2; best = b; }
    }
    return best;
  }

  function updateBomber(unit, dt) {
    const def = UNITS.bomber;
    let goalX = unit.bombTargetX;
    let goalY = unit.bombTargetY;

    if (unit.airMissionState === 'returning' || unit.airMissionState === 'waitingForBase') {
      let base = findEntityById(unit.homeAirbaseId);
      if (!base?.alive || base.type !== 'airbase' || base.playerId !== unit.playerId) {
        base = findClosestFriendlyAirbase(unit);
        unit.homeAirbaseId = base?.id || null;
      }
      if (base) {
        unit.airMissionState = 'returning';
        goalX = base.x;
        goalY = base.y;
        if (Math.hypot(base.x - unit.x, base.y - unit.y) <= base.radius + 24) {
          storeLandedBomber(base, unit);
          return;
        }
      } else {
        unit.airMissionState = 'waitingForBase';
        const cap = game.players[unit.playerId]?.capital;
        if (cap?.alive) {
          const orbit = game.time * 0.45 + unit.id;
          goalX = cap.x + Math.cos(orbit) * 170;
          goalY = cap.y + Math.sin(orbit) * 170;
        } else {
          goalX = unit.x + Math.cos(unit.angle) * 180;
          goalY = unit.y + Math.sin(unit.angle) * 180;
        }
      }
    } else if (unit.airMissionState === 'outbound') {
      if (!hasStatus(unit, 'spoofed') && Math.hypot(unit.bombTargetX - unit.x, unit.bombTargetY - unit.y) <= 30) {
        const fieldMult = typeof getEnergyFieldAttackMultiplier === 'function' ? getEnergyFieldAttackMultiplier(unit) : 1;
        explode(unit.bombTargetX, unit.bombTargetY, unit.playerId, getEntityStat(unit, 'bombDamage', def.bombDamage) * fieldMult, def.bombAoe, 0, null, { airDelivered:true });
        pushEffect({ type: 'shockwave', x: unit.bombTargetX, y: unit.bombTargetY, radius: def.bombAoe * 1.35, life: 0.75, maxLife: 0.75 });
        unit.bombReleased = true;
        unit.airMissionState = 'returning';
        let base = findEntityById(unit.homeAirbaseId);
        if (!base?.alive) base = findClosestFriendlyAirbase(unit);
        if (base) { unit.homeAirbaseId = base.id; goalX = base.x; goalY = base.y; }
      }
    } else {
      unit.airMissionState = 'returning';
      const base = findClosestFriendlyAirbase(unit);
      if (base) { unit.homeAirbaseId = base.id; goalX = base.x; goalY = base.y; }
    }

    const bomberSpoofGoal = getSpoofedGoal(unit);
    if (bomberSpoofGoal) { goalX = bomberSpoofGoal.x; goalY = bomberSpoofGoal.y; }
    const desired = normalize(goalX - unit.x, goalY - unit.y);
    let steerX = desired.x;
    let steerY = desired.y;
    // Bombers deliberately jink away from hostile homing missiles. The steering
    // combines radial escape with a deterministic perpendicular break so an
    // aircraft does not simply flee straight down the missile's approach line.
    let checked = 0;
    for (const p of game.projectiles) {
      if (!isHomingAirProjectile(p) || p.playerId === unit.playerId || p.life <= 0 || p.flareTarget || p.targetId !== unit.id) continue;
      const dx = unit.x - p.x;
      const dy = unit.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 230 * 230 || d2 < 0.001) continue;
      const d = Math.sqrt(d2);
      const urgency = clamp((230 - d) / 190, 0, 1);
      const side = ((unit.id + (p.launcherId || 0)) & 1) ? 1 : -1;
      steerX += (dx / d) * urgency * 2.2 + (-dy / d) * side * urgency * 1.65;
      steerY += (dy / d) * urgency * 2.2 + (dx / d) * side * urgency * 1.65;
      if (++checked >= 6) break;
    }
    const n = normalize(steerX, steerY);
    const responsiveness = 1 - Math.pow(0.0008, dt);
    const hpRatio = clamp(unit.hp / Math.max(1, unit.maxHp || def.hp), 0, 1);
    const speedMultiplier = hpRatio < BOMBER_DAMAGED_HP_THRESHOLD ? BOMBER_DAMAGED_SPEED_MULTIPLIER : 1;
    const bomberSpeed = getEntityStat(unit, 'speed', def.speed) * speedMultiplier;
    unit.vx = lerp(unit.vx, n.x * bomberSpeed, responsiveness);
    unit.vy = lerp(unit.vy, n.y * bomberSpeed, responsiveness);
    unit.x = clamp(unit.x + unit.vx * dt, unit.radius, WORLD.width - unit.radius);
    unit.y = clamp(unit.y + unit.vy * dt, unit.radius, WORLD.height - unit.radius);
    if (Math.abs(unit.vx) + Math.abs(unit.vy) > 1) unit.angle = Math.atan2(unit.vy, unit.vx);
  }

  function angleDifference(a, b) {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
  }

  function moveAirUnitToward(unit, goalX, goalY, speed, dt) {
    const spoofGoal = getSpoofedGoal(unit);
    if (spoofGoal) { goalX = spoofGoal.x; goalY = spoofGoal.y; }
    const desired = normalize(goalX - unit.x, goalY - unit.y);
    let steerX = desired.x;
    let steerY = desired.y;
    let checked = 0;
    // Aircraft continue to jink while a homing projectile is truly locked on
    // them. Once a flare has pulled the projectile away, that missile no longer
    // contributes to the evasion vector.
    for (const p of game.projectiles) {
      if (!isHomingAirProjectile(p) || p.playerId === unit.playerId || p.life <= 0 || p.flareTarget || p.targetId !== unit.id) continue;
      const dx = unit.x - p.x;
      const dy = unit.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 230 * 230 || d2 < 0.001) continue;
      const d = Math.sqrt(d2);
      const urgency = clamp((230 - d) / 190, 0, 1);
      const side = ((unit.id + (p.launcherId || 0)) & 1) ? 1 : -1;
      steerX += (dx / d) * urgency * 2.2 + (-dy / d) * side * urgency * 1.65;
      steerY += (dy / d) * urgency * 2.2 + (dx / d) * side * urgency * 1.65;
      if (++checked >= 6) break;
    }
    const n = normalize(steerX, steerY);
    const responsiveness = 1 - Math.pow(0.0008, dt);
    unit.vx = lerp(unit.vx, n.x * speed, responsiveness);
    unit.vy = lerp(unit.vy, n.y * speed, responsiveness);
    unit.x = clamp(unit.x + unit.vx * dt, unit.radius, WORLD.width - unit.radius);
    unit.y = clamp(unit.y + unit.vy * dt, unit.radius, WORLD.height - unit.radius);
    if (Math.abs(unit.vx) + Math.abs(unit.vy) > 1) unit.angle = Math.atan2(unit.vy, unit.vx);
  }

  function getFighterAttackRange(unit) {
    const detection = getEntityStat(unit, 'detectionRange', AIR_DOMINANCE_BALANCE.fighterDetectionRange);
    return hasResearchCapability(unit.playerId, 'fighterDetectionRangeStrike')
      ? detection
      : getEntityStat(unit, 'range', AIR_DOMINANCE_BALANCE.fighterAttackRange);
  }

  function findFighterGroundStrikeTarget(unit) {
    const cx = unit.fighterMissionX;
    const cy = unit.fighterMissionY;
    const area = Number.isFinite(unit.fighterStrikeRadiusOverride) ? unit.fighterStrikeRadiusOverride : AIR_DOMINANCE_BALANCE.fighterStrikeRadius;
    let best = null;
    let bestD2 = Infinity;
    buildingGrid.queryCircle(cx, cy, area + 80, queryScratchB);
    for (const target of queryScratchB) {
      if (!isValidTarget(target, unit)) continue;
      const dc = Math.hypot(target.x - cx, target.y - cy);
      if (dc > area + target.radius) continue;
      const d2 = distSq(unit, target);
      if (d2 < bestD2) { bestD2 = d2; best = target; }
    }
    unitGrid.queryCircle(cx, cy, area + 36, queryScratchA);
    for (const target of queryScratchA) {
      if (!isValidTarget(target, unit) || target.airborne || target.parachuting) continue;
      const dc = Math.hypot(target.x - cx, target.y - cy);
      if (dc > area + target.radius) continue;
      const d2 = distSq(unit, target);
      if (d2 < bestD2) { bestD2 = d2; best = target; }
    }
    return best;
  }

  function findFighterPatrolTarget(unit) {
    const detection = getEntityStat(unit, 'detectionRange', AIR_DOMINANCE_BALANCE.fighterDetectionRange);
    const attackRange = getFighterAttackRange(unit);
    const patrolRadius = Number.isFinite(unit.fighterPatrolRadiusOverride) ? unit.fighterPatrolRadiusOverride : AIR_DOMINANCE_BALANCE.fighterPatrolRadius;
    let bestWingman = null;
    let bestWingmanD2 = detection * detection;
    let bestManned = null;
    let bestMannedD2 = detection * detection;
    unitGrid.queryCircle(unit.x, unit.y, detection, queryScratchA);
    for (const target of queryScratchA) {
      if (!target.alive || !target.airborne || target.parachuting || !entityHasTag(target, 'aircraft') || target.playerId === unit.playerId) continue;
      if (isAirStealthHidden(target, unit)) continue;
      const d2 = distSq(unit, target);
      // Patrol detection normally stays inside the 800-radius patrol zone. But
      // an aircraft already inside the Fighter's weapon range is an immediate
      // local threat and is engaged even if it sits just outside that zone.
      const inImmediateAttackRange = d2 <= attackRange * attackRange;
      if (!inImmediateAttackRange && Math.hypot(target.x - unit.fighterMissionX, target.y - unit.fighterMissionY) > patrolRadius) continue;
      if (target.type === 'loyalWingman') {
        if (d2 < bestWingmanD2) { bestWingmanD2 = d2; bestWingman = target; }
      } else if (d2 < bestMannedD2) {
        bestMannedD2 = d2; bestManned = target;
      }
    }
    return bestWingman || bestManned;
  }

  function chooseFighterPatrolWaypoint(unit) {
    const patrolRadius = Number.isFinite(unit.fighterPatrolRadiusOverride) ? unit.fighterPatrolRadiusOverride : AIR_DOMINANCE_BALANCE.fighterPatrolRadius;
    const angle = rand(0, Math.PI * 2);
    // Roam naturally across the patrol area instead of tracing a scripted
    // circular orbit. sqrt(random) distributes waypoints across the area.
    const radius = Math.sqrt(Math.random()) * patrolRadius * 0.88;
    unit.fighterPatrolX = clamp(unit.fighterMissionX + Math.cos(angle) * radius, unit.radius, WORLD.width - unit.radius);
    unit.fighterPatrolY = clamp(unit.fighterMissionY + Math.sin(angle) * radius, unit.radius, WORLD.height - unit.radius);
    return { x: unit.fighterPatrolX, y: unit.fighterPatrolY };
  }

  function countActiveFighterA2AMissiles(fighter, targetId) {
    let count = 0;
    for (const p of game.projectiles) {
      if (p.kind !== 'fighterA2AMissile' || p.life <= 0 || p.launcherId !== fighter.id) continue;
      if (p.initialTargetId === targetId) count++;
    }
    return count;
  }

  function launchFighterA2AMissile(unit, target) {
    if (hasStatus(unit, 'spoofed')) return false;
    if (!unit?.alive || unit.type !== 'superFighter' || !target?.alive || unit.fighterA2ARemaining <= 0 || unit.fighterMissileCooldown > 0 || game.projectiles.length >= MAX_PROJECTILES) return false;
    if (countActiveFighterA2AMissiles(unit, target.id) >= 2) return false;
    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const n = normalize(dx, dy);
    game.projectiles.push({
      kind: 'fighterA2AMissile', playerId: unit.playerId, launcherId: unit.id,
      x: unit.x + n.x * (unit.radius + 5), y: unit.y + n.y * (unit.radius + 5),
      vx: n.x * AIR_DOMINANCE_BALANCE.fighterA2ASpeed, vy: n.y * AIR_DOMINANCE_BALANCE.fighterA2ASpeed,
      speed: AIR_DOMINANCE_BALANCE.fighterA2ASpeed, turnRate: 6.4,
      targetId: target.id, initialTargetId: target.id,
      damage: getEntityStat(unit, 'airToAirMissileDamage', AIR_DOMINANCE_BALANCE.fighterA2ADamage) * (typeof getEnergyFieldAttackMultiplier === 'function' ? getEnergyFieldAttackMultiplier(unit) : 1), life: 5.0
    });
    unit.fighterA2ARemaining--;
    unit.payloadRemaining = Math.max(0, unit.fighterA2ARemaining + unit.fighterA2GRemaining);
    unit.fighterMissileCooldown = AIR_DOMINANCE_BALANCE.fighterLaunchInterval;
    unit.lastAttackAt = game.time;
    unit.fighterStealthed = false;
    markAircraftTargeted(target);
    pushEffect({ type: 'fighterLaunch', x: unit.x + n.x * (unit.radius + 5), y: unit.y + n.y * (unit.radius + 5), radius: 18, life: 0.18, maxLife: 0.18 });
    return true;
  }

  function launchFighterA2GMissile(unit, target) {
    if (hasStatus(unit, 'spoofed')) return false;
    if (!unit?.alive || unit.type !== 'superFighter' || !target?.alive || target.airborne || unit.fighterA2GRemaining <= 0 || unit.fighterMissileCooldown > 0 || game.projectiles.length >= MAX_PROJECTILES) return false;
    const targetX = target.x;
    const targetY = target.y;
    const dx = targetX - unit.x;
    const dy = targetY - unit.y;
    const n = normalize(dx, dy);
    const speed = AIR_DOMINANCE_BALANCE.fighterA2GSpeed;
    const d = Math.hypot(dx, dy);
    game.projectiles.push({
      kind: 'fighterA2GMissile', playerId: unit.playerId, launcherId: unit.id,
      x: unit.x + n.x * (unit.radius + 5), y: unit.y + n.y * (unit.radius + 5),
      vx: n.x * speed, vy: n.y * speed, speed,
      targetId: target.id, targetX, targetY,
      damage: getEntityStat(unit, 'airToGroundMissileDamage', AIR_DOMINANCE_BALANCE.fighterA2GDamage) * (typeof getEnergyFieldAttackMultiplier === 'function' ? getEnergyFieldAttackMultiplier(unit) : 1),
      aoe: AIR_DOMINANCE_BALANCE.fighterA2GAoe,
      life: Math.max(0.3, d / speed + 0.45)
    });
    unit.fighterA2GRemaining--;
    unit.payloadRemaining = Math.max(0, unit.fighterA2ARemaining + unit.fighterA2GRemaining);
    unit.fighterMissileCooldown = AIR_DOMINANCE_BALANCE.fighterLaunchInterval;
    unit.lastAttackAt = game.time;
    unit.fighterStealthed = false;
    pushEffect({ type: 'fighterLaunch', x: unit.x + n.x * (unit.radius + 5), y: unit.y + n.y * (unit.radius + 5), radius: 20, life: 0.18, maxLife: 0.18 });
    return true;
  }

  function updateFighterReactiveStealth(unit) {
    if (!isResearchComplete(unit.playerId, 'adStealthFighter')) {
      unit.fighterStealthed = false;
      return;
    }
    const lastExposure = Math.max(unit.lastAttackAt || -99, unit.lastTargetedAt || -99);
    unit.fighterStealthed = game.time - lastExposure >= 2;
  }

  function updateSuperFighter(unit, dt) {
    unit.fighterMissileCooldown = Math.max(0, (unit.fighterMissileCooldown || 0) - dt);
    unit.enduranceRemaining = Math.max(0, (Number.isFinite(unit.enduranceRemaining) ? unit.enduranceRemaining : getEntityStat(unit, 'endurance', AIR_DOMINANCE_BALANCE.fighterEndurance)) - dt);
    updateAircraftFlareDefense(unit, dt);
    updateFighterReactiveStealth(unit);
    if (unit.enduranceRemaining <= 0) {
      destroyEntity(unit, unit.playerId);
      return;
    }

    let base = findEntityById(unit.homeAirbaseId);
    if (!base?.alive || base.type !== 'airbase' || base.playerId !== unit.playerId) {
      base = findClosestFriendlyAirbase(unit);
      unit.homeAirbaseId = base?.id || null;
    }
    const speed = getEntityStat(unit, 'speed', AIR_DOMINANCE_BALANCE.fighterSpeed);
    const spoofGoal = getSpoofedGoal(unit);
    if (spoofGoal) {
      moveAirUnitToward(unit, spoofGoal.x, spoofGoal.y, speed, dt);
      return;
    }
    const distanceHome = base ? distance(unit, base) : Infinity;
    const returnNeed = base ? distanceHome / Math.max(1, speed) + 3 : Infinity;
    if (base && unit.enduranceRemaining <= returnNeed && unit.airMissionState !== 'returning') {
      unit.airMissionState = 'returning';
      unit.fighterReturnReason = 'endurance';
    }
    if (unit.fighterA2ARemaining <= 0 && unit.fighterA2GRemaining <= 0 && unit.airMissionState !== 'returning') {
      unit.airMissionState = 'returning';
      unit.fighterReturnReason = 'payload';
    }

    // A Fighter that left because its destruction area was temporarily clear can
    // turn back if fresh ground targets enter that 75-radius area and it still has
    // A2G payload/endurance. Endurance/payload RTB is never cancelled.
    if (unit.airMissionState === 'returning' && unit.fighterReturnReason === 'areaClear' && unit.fighterA2GRemaining > 0 && unit.enduranceRemaining > returnNeed + 2) {
      if (findFighterGroundStrikeTarget(unit)) {
        unit.airMissionState = 'fighterStrike';
        unit.fighterReturnReason = null;
      }
    }

    let goalX = unit.fighterMissionX;
    let goalY = unit.fighterMissionY;
    if (unit.airMissionState === 'returning' || unit.airMissionState === 'waitingForBase') {
      if (base) {
        unit.airMissionState = 'returning';
        goalX = base.x; goalY = base.y;
        if (distance(unit, base) <= base.radius + 22) {
          storeLandedAircraft(base, unit, 0);
          return;
        }
      } else {
        unit.airMissionState = 'waitingForBase';
        const cap = game.players[unit.playerId]?.capital;
        if (cap?.alive) {
          const a = game.time * 0.42 + unit.id;
          goalX = cap.x + Math.cos(a) * 190;
          goalY = cap.y + Math.sin(a) * 190;
        }
      }
      moveAirUnitToward(unit, goalX, goalY, speed, dt);
      return;
    }

    const attackRange = getFighterAttackRange(unit);

    // Ground strike takes priority only while there is an actual ground target
    // inside the 75-radius destruction area. If that area is clear but A2A
    // payload remains, the Fighter stays on station and patrols instead of
    // immediately returning home. If a new ground target later enters the area,
    // remaining A2G payload immediately pulls it back into strike mode.
    let groundTarget = unit.fighterA2GRemaining > 0 ? findFighterGroundStrikeTarget(unit) : null;
    if (groundTarget) {
      unit.airMissionState = 'fighterStrike';
      unit.fighterReturnReason = null;
    } else if (unit.fighterA2ARemaining > 0) {
      unit.airMissionState = 'fighterPatrol';
      unit.fighterReturnReason = null;
    } else if (unit.fighterA2GRemaining > 0) {
      unit.airMissionState = 'returning';
      unit.fighterReturnReason = 'areaClear';
      if (base) { goalX = base.x; goalY = base.y; }
      moveAirUnitToward(unit, goalX, goalY, speed, dt);
      return;
    }

    if (unit.airMissionState === 'fighterStrike') {
      // A2A missiles are homing, so a detected aircraft already inside attack
      // range can be engaged immediately even while the Fighter continues its
      // A2G mission. No nose-alignment gate is required for A2A launch.
      if (unit.fighterA2ARemaining > 0 && unit.fighterMissileCooldown <= 0) {
        const airTarget = findClosestEnemyAircraft(unit, attackRange);
        if (airTarget && distance(unit, airTarget) <= attackRange) launchFighterA2AMissile(unit, airTarget);
      }

      // groundTarget was resolved above; the mission cannot be in fighterStrike
      // without one, but keep this defensive fallback for state robustness.
      groundTarget ||= findFighterGroundStrikeTarget(unit);
      if (!groundTarget) {
        if (unit.fighterA2ARemaining > 0) {
          unit.airMissionState = 'fighterPatrol';
        } else {
          unit.airMissionState = 'returning';
          unit.fighterReturnReason = 'areaClear';
          if (base) { goalX = base.x; goalY = base.y; }
          moveAirUnitToward(unit, goalX, goalY, speed, dt);
          return;
        }
      } else {
        goalX = groundTarget.x; goalY = groundTarget.y;
        const d = distance(unit, groundTarget);
        const targetAngle = Math.atan2(groundTarget.y - unit.y, groundTarget.x - unit.x);
        if (d <= attackRange && unit.fighterMissileCooldown <= 0 && Math.abs(angleDifference(targetAngle, unit.angle)) <= AIR_DOMINANCE_BALANCE.fighterFacingTolerance) {
          launchFighterA2GMissile(unit, groundTarget);
        }
      }
    }

    if (unit.airMissionState === 'fighterPatrol') {
      if (unit.fighterA2ARemaining <= 0) {
        // If A2G remains but the strike area is still clear, there is no useful
        // mission left. Otherwise the ordinary empty-payload rule handles RTB.
        unit.airMissionState = 'returning';
        unit.fighterReturnReason = unit.fighterA2GRemaining > 0 ? 'areaClear' : 'payload';
        if (base) { goalX = base.x; goalY = base.y; }
      } else {
        const target = findFighterPatrolTarget(unit);
        if (target) {
          goalX = target.x; goalY = target.y;
          const d = distance(unit, target);
          if (d <= attackRange && unit.fighterMissileCooldown <= 0) {
            launchFighterA2AMissile(unit, target);
          }
        } else {
          // Simple free roaming: choose a waypoint somewhere inside the 800
          // patrol area, fly to it, then choose another. No rigid orbit.
          const invalidWaypoint = !Number.isFinite(unit.fighterPatrolX) || !Number.isFinite(unit.fighterPatrolY);
          const reachedWaypoint = !invalidWaypoint && Math.hypot(unit.fighterPatrolX - unit.x, unit.fighterPatrolY - unit.y) <= 70;
          const outsidePatrol = !invalidWaypoint && Math.hypot(unit.fighterPatrolX - unit.fighterMissionX, unit.fighterPatrolY - unit.fighterMissionY) > (Number.isFinite(unit.fighterPatrolRadiusOverride) ? unit.fighterPatrolRadiusOverride : AIR_DOMINANCE_BALANCE.fighterPatrolRadius);
          if (invalidWaypoint || reachedWaypoint || outsidePatrol) chooseFighterPatrolWaypoint(unit);
          goalX = unit.fighterPatrolX;
          goalY = unit.fighterPatrolY;
        }
      }
    }
    moveAirUnitToward(unit, goalX, goalY, speed, dt);
  }

  function dropParatroopers(unit, emergency = false) {
    if (!unit?.alive || unit.type !== 'paratrooperPlane' || !unit.cargoRecords?.length) return 0;
    const cargo = unit.cargoRecords.splice(0);
    let dropped = 0;
    for (let i = 0; i < cargo.length; i++) {
      const record = cargo[i];
      const angle = (i / Math.max(1, cargo.length)) * Math.PI * 2 + unit.angle;
      const soldier = createUnitFromRecord(record,
        clamp(unit.x + Math.cos(angle) * (12 + (i % 3) * 5), 8, WORLD.width - 8),
        clamp(unit.y + Math.sin(angle) * (12 + (i % 3) * 5), 8, WORLD.height - 8), {
          airborne: true,
          parachuting: true,
          parachuteLandAt: game.time + AIR_DOMINANCE_BALANCE.paratrooperDropSeconds,
          parachuteDriftX: Math.cos(angle) * 12,
          parachuteDriftY: Math.sin(angle) * 12,
          parachuteDestinationX: unit.paratrooperMissionX,
          parachuteDestinationY: unit.paratrooperMissionY,
          parachuteAssaultOnLanding: !emergency,
          target: null,
          hasOrder: false
        });
      if (soldier) dropped++;
      else addToCapitalReserve(unit.playerId, record, 'militaryBase');
    }
    unit.passengersDropped += dropped;
    unit.payloadRemaining = 0;
    unit.airMissionState = 'returning';
    unit.paratrooperReturnReason = emergency ? 'emergencyDrop' : 'payload';
    if (unit.playerId === PLAYER_ID && dropped) notify(`${emergency ? 'Emergency drop' : 'Paratroopers deployed'} — ${dropped} soldier${dropped === 1 ? '' : 's'} descending.`, emergency ? 'warning' : 'good', 2.8);
    return dropped;
  }

  function updateParachutingTroop(unit, dt) {
    unit.target = null;
    unit.hasOrder = false;
    unit.vx = unit.parachuteDriftX || 0;
    unit.vy = unit.parachuteDriftY || 0;
    unit.x = clamp(unit.x + unit.vx * dt, unit.radius, WORLD.width - unit.radius);
    unit.y = clamp(unit.y + unit.vy * dt, unit.radius, WORLD.height - unit.radius);
    if (game.time + 1e-9 < (unit.parachuteLandAt || 0)) return;
    unit.parachuting = false;
    unit.airborne = false;
    unit.vx = 0; unit.vy = 0;
    unit.stealthUntilAttack = true;
    unit.orderX = Number.isFinite(unit.parachuteDestinationX) ? unit.parachuteDestinationX : unit.x;
    unit.orderY = Number.isFinite(unit.parachuteDestinationY) ? unit.parachuteDestinationY : unit.y;
    if (unit.parachuteAssaultOnLanding) {
      applyAssaultZone(unit, unit.orderX, unit.orderY);
    } else {
      unit.hasOrder = Math.hypot(unit.orderX - unit.x, unit.orderY - unit.y) > 20;
      unit.transportReleaseOrder = unit.hasOrder;
    }
    unit.parachuteAssaultOnLanding = false;
  }

  function updateParatrooperPlane(unit, dt) {
    unit.enduranceRemaining = Math.max(0, (Number.isFinite(unit.enduranceRemaining) ? unit.enduranceRemaining : AIR_DOMINANCE_BALANCE.paratrooperEndurance) - dt);
    updateAircraftFlareDefense(unit, dt);
    if (unit.enduranceRemaining <= 0) {
      destroyEntity(unit, unit.playerId);
      return;
    }
    if (unit.cargoRecords?.length && unit.hp / Math.max(1, unit.maxHp) < 0.40) dropParatroopers(unit, true);

    let base = findEntityById(unit.homeAirbaseId);
    if (!base?.alive || base.type !== 'airbase' || base.playerId !== unit.playerId) {
      base = findClosestFriendlyAirbase(unit);
      unit.homeAirbaseId = base?.id || null;
    }
    const speed = getEntityStat(unit, 'speed', AIR_DOMINANCE_BALANCE.paratrooperSpeed);
    const spoofGoal = getSpoofedGoal(unit);
    if (spoofGoal) {
      moveAirUnitToward(unit, spoofGoal.x, spoofGoal.y, speed, dt);
      return;
    }
    const distanceHome = base ? distance(unit, base) : Infinity;
    const returnNeed = base ? distanceHome / Math.max(1, speed) + 3 : Infinity;
    if (base && unit.enduranceRemaining <= returnNeed && unit.airMissionState !== 'returning') {
      unit.airMissionState = 'returning';
      unit.paratrooperReturnReason = 'endurance';
    }

    let goalX = unit.paratrooperMissionX;
    let goalY = unit.paratrooperMissionY;
    if (unit.airMissionState === 'outbound' && unit.cargoRecords?.length) {
      if (Math.hypot(unit.paratrooperMissionX - unit.x, unit.paratrooperMissionY - unit.y) <= 28) {
        dropParatroopers(unit, false);
      }
    } else if (unit.airMissionState !== 'returning' && unit.airMissionState !== 'waitingForBase') {
      unit.airMissionState = 'returning';
      unit.paratrooperReturnReason ||= 'payload';
    }

    if (unit.airMissionState === 'returning' || unit.airMissionState === 'waitingForBase') {
      if (base) {
        unit.airMissionState = 'returning';
        goalX = base.x; goalY = base.y;
        if (distance(unit, base) <= base.radius + 22) {
          storeLandedAircraft(base, unit, unit.passengersDropped || 0);
          return;
        }
      } else {
        unit.airMissionState = 'waitingForBase';
        const cap = game.players[unit.playerId]?.capital;
        if (cap?.alive) {
          const a = game.time * 0.38 + unit.id;
          goalX = cap.x + Math.cos(a) * 180;
          goalY = cap.y + Math.sin(a) * 180;
        }
      }
    }
    moveAirUnitToward(unit, goalX, goalY, speed, dt);
  }

