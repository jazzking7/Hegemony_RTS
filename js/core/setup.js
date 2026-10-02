'use strict';

  // ---------------------------------------------------------------------------
  // Setup and reset
  // ---------------------------------------------------------------------------
  function getStartLayout(enemyCount) {
    const scaleX = WORLD.width / MAP_SIZE_PRESETS.standard.width;
    const scaleY = WORLD.height / MAP_SIZE_PRESETS.standard.height;
    const point = (x, y) => ({ x: x * scaleX, y: y * scaleY });
    const human = point(680, 1100);
    const layouts = {
      1: [point(2920, 1100)],
      2: [point(2920, 610), point(2920, 1690)],
      3: [point(2950, 1100), point(1820, 360), point(1820, 1840)],
      4: [point(2920, 460), point(2920, 1740), point(1770, 350), point(1770, 1850)]
    };
    return { human, enemies: layouts[clamp(enemyCount, 1, 4)] };
  }

  function resetGame() {
    setWorldSizePreset(game.mapSize || 'standard');
    unitGrid.resizeWorld();
    buildingGrid.resizeWorld();
    navGrid.resizeWorld();
    game.time = 0;
    game.id = 1;
    game.unitInstanceId = 1;
    game.automationId = 1;
    game.scheduleExecutionId = 1;
    game.enemyCount = clamp(Math.round(game.enemyCount || 2), 1, 4);
    game.players = [];
    for (let id = 0; id <= game.enemyCount; id++) {
      game.players.push(makePlayer(id, PLAYER_NAMES[id], id !== PLAYER_ID));
    }
    game.buildings.length = 0;
    game.units.length = 0;
    game.projectiles.length = 0;
    game.effects.length = 0;
    game.entityById.clear();
    game.liveEntityCount = 0;
    game.buildingGridDirty = true;
    game.pathQueue.length = 0;
    game.urgentPathQueue.length = 0;
    navGrid.markDirty();
    game.selected = null;
    game.buildMode = null;
    game.continuousBuild = false;
    game.buildMenuCategory = 'utility';
    game.attackTarget = null;
    game.chosenBaseId = null;
    game.deploymentPrefs = { mode: 'facility', globalCategory: 'ground', lastFacilityId: null, bringUnmannedEscorts: false, escortsPerAircraft: 1 };
    game.researchProviderSelectionId = null;
    game.researchSelectedDoctrine = null;
    game.coordinatePicker = null;
    game.ewAimingBuildingId = null;
    game.missileAimingSiteId = null;
    game.missileAimSiloIndex = null;
    game.missileAimTarget = null;
    game.energyAimingSystemId = null;
    game.energyAimTarget = null;
    game.energyFields = [];
    game.energyFieldRevision = 0;
    game.energyFieldSignature = '';
    game.missileZones = [];
    document.getElementById('app')?.classList.remove('missile-aiming', 'coordinate-picking', 'energy-aiming');
    document.getElementById('missileAimHud')?.classList.add('hidden');
    document.getElementById('coordinatePickerHud')?.classList.add('hidden');
    document.getElementById('energyAimHud')?.classList.add('hidden');
    game.attackAmounts = { basic: 0, elite: 0, tank: 0, spg: 0, apc: 0, ifv: 0, bomber: 0, superFighter: 0, paratrooperPlane: 0, loiteringMunition: 0 };
    game.bringUnmannedEscorts = false;
    game.focusedDeployment = false;
    game.escortsPerAircraft = 1;
    game.over = false;
    game.paused = false;
    const layout = getStartLayout(game.enemyCount);
    game.camera.x = layout.human.x + 80;
    game.camera.y = layout.human.y;
    game.camera.zoom = 0.72;
    game.camera.targetZoom = 0.72;
    game.drag.active = false;
    game.drag.pointerId = null;
    game.drag.moved = false;
    game.drag.ignoreNextClick = false;
    els.canvas.classList.remove('dragging');
    closeResearchModal();

    setupPlayerBase(0, layout.human.x, layout.human.y, 0);
    for (let i = 0; i < layout.enemies.length; i++) {
      const start = layout.enemies[i];
      const facing = Math.atan2(WORLD.height / 2 - start.y, WORLD.width / 2 - start.x);
      setupPlayerBase(i + 1, start.x, start.y, facing);
    }

    // Give each starting base a small deployment reserve. Stored troops now
    // have persistent identities even though the legacy storage counters remain
    // as UI/compatibility mirrors.
    for (const b of game.buildings) {
      if (b.type === 'militaryBase') {
        const basicCount = b.playerId === PLAYER_ID ? 8 : 6;
        for (let i = 0; i < basicCount; i++) createAndStoreUnit(b, 'basic');
        for (let i = 0; i < 2; i++) createAndStoreUnit(b, 'elite');
        createAndStoreUnit(b, 'tank');
      }
    }

    rebuildSpatialHashes();
    navGrid.rebuild();
    game.started = true;
    els.gameOverOverlay.classList.add('hidden');
    setBuildMode(null);
    setSelection(null);
    refreshBuildButtons();
    updateHUD();
    const mapPreset = MAP_SIZE_PRESETS[game.mapSize] || MAP_SIZE_PRESETS.standard;
    notify(`Skirmish online against ${game.enemyCount} enemy commander${game.enemyCount === 1 ? '' : 's'} on the ${mapPreset.name.toLowerCase()} map. Expand inside the capital command radius.`, 'good', 5);
  }

  function setupPlayerBase(playerId, x, y, facing) {
    createBuilding('capital', playerId, x, y);
    createBuilding('militaryBase', playerId, x + Math.cos(facing) * 145, y + Math.sin(facing) * 145 - 120);
    createBuilding('city', playerId, x + Math.cos(facing) * 170, y + Math.sin(facing) * 170 + 120);
    createBuilding('machineGun', playerId, x + Math.cos(facing + 0.75) * 245, y + Math.sin(facing + 0.75) * 245);
    createBuilding('cannon', playerId, x + Math.cos(facing - 0.75) * 270, y + Math.sin(facing - 0.75) * 270);
  }

