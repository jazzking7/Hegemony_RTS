'use strict';

  // ---------------------------------------------------------------------------
  // HUD and input
  // ---------------------------------------------------------------------------
  function updateHUD() {
    if (!game.players.length) return;
    const player = game.players[PLAYER_ID];
    els.money.textContent = moneyText(player.money);
    const grossIncome = calculateIncome(PLAYER_ID);
    const energyCost = typeof calculateEnergyOperatingCostPerMinute === 'function' ? calculateEnergyOperatingCostPerMinute(PLAYER_ID) : 0;
    const netIncome = grossIncome - energyCost;
    els.income.textContent = `${netIncome < 0 ? '-' : ''}${moneyText(Math.abs(netIncome))}/min`;
    const activeUnits = game.units.filter(u => u.alive && u.playerId === PLAYER_ID).length;
    const storedUnits = game.buildings.filter(b => b.alive && b.playerId === PLAYER_ID && DEPLOYMENT_FACILITY_TYPES.includes(b.type)).reduce((sum, b) => sum + Object.values(b.storage).reduce((a, n) => a + n, 0), 0);
    const reserveUnits = getCapitalReserveCount(PLAYER_ID);
    els.force.textContent = `${activeUnits} active · ${storedUnits} stored${reserveUnits ? ` · ${reserveUnits} reserve` : ''}`;
    els.status.textContent = !player.alive ? 'DEFEATED' : game.paused ? 'PAUSED' : 'OPERATIONAL';
    els.pauseButton.textContent = game.paused ? '▶' : 'Ⅱ';
    refreshBuildButtons();

    // Keep the selected panel live without rebuilding its DOM. Full panel
    // renders are event-driven; this lightweight pass only mutates values and
    // disabled/progress states so hovered controls never get replaced.
    if (game.selected?.alive && !game.missileAimingSiteId && !game.energyAimingSystemId) refreshSelectionPanelLiveState();
    if (game.missileAimingSiteId) updateMissileAimingHUD();
    if (game.energyAimingSystemId) updateEnergyAimingHUD();
    if (game.coordinatePicker?.active) updateCoordinatePickerHUD();
  }

  function handleCanvasClick(event) {
    if (game.drag.ignoreNextClick) {
      game.drag.ignoreNextClick = false;
      return;
    }
    if (!game.started || game.paused || game.over || !els.attackModal.classList.contains('hidden')) return;
    const rect = els.canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    if (game.coordinatePicker?.active) {
      setCoordinatePickerTarget(world.x, world.y);
      return;
    }

    if (game.energyAimingSystemId) {
      setEnergyAimTarget(world.x, world.y);
      return;
    }

    if (game.missileAimingSiteId) {
      const result = fireAimedMissileAt(world.x, world.y, true);
      if (!result.ok) notify(result.reason || 'Invalid missile target.', 'warning', 2);
      return;
    }

    if (game.ewAimingBuildingId) {
      const station = game.entityById.get(game.ewAimingBuildingId);
      if (station?.alive && station.playerId === PLAYER_ID && EW_STATION_TYPES.includes(station.type)) {
        setEWAntennaHeading(station, Math.atan2(world.y - station.y, world.x - station.x));
        game.ewAimingBuildingId = null;
        renderSelectionPanel();
        notify(`${BUILDINGS[station.type].shortName || BUILDINGS[station.type].name} antenna heading updated.`, 'good', 2);
      } else game.ewAimingBuildingId = null;
      return;
    }

    if (game.buildMode) {
      placeBuilding(game.buildMode, world.x, world.y, PLAYER_ID);
      return;
    }

    buildingGrid.queryCircle(world.x, world.y, 70, queryScratchA);
    let picked = null;
    let bestD2 = Infinity;
    for (const b of queryScratchA) {
      if (!b.alive || b.playerId !== PLAYER_ID) continue;
      const d2 = (b.x - world.x) ** 2 + (b.y - world.y) ** 2;
      if (d2 <= (b.radius + 9) ** 2 && d2 < bestD2) { bestD2 = d2; picked = b; }
    }
    setSelection(picked);
  }

  function updateMouseFromPointer(event) {
    game.mouse.x = event.clientX;
    game.mouse.y = event.clientY;
    game.mouse.inside = true;
    const w = screenToWorld(event.clientX, event.clientY);
    game.mouse.worldX = w.x;
    game.mouse.worldY = w.y;
    if (game.missileAimingSiteId) updateMissileAimingHUD();
    if (game.energyAimingSystemId) updateEnergyAimingHUD();
    if (game.coordinatePicker?.active) updateCoordinatePickerHUD();
  }

  function handlePointerDown(event) {
    updateMouseFromPointer(event);
    if (!game.started || !els.attackModal.classList.contains('hidden')) return;
    if (![0, 1, 2].includes(event.button)) return;
    if (game.coordinatePicker?.active || game.energyAimingSystemId) return;
    if (event.button === 0 && game.buildMode) return;

    game.drag.active = true;
    game.drag.pointerId = event.pointerId;
    game.drag.button = event.button;
    game.drag.startX = game.drag.lastX = event.clientX;
    game.drag.startY = game.drag.lastY = event.clientY;
    game.drag.moved = false;
    els.canvas.setPointerCapture?.(event.pointerId);
    if (event.button !== 0) event.preventDefault();
  }

  function handlePointerMove(event) {
    updateMouseFromPointer(event);
    if (!game.drag.active || event.pointerId !== game.drag.pointerId) return;

    const dx = event.clientX - game.drag.lastX;
    const dy = event.clientY - game.drag.lastY;
    game.drag.lastX = event.clientX;
    game.drag.lastY = event.clientY;

    const totalDistance = Math.hypot(event.clientX - game.drag.startX, event.clientY - game.drag.startY);
    if (totalDistance > 4) game.drag.moved = true;
    if (!game.drag.moved && game.drag.button === 0) return;

    game.camera.x -= dx / game.camera.zoom;
    game.camera.y -= dy / game.camera.zoom;
    clampCamera();
    updateMouseFromPointer(event);
    els.canvas.classList.add('dragging');
    event.preventDefault();
  }

  function endPointerDrag(event) {
    if (!game.drag.active || event.pointerId !== game.drag.pointerId) return;
    if (game.drag.moved && game.drag.button === 0) game.drag.ignoreNextClick = true;
    game.drag.active = false;
    game.drag.pointerId = null;
    game.drag.moved = false;
    els.canvas.classList.remove('dragging');
    if (els.canvas.hasPointerCapture?.(event.pointerId)) els.canvas.releasePointerCapture(event.pointerId);
  }

  function setCoordinatePickingPresentation(active) {
    document.getElementById('app')?.classList.toggle('coordinate-picking', !!active);
    document.getElementById('coordinatePickerHud')?.classList.toggle('hidden', !active);
  }

  function beginAutomationCoordinatePicking(center, kind) {
    if (!center?.alive || center.playerId !== PLAYER_ID || center.type !== 'advancedCoordinationCenter') return false;
    const ground = kind === 'ground';
    const xInput = els.selectionContent.querySelector(ground ? '[data-aw-ground-x]' : '[data-aw-air-x]');
    const yInput = els.selectionContent.querySelector(ground ? '[data-aw-ground-y]' : '[data-aw-air-y]');
    if (!xInput || !yInput) return false;
    if (typeof cancelMissileAiming === 'function') cancelMissileAiming();
    if (typeof cancelOrbitalEnergyAiming === 'function') cancelOrbitalEnergyAiming();
    cancelEWAntennaAim();
    setBuildMode(null);
    game.coordinatePicker = {
      active: true,
      kind: ground ? 'ground' : 'air',
      centerId: center.id,
      xInput, yInput,
      originalX: Number(xInput.value) || center.x,
      originalY: Number(yInput.value) || center.y,
      target: null
    };
    setCoordinatePickingPresentation(true);
    updateCoordinatePickerHUD();
    return true;
  }

  function setCoordinatePickerTarget(x, y) {
    if (!game.coordinatePicker?.active) return false;
    game.coordinatePicker.target = { x: clamp(x, 0, WORLD.width), y: clamp(y, 0, WORLD.height) };
    updateCoordinatePickerHUD();
    return true;
  }

  function updateCoordinatePickerHUD() {
    const picker = game.coordinatePicker;
    const hud = document.getElementById('coordinatePickerHud');
    if (!hud) return;
    if (!picker?.active) { hud.classList.add('hidden'); return; }
    const center = game.entityById.get(picker.centerId);
    if (!center?.alive || center.playerId !== PLAYER_ID) { cancelCoordinatePicking(false); return; }
    const title = document.getElementById('coordinatePickerTitle');
    const info = document.getElementById('coordinatePickerInfo');
    const confirm = document.getElementById('coordinatePickerConfirm');
    if (title) title.textContent = picker.kind === 'ground' ? 'THEATER ROUTINE TARGET' : 'AERIAL AUTOMATION TARGET';
    if (info) {
      if (picker.target) info.textContent = `TARGET X ${Math.round(picker.target.x)} · Y ${Math.round(picker.target.y)} · Space or Confirm to use`;
      else if (game.mouse.inside) info.textContent = `POINTER X ${Math.round(game.mouse.worldX)} · Y ${Math.round(game.mouse.worldY)} · click to mark`;
      else info.textContent = 'Click the battlefield to place a target marker.';
    }
    if (confirm) confirm.disabled = !picker.target;
  }

  function confirmCoordinatePicking() {
    const picker = game.coordinatePicker;
    if (!picker?.active || !picker.target) return false;
    if (picker.xInput?.isConnected) picker.xInput.value = String(Math.round(picker.target.x));
    if (picker.yInput?.isConnected) picker.yInput.value = String(Math.round(picker.target.y));
    cancelCoordinatePicking(true);
    return true;
  }

  function cancelCoordinatePicking(confirmed = false) {
    if (!game.coordinatePicker?.active) return false;
    game.coordinatePicker = null;
    setCoordinatePickingPresentation(false);
    if (!confirmed) notify('Coordinate selection cancelled.', 'warning', 1.5);
    return true;
  }

  function handleKeyDown(event) {
    const key = event.key.toLowerCase();
    const editingField = event.target?.matches?.('input, textarea, select, [contenteditable="true"]');
    if (editingField && key !== 'escape') return;
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
    game.keys.add(key);

    if (event.repeat) return;
    if (key === 'escape') {
      if (game.coordinatePicker?.active) { cancelCoordinatePicking(false); return; }
      if (game.energyAimingSystemId) { cancelOrbitalEnergyAiming(); renderSelectionPanel(); return; }
      if (game.missileAimingSiteId) { cancelMissileAiming(); renderSelectionPanel(); return; }
      if (game.ewAimingBuildingId) { cancelEWAntennaAim(); return; }
      if (els.researchModal && !els.researchModal.classList.contains('hidden')) closeResearchModal();
      else if (!els.attackModal.classList.contains('hidden')) closeAttackModal();
      else setBuildMode(null);
      return;
    }
    if (game.coordinatePicker?.active && key === ' ') {
      if (!confirmCoordinatePicking()) notify('Click a target location first.', 'warning', 1.5);
      return;
    }
    if (game.energyAimingSystemId && key === ' ') {
      const result = fireOrbitalEnergyAt(game.mouse.worldX, game.mouse.worldY);
      if (!result.ok) notify(result.reason || 'Unable to fire Orbital Beam.', 'warning', 2);
      return;
    }
    if (game.missileAimingSiteId && /^[1-6]$/.test(key)) {
      if (!selectMissileAimSilo(Number(key) - 1)) notify(`Silo ${key} is unavailable.`, 'warning', 1.5);
      return;
    }
    if (key === ' ' && game.missileAimingSiteId) {
      const result = fireAimedMissileAt(game.mouse.worldX, game.mouse.worldY, false);
      if (!result.ok) notify(result.reason || 'Unable to fire missile.', 'warning', 2);
      return;
    }
    if (key === 't' && game.started && !game.paused && !game.over && !game.coordinatePicker?.active && !game.energyAimingSystemId && (!els.researchModal || els.researchModal.classList.contains('hidden')) && els.attackModal.classList.contains('hidden')) {
      const result = beginBestMissileAiming();
      if (!result.ok) notify(result.reason, 'warning', 2);
      return;
    }
    if (key === ' ') togglePause();
    if (key === 'r' && game.started && !game.over && game.players[PLAYER_ID]?.capital?.alive) {
      openResearchModal();
      return;
    }
    if (key === 'a' && game.started && !game.paused && !game.over && els.attackModal.classList.contains('hidden') && (!els.researchModal || els.researchModal.classList.contains('hidden'))) {
      openAttackModal(game.mouse.worldX, game.mouse.worldY);
    }

    // Optional local stress test: F8 adds up to 300 friendly infantry once.
    if (key === 'f8' && game.started && !game.stressSpawned) {
      const cap = game.players[PLAYER_ID].capital;
      const count = Math.min(300, MAX_ENTITIES - entityCount());
      for (let i = 0; i < count; i++) {
        const a = i / count * Math.PI * 2;
        const r = 100 + (i % 25) * 8;
        const u = createUnit(i % 8 === 0 ? 'elite' : 'basic', PLAYER_ID, cap.x + Math.cos(a) * r, cap.y + Math.sin(a) * r);
        if (u) {
          u.orderX = cap.x + Math.cos(a) * 420;
          u.orderY = cap.y + Math.sin(a) * 420;
          u.hasOrder = true;
        }
      }
      game.stressSpawned = true;
      notify(`${count} stress-test units created.`, 'good', 4);
    }
  }

  function togglePause() {
    if (!game.started || game.over) return;
    game.paused = !game.paused;
    notify(game.paused ? 'Simulation paused.' : 'Simulation resumed.', '', 1.5);
    updateHUD();
  }

