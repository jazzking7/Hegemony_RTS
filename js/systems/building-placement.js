'use strict';

  // ---------------------------------------------------------------------------
  // Building placement
  // ---------------------------------------------------------------------------
  function checkPlacement(type, x, y, playerId = PLAYER_ID) {
    const def = BUILDINGS[type];
    const player = game.players[playerId];
    if (!player || !player.alive || !player.capital || !player.capital.alive) return { valid: false, reason: 'Capital unavailable' };
    if (!isDefinitionUnlocked(playerId, 'building', type)) return { valid: false, reason: 'Locked by research' };
    if (type === 'militaryCommand' && game.buildings.some(b => b.alive && b.playerId === playerId && b.type === 'militaryCommand')) {
      return { valid: false, reason: 'Command Center limit reached' };
    }
    if (type === 'advancedCoordinationCenter' && game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === 'advancedCoordinationCenter').length >= getAdvancedCoordinationCenterLimit(playerId)) {
      return { valid: false, reason: 'Advanced Coordination Center limit reached' };
    }
    if (type === 'missileLaunchSite' && game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === 'missileLaunchSite').length >= getMissileLaunchSiteLimit(playerId)) {
      return { valid: false, reason: 'Missile Launch Site limit reached' };
    }
    if (type === 'orbitalBeamSystem' && game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === 'orbitalBeamSystem').length >= getOrbitalBeamStats(playerId).cap) {
      return { valid: false, reason: 'Orbital Beam System limit reached' };
    }
    if (type === 'researchCenter' && game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === 'researchCenter').length >= RESEARCH_CENTER_BUILD_CAP) {
      return { valid: false, reason: `Research Center limit reached (${RESEARCH_CENTER_BUILD_CAP})` };
    }
    if (player.money < def.cost) return { valid: false, reason: 'Insufficient funds' };
    const useFortressGarrison = type === 'fortress' && getStoredGroundUnitCount(playerId) >= 10;
    const entityNeed = type === 'fortress' ? (useFortressGarrison ? 11 : 1) : 1;
    if (entityCount() > MAX_ENTITIES - entityNeed) return { valid: false, reason: 'Entity limit reached' };
    if (type === 'fortress' && !useFortressGarrison && getAvailableAdvancedEngineerCount(playerId) < 1) return { valid: false, reason: 'Requires 10 stored infantry or an available Advanced Engineer' };
    if (x < def.radius + 12 || y < def.radius + 12 || x > WORLD.width - def.radius - 12 || y > WORLD.height - def.radius - 12) {
      return { valid: false, reason: 'Outside battlefield' };
    }
    // Fortresses are expeditionary strongpoints and are the one structure that
    // may be established outside existing command/build radii.
    if (type !== 'fortress' && !isInsideFriendlyBuildZone(playerId, x, y, def.radius)) {
      return { valid: false, reason: 'Outside construction radius' };
    }

    if (typeof isPointBlockedByFragmentedZone === 'function' && isPointBlockedByFragmentedZone(x, y, def.radius)) return { valid: false, reason: 'Fragmented terrain prevents construction' };

    if (type === 'energyFieldNode') {
      for (const node of game.buildings) {
        if (!node.alive || node.playerId !== playerId || node.type !== 'energyFieldNode') continue;
        if (Math.hypot(x - node.x, y - node.y) < DIRECTED_ENERGY_BALANCE.nodeMinSpacing) return { valid: false, reason: `Field Nodes require ${DIRECTED_ENERGY_BALANCE.nodeMinSpacing} spacing` };
      }
    }

    buildingGrid.queryCircle(x, y, def.radius + 90, queryScratchA);
    for (const b of queryScratchA) {
      if (!b.alive) continue;
      if (Math.hypot(x - b.x, y - b.y) < def.radius + b.radius + BUILDING_PLACEMENT_GAP) {
        return { valid: false, reason: 'Obstructed' };
      }
    }
    return { valid: true, reason: type === 'fortress' ? (useFortressGarrison ? 'Deploy 10-infantry construction garrison' : 'Advanced Engineers will construct this Fortress') : 'Click to construct' };
  }

  function takeFortressBuilderRecord(base) {
    if (!base?.alive || !['militaryBase','superiorMobilizationComplex'].includes(base.type)) return null;
    base.storedUnits ||= [];
    const index = base.storedUnits.findIndex(record => record?.lifecycleState === LIFECYCLE_STATES.STORED && INFANTRY_UNIT_TYPES.includes(record.type));
    if (index < 0) return null;
    const [record] = base.storedUnits.splice(index, 1);
    syncGroundStorageCounts(base);
    return record;
  }

  function dispatchFortressBuilders(fortress, requested = 10) {
    if (!fortress?.alive || fortress.type !== 'fortress' || fortress.constructionState === 'operational' || fortress.allowGarrisonConstruction === false) return 0;
    const bases = game.buildings
      .filter(b => b.alive && b.playerId === fortress.playerId && ['militaryBase','superiorMobilizationComplex'].includes(b.type))
      .sort((a, b) => distance(a, fortress) - distance(b, fortress));
    let sent = 0;
    const liveIds = (fortress.builderIds || []).filter(id => game.entityById.get(id)?.alive);
    fortress.builderIds = liveIds;
    const need = Math.max(0, Math.min(requested, 10 - liveIds.length));
    if (!need) return 0;

    for (const base of bases) {
      while (sent < need && entityCount() < MAX_ENTITIES) {
        const record = takeFortressBuilderRecord(base);
        if (!record) break;
        const slot = fortress.builderIds.length;
        const angle = slot / 10 * Math.PI * 2;
        const spawnAngle = ((slot + base.id) % 12) / 12 * Math.PI * 2;
        const unit = createUnitFromRecord(record, base.x + Math.cos(spawnAngle) * 48, base.y + Math.sin(spawnAngle) * 48, {
          fortressBuilderSiteId: fortress.id,
          fortressBuilderArrived: false,
          fortressBuilderSlot: slot
        });
        if (!unit) { restoreStoredUnit(base, record); return sent; }
        unit.orderX = fortress.x + Math.cos(angle) * (fortress.radius + 30);
        unit.orderY = fortress.y + Math.sin(angle) * (fortress.radius + 30);
        unit.hasOrder = true;
        fortress.builderIds.push(unit.id);
        sent++;
      }
      if (sent >= need) break;
    }
    return sent;
  }

  function placeBuilding(type, x, y, playerId = PLAYER_ID) {
    const result = checkPlacement(type, x, y, playerId);
    if (!result.valid) {
      if (playerId === PLAYER_ID) notify(result.reason, 'warning', 2);
      return null;
    }
    const player = game.players[playerId];
    player.money -= BUILDINGS[type].cost;
    let building;
    if (type === 'fortress') {
      const useGarrison = getStoredGroundUnitCount(playerId) >= 10;
      building = createBuilding(type, playerId, x, y, {
        hp: 500,
        maxHp: BUILDINGS.fortress.hp,
        constructionState: 'mobilizing',
        constructionProgress: 0,
        builderIds: [],
        engineerBuilderIds: [],
        garrisonIds: [],
        allowGarrisonConstruction: useGarrison
      });
      if (useGarrison) {
        const sent = dispatchFortressBuilders(building, 10);
        if (sent < 10 && playerId === PLAYER_ID) notify(`Fortress convoy mobilized with ${sent}/10 infantry; replacements will deploy as they become available.`, 'warning', 4);
      }
    } else {
      building = createBuilding(type, playerId, x, y);
    }
    if (playerId === PLAYER_ID) {
      if (type === 'fortress') notify(building.allowGarrisonConstruction ? 'Fortress site established. Ten infantry are moving to construct it.' : 'Fortress site established. Advanced Engineers will construct it.', 'good', 3.2);
      else notify(`${BUILDINGS[type].name} constructed.`, 'good', 3.2);
      if (game.continuousBuild) {
        // Keep placement active. Selection remains clear so the right panel does not
        // steal focus while the player is placing a construction chain.
        setSelection(null);
        setBuildMode(type);
      } else {
        setSelection(building);
        setBuildMode(null);
      }
      refreshBuildButtons();
    }
    return building;
  }

