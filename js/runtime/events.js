'use strict';

  // ---------------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------------
  createBuildButtons();
  setBuildMenuCategory(game.buildMenuCategory || 'utility');
  refreshBuildModeControls();
  document.querySelectorAll('[data-build-category]').forEach(button => button.addEventListener('click', () => setBuildMenuCategory(button.dataset.buildCategory)));
  document.getElementById('continuousBuildToggle')?.addEventListener('change', event => { game.continuousBuild = !!event.currentTarget.checked; refreshBuildModeControls(); });
  document.getElementById('cancelBuildMode')?.addEventListener('click', () => setBuildMode(null));
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  els.canvas.addEventListener('pointerdown', handlePointerDown);
  els.canvas.addEventListener('pointermove', handlePointerMove);
  els.canvas.addEventListener('pointerup', endPointerDrag);
  els.canvas.addEventListener('pointercancel', endPointerDrag);
  els.canvas.addEventListener('mouseenter', () => { game.mouse.inside = true; });
  els.canvas.addEventListener('mouseleave', () => { if (!game.drag.active) game.mouse.inside = false; });
  els.canvas.addEventListener('click', handleCanvasClick);
  els.canvas.addEventListener('contextmenu', event => event.preventDefault());
  els.canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const before = screenToWorld(event.clientX, event.clientY);
    game.camera.targetZoom = clamp(game.camera.targetZoom * Math.exp(-event.deltaY * 0.0012), 0.38, 1.55);
    const ratio = game.camera.targetZoom / game.camera.zoom;
    game.camera.x = before.x - (before.x - game.camera.x) / ratio;
    game.camera.y = before.y - (before.y - game.camera.y) / ratio;
    clampCamera();
  }, { passive: false });
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', event => game.keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => {
    game.keys.clear();
    game.drag.active = false;
    game.drag.pointerId = null;
    game.drag.moved = false;
    els.canvas.classList.remove('dragging');
  });

  els.confirmAttack.addEventListener('click', deployAttack);
  els.closeAttackModal.addEventListener('click', closeAttackModal);
  els.attackModal.addEventListener('click', event => { if (event.target === els.attackModal) closeAttackModal(); });
  els.closeResearchModal?.addEventListener('click', closeResearchModal);
  els.researchModal?.addEventListener('click', event => { if (event.target === els.researchModal) closeResearchModal(); });
  els.pauseButton.addEventListener('click', togglePause);
  document.getElementById('missileAimConfirm')?.addEventListener('click', () => {
    const result = confirmMissileAimTarget();
    if (!result.ok) notify(result.reason || 'Unable to confirm missile launch.', 'warning', 2);
  });
  document.getElementById('missileAimClear')?.addEventListener('click', clearMissileAimTarget);
  document.getElementById('coordinatePickerConfirm')?.addEventListener('click', () => {
    if (!confirmCoordinatePicking()) notify('Click a target location first.', 'warning', 1.5);
  });
  document.getElementById('coordinatePickerCancel')?.addEventListener('click', () => cancelCoordinatePicking(false));
  document.getElementById('energyAimConfirm')?.addEventListener('click', () => {
    const result = confirmOrbitalEnergyAim();
    if (!result.ok) notify(result.reason || 'Unable to confirm orbital strike.', 'warning', 2);
  });
  document.getElementById('energyAimCancel')?.addEventListener('click', () => { cancelOrbitalEnergyAiming(); renderSelectionPanel(); });
  document.addEventListener('pointerdown', event => {
    const input = event.target?.closest?.('input[type="number"], input[data-command-field], .convoy-name');
    if (input && document.activeElement !== input) input.dataset.selectOnPointerUp = '1';
  });
  document.addEventListener('pointerup', event => {
    const input = event.target?.closest?.('input[type="number"], input[data-command-field], .convoy-name');
    if (input?.dataset.selectOnPointerUp === '1') {
      delete input.dataset.selectOnPointerUp;
      input.focus();
      if (input.type === 'number') input.dataset.replaceOnType = '1';
      else { try { input.select?.(); } catch (_) { /* non-text control */ } }
    }
  });
  window.addEventListener('keydown', event => {
    const input = event.target;
    if (!input?.matches?.('input[type="number"]') || input.dataset.replaceOnType !== '1') return;
    if (/^[0-9]$/.test(event.key) || event.key === '-' || event.key === '.') {
      input.value = '';
      delete input.dataset.replaceOnType;
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      input.value = '';
      delete input.dataset.replaceOnType;
      event.preventDefault();
    } else if (!['Shift','Control','Alt','Meta'].includes(event.key)) {
      delete input.dataset.replaceOnType;
    }
  }, true);
  document.querySelectorAll('[data-enemy-count]').forEach(button => {
    button.addEventListener('click', () => {
      game.enemyCount = clamp(Number(button.dataset.enemyCount) || 2, 1, 4);
      document.querySelectorAll('[data-enemy-count]').forEach(other => {
        other.classList.toggle('active', other === button);
      });
    });
  });
  document.querySelectorAll('[data-map-size]').forEach(button => {
    button.addEventListener('click', () => {
      game.mapSize = button.dataset.mapSize === 'large' ? 'large' : 'standard';
      document.querySelectorAll('[data-map-size]').forEach(other => {
        other.classList.toggle('active', other === button);
      });
    });
  });
  els.startButton.addEventListener('click', () => {
    els.startOverlay.classList.add('hidden');
    resetGame();
  });
  els.restartButton.addEventListener('click', resetGame);

  if (typeof location !== 'undefined' && location.search.includes('debug=1')) {
    window.__RTS_DEBUG__ = {
      game,
      BUILDINGS,
      UNITS,
      WORLD,
      MAP_SIZE_PRESETS,
      setWorldSizePreset,
      navGrid,
      createBuilding,
      createUnit,
      placeBuilding,
      openAttackModal,
      closeAttackModal,
      renderAttackModal,
      getDeploymentPreferences,
      getDeploymentContext,
      getDeploymentFacilitiesForCategory,
      getDeploymentTypesForCategory,
      getDeploymentAvailable,
      deployAttack,
      updateFortresses,
      updateBomber,
      updateBuildingCombat,
      updateCapitalEmergencyAA,
      updateTraining,
      applyDamage,
      fireWeapon,
      isAirStealthHidden,
      destroyEntity,
      markEntityDead,
      getMaxTrainable,
      getAirbaseReadyCount,
      getAirbaseCoolingCount,
      getAirbaseBomberCommitment,
      getAirbaseAvailableSlots,
      getAirbaseAssignedActiveCount,
      takeReadyBomber,
      storeLandedBomber,
      requestUnitPath,
      processPathRequests,
      isGroundSegmentClear,
      resetGame,
      rebuildSpatialHashes,
      update,
      updateHives,
      updateAI,
      updateElectronicWarfare,
      getEWStationStats,
      isPointInEWEmission,
      setEWAntennaHeading,
      getRadarDamageReceivedMultiplier,
      applyEWJamming,
      applyEWSpoofing,
      getSpoofedGoal,
      ELECTRONIC_WARFARE_BALANCE,
      MISSILE_BATTERY_BALANCE,
      MISSILE_TYPES,
      STRATEGIC_MISSILE_KIND,
      getStrategicMissileStats,
      getFragmentedZoneStats,
      getBurningZoneStats,
      getMissileSiloBuildTime,
      getMissileSiloReloadTime,
      getStockpileFillTime,
      getMissileStorageCapacity,
      getMissileSiloCount,
      getMissileLaunchSiteLimit,
      getStockpileParallelism,
      ensureMissileLaunchSiteState,
      countStoredMissiles,
      countLoadedMissiles,
      queueStockpileMissile,
      configureMissileSilo,
      toggleMissileSilo,
      updateMissileLaunchSites,
      beginMissileAiming,
      beginBestMissileAiming,
      findBestMissileLaunchSiteForAiming,
      getReadyMissileCount,
      cancelMissileAiming,
      selectMissileAimSilo,
      canMissileSiloFireAt,
      launchStrategicMissile,
      fireAimedMissileAt,
      confirmMissileAimTarget,
      clearMissileAimTarget,
      updateMissileAimingHUD,
      beginAutomationCoordinatePicking,
      setCoordinatePickerTarget,
      confirmCoordinatePicking,
      cancelCoordinatePicking,
      findStrategicMissileById,
      damageStrategicMissile,
      updateStrategicMissile,
      spoofStrategicMissile,
      getFragmentedZoneSlow,
      getBurningZoneDamageReceivedMultiplier,
      updateMissileZones,
      isPointBlockedByFragmentedZone,
      DIRECTED_ENERGY_BALANCE,
      ENERGY_CONSUMER_TYPES,
      getGeneratorMaxPower,
      getGeneratorRange,
      getGeneratorPowerCostRate,
      calculateEnergyOperatingCostPerMinute,
      getEnergyConsumerDemand,
      getEnergyPriority,
      setEnergyPriority,
      ensureEnergyBuildingState,
      getOrbitalBeamStats,
      getDeathRayStats,
      getEnergyFieldCaps,
      energyFieldBonusRatio,
      setGeneratorOutput,
      toggleEnergyNode,
      updateEnergyPowerNetworks,
      rebuildEnergyFields,
      getEnergyFieldsAt,
      getEnergyFieldAttackMultiplier,
      getEnergyFieldDamageReduction,
      getEnergyFieldSummaryForNode,
      getDeathRaySlow,
      updateDeathRayTower,
      updateOrbitalBeamSystem,
      beginOrbitalEnergyAiming,
      cancelOrbitalEnergyAiming,
      setEnergyAimTarget,
      fireOrbitalBeamSystemAt,
      fireOrbitalEnergyAt,
      confirmOrbitalEnergyAim,
      updateDirectedEnergy,
      ADVANCED_INFANTRY_BALANCE,
      ADV_INF_CATALOG,
      getAdvancedInfantryState,
      getPlayerInfantryLoadouts,
      getOperationalSMCs,
      hasOperationalSuperiorMobilizationComplex,
      getInfantryLoadoutCapacity,
      getInfantryLoadoutById,
      getInfantryLoadoutToken,
      parseInfantryLoadoutToken,
      isInfantryLoadoutToken,
      normalizeInfantryLoadout,
      saveInfantryLoadout,
      deleteInfantryLoadout,
      getInfantryLoadoutExtraCost,
      getInfantryLoadoutTrainingCost,
      getInfantryLoadoutConfigurationSnapshot,
      getAdvancedInfantryFlatHp,
      getAdvancedInfantrySpeedMultiplier,
      getAdvancedInfantryRangeMultiplier,
      getAdvancedInfantryCooldownMultiplier,
      getAdvancedInfantryDetectionMultiplier,
      getAdvancedInfantryDamageIntakeMultiplier,
      advancedInfantryHasArmouredProperty,
      advancedInfantryIgnoresLandmines,
      getAdvancedInfantryNullifyChance,
      getAdvancedInfantryEWResistance,
      advancedInfantryRejectsEW,
      getAdvancedInfantryCritStats,
      applyAdvancedInfantryCritical,
      getAdvancedInfantryWeaponProfiles,
      fireAdvancedInfantryWeapons,
      updateAdvancedInfantryProjectile,
      isAdvancedInfantryConcealedFrom,
      isAdvancedInfantryFullyStealthed,
      applyAdvancedInfantrySteering,
      updateAdvancedInfantry,
      applyAdvancedInfantryDeathEffects,
      getStoredInfantryLoadoutCount,
      getAdvancedInfantryQueueCount,
      queueInfantryLoadoutTraining,
      getPlayerGroundDefinitionTypes,
      getGroundDefinitionBaseType,
      getGroundDefinitionName,
      getGroundDefinitionDescription,
      getGroundDefinitionCost,
      getGroundDefinitionAvailable,
      takeGroundDefinitionRecord,
      queueGroundDefinitionTraining,
      getCommandGroundTypes,
      aiAdoptAdvancedInfantry,
      aiBuild,
      aiTrain,
      aiAttack,
      aiResearch,
      aiHasSubstantialResearch,
      getAIPersonality,
      getAIMacroTelemetry,
      hasCommandCenter,
      setBuildMenuCategory,
      setBuildMode,
      refreshBuildModeControls,
      getCommandAutomationState,
      normalizeScheduledDeployment,
      setScheduledDeployment,
      getScheduledDeploymentTotal,
      trainScheduledDeployment,
      startScheduledDeployment,
      updateScheduledDeployments,
      applyFocusedMission,
      completeFocusedMission,
      applyAssaultZone,
      findAssaultZoneTarget,
      getAdvancedCoordinationCenterLimit,
      getCoordinationCenterBandwidth,
      getCoordinationCenterUsedBandwidth,
      getTheaterDeploymentCap,
      getGroundCompositionEntityCount,
      createAutomatedWarfare,
      pauseAutomatedWarfare,
      cancelAutomatedWarfare,
      updateCommandAutomation,
      launchGroundComposition,
      launchAirSortie,
      queueCommandUnit,
      getRoutineSetCost,
      getAutomationInitiationMultiplier,
      getTheaterTrainingTimeMultiplier,
      getTheaterCostMultiplier,
      getAerialAutomationTrainingTimeMultiplier,
      getAerialAutomationCostMultiplier,
      getTrainingMultiplier,
      DOCTRINE_RESEARCH,
      SPECIALIZED_RESEARCH,
      ONSITE_UPGRADES,
      getResearchDefinition,
      getResearchSlotCount,
      getAvailableResearchProvider,
      getResearchProviders,
      getResearchProvider,
      getResearchProviderActiveCount,
      getResearchProviderAvailableSlots,
      getResearchCost,
      getResearchDuration,
      getDoctrineResearchStartedCount,
      getVehiclePassengerComposition,
      setVehiclePassengerComposition,
      getVehicleBuildConfiguration,
      getVehiclePassengerCount,
      getTrainingPackageCost,
      createConfiguredPassengerRecords,
      canStartResearch,
      startResearch,
      completeResearch,
      updateResearch,
      reassignResearchProvider,
      isResearchComplete,
      isDoctrineUnlocked,
      hasResearchCapability,
      isDefinitionUnlocked,
      hasOnsiteUpgrade,
      canApplyOnsiteUpgrade,
      applyOnsiteUpgrade,
      getOnsiteUpgradeLevel,
      getOnsiteUpgradeCeiling,
      getOnsiteUpgradeCost,
      getOnsiteUpgradeRecoveryRate,
      getOnsiteUpgradeEffectScale,
      canApplyBuildingOnsiteUpgrade,
      applyBuildingOnsiteUpgrade,
      commitBuildingOnsiteUpgrade,
      getStructureRemovalRefundRate,
      getEngineeringComplexCapacity,
      getEngineeringComplexCommitment,
      getEngineeringComplexActiveCount,
      queueEngineerTraining,
      updateEngineeringComplexes,
      updateAdvancedEngineerUnit,
      getAvailableAdvancedEngineerCount,
      moveUnit,
      updateUnits,
      getBuildingUnitCollisionGap,
      getEngineerRestDuration,
      getEngineerEndurance,
      getEngineerRepairRate,
      LIFECYCLE_STATES,
      createUnitRecord,
      createAndStoreUnit,
      createUnitFromRecord,
      recordFromUnit,
      storeUnitRecord,
      getGroundFacilityStorageCapacity,
      getGroundFacilityStoredCount,
      getGroundFacilityAvailableStorage,
      takeStoredUnit,
      restoreStoredUnit,
      addToCapitalReserve,
      getCapitalReserveCount,
      recoverCapitalReserve,
      evacuateBuildingContentsToCapital,
      removeBuilding,
      syncGroundStorageCounts,
      getPlayerModifiedStat,
      getEntityStat,
      getDefinitionPlayerStat,
      getUnitCost,
      getUnitTrainingTime,
      getAirbaseAircraftCapacity,
      getAircraftTurnaroundSpeedMultiplier,
      getAircraftTurnaroundSeconds,
      getFighterPayloadCapacity,
      getParatrooperCapacity,
      normalizeFighterMissileConfiguration,
      setFighterMissileConfiguration,
      normalizeParatrooperComposition,
      setParatrooperComposition,
      getAircraftBuildConfiguration,
      getParatrooperPassengerCount,
      getParatrooperReloadCost,
      tryReloadParatrooperRecord,
      serviceParatrooperReloads,
      takeReadyAircraft,
      storeLandedAircraft,
      getAirbaseAircraftCommitment,
      getDroneBatchCost,
      getDroneBatchDiscount,
      canQueueDroneBatch,
      getDroneHubCapacity,
      getDroneHubStoredCount,
      getLoyalWingmanNetworkRoom,
      getLoyalWingmanSortieCap,
      getAirbaseWingmanCapacity,
      getAirbaseReadyWingmanCount,
      getAirbaseActiveWingmanCount,
      getAirbaseAvailableWingmanSlots,
      queueDroneBatch,
      takeStoredDrone,
      storeDroneAtHub,
      storeWingmanAtAirbase,
      redistributeLoyalWingmen,
      setHiveMode,
      spawnHiveDroneWave,
      updateHives,
      detonateLoiteringMunition,
      updateLoiteringMunition,
      isValidTarget,
      findClosestEnemy,
      findClosestEnemyAircraft,
      findClosestEnemyWingmanAtPoint,
      updateProjectiles,
      launchAAMissile,
      updateAirDefenseTower,
      launchWingmanAirGroundMissile,
      launchLoyalWingmanEscort,
      updateLoyalWingman,
      updateSuperFighter,
      updateParatrooperPlane,
      dropParatroopers,
      updateParachutingTroop,
      launchFighterA2AMissile,
      launchFighterA2GMissile,
      launchFlareBurst,
      updateAircraftFlareDefense,
      updateHomingAirProjectile,
      getFighterAttackRange,
      findFighterGroundStrikeTarget,
      findFighterPatrolTarget,
      countActiveFighterA2AMissiles,
      AIR_DOMINANCE_BALANCE,
      getLoiteringAOE,
      getTransportCapacity,
      getTransportCapacityForType,
      loadCargoRecord,
      unloadCargo,
      syncPlayerUnitDurability,
      getUnitWeaponProfile,
      getEntityStatFromBase,
      setModifierSource,
      removeModifierSource,
      definitionHasTag,
      entityHasTag,
      entityHasCapability,
      applyStatus,
      removeStatus,
      hasStatus,
      getStatusRemaining,
      updateStatuses,
      calculateIncome,
      updateEconomy,
      getBuildingIncome,
      getUpgradeCost,
      trainUnits,
      renderSelectionPanel,
      renderAttackModal,
      openAttackModal,
      renderResearchModal,
      updateResearchProgressUI,
      openResearchModal,
      checkPlacement,
      upgradeSettlement
    };
  }

