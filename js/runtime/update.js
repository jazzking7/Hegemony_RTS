'use strict';

  // ---------------------------------------------------------------------------
  // Main update
  // ---------------------------------------------------------------------------
  function update(dt) {
    updateCamera(dt);
    positionAttackMarker();
    if (!game.started || game.paused || game.over) return;
    game.time += dt;

    cullInvalidLiveEntities();
    rebuildSpatialHashes();
    processPathRequests();
    updateEconomy(dt);
    updateResearch(dt);
    updateTraining(dt);
    updateCommandAutomation(dt);
    updateEngineeringComplexes(dt);
    updateHives(dt);
    updateFortresses(dt);
    updateAI(dt);
    updateMissileLaunchSites(dt);
    updateMissileZones(dt);
    updateElectronicWarfare(dt);
    updateDirectedEnergy(dt);
    updateAdvancedInfantry(dt);
    updateBuildingCombat(dt);
    // Tick statuses after building combat so a Landmine stun is decremented in
    // the same fixed step, matching the legacy unit-loop timer behavior exactly.
    updateStatuses(dt);
    updateUnits(dt);
    updateProjectiles(dt);
    updateEffects(dt);
    compactDeadEntities();

    if (game.notificationUntil && game.time > game.notificationUntil) {
      els.notification.textContent = 'Destroy enemy capitals to win.';
      els.notification.className = 'notification';
      game.notificationUntil = 0;
    }
  }

