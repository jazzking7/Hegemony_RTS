'use strict';

  function updateUnits(dt) {
    for (const unit of game.units) {
      if (!unit.alive) continue;
      const def = UNITS[unit.type];
      const combatDef = getUnitWeaponProfile(unit) || def;
      if (unit.type === 'loiteringMunition') {
        updateLoiteringMunition(unit, dt);
        continue;
      }
      if (unit.type === 'loyalWingman') {
        updateLoyalWingman(unit, dt);
        continue;
      }
      if (unit.type === 'bomber') {
        updateBomber(unit, dt);
        continue;
      }
      if (unit.type === 'superFighter') {
        updateSuperFighter(unit, dt);
        continue;
      }
      if (unit.type === 'paratrooperPlane') {
        updateParatrooperPlane(unit, dt);
        continue;
      }
      if (unit.parachuting) {
        updateParachutingTroop(unit, dt);
        continue;
      }
      if (unit.type === 'advancedEngineer') {
        updateAdvancedEngineerUnit(unit, dt);
        continue;
      }
      if (unit.fortressBuilderSiteId) {
        const fortress = findEntityById(unit.fortressBuilderSiteId);
        if (updateFortressBuilder(unit, fortress, dt)) continue;
      }
      if (unit.garrisoned) {
        unit.vx = 0; unit.vy = 0; unit.target = null; unit.hasOrder = false;
        continue;
      }
      unit.cooldown = Math.max(0, unit.cooldown - dt);
      if (hasStatus(unit, 'stunned')) {
        unit.vx *= 0.82;
        unit.vy *= 0.82;
        continue;
      }
      const spoofGoal = getSpoofedGoal(unit);
      if (spoofGoal) {
        unit.target = null;
        moveUnit(unit, spoofGoal.x, spoofGoal.y, getEntityStat(unit, 'speed', def.speed), dt);
        continue;
      }

      if (!isValidTarget(unit.target, unit)) unit.target = null;
      if (unit.type === 'hiveSoldier' && unit.target && unit.parentHiveId) {
        const parentHive = findEntityById(unit.parentHiveId);
        if (!parentHive?.alive || distance(unit.target, parentHive) > getEntityStat(parentHive, 'range', BUILDINGS.hive.range)) unit.target = null;
      }
      if (unit.parentFortressId && unit.target) {
        const parentFortress = findEntityById(unit.parentFortressId);
        if (!isCompletedFortress(parentFortress) || distance(unit.target, parentFortress) > getEntityStat(parentFortress, 'range', BUILDINGS.fortress.range)) unit.target = null;
      }
      if (unit.focusedMission) {
        const focusDistance = Math.hypot((unit.focusedMissionX ?? unit.orderX) - unit.x, (unit.focusedMissionY ?? unit.orderY) - unit.y);
        if (focusDistance <= (unit.focusedMissionRadius || COMMAND_AUTOMATION_BALANCE.focusedArrivalRadius)) completeFocusedMission(unit);
        else unit.target = null;
      }
      if (unit.assaultZoneRadius > 0 && unit.target) {
        const zoneDistance = Math.hypot(unit.target.x - unit.assaultZoneX, unit.target.y - unit.assaultZoneY);
        if (zoneDistance > unit.assaultZoneRadius + (unit.target.radius || 0)) unit.target = null;
      }

      // Troops released from a transport inherit its destination as an ordinary
      // move order, not a focused order. They keep that destination queued, but
      // can still acquire, engage, and chase nearby enemies on the way. After a
      // distraction is resolved they continue toward the inherited coordinate.

      // Ordinary units acquire local targets themselves. Hive Hunters are instead
      // assigned targets by their parent Hive so they react to anything entering
      // the Hive's full detection radius without performing redundant scans.
      if (unit.type !== 'hiveSoldier' && !unit.parentFortressId && entityHasCapability(unit, 'attacks') && !unit.focusedMission) {
        const scanRange = Math.max((combatDef.range || 0) + 85, 210);
        if (!unit.target && game.time >= unit.nextTargetScan) {
          unit.target = unit.assaultZoneRadius > 0 ? findAssaultZoneTarget(unit) : findClosestEnemy(unit, scanRange, true);
          unit.nextTargetScan = game.time + 0.22 + (unit.id % 9) * 0.013;
        }
      }

      let goalX = unit.orderX;
      let goalY = unit.orderY;
      let shouldMove = unit.hasOrder;
      const ifvDestinationMission = unit.type === 'ifv' && unit.hasOrder;

      if (unit.target) {
        const targetDistance = distance(unit, unit.target);
        const effectiveRange = (combatDef.range || 0) + unit.target.radius;
        if (ifvDestinationMission) {
          // IFVs do not stop or divert from a deployment coordinate to fight.
          // They opportunistically fire at targets already in range while moving.
          goalX = unit.orderX;
          goalY = unit.orderY;
          shouldMove = true;
          if (targetDistance <= effectiveRange && (!combatDef.minRange || targetDistance >= combatDef.minRange) && unit.cooldown <= 0) {
            fireWeapon(unit, unit.target, combatDef, 'unit');
          } else if (targetDistance > Math.max(effectiveRange + 120, 260)) {
            unit.target = null;
          }
        } else if (targetDistance <= effectiveRange && (!combatDef.minRange || targetDistance >= combatDef.minRange)) {
          shouldMove = false;
          unit.vx *= 0.75;
          unit.vy *= 0.75;
          unit.stuckTime = 0;
          unit.hardStuckTime = 0;
          if (typeof isAdvancedInfantryUnit === 'function' && isAdvancedInfantryUnit(unit) && getAdvancedInfantryWeaponProfiles(unit).length) {
            fireAdvancedInfantryWeapons(unit, unit.target);
          } else if (unit.cooldown <= 0) fireWeapon(unit, unit.target, combatDef, 'unit');
        } else {
          goalX = unit.target.x;
          goalY = unit.target.y;
          shouldMove = true;
          if (combatDef.minRange && targetDistance < combatDef.minRange * 0.75) {
            const away = normalize(unit.x - unit.target.x, unit.y - unit.target.y);
            goalX = unit.x + away.x * 120;
            goalY = unit.y + away.y * 120;
          }
        }
      }

      if (unit.assaultZoneRadius > 0 && !unit.target) {
        const homeDistance = Math.hypot(unit.assaultZoneX - unit.x, unit.assaultZoneY - unit.y);
        if (homeDistance > Math.min(72, unit.assaultZoneRadius * 0.36)) {
          goalX = unit.assaultZoneX;
          goalY = unit.assaultZoneY;
          shouldMove = true;
        } else if (!unit.hasOrder) {
          shouldMove = false;
        }
      }

      if (unit.type === 'hiveSoldier' && unit.parentHiveId) {
        const hive = findEntityById(unit.parentHiveId);
        if (!hive || !hive.alive) {
          unit.parentHiveId = null;
          unit.target = null;
        } else {
          // A Hunter only engages targets that are still inside its parent Hive's
          // detection area. Once a target leaves, the Hunter returns to patrol.
          if (unit.target && distance(unit.target, hive) > getEntityStat(hive, 'range', BUILDINGS.hive.range)) unit.target = null;
          if (!unit.target) {
            const i = unit.hivePatrolIndex || 0;
            const angle = i / 3 * Math.PI * 2 + hive.id * 0.17;
            goalX = hive.x + Math.cos(angle) * 95;
            goalY = hive.y + Math.sin(angle) * 95;
            shouldMove = Math.hypot(goalX - unit.x, goalY - unit.y) > 18;
          }
        }
      }

      if (unit.parentFortressId) {
        const fort = findEntityById(unit.parentFortressId);
        if (!isCompletedFortress(fort)) {
          unit.parentFortressId = null;
          unit.target = null;
        } else {
          if (unit.target && distance(unit.target, fort) > getEntityStat(fort, 'range', BUILDINGS.fortress.range)) unit.target = null;
          if (!unit.target) {
            const i = unit.fortressPatrolIndex || 0;
            const a = i / Math.max(1, fort.garrisonIds?.length || 10) * Math.PI * 2 + fort.id * 0.11;
            goalX = fort.x + Math.cos(a) * (fort.radius + unit.radius + 58);
            goalY = fort.y + Math.sin(a) * (fort.radius + unit.radius + 58);
            const homeDistance = Math.hypot(goalX - unit.x, goalY - unit.y);
            if (homeDistance <= 15) {
              unit.garrisoned = true;
              unit.lifecycleState = LIFECYCLE_STATES.GARRISONED;
              unit.x = fort.x; unit.y = fort.y;
              unit.vx = 0; unit.vy = 0;
              unit.hasOrder = false;
              shouldMove = false;
            } else {
              shouldMove = true;
            }
          }
        }
      }

      if (shouldMove) moveUnit(unit, goalX, goalY, getEntityStat(unit, 'speed', def.speed), dt);
      else {
        unit.vx *= 0.82;
        unit.vy *= 0.82;
      }

      const reachedOrder = unit.hasOrder && (Math.hypot(unit.orderX - unit.x, unit.orderY - unit.y) < 18 || unit.reachedNearestGoal);
      if (reachedOrder && (TRANSPORT_UNIT_TYPES.includes(unit.type) || !unit.target || unit.transportReleaseOrder)) {
        if (TRANSPORT_UNIT_TYPES.includes(unit.type) && unit.cargoRecords?.length) unloadCargo(unit, false);
        unit.hasOrder = false;
        unit.transportReleaseOrder = false;
        unit.reachedNearestGoal = false;
        unit.path = null;
      }
    }
  }

  function requestUnitPath(unit, goalX, goalY, urgent = false) {
    unit.pendingPathGoalX = goalX;
    unit.pendingPathGoalY = goalY;
    if (unit.pathQueued || game.time < unit.repathAfter) return;
    unit.pathQueued = true;
    (urgent ? game.urgentPathQueue : game.pathQueue).push(unit.id);
  }

  function processPathRequests() {
    navGrid.rebuild();
    let processed = 0;
    const maxRequests = 6;
    while (processed < maxRequests && (game.urgentPathQueue.length || game.pathQueue.length)) {
      const queue = game.urgentPathQueue.length ? game.urgentPathQueue : game.pathQueue;
      const id = queue.pop();
      const unit = game.entityById.get(id);
      if (!unit || !unit.alive || !unit.pathQueued) continue;
      unit.pathQueued = false;

      const path = navGrid.findPath(unit.x, unit.y, unit.pendingPathGoalX, unit.pendingPathGoalY);
      unit.pathGoalX = unit.pendingPathGoalX;
      unit.pathGoalY = unit.pendingPathGoalY;
      unit.pathVersion = navGrid.version;
      unit.repathAfter = game.time + 0.32 + (unit.id % 6) * 0.025;
      if (path && path.length) {
        unit.path = path;
        unit.pathIndex = 0;
        unit.pathFailCount = 0;
        unit.reachedNearestGoal = false;
      } else {
        unit.path = null;
        unit.pathIndex = 0;
        unit.pathFailCount++;
        // A totally enclosed unit has no physical route. After repeated failure,
        // briefly relax building collision so it can escape instead of freezing.
        if (unit.pathFailCount >= 2) unit.phaseUntil = Math.max(unit.phaseUntil, game.time + 3.5);
      }
      processed++;
    }
  }

  function moveUnit(unit, goalX, goalY, speed, dt) {
    const spoofGoal = getSpoofedGoal(unit);
    if (spoofGoal) { goalX = spoofGoal.x; goalY = spoofGoal.y; }
    const oldX = unit.x;
    const oldY = unit.y;
    const oldGoalDistance = Math.hypot(goalX - oldX, goalY - oldY);
    unit.reachedNearestGoal = false;

    if (unit.path && (unit.pathVersion !== navGrid.version || Math.hypot(goalX - unit.pathGoalX, goalY - unit.pathGoalY) > 125)) {
      unit.path = null;
      unit.pathIndex = 0;
    }
    // The moment the final route becomes geometrically clear, abandon any
    // coarse-grid detour immediately. This is especially important when a unit
    // has just lined itself up with a narrow legal building corridor.
    if (unit.path && isGroundSegmentClear(unit, unit.x, unit.y, goalX, goalY, goalX, goalY, 0.5)) {
      unit.path = null;
      unit.pathIndex = 0;
      unit.pathQueued = false;
      unit.pathFailCount = 0;
      unit.reachedNearestGoal = false;
    }

    if (game.time >= unit.nextPathCheck) {
      // Exact circle geometry gets first say. The coarse 48px A* grid cannot
      // represent the deliberately narrow legal corridors between buildings and
      // used to send units around gaps they could physically pass through.
      const directClear = isGroundSegmentClear(unit, unit.x, unit.y, goalX, goalY, goalX, goalY, 0.5);
      if (directClear) {
        unit.path = null;
        unit.pathIndex = 0;
        unit.pathQueued = false;
        unit.pathFailCount = 0;
        unit.reachedNearestGoal = false;
      } else if (!unit.path) {
        requestUnitPath(unit, goalX, goalY, false);
      }
      unit.nextPathCheck = game.time + 0.18 + (unit.id % 11) * 0.014;
    }

    let navX = goalX;
    let navY = goalY;
    if (unit.path && unit.path.length) {
      while (unit.pathIndex < unit.path.length) {
        const point = unit.path[unit.pathIndex];
        if (Math.hypot(point.x - unit.x, point.y - unit.y) > 22) break;
        unit.pathIndex++;
      }
      if (unit.pathIndex >= unit.path.length) {
        unit.path = null;
        unit.pathIndex = 0;
        if (!isGroundSegmentClear(unit, unit.x, unit.y, goalX, goalY, goalX, goalY, 0.5)) unit.reachedNearestGoal = true;
      } else {
        // Skip ahead when later waypoints become directly visible.
        let best = unit.pathIndex;
        for (let i = unit.path.length - 1; i > unit.pathIndex; i--) {
          if (isGroundSegmentClear(unit, unit.x, unit.y, unit.path[i].x, unit.path[i].y, goalX, goalY, 0.5)) { best = i; break; }
        }
        unit.pathIndex = best;
        navX = unit.path[best].x;
        navY = unit.path[best].y;
      }
    }

    const desired = normalize(navX - unit.x, navY - unit.y);
    let steerX = desired.x;
    let steerY = desired.y;

    const phasing = game.time < unit.phaseUntil;
    // Detect structure-dense space before unit separation. In a legal corridor,
    // other troops must yield/overlap a little instead of shoving one another
    // sideways into the building shells and creating a traffic-jam oscillation.
    let nearbyStructureCount = 0;
    buildingGrid.queryCircle(unit.x, unit.y, 96, queryScratchB);
    for (const b of queryScratchB) {
      if (!b.alive || b.type === 'landmine') continue;
      const d = Math.hypot(unit.x - b.x, unit.y - b.y);
      if (d < getBuildingUnitCollisionGap(unit, b) + 28) nearbyStructureCount++;
    }
    const separationScale = nearbyStructureCount >= 2 ? 0.22 : (nearbyStructureCount === 1 ? 0.58 : 1);

    // Nearby-unit separation is intentionally very soft in building corridors.
    // Units may overlap visually; route completion is more important than making
    // a narrow lane behave like rigid-body traffic.
    unitGrid.queryCircle(unit.x, unit.y, unit.radius * 4 + 22, queryScratchA);
    let checked = 0;
    for (const other of queryScratchA) {
      if (other === unit || !other.alive || other.airborne || other.garrisoned || checked++ >= 10) continue;
      const dx = unit.x - other.x;
      const dy = unit.y - other.y;
      const d2 = dx * dx + dy * dy;
      const desiredGap = unit.radius + other.radius + 1;
      if (d2 > 0.001 && d2 < desiredGap * desiredGap * 1.72) {
        const d = Math.sqrt(d2);
        const strength = clamp((desiredGap * 1.28 - d) / (desiredGap * 1.28), 0, 1);
        steerX += (dx / d) * strength * 0.82 * separationScale;
        steerY += (dy / d) * strength * 0.82 * separationScale;
      }
    }

    if (typeof applyAdvancedInfantrySteering === 'function') {
      const advancedSteer = applyAdvancedInfantrySteering(unit, { x: steerX, y: steerY }, separationScale);
      steerX = advancedSteer.x;
      steerY = advancedSteer.y;
    }

    if (!phasing) {
      // Do not repel units merely because they are close to a structure. Only a
      // structure whose true collision shell intersects the short projected
      // movement segment gets avoidance steering. This is the crucial corridor
      // rule: if the center line fits through a legal building gap, the unit is
      // allowed to commit straight through it with zero edge repulsion.
      const lookAhead = clamp(speed * 0.30, BUILDING_LOOKAHEAD_MIN, BUILDING_LOOKAHEAD_MAX);
      const lookX = unit.x + desired.x * lookAhead;
      const lookY = unit.y + desired.y * lookAhead;
      for (const b of queryScratchB) {
        if (!b.alive || b.type === 'landmine' || isGoalBuilding(b, goalX, goalY)) continue;
        const gap = getBuildingUnitCollisionGap(unit, b);
        const awayX = unit.x - b.x;
        const awayY = unit.y - b.y;
        const d = Math.hypot(awayX, awayY) || 1;
        const overlapping = d < gap + 0.25;
        const projectedHit = pointSegmentDistanceSq(b.x, b.y, unit.x, unit.y, lookX, lookY) < (gap + 0.75) * (gap + 0.75);
        if (!overlapping && !projectedHit) continue;

        const awayNX = awayX / d;
        const awayNY = awayY / d;
        const toBNX = -awayNX;
        const toBNY = -awayNY;
        const ahead = desired.x * toBNX + desired.y * toBNY;

        // Choose one stable side around the blocking circle. Prefer the tangent
        // already most aligned with the desired route; use the unit's persistent
        // side bit only for a perfectly head-on tie so it never flips each tick.
        const tangentAX = -awayNY;
        const tangentAY = awayNX;
        const tangentBX = awayNY;
        const tangentBY = -awayNX;
        const alignA = tangentAX * desired.x + tangentAY * desired.y;
        const alignB = tangentBX * desired.x + tangentBY * desired.y;
        let tangentX;
        let tangentY;
        if (Math.abs(alignA - alignB) < 0.08) {
          const side = unit.detourSide || (unit.id % 2 ? 1 : -1);
          tangentX = tangentAX * side;
          tangentY = tangentAY * side;
        } else if (alignA > alignB) {
          tangentX = tangentAX;
          tangentY = tangentAY;
        } else {
          tangentX = tangentBX;
          tangentY = tangentBY;
        }

        const penetration = clamp((gap + BUILDING_AVOIDANCE_MARGIN - d) / BUILDING_AVOIDANCE_MARGIN, 0, 1);
        const tangentStrength = projectedHit && ahead > -0.15 ? 1.28 : 0.72;
        steerX += tangentX * tangentStrength;
        steerY += tangentY * tangentStrength;
        if (overlapping || penetration > 0) {
          steerX += awayNX * (0.35 + penetration * 1.25);
          steerY += awayNY * (0.35 + penetration * 1.25);
        }
      }
    }

    const n = normalize(steerX, steerY);
    const responsiveness = 1 - Math.pow(0.0015, dt);
    unit.vx = lerp(unit.vx, n.x * speed, responsiveness);
    unit.vy = lerp(unit.vy, n.y * speed, responsiveness);
    unit.x = clamp(unit.x + unit.vx * dt, unit.radius, WORLD.width - unit.radius);
    unit.y = clamp(unit.y + unit.vy * dt, unit.radius, WORLD.height - unit.radius);

    if (!phasing) {
      // Exact local overlap correction remains cheap and prevents visual clipping.
      buildingGrid.queryCircle(unit.x, unit.y, 92, queryScratchB);
      for (const b of queryScratchB) {
        if (!b.alive || b.type === 'landmine') continue;
        let dx = unit.x - b.x;
        let dy = unit.y - b.y;
        let d = Math.hypot(dx, dy);
        const gap = getBuildingUnitCollisionGap(unit, b);
        if (d < gap) {
          if (d < 0.001) {
            const angle = ((unit.id * 0.61803398875) % 1) * Math.PI * 2;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            d = 1;
          }
          const nx = dx / d;
          const ny = dy / d;
          unit.x = clamp(b.x + nx * gap, unit.radius, WORLD.width - unit.radius);
          unit.y = clamp(b.y + ny * gap, unit.radius, WORLD.height - unit.radius);
          const inwardVelocity = unit.vx * -nx + unit.vy * -ny;
          if (inwardVelocity > 0) {
            unit.vx += nx * inwardVelocity;
            unit.vy += ny * inwardVelocity;
          }
        }
      }
    }

    const moved = Math.hypot(unit.x - oldX, unit.y - oldY);
    const navDistanceAfter = Math.hypot(navX - unit.x, navY - unit.y);
    if (navDistanceAfter > 26 && moved < speed * dt * 0.18) unit.stuckTime += dt;
    else unit.stuckTime = Math.max(0, unit.stuckTime - dt * 1.6);

    if (game.time >= unit.progressCheckAt) {
      const currentGoalDistance = Math.hypot(goalX - unit.x, goalY - unit.y);
      const currentNavDistance = Math.hypot(navX - unit.x, navY - unit.y);
      const sampleMovement = Math.hypot(unit.x - unit.progressX, unit.y - unit.progressY);
      const navProgress = Number.isFinite(unit.lastNavDistance) ? unit.lastNavDistance - currentNavDistance : Infinity;
      const requiredProgress = Math.max(1.2, speed * 0.45 * 0.035);
      const noUsefulProgress = currentNavDistance > 30 && navProgress < requiredProgress;
      const barelyMoved = currentNavDistance > 30 && sampleMovement < speed * 0.45 * 0.10;

      // Measure progress toward the current navigation target, not just raw
      // displacement. Orbiting a building can cover plenty of pixels while
      // making zero route progress; that is now correctly classified as stuck.
      if (noUsefulProgress || barelyMoved) unit.hardStuckTime += 0.45;
      else unit.hardStuckTime = Math.max(0, unit.hardStuckTime - 0.45);
      unit.progressX = unit.x;
      unit.progressY = unit.y;
      unit.lastGoalDistance = currentGoalDistance;
      unit.lastNavDistance = currentNavDistance;
      unit.progressCheckAt = game.time + 0.45;
    }

    if (unit.stuckTime > 0.65 || unit.hardStuckTime > 0.9) {
      requestUnitPath(unit, goalX, goalY, true);
      unit.path = null;
      unit.pathIndex = 0;
      unit.stuckTime = 0;
      // Briefly shrink only the structure-edge clearance. This is enough to
      // break edge adhesion and squeeze through a legal corridor without making
      // the unit intangible to the building core.
      unit.gapAssistUntil = Math.max(unit.gapAssistUntil || 0, game.time + 1.25);
    }

    if (unit.hardStuckTime > 2.7) {
      // Last-resort escape remains available for genuinely enclosed/corrupted
      // layouts, but ordinary legal gaps should be resolved by exact geometry
      // and gap assist long before this point.
      unit.phaseUntil = game.time + 1.4;
      unit.gapAssistUntil = game.time + 2.2;
      unit.hardStuckTime = 0;
      unit.path = null;
      unit.pathIndex = 0;
      unit.repathAfter = 0;
    }

    if (Math.abs(unit.vx) + Math.abs(unit.vy) > 1) unit.angle = Math.atan2(unit.vy, unit.vx);
  }

  function updateEffects(dt) {
    for (let i = game.effects.length - 1; i >= 0; i--) {
      game.effects[i].life -= dt;
      if (game.effects[i].life <= 0) swapRemove(game.effects, i);
    }
  }

  function cullInvalidLiveEntities() {
    // This is intentionally cheap (maximum 1,000 entities) and guarantees that
    // no corrupted HP state can survive as an immortal target between frames.
    for (const unit of game.units) {
      if (unit.alive && (!Number.isFinite(unit.hp) || unit.hp <= 0)) destroyEntity(unit, null);
    }
    for (const building of game.buildings) {
      if (building.alive && (!Number.isFinite(building.hp) || building.hp <= 0)) destroyEntity(building, null);
    }
  }

  function rebuildSpatialHashes() {
    unitGrid.clear();
    for (const u of game.units) if (u.alive && !u.garrisoned) unitGrid.insert(u);
    if (game.buildingGridDirty) {
      buildingGrid.clear();
      for (const b of game.buildings) if (b.alive) buildingGrid.insert(b);
      game.buildingGridDirty = false;
    }
  }

  function compactDeadEntities() {
    if ((game.time * 4 | 0) === ((game.time - FIXED_DT) * 4 | 0)) return;

    game.units = game.units.filter(u => {
      if (u.alive || game.time - (u.destroyedAt ?? game.time) < 0.18) return true;
      game.entityById.delete(u.id);
      return false;
    });
    game.buildings = game.buildings.filter(b => {
      if (b.alive || game.time - (b.destroyedAt ?? game.time) < 0.22) return true;
      game.entityById.delete(b.id);
      return false;
    });
  }

