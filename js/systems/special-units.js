'use strict';

  function updateFortressBuilder(unit, fortress, dt) {
    if (!fortress?.alive || fortress.type !== 'fortress' || fortress.constructionState === 'operational') {
      unit.fortressBuilderSiteId = null;
      unit.fortressBuilderArrived = false;
      unit.hasOrder = false;
      return false;
    }
    unit.target = null;
    const slot = Math.max(0, unit.fortressBuilderSlot || 0);
    const angle = slot / 10 * Math.PI * 2;
    const goalX = fortress.x + Math.cos(angle) * (fortress.radius + 30);
    const goalY = fortress.y + Math.sin(angle) * (fortress.radius + 30);
    const d = Math.hypot(goalX - unit.x, goalY - unit.y);
    if (d <= 18) {
      unit.fortressBuilderArrived = true;
      unit.hasOrder = false;
      unit.vx *= 0.45;
      unit.vy *= 0.45;
    } else {
      unit.fortressBuilderArrived = false;
      unit.orderX = goalX;
      unit.orderY = goalY;
      unit.hasOrder = true;
      moveUnit(unit, goalX, goalY, getEntityStat(unit, 'speed', UNITS[unit.type].speed), dt);
    }
    return true;
  }

  function releaseFortressGarrison(fortress) {
    const ids = [...(fortress.garrisonIds || []), ...(fortress.builderIds || [])];
    for (const id of fortress.engineerBuilderIds || []) {
      const engineer = game.entityById.get(id);
      if (!engineer?.alive || engineer.type !== 'advancedEngineer') continue;
      if (engineer.engineerTargetId === fortress.id) engineer.engineerTargetId = null;
      engineer.engineerMode = 'search';
    }
    let i = 0;
    for (const id of ids) {
      const unit = game.entityById.get(id);
      if (!unit?.alive) continue;
      unit.parentFortressId = null;
      unit.fortressBuilderSiteId = null;
      unit.fortressBuilderArrived = false;
      unit.garrisoned = false;
      unit.lifecycleState = LIFECYCLE_STATES.ACTIVE;
      unit.target = null;
      unit.hasOrder = false;
      if (Math.hypot(unit.x - fortress.x, unit.y - fortress.y) < fortress.radius + 8) {
        const a = i++ / Math.max(1, ids.length) * Math.PI * 2;
        unit.x = fortress.x + Math.cos(a) * (fortress.radius + unit.radius + 8);
        unit.y = fortress.y + Math.sin(a) * (fortress.radius + unit.radius + 8);
      }
    }
    fortress.garrisonIds = [];
    fortress.builderIds = [];
    fortress.engineerBuilderIds = [];
  }

  function updateFortresses(dt) {
    for (const fort of game.buildings) {
      if (!fort.alive || fort.type !== 'fortress') continue;
      if (fort.constructionState !== 'operational') {
        fort.builderIds = (fort.builderIds || []).filter(id => game.entityById.get(id)?.alive);
        fort.engineerBuilderIds = (fort.engineerBuilderIds || []).filter(id => {
          const unit = game.entityById.get(id);
          return unit?.alive && unit.type === 'advancedEngineer' && unit.engineerTargetId === fort.id;
        });
        if (fort.allowGarrisonConstruction !== false && fort.builderIds.length < 10) dispatchFortressBuilders(fort, 10 - fort.builderIds.length);
        // Reindex conventional construction-garrison slots after casualties.
        for (let i = 0; i < fort.builderIds.length; i++) {
          const u = game.entityById.get(fort.builderIds[i]);
          if (u?.alive) u.fortressBuilderSlot = i;
        }
        const builders = fort.builderIds.map(id => game.entityById.get(id)).filter(u => u?.alive);
        const allArrived = fort.allowGarrisonConstruction !== false && builders.length === 10 && builders.every(u => u.fortressBuilderArrived);
        const engineerWorking = fort.engineerBuilderIds.some(id => {
          const unit = game.entityById.get(id);
          return unit?.alive && distance(unit, fort) <= fort.radius + unit.radius + 12;
        });
        fort.constructionState = (allArrived || engineerWorking) ? 'building' : 'mobilizing';
        // Ten conventional infantry complete the site in 20 seconds (5%/s).
        // Advanced Engineers add their own 2%/s in updateAdvancedEngineerUnit().
        if (allArrived) fort.constructionProgress = Math.min(20, (fort.constructionProgress || 0) + dt);
        if ((fort.constructionProgress || 0) >= 20) {
          fort.constructionState = 'operational';
          fort.constructionProgress = 20;
          fort.hp = fort.maxHp = BUILDINGS.fortress.hp;
          fort.garrisonIds = allArrived ? builders.map(u => u.id) : [];
          fort.builderIds = [];
          for (let i = 0; i < builders.length; i++) {
            const u = builders[i];
            u.fortressBuilderSiteId = null;
            u.fortressBuilderArrived = false;
            u.target = null;
            u.hasOrder = false;
            if (allArrived) {
              u.parentFortressId = fort.id;
              u.fortressPatrolIndex = i;
              u.garrisoned = true;
              u.lifecycleState = LIFECYCLE_STATES.GARRISONED;
              u.vx = 0; u.vy = 0;
              u.x = fort.x; u.y = fort.y;
            }
          }
          for (const id of fort.engineerBuilderIds) {
            const engineer = game.entityById.get(id);
            if (!engineer?.alive || engineer.type !== 'advancedEngineer') continue;
            engineer.engineerTargetId = null;
            engineer.engineerMode = 'search';
          }
          fort.engineerBuilderIds = [];
          game.buildingGridDirty = true;
          if (fort.playerId === PLAYER_ID) {
            notify(allArrived ? 'Fortress completed. Garrison online and local construction radius established.' : 'Fortress completed by Advanced Engineers. Local construction radius established.', 'good', 4.5);
            refreshBuildButtons();
            if (game.selected === fort) renderSelectionPanel();
          }
        }
        continue;
      }

      fort.garrisonIds = (fort.garrisonIds || []).filter(id => game.entityById.get(id)?.alive);
      if (game.time >= fort.nextScan) {
        const enemy = findClosestEnemy(fort, getEntityStat(fort, 'range', BUILDINGS.fortress.range), true);
        fort.fortressTargetId = enemy?.id || null;
        fort.nextScan = game.time + 0.20 + (fort.id % 9) * 0.018;
        for (let i = 0; i < fort.garrisonIds.length; i++) {
          const u = game.entityById.get(fort.garrisonIds[i]);
          if (!u?.alive) continue;
          if (enemy) {
            if (u.garrisoned) {
              const a = i / Math.max(1, fort.garrisonIds.length) * Math.PI * 2;
              u.garrisoned = false;
              u.lifecycleState = LIFECYCLE_STATES.ACTIVE;
              u.x = fort.x + Math.cos(a) * (fort.radius + u.radius + 10);
              u.y = fort.y + Math.sin(a) * (fort.radius + u.radius + 10);
            }
            u.target = enemy;
            u.orderX = enemy.x;
            u.orderY = enemy.y;
            u.hasOrder = true;
          } else {
            u.target = null;
            if (!u.garrisoned) {
              const a = i / Math.max(1, fort.garrisonIds.length) * Math.PI * 2 + fort.id * 0.11;
              u.orderX = fort.x + Math.cos(a) * (fort.radius + u.radius + 58);
              u.orderY = fort.y + Math.sin(a) * (fort.radius + u.radius + 58);
              u.hasOrder = true;
            }
          }
        }
      }
    }
  }

  function findNearestFortressConstructionSite(unit) {
    let best = null;
    let bestD2 = Infinity;
    for (const building of game.buildings) {
      if (!building.alive || building.playerId !== unit.playerId || building.type !== 'fortress' || building.constructionState === 'operational') continue;
      const d2 = distSq(unit, building);
      if (d2 < bestD2) { bestD2 = d2; best = building; }
    }
    return best;
  }

  function findNearestDamagedFriendlyBuilding(unit) {
    let best = null;
    let bestD2 = Infinity;
    for (const building of game.buildings) {
      if (!building.alive || building.playerId !== unit.playerId || building.type === 'landmine') continue;
      if (building.type === 'fortress' && building.constructionState !== 'operational') continue;
      if (building.hp >= building.maxHp - 0.5) continue;
      const d2 = distSq(unit, building);
      if (d2 < bestD2) { bestD2 = d2; best = building; }
    }
    return best;
  }

  function findNearestEngineeringComplex(unit) {
    let best = null;
    let bestD2 = Infinity;
    for (const building of game.buildings) {
      if (!building.alive || building.playerId !== unit.playerId || building.type !== 'advancedEngineeringComplex') continue;
      const d2 = distSq(unit, building);
      if (d2 < bestD2) { bestD2 = d2; best = building; }
    }
    return best;
  }

  function getEngineerAutoOUTarget(unit, complex) {
    if (!complex?.alive || !complex.engineerAutoOUEnabled || !hasResearchCapability(unit.playerId, 'engineerAutoOU')) return null;
    const player = game.players[unit.playerId];
    if (!player?.alive) return null;
    const priority = complex.engineerOUPriority === 'functional' ? 'functional' : 'defense';
    let best = null;
    let bestRank = Infinity;
    let bestD2 = Infinity;
    for (const building of game.buildings) {
      if (!building.alive || building.playerId !== unit.playerId || building.type === 'capital' || building.type === 'landmine') continue;
      const check = canApplyBuildingOnsiteUpgrade(building, { engineerId: unit.id });
      if (!check.ok || player.money < check.cost) continue;
      const combat = isCombatBuilding(building);
      const rank = priority === 'defense' ? (combat ? 0 : 1) : (combat ? 1 : 0);
      const d2 = distSq(unit, building);
      if (rank < bestRank || (rank === bestRank && d2 < bestD2)) {
        best = building; bestRank = rank; bestD2 = d2;
      }
    }
    return best;
  }

  function clearEngineerOUJob(unit, refund = false) {
    if (!unit || unit.type !== 'advancedEngineer') return;
    const target = unit.engineerOUTargetId ? game.entityById.get(unit.engineerOUTargetId) : null;
    if (target?.ouReservedBy === unit.id) target.ouReservedBy = null;
    if (refund && Number.isFinite(unit.engineerOUPaid) && unit.engineerOUPaid > 0) {
      const player = game.players[unit.playerId];
      if (player?.alive) player.money += unit.engineerOUPaid;
    }
    unit.engineerOUPaid = 0;
    unit.engineerOUWorkProgress = 0;
    unit.engineerOUTargetId = null;
  }

  function dockAdvancedEngineer(unit, complex, exhausted = false) {
    if (!unit?.alive || unit.type !== 'advancedEngineer') return false;
    clearEngineerOUJob(unit, true);
    const readyAt = exhausted ? game.time + getEngineerRestDuration(unit.playerId) : 0;
    const record = recordFromUnit(unit, exhausted ? LIFECYCLE_STATES.TURNAROUND : LIFECYCLE_STATES.STORED, {
      readyAt,
      originFacilityType: 'advancedEngineeringComplex'
    });
    if (!record) return false;
    markEntityDead(unit, false, exhausted ? LIFECYCLE_STATES.TURNAROUND : LIFECYCLE_STATES.STORED);
    record.hp = record.maxHp = getDefinitionPlayerStat(record.playerId, 'unit', 'advancedEngineer', 'hp', UNITS.advancedEngineer.hp);
    if (complex?.alive && complex.type === 'advancedEngineeringComplex' && storeEngineerRecord(complex, record, readyAt)) return true;
    return addToCapitalReserve(record.playerId, record, 'advancedEngineeringComplex');
  }

  function dispatchAdvancedEngineer(complex, recordIndex) {
    if (!complex?.alive || complex.type !== 'advancedEngineeringComplex') return null;
    complex.engineerBay ||= [];
    const record = complex.engineerBay[recordIndex];
    if (!record || (record.readyAt || 0) > game.time || game.liveEntityCount >= MAX_ENTITIES) return null;
    complex.engineerBay.splice(recordIndex, 1);
    const angle = (record.instanceId * 0.61803398875 % 1) * Math.PI * 2;
    const unit = createUnitFromRecord(record,
      complex.x + Math.cos(angle) * (complex.radius + 18),
      complex.y + Math.sin(angle) * (complex.radius + 18), {
        homeComplexId: complex.id,
        engineerMode: 'search',
        engineerTargetId: null,
        engineerOUTargetId: null,
        engineerOUWorkProgress: 0,
        engineerOUPaid: 0,
        engineerEnduranceRemaining: getEngineerEndurance(complex.playerId),
        engineerExhausted: false
      });
    return unit;
  }

  function updateEngineeringComplexes(dt) {
    for (const complex of game.buildings) {
      if (!complex.alive || complex.type !== 'advancedEngineeringComplex') continue;
      complex.engineerBay ||= [];
      const capacity = getEngineeringComplexCapacity(complex);
      complex.engineerDesiredCount = clamp(Math.floor(Number(complex.engineerDesiredCount) || 0), 0, capacity);

      if (hasResearchCapability(complex.playerId, 'engineerAutoReplenishment') && complex.engineerDesiredCount > 0 && game.time >= (complex.nextEngineerAutoTrainAt || 0)) {
        const missing = Math.max(0, complex.engineerDesiredCount - getEngineeringComplexCommitment(complex));
        if (missing > 0) queueEngineerTraining(complex, missing, { silent: true });
        complex.nextEngineerAutoTrainAt = game.time + 1;
      }

      // Hosted Engineers only leave when there is actual work. With no repair or
      // permitted auto-OU target they remain safely inside the Complex.
      for (let i = complex.engineerBay.length - 1; i >= 0; i--) {
        const record = complex.engineerBay[i];
        if ((record.readyAt || 0) > game.time) continue;
        const probe = { x: complex.x, y: complex.y, playerId: complex.playerId, id: -1, type: 'advancedEngineer' };
        const fortressSite = findNearestFortressConstructionSite(probe);
        const damaged = !fortressSite ? findNearestDamagedFriendlyBuilding(probe) : null;
        const autoOUTarget = !fortressSite && !damaged && complex.engineerAutoOUEnabled && hasResearchCapability(complex.playerId, 'engineerAutoOU') ? getEngineerAutoOUTarget(probe, complex) : null;
        if (!fortressSite && !damaged && !autoOUTarget) continue;
        const unit = dispatchAdvancedEngineer(complex, i);
        if (!unit) continue;
        if (fortressSite) { unit.engineerTargetId = fortressSite.id; unit.engineerMode = 'fortressConstruction'; }
        else if (damaged) unit.engineerTargetId = damaged.id;
        else if (autoOUTarget) unit.engineerOUTargetId = autoOUTarget.id;
      }
    }
  }

  function beginEngineerOUJob(unit, target) {
    if (!unit?.alive || !target?.alive || unit.type !== 'advancedEngineer') return false;
    const check = canApplyBuildingOnsiteUpgrade(target, { engineerId: unit.id });
    const player = game.players[unit.playerId];
    if (!check.ok || !player?.alive || player.money < check.cost) return false;
    player.money -= check.cost;
    target.ouReservedBy = unit.id;
    unit.engineerOUTargetId = target.id;
    unit.engineerOUPaid = check.cost;
    unit.engineerOUWorkProgress = 0;
    unit.engineerMode = 'ouWorking';
    unit.hasOrder = false;
    unit.vx = 0; unit.vy = 0;
    return true;
  }

  function completeEngineerOUJob(unit) {
    const target = unit.engineerOUTargetId ? game.entityById.get(unit.engineerOUTargetId) : null;
    const paid = Number(unit.engineerOUPaid) || 0;
    if (!target?.alive || target.ouReservedBy !== unit.id) {
      clearEngineerOUJob(unit, true);
      unit.engineerMode = 'search';
      return false;
    }
    target.ouReservedBy = null;
    const result = commitBuildingOnsiteUpgrade(target, paid);
    unit.engineerOUPaid = 0;
    unit.engineerOUWorkProgress = 0;
    unit.engineerOUTargetId = null;
    unit.engineerMode = 'search';
    if (target.playerId === PLAYER_ID && result.ok) notify(`${BUILDINGS[target.type].name} automatically upgraded to OU ${result.level}.`, 'good', 2.2);
    return !!result.ok;
  }

  function updateAdvancedEngineerUnit(unit, dt) {
    let complex = game.entityById.get(unit.homeComplexId);
    if (!complex?.alive || complex.type !== 'advancedEngineeringComplex' || complex.playerId !== unit.playerId) {
      complex = findNearestEngineeringComplex(unit);
      if (complex) unit.homeComplexId = complex.id;
      else {
        clearEngineerOUJob(unit, true);
        deactivateUnitToReserve(unit, 'advancedEngineeringComplex');
        return;
      }
    }

    if (hasStatus(unit, 'stunned')) {
      unit.vx *= 0.82; unit.vy *= 0.82;
      return;
    }

    const speed = getEntityStat(unit, 'speed', UNITS.advancedEngineer.speed);
    const spoofGoal = getSpoofedGoal(unit);
    if (spoofGoal) {
      unit.engineerEnduranceRemaining = Math.max(0, (Number.isFinite(unit.engineerEnduranceRemaining) ? unit.engineerEnduranceRemaining : getEngineerEndurance(unit.playerId)) - dt);
      moveUnit(unit, spoofGoal.x, spoofGoal.y, speed, dt);
      return;
    }
    if (unit.engineerMode === 'ouWorking') {
      const ouTarget = unit.engineerOUTargetId ? game.entityById.get(unit.engineerOUTargetId) : null;
      if (!ouTarget?.alive || ouTarget.ouReservedBy !== unit.id) {
        clearEngineerOUJob(unit, true);
        unit.engineerMode = 'search';
        return;
      }
      unit.vx = 0; unit.vy = 0;
      unit.engineerEnduranceRemaining = Math.max(0, (Number.isFinite(unit.engineerEnduranceRemaining) ? unit.engineerEnduranceRemaining : getEngineerEndurance(unit.playerId)) - dt);
      if (unit.engineerEnduranceRemaining <= 0) unit.engineerExhausted = true;
      unit.engineerOUWorkProgress += dt;
      if (unit.engineerOUWorkProgress + 1e-9 >= ADVANCED_ENGINEERING_BALANCE.ouWorkSeconds) {
        completeEngineerOUJob(unit);
        if (unit.engineerExhausted) unit.engineerMode = 'return';
      }
      return;
    }

    // Unfinished Fortresses are construction jobs, not ordinary repair jobs.
    // Each Advanced Engineer contributes 2% completion per second, so one
    // Engineer completes a fresh site in 50 seconds and five do it in 10.
    let fortressSite = unit.engineerTargetId ? game.entityById.get(unit.engineerTargetId) : null;
    if (!fortressSite?.alive || fortressSite.playerId !== unit.playerId || fortressSite.type !== 'fortress' || fortressSite.constructionState === 'operational') fortressSite = findNearestFortressConstructionSite(unit);
    if (fortressSite) {
      unit.engineerTargetId = fortressSite.id;
      unit.engineerOUTargetId = null;
      unit.engineerMode = 'fortressConstruction';
      fortressSite.engineerBuilderIds ||= [];
      if (!fortressSite.engineerBuilderIds.includes(unit.id)) fortressSite.engineerBuilderIds.push(unit.id);
      const workDistance = fortressSite.radius + unit.radius + 12;
      if (distance(unit, fortressSite) <= workDistance) {
        unit.hasOrder = false;
        unit.vx *= 0.7; unit.vy *= 0.7;
        fortressSite.constructionProgress = Math.min(20, (fortressSite.constructionProgress || 0) + dt * 0.4);
      } else {
        unit.orderX = fortressSite.x; unit.orderY = fortressSite.y; unit.hasOrder = true;
        moveUnit(unit, fortressSite.x, fortressSite.y, speed, dt);
      }
      return;
    }

    unit.engineerEnduranceRemaining = Math.max(0, (Number.isFinite(unit.engineerEnduranceRemaining) ? unit.engineerEnduranceRemaining : getEngineerEndurance(unit.playerId)) - dt);
    if (unit.engineerEnduranceRemaining <= 0) {
      unit.engineerExhausted = true;
      unit.engineerMode = 'return';
      unit.engineerTargetId = null;
      clearEngineerOUJob(unit, false);
    }

    if (unit.engineerMode === 'return') {
      unit.orderX = complex.x; unit.orderY = complex.y; unit.hasOrder = true;
      if (distance(unit, complex) <= complex.radius + unit.radius + 10) {
        dockAdvancedEngineer(unit, complex, !!unit.engineerExhausted);
        return;
      }
      moveUnit(unit, complex.x, complex.y, speed, dt);
      return;
    }

    // Repair has absolute priority over auto-OU before the 5-second OU work
    // actually begins. Engineers continuously re-check for new repair needs.
    let repairTarget = unit.engineerTargetId ? game.entityById.get(unit.engineerTargetId) : null;
    if (!repairTarget?.alive || repairTarget.playerId !== unit.playerId || repairTarget.hp >= repairTarget.maxHp - 0.5) repairTarget = null;
    if (!repairTarget) repairTarget = findNearestDamagedFriendlyBuilding(unit);
    if (repairTarget) {
      unit.engineerTargetId = repairTarget.id;
      unit.engineerOUTargetId = null;
      unit.engineerMode = 'repair';
      const repairDistance = repairTarget.radius + unit.radius + 12;
      if (distance(unit, repairTarget) <= repairDistance) {
        unit.hasOrder = false;
        unit.vx *= 0.7; unit.vy *= 0.7;
        repairTarget.hp = Math.min(repairTarget.maxHp, repairTarget.hp + repairTarget.maxHp * getEngineerRepairRate(unit.playerId) * dt);
      } else {
        unit.orderX = repairTarget.x; unit.orderY = repairTarget.y; unit.hasOrder = true;
        moveUnit(unit, repairTarget.x, repairTarget.y, speed, dt);
      }
      return;
    }

    unit.engineerTargetId = null;
    if (complex.engineerAutoOUEnabled && hasResearchCapability(unit.playerId, 'engineerAutoOU')) {
      let ouTarget = unit.engineerOUTargetId ? game.entityById.get(unit.engineerOUTargetId) : null;
      if (!ouTarget?.alive || !canApplyBuildingOnsiteUpgrade(ouTarget, { engineerId: unit.id }).ok) ouTarget = getEngineerAutoOUTarget(unit, complex);
      if (ouTarget) {
        unit.engineerOUTargetId = ouTarget.id;
        unit.engineerMode = 'ouTravel';
        const workDistance = ouTarget.radius + unit.radius + 12;
        if (distance(unit, ouTarget) <= workDistance) {
          if (!beginEngineerOUJob(unit, ouTarget)) {
            unit.engineerOUTargetId = null;
            unit.engineerMode = 'return';
          }
        } else {
          unit.orderX = ouTarget.x; unit.orderY = ouTarget.y; unit.hasOrder = true;
          moveUnit(unit, ouTarget.x, ouTarget.y, speed, dt);
        }
        return;
      }
    }

    unit.engineerMode = 'return';
    unit.orderX = complex.x; unit.orderY = complex.y; unit.hasOrder = true;
    if (distance(unit, complex) <= complex.radius + unit.radius + 10) dockAdvancedEngineer(unit, complex, false);
    else moveUnit(unit, complex.x, complex.y, speed, dt);
  }

  function getLoiteringAOE(unitOrPlayer) {
    const playerId = typeof unitOrPlayer === 'number' ? unitOrPlayer : unitOrPlayer?.playerId;
    const unit = typeof unitOrPlayer === 'object' ? unitOrPlayer : null;
    const unlocked = isResearchComplete(playerId, 'dwLMAOE');
    if (!unlocked) return { damage: 0, radius: 0 };
    const damage = unit ? getEntityStat(unit, 'aoeDamage', DRONE_WARFARE_BALANCE.loiteringAoeDamage)
      : getDefinitionPlayerStat(playerId, 'unit', 'loiteringMunition', 'aoeDamage', DRONE_WARFARE_BALANCE.loiteringAoeDamage);
    const radius = unit ? getEntityStat(unit, 'aoeRadius', DRONE_WARFARE_BALANCE.loiteringAoeRadius)
      : getDefinitionPlayerStat(playerId, 'unit', 'loiteringMunition', 'aoeRadius', DRONE_WARFARE_BALANCE.loiteringAoeRadius);
    return { damage, radius };
  }

  function detonateLoiteringMunition(unit, contactTarget = null) {
    if (!unit?.alive || unit.type !== 'loiteringMunition') return false;
    unit.droneDetonating = true;
    const fieldMult = typeof getEnergyFieldAttackMultiplier === 'function' ? getEnergyFieldAttackMultiplier(unit) : 1;
    const directDamage = getEntityStat(unit, 'damage', DRONE_WARFARE_BALANCE.loiteringDamage) * fieldMult;
    if (contactTarget?.alive && contactTarget.playerId !== unit.playerId) applyDamage(contactTarget, directDamage, unit.playerId, null, { airDelivered:true });
    const aoe = getLoiteringAOE(unit);
    if (aoe.damage > 0 && aoe.radius > 0) explode(unit.x, unit.y, unit.playerId, aoe.damage * fieldMult, aoe.radius, null, null, { airDelivered:true });
    else pushEffect({ type: 'explosion', x: unit.x, y: unit.y, radius: 16, life: 0.22, maxLife: 0.22 });
    markEntityDead(unit, false);
    return true;
  }

  function findLoiteringContact(unit) {
    const contactRadius = unit.radius + 8;
    unitGrid.queryCircle(unit.x, unit.y, contactRadius + 18, queryScratchA);
    for (const other of queryScratchA) {
      if (!other.alive || other === unit || other.playerId === unit.playerId || other.garrisoned || other.airborne) continue;
      if (Math.hypot(other.x - unit.x, other.y - unit.y) <= unit.radius + other.radius + 2) return other;
    }
    buildingGrid.queryCircle(unit.x, unit.y, contactRadius + 42, queryScratchB);
    for (const building of queryScratchB) {
      if (!building.alive || building.playerId === unit.playerId || building.type === 'landmine') continue;
      if (Math.hypot(building.x - unit.x, building.y - unit.y) <= unit.radius + building.radius + 1) return building;
    }
    return null;
  }

  function updateLoiteringMunition(unit, dt) {
    const def = UNITS.loiteringMunition;
    if (unit.hiveGenerated && Number.isFinite(unit.droneEnduranceRemaining)) {
      unit.droneEnduranceRemaining -= dt;
      if (unit.droneEnduranceRemaining <= 0) {
        if (hasResearchCapability(unit.playerId, 'loiteringLastDitch')) destroyEntity(unit, unit.playerId);
        else markEntityDead(unit, false);
        return;
      }
    }

    if (!isValidTarget(unit.target, unit)) unit.target = null;
    const spoofGoal = getSpoofedGoal(unit);
    if (spoofGoal) unit.target = null;
    if (!spoofGoal && !unit.target && game.time >= unit.nextTargetScan) {
      unit.target = findClosestEnemy(unit, def.scanRange || DRONE_WARFARE_BALANCE.loiteringScanRange, true);
      unit.nextTargetScan = game.time + 0.10 + (unit.id % 7) * 0.012;
    }

    const goalX = spoofGoal ? spoofGoal.x : (unit.target?.alive ? unit.target.x : unit.droneMissionX);
    const goalY = spoofGoal ? spoofGoal.y : (unit.target?.alive ? unit.target.y : unit.droneMissionY);
    const desired = normalize(goalX - unit.x, goalY - unit.y);
    let steerX = desired.x;
    let steerY = desired.y;
    if (hasResearchCapability(unit.playerId, 'loiteringDispersal')) {
      // A light local separation bias keeps swarms broad without overriding the
      // mission vector. Hive-generated drones inherit this through the same SR.
      const disperseRadius = 42;
      let disperseX = 0, disperseY = 0, neighbors = 0;
      unitGrid.queryCircle(unit.x, unit.y, disperseRadius, queryScratchC);
      for (const other of queryScratchC) {
        if (!other.alive || other === unit || other.playerId !== unit.playerId || other.type !== 'loiteringMunition') continue;
        let dx = unit.x - other.x, dy = unit.y - other.y;
        let d2 = dx * dx + dy * dy;
        if (d2 >= disperseRadius * disperseRadius) continue;
        if (d2 < 0.01) {
          const a = ((unit.instanceId || unit.id) * 0.754877666 + (other.instanceId || other.id) * 0.569840296) % (Math.PI * 2);
          dx = Math.cos(a); dy = Math.sin(a); d2 = 1;
        }
        const d = Math.sqrt(d2);
        const strength = (disperseRadius - d) / disperseRadius;
        disperseX += dx / d * strength;
        disperseY += dy / d * strength;
        neighbors++;
      }
      if (neighbors) {
        const spread = normalize(disperseX, disperseY);
        steerX += spread.x * 0.48;
        steerY += spread.y * 0.48;
      }
    }
    if (hasResearchCapability(unit.playerId, 'loiteringEvasive')) {
      const wave = Math.sin(game.time * 9.5 + unit.instanceId * 0.71) * 0.34;
      steerX += -desired.y * wave;
      steerY += desired.x * wave;
    }
    const n = normalize(steerX, steerY);
    const speed = getEntityStat(unit, 'speed', def.speed);
    unit.vx = n.x * speed;
    unit.vy = n.y * speed;
    unit.x = clamp(unit.x + unit.vx * dt, unit.radius, WORLD.width - unit.radius);
    unit.y = clamp(unit.y + unit.vy * dt, unit.radius, WORLD.height - unit.radius);
    unit.angle = Math.atan2(unit.vy, unit.vx);

    const contact = spoofGoal ? null : findLoiteringContact(unit);
    if (contact) {
      detonateLoiteringMunition(unit, contact);
      return;
    }
    if (!spoofGoal && !unit.target && Math.hypot(unit.droneMissionX - unit.x, unit.droneMissionY - unit.y) <= 9) {
      detonateLoiteringMunition(unit, null);
    }
  }

  function findEnemyAtPoint(playerId, x, y, radius = 34) {
    let best = null;
    let bestD2 = radius * radius;
    unitGrid.queryCircle(x, y, radius, queryScratchA);
    for (const target of queryScratchA) {
      if (!target.alive || target.playerId === playerId || target.airborne || target.garrisoned) continue;
      const dx = target.x - x, dy = target.y - y, d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = target; }
    }
    buildingGrid.queryCircle(x, y, radius, queryScratchB);
    for (const target of queryScratchB) {
      if (!target.alive || target.playerId === playerId || target.type === 'landmine') continue;
      const dx = target.x - x, dy = target.y - y, d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = target; }
    }
    return best;
  }

  function launchWingmanAirGroundMissile(unit) {
    if (hasStatus(unit, 'spoofed')) return false;
    if (!unit?.alive || unit.type !== 'loyalWingman' || unit.payloadRemaining <= 0 || game.projectiles.length >= MAX_PROJECTILES) return false;
    const targetX = unit.bombTargetX;
    const targetY = unit.bombTargetY;
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return false;
    const n = normalize(targetX - unit.x, targetY - unit.y);
    const missileSpeed = 520;
    const d = Math.hypot(targetX - unit.x, targetY - unit.y);
    game.projectiles.push({
      kind: 'wingmanMissile', playerId: unit.playerId,
      x: unit.x + n.x * (unit.radius + 4), y: unit.y + n.y * (unit.radius + 4),
      vx: n.x * missileSpeed, vy: n.y * missileSpeed, speed: missileSpeed,
      targetX, targetY, damage: getEntityStat(unit, 'missileDamage', DRONE_WARFARE_BALANCE.loyalWingmanMissileDamage) * (typeof getEnergyFieldAttackMultiplier === 'function' ? getEnergyFieldAttackMultiplier(unit) : 1),
      life: Math.max(0.2, d / missileSpeed + 0.3)
    });
    unit.payloadRemaining--;
    unit.missileCooldown = 0.30;
    // Small launch flash makes payload release visually obvious even at normal zoom.
    pushEffect({ type: 'wingmanLaunch', x: unit.x + n.x * (unit.radius + 5), y: unit.y + n.y * (unit.radius + 5), radius: 18, life: 0.18, maxLife: 0.18 });
    return true;
  }


  function findEmergencyWingmanHub(unit) {
    let best = null;
    let bestD2 = Infinity;
    for (const hub of game.buildings) {
      if (!hub.alive || hub.playerId !== unit.playerId || hub.type !== 'droneHub') continue;
      if (getDroneHubStoredCount(hub, 'loyalWingman') >= getDroneHubCapacity(hub, 'loyalWingman')) continue;
      const d2 = distSq(unit, hub);
      if (d2 < bestD2) { bestD2 = d2; best = hub; }
    }
    return best;
  }

  function updateLoyalWingman(unit, dt) {
    const def = UNITS.loyalWingman;
    unit.missileCooldown = Math.max(0, (unit.missileCooldown || 0) - dt);
    unit.enduranceRemaining = Math.max(0, (Number.isFinite(unit.enduranceRemaining) ? unit.enduranceRemaining : getEntityStat(unit, 'endurance', def.endurance)) - dt);
    if (unit.enduranceRemaining <= 0) {
      destroyEntity(unit, unit.playerId);
      return;
    }

    let master = findEntityById(unit.masterAircraftId);
    if (!master?.alive || !master.airborne || master.playerId !== unit.playerId) master = null;

    let base = findEntityById(unit.homeAirbaseId);
    if (!base?.alive || base.type !== 'airbase' || base.playerId !== unit.playerId) {
      base = findClosestFriendlyWingmanAirbase(unit);
      unit.homeAirbaseId = base?.id || null;
    }
    const maxSpeed = getEntityStat(unit, 'speed', def.speed);
    const spoofGoal = getSpoofedGoal(unit);
    if (spoofGoal) {
      moveAirUnitToward(unit, spoofGoal.x, spoofGoal.y, maxSpeed, dt);
      return;
    }
    const distanceHome = base ? distance(unit, base) : Infinity;
    const returnNeed = base ? distanceHome / Math.max(1, maxSpeed) + 3 : Infinity;
    if (base && unit.enduranceRemaining <= returnNeed) {
      const masterReturningNow = master && (master.airMissionState === 'returning' || master.airMissionState === 'waitingForBase');
      unit.airMissionState = masterReturningNow ? 'escortReturn' : 'returning';
    }

    if (unit.payloadRemaining > 0 && Math.hypot(unit.bombTargetX - unit.x, unit.bombTargetY - unit.y) <= getEntityStat(unit, 'missileRange', def.missileRange) && unit.missileCooldown <= 0) {
      launchWingmanAirGroundMissile(unit);
    }

    if (unit.airMissionState !== 'returning' && unit.airMissionState !== 'escortReturn') {
      const masterReturning = !master || master.airMissionState === 'returning' || master.airMissionState === 'waitingForBase';
      if (masterReturning) {
        if (unit.payloadRemaining > 0) unit.airMissionState = 'independentAttack';
        else unit.airMissionState = master ? 'escortReturn' : 'returning';
      }
    }

    if (unit.airMissionState === 'escortReturn' && !master) unit.airMissionState = 'returning';

    let goalX = unit.bombTargetX;
    let goalY = unit.bombTargetY;
    let desiredSpeed = maxSpeed;
    let escortTargetVx = null;
    let escortTargetVy = null;
    if (unit.airMissionState === 'escortReturn' && master && (master.airMissionState === 'returning' || master.airMissionState === 'waitingForBase')) {
      // Return in formation with the escorted aircraft. The Wingman may correct
      // its direction to stay behind the master, but its speed is capped at the
      // master's current speed so it never races home ahead of its escort.
      const forwardX = Math.cos(master.angle), forwardY = Math.sin(master.angle);
      const sideX = -forwardY, sideY = forwardX;
      const side = unit.escortCount > 1 ? (unit.escortIndex % 2 === 0 ? -1 : 1) : (((unit.id + master.id) & 1) ? 1 : -1);
      goalX = master.x - forwardX * 34 + sideX * side * (32 + 12 * Math.floor(unit.escortIndex / 2));
      goalY = master.y - forwardY * 34 + sideY * side * (32 + 12 * Math.floor(unit.escortIndex / 2));
      const errorX = goalX - unit.x, errorY = goalY - unit.y;
      let targetVx = master.vx + errorX * 1.25;
      let targetVy = master.vy + errorY * 1.25;
      const masterSpeed = Math.hypot(master.vx, master.vy);
      const targetSpeed = Math.hypot(targetVx, targetVy);
      if (targetSpeed > Math.max(0.01, masterSpeed)) {
        const scale = masterSpeed / targetSpeed;
        targetVx *= scale; targetVy *= scale;
      }
      escortTargetVx = targetVx;
      escortTargetVy = targetVy;
    } else if (unit.airMissionState === 'returning') {
      if (base) {
        goalX = base.x; goalY = base.y;
        if (distance(unit, base) <= base.radius + 20) {
          storeLandedWingman(base, unit);
          return;
        }
      } else {
        const hub = findEmergencyWingmanHub(unit);
        if (hub) {
          goalX = hub.x; goalY = hub.y;
          if (distance(unit, hub) <= hub.radius + 18) {
            storeLandedWingmanAtHub(hub, unit);
            return;
          }
        } else {
          const cap = game.players[unit.playerId]?.capital;
          if (cap?.alive) { goalX = cap.x; goalY = cap.y; }
        }
      }
    } else if (unit.airMissionState === 'escort' && master) {
      const forwardX = Math.cos(master.angle), forwardY = Math.sin(master.angle);
      const sideX = -forwardY, sideY = forwardX;
      const side = unit.escortCount > 1 ? (unit.escortIndex % 2 === 0 ? -1 : 1) : (((unit.id + master.id) & 1) ? 1 : -1);
      goalX = master.x - forwardX * 34 + sideX * side * (32 + 12 * Math.floor(unit.escortIndex / 2));
      goalY = master.y - forwardY * 34 + sideY * side * (32 + 12 * Math.floor(unit.escortIndex / 2));

      // Formation velocity is anchored to the master's actual velocity. When a
      // Wingman is in position it therefore matches the master's speed exactly;
      // its 350 speed is only a catch-up/repositioning ceiling when formation
      // error opens up.
      const errorX = goalX - unit.x, errorY = goalY - unit.y;
      let targetVx = master.vx + errorX * 2.15;
      let targetVy = master.vy + errorY * 2.15;
      const targetSpeed = Math.hypot(targetVx, targetVy);
      if (targetSpeed > maxSpeed) {
        const scale = maxSpeed / targetSpeed;
        targetVx *= scale; targetVy *= scale;
      }
      escortTargetVx = targetVx;
      escortTargetVy = targetVy;
    } else if (unit.payloadRemaining <= 0) {
      const masterReturning = master && (master.airMissionState === 'returning' || master.airMissionState === 'waitingForBase');
      unit.airMissionState = masterReturning ? 'escortReturn' : 'returning';
      return updateLoyalWingman(unit, 0);
    }

    const desired = normalize(goalX - unit.x, goalY - unit.y);
    const responsiveness = 1 - Math.pow(0.0006, dt);
    let targetVx = escortTargetVx == null ? desired.x * desiredSpeed : escortTargetVx;
    let targetVy = escortTargetVy == null ? desired.y * desiredSpeed : escortTargetVy;

    // Loyal Wingmen are not passive decoys. When a hostile homing AA missile is
    // actually locked onto this Wingman, it performs the same radial + lateral
    // jink used by manned bombers. The evasion temporarily overrides formation
    // direction, then the normal escort controller pulls it back into position.
    let evadeSteerX = 0;
    let evadeSteerY = 0;
    let aaThreats = 0;
    for (const p of game.projectiles) {
      if (!isHomingAirProjectile(p) || p.playerId === unit.playerId || p.life <= 0 || p.flareTarget || p.targetId !== unit.id) continue;
      const dx = unit.x - p.x;
      const dy = unit.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 230 * 230 || d2 < 0.001) continue;
      const d = Math.sqrt(d2);
      const urgency = clamp((230 - d) / 190, 0, 1);
      const side = ((unit.id + (p.launcherId || 0)) & 1) ? 1 : -1;
      evadeSteerX += (dx / d) * urgency * 2.2 + (-dy / d) * side * urgency * 1.65;
      evadeSteerY += (dy / d) * urgency * 2.2 + (dx / d) * side * urgency * 1.65;
      if (++aaThreats >= 6) break;
    }
    if (aaThreats > 0) {
      const baseSpeed = Math.hypot(targetVx, targetVy);
      const baseDir = baseSpeed > 0.001 ? { x: targetVx / baseSpeed, y: targetVy / baseSpeed } : desired;
      const evadeDir = normalize(baseDir.x + evadeSteerX, baseDir.y + evadeSteerY);
      let evadeSpeed = maxSpeed;
      if (unit.airMissionState === 'escortReturn' && master) {
        // Returning escorts still obey the rule that they do not outrun their
        // manned aircraft; they evade by changing direction, not by racing home.
        evadeSpeed = Math.min(maxSpeed, Math.hypot(master.vx, master.vy));
      }
      targetVx = evadeDir.x * evadeSpeed;
      targetVy = evadeDir.y * evadeSpeed;
    }

    unit.vx = lerp(unit.vx, targetVx, responsiveness);
    unit.vy = lerp(unit.vy, targetVy, responsiveness);
    unit.x = clamp(unit.x + unit.vx * dt, unit.radius, WORLD.width - unit.radius);
    unit.y = clamp(unit.y + unit.vy * dt, unit.radius, WORLD.height - unit.radius);
    if (Math.abs(unit.vx) + Math.abs(unit.vy) > 1) unit.angle = Math.atan2(unit.vy, unit.vx);
  }

