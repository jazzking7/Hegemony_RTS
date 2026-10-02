'use strict';

  // ---------------------------------------------------------------------------
  // Electronic Warfare & Recon
  // ---------------------------------------------------------------------------
  // EW waves are modeled as instantaneous periodic cone scans. The visual cone
  // is shown only while the player is aiming an antenna; no wave projectiles or
  // persistent coverage overlays are created.
  const EW_STATION_TYPES = Object.freeze(['radarStation', 'jammingStation', 'spoofingStation']);
  const EW_JAM_SOURCE = 'ew:jamming';
  const ewJammedEntityIds = new Set();

  function normalizeAngleRadians(value) {
    let a = value % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function getEWResearchCount(playerId, ids) {
    let count = 0;
    for (const id of ids) if (isResearchComplete(playerId, id)) count++;
    return count;
  }

  function getEWStationStats(station) {
    if (!station || !EW_STATION_TYPES.includes(station.type)) return null;
    const playerId = station.playerId;
    const b = ELECTRONIC_WARFARE_BALANCE;
    const prefix = station.type === 'radarStation' ? 'Radar' : station.type === 'jammingStation' ? 'Jamming' : 'Spoof';
    const rangeBase = station.type === 'jammingStation' ? b.jammingRange : station.type === 'radarStation' ? b.radarRange : b.spoofingRange;
    const angleBonus = [1,2,3,4].reduce((sum, n) => sum + (isResearchComplete(playerId, `ew${prefix}Angle${n}`) ? n * 2 : 0), 0);
    const rangeBonusValues = [0.08, 0.10, 0.12, 0.14];
    const rangeBonus = rangeBonusValues.reduce((sum, v, i) => sum + (isResearchComplete(playerId, `ew${prefix}Range${i + 1}`) ? v : 0), 0);
    let interval = b.baseFrequency;
    const frequencyNodes = station.type === 'radarStation'
      ? [['ewRadarFreq1',0.63],['ewRadarFreq2',0.60],['ewRadarFreq3',0.55],['ewRadarFreq4',0.48]]
      : station.type === 'jammingStation'
        ? [['ewJammingFreq1',0.63],['ewJammingFreq2',0.60],['ewJammingFreq3',0.55],['ewJammingFreq4',0.48]]
        : [['ewSpoofFreq1',0.63],['ewSpoofFreq2',0.60],['ewSpoofFreq3',0.55],['ewSpoofFreq4',0.48]];
    for (const [id, value] of frequencyNodes) if (isResearchComplete(playerId, id)) interval = value;
    const result = {
      angleDeg: b.baseAngleDeg + angleBonus,
      angleRad: (b.baseAngleDeg + angleBonus) * Math.PI / 180,
      range: getEntityStatFromBase(station, 'range', rangeBase * (1 + rangeBonus)),
      interval
    };
    if (station.type === 'radarStation') {
      let vulnerability = b.radarDamageVulnerability;
      if (isResearchComplete(playerId, 'ewRadarVuln1')) vulnerability += 0.05;
      if (isResearchComplete(playerId, 'ewRadarVuln2')) vulnerability += 0.10;
      if (isResearchComplete(playerId, 'ewRadarVuln3')) vulnerability += 0.15;
      if (isResearchComplete(playerId, 'ewRadarVuln4')) vulnerability += 0.20;
      result.revealChance = b.radarRevealChance;
      result.revealDuration = b.radarRevealDuration;
      result.damageVulnerability = vulnerability;
    } else if (station.type === 'jammingStation') {
      result.duration = b.jammingDuration;
      result.slow = b.jammingSlow + (isResearchComplete(playerId, 'ewJammingSlow') ? 0.15 : 0);
      result.rangeReduction = b.jammingRangeReduction + (isResearchComplete(playerId, 'ewJammingRangeReduction') ? 0.20 : 0);
      result.shutdownChance = b.jammingShutdownChance + (isResearchComplete(playerId, 'ewJammingShutdown') ? 0.16 : 0);
    } else {
      let chance = b.spoofingChance;
      if (isResearchComplete(playerId, 'ewSpoofChance1')) chance += 0.04;
      if (isResearchComplete(playerId, 'ewSpoofChance2')) chance += 0.04;
      if (isResearchComplete(playerId, 'ewSpoofChance3')) chance += 0.06;
      result.duration = b.spoofingDuration;
      result.spoofChance = chance;
    }
    return result;
  }

  function isPointInEWEmission(station, x, y, stats = null, heading = null) {
    if (!station?.alive) return false;
    stats ||= getEWStationStats(station);
    if (!stats) return false;
    const dx = x - station.x, dy = y - station.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > stats.range * stats.range) return false;
    if (d2 <= 1) return true;
    const direction = Number.isFinite(heading) ? heading : (Number.isFinite(station.ewHeading) ? station.ewHeading : 0);
    const angle = Math.atan2(dy, dx);
    return Math.abs(normalizeAngleRadians(angle - direction)) <= stats.angleRad * 0.5;
  }

  function setEWAntennaHeading(station, heading) {
    if (!station?.alive || !EW_STATION_TYPES.includes(station.type) || !Number.isFinite(heading)) return false;
    station.ewHeading = normalizeAngleRadians(heading);
    return true;
  }

  function beginEWAntennaAim(station) {
    if (!station?.alive || station.playerId !== PLAYER_ID || !EW_STATION_TYPES.includes(station.type)) return false;
    setBuildMode(null);
    game.ewAimingBuildingId = station.id;
    notify(`Aim ${BUILDINGS[station.type].shortName || BUILDINGS[station.type].name} antenna, then click a direction.`, 'good', 3);
    return true;
  }

  function cancelEWAntennaAim() {
    if (!game.ewAimingBuildingId) return false;
    game.ewAimingBuildingId = null;
    return true;
  }

  function getEWProbabilityCooldownMap(target) {
    target.ewProbabilityCooldowns ||= new Map();
    return target.ewProbabilityCooldowns;
  }

  function tryEWProbability(target, effectId, sourcePlayerId, interval, chance) {
    if (!target || chance <= 0) return false;
    const map = getEWProbabilityCooldownMap(target);
    const key = `${effectId}:${sourcePlayerId}`;
    const next = map.get(key) || 0;
    if (game.time < next) return false;
    map.set(key, game.time + Math.max(0.01, interval));
    return Math.random() < clamp(chance, 0, 1);
  }

  // When several allied EW stations overlap a target, they form one effective
  // EW network for that effect. Coverage/redundancy can increase, but numerical
  // strength and probability checks use only the strongest applicable values.
  // This prevents tower-count RNG multiplication while still respecting upgrades.
  function getStrongestEWCoverageStats(type, playerId, x, y, fallbackStats = null) {
    let strongest = fallbackStats ? { ...fallbackStats } : null;
    for (const station of game.buildings) {
      if (!station.alive || station.playerId !== playerId || station.type !== type) continue;
      const stats = getEWStationStats(station);
      if (!stats || !isPointInEWEmission(station, x, y, stats)) continue;
      if (!strongest) strongest = { ...stats };
      else {
        strongest.interval = Math.min(strongest.interval, stats.interval);
        if (type === 'radarStation') {
          strongest.revealChance = Math.max(strongest.revealChance || 0, stats.revealChance || 0);
          strongest.revealDuration = Math.max(strongest.revealDuration || 0, stats.revealDuration || 0);
          strongest.damageVulnerability = Math.max(strongest.damageVulnerability || 0, stats.damageVulnerability || 0);
        } else if (type === 'jammingStation') {
          strongest.duration = Math.max(strongest.duration || 0, stats.duration || 0);
          strongest.slow = Math.max(strongest.slow || 0, stats.slow || 0);
          strongest.rangeReduction = Math.max(strongest.rangeReduction || 0, stats.rangeReduction || 0);
          strongest.shutdownChance = Math.max(strongest.shutdownChance || 0, stats.shutdownChance || 0);
        } else if (type === 'spoofingStation') {
          strongest.duration = Math.max(strongest.duration || 0, stats.duration || 0);
          strongest.spoofChance = Math.max(strongest.spoofChance || 0, stats.spoofChance || 0);
        }
      }
    }
    return strongest;
  }

  function isEntityStealthedForRadar(target) {
    if (!target?.alive || hasStatus(target, 'revealed')) return false;
    if (target.type === 'superFighter' && target.fighterStealthed) return true;
    if (target.stealthUntilAttack) return true;
    if (target.type === 'loiteringMunition' && isResearchComplete(target.playerId, 'dwLMStealth')) return true;
    if (typeof isAdvancedInfantryFullyStealthed === 'function' && isAdvancedInfantryFullyStealthed(target)) return true;
    if (typeof hasAdvancedInfantryModule === 'function' && hasAdvancedInfantryModule(target, 'conceal')) return true;
    return false;
  }

  function markRadarDetected(target, sourcePlayerId, interval) {
    target.ewRadarDetectedUntilByPlayer ||= new Map();
    target.ewRadarDetectedUntilByPlayer.set(sourcePlayerId, game.time + Math.max(interval + 0.08, 0.12));
  }

  function applyEWRadar(station, target, stats) {
    if (!target?.alive || target.playerId === station.playerId) return;
    const networkStats = getStrongestEWCoverageStats('radarStation', station.playerId, target.x, target.y, stats) || stats;
    if (isEntityStealthedForRadar(target)) {
      if (!tryEWProbability(target, 'radarReveal', station.playerId, networkStats.interval, networkStats.revealChance)) return;
      if (typeof advancedInfantryRejectsEW === 'function' && advancedInfantryRejectsEW(target)) return;
      applyStatus(target, 'revealed', networkStats.revealDuration, { playerId: station.playerId, entityId: station.id });
    } else if (typeof advancedInfantryRejectsEW === 'function' && advancedInfantryRejectsEW(target)) return;
    markRadarDetected(target, station.playerId, networkStats.interval);
  }

  function setEWJammingContribution(target, sourcePlayerId, stats, stationId) {
    target.ewJammingByPlayer ||= new Map();
    target.ewJammingByPlayer.set(sourcePlayerId, {
      slow: stats.slow,
      rangeReduction: stats.rangeReduction,
      expiresAt: game.time + stats.duration,
      stationId
    });
    ewJammedEntityIds.add(target.id);
    refreshEWJammingModifiers(target);
    applyStatus(target, 'jammed', stats.duration, { playerId: sourcePlayerId, entityId: stationId });
  }

  function refreshEWJammingModifiers(target) {
    if (!target?.alive) return;
    const contributions = target.ewJammingByPlayer;
    if (!contributions?.size) {
      removeModifierSource(target, EW_JAM_SOURCE);
      removeStatus(target, 'jammed');
      target.ewJammingAppliedSlow = null;
      target.ewJammingAppliedRangeReduction = null;
      ewJammedEntityIds.delete(target.id);
      return;
    }
    let maxSlow = 0, maxRangeReduction = 0, maxRemaining = 0;
    for (const [playerId, value] of [...contributions]) {
      if (!game.players[playerId]?.alive || value.expiresAt <= game.time) {
        contributions.delete(playerId);
        continue;
      }
      maxSlow = Math.max(maxSlow, value.slow || 0);
      maxRangeReduction = Math.max(maxRangeReduction, value.rangeReduction || 0);
      maxRemaining = Math.max(maxRemaining, value.expiresAt - game.time);
    }
    if (!contributions.size) {
      removeModifierSource(target, EW_JAM_SOURCE);
      removeStatus(target, 'jammed');
      target.ewJammingAppliedSlow = null;
      target.ewJammingAppliedRangeReduction = null;
      ewJammedEntityIds.delete(target.id);
      return;
    }
    if (target.ewJammingAppliedSlow !== maxSlow || target.ewJammingAppliedRangeReduction !== maxRangeReduction) {
      const modifiers = [];
      if (target.kind === 'unit' && maxSlow > 0) modifiers.push({ stat: 'speed', operation: 'multiply', value: Math.max(0, 1 - maxSlow) });
      if (maxRangeReduction > 0) {
        modifiers.push({ stat: 'range', operation: 'multiply', value: Math.max(0, 1 - maxRangeReduction) });
        modifiers.push({ stat: 'missileRange', operation: 'multiply', value: Math.max(0, 1 - maxRangeReduction) });
        modifiers.push({ stat: 'detectionRange', operation: 'multiply', value: Math.max(0, 1 - maxRangeReduction) });
        modifiers.push({ stat: 'triggerRange', operation: 'multiply', value: Math.max(0, 1 - maxRangeReduction) });
      }
      setModifierSource(target, EW_JAM_SOURCE, modifiers);
      target.ewJammingAppliedSlow = maxSlow;
      target.ewJammingAppliedRangeReduction = maxRangeReduction;
    }
  }

  function applyEWJamming(station, target, stats) {
    if (!target?.alive || target.playerId === station.playerId) return;
    const networkStats = getStrongestEWCoverageStats('jammingStation', station.playerId, target.x, target.y, stats) || stats;
    if (typeof advancedInfantryRejectsEW === 'function' && advancedInfantryRejectsEW(target)) return;
    setEWJammingContribution(target, station.playerId, networkStats, station.id);
    if (target.kind === 'unit' && entityHasTag(target, 'drone')) {
      if (tryEWProbability(target, 'jammingShutdown', station.playerId, networkStats.interval, networkStats.shutdownChance)) destroyEntity(target, station.playerId);
    }
  }

  function randomSpoofCoordinate(target, station) {
    const away = Math.atan2(target.y - station.y, target.x - station.x);
    const angle = away + (Math.random() * 1.8 - 0.9);
    const distance = 160 + Math.random() * 260;
    return {
      x: clamp(target.x + Math.cos(angle) * distance, 40, WORLD.width - 40),
      y: clamp(target.y + Math.sin(angle) * distance, 40, WORLD.height - 40)
    };
  }

  function applyEWSpoofing(station, target, stats) {
    if (!target?.alive || target.playerId === station.playerId || target.kind !== 'unit' || hasStatus(target, 'spoofed')) return;
    const networkStats = getStrongestEWCoverageStats('spoofingStation', station.playerId, target.x, target.y, stats) || stats;
    if (!tryEWProbability(target, 'spoof', station.playerId, networkStats.interval, networkStats.spoofChance)) return;
    if (typeof advancedInfantryRejectsEW === 'function' && advancedInfantryRejectsEW(target)) return;
    const fake = randomSpoofCoordinate(target, station);
    target.ewSpoofGoal = { x: fake.x, y: fake.y, expiresAt: game.time + networkStats.duration, sourcePlayerId: station.playerId };
    applyStatus(target, 'spoofed', networkStats.duration, { playerId: station.playerId, entityId: station.id });
  }

  function getSpoofedGoal(entity) {
    if (!entity?.alive || !hasStatus(entity, 'spoofed') || !entity.ewSpoofGoal) return null;
    return entity.ewSpoofGoal;
  }

  function clearExpiredSpoofGoal(entity) {
    if (!entity?.ewSpoofGoal) return;
    if (!hasStatus(entity, 'spoofed') || entity.ewSpoofGoal.expiresAt <= game.time) entity.ewSpoofGoal = null;
  }

  function scanEWEntityTargets(station, stats, handler) {
    unitGrid.queryCircle(station.x, station.y, stats.range, queryScratchA);
    const units = queryScratchA.slice();
    for (const target of units) {
      if (!target.alive || target.playerId === station.playerId || target.garrisoned || !isPointInEWEmission(station, target.x, target.y, stats)) continue;
      handler(target);
    }
    buildingGrid.queryCircle(station.x, station.y, stats.range, queryScratchB);
    const buildings = queryScratchB.slice();
    for (const target of buildings) {
      if (!target.alive || target.playerId === station.playerId || target.type === 'landmine' || !isPointInEWEmission(station, target.x, target.y, stats)) continue;
      handler(target);
    }
  }

  function isGuidedEWProjectile(projectile) {
    return projectile?.kind === 'aaMissile' || projectile?.kind === 'fighterA2AMissile' || projectile?.kind === STRATEGIC_MISSILE_KIND;
  }

  function applyEWJammingToProjectiles(station, stats) {
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
      const p = game.projectiles[i];
      if (!p || p.playerId === station.playerId || p.life <= 0 || !isGuidedEWProjectile(p)) continue;
      if (!isPointInEWEmission(station, p.x, p.y, stats)) continue;
      const networkStats = getStrongestEWCoverageStats('jammingStation', station.playerId, p.x, p.y, stats) || stats;
      if (!tryEWProbability(p, 'jammingShutdown', station.playerId, networkStats.interval, networkStats.shutdownChance)) continue;
      if (p.kind === 'aaMissile') finishAAMissile(p);
      if (p.kind === STRATEGIC_MISSILE_KIND) damageStrategicMissile(p, 1, station.playerId);
      swapRemove(game.projectiles, i);
    }
  }

  function emitElectronicWarfare(station, stats) {
    station.ewLastEmissionAt = game.time;
    if (station.type === 'radarStation') scanEWEntityTargets(station, stats, target => applyEWRadar(station, target, stats));
    else if (station.type === 'jammingStation') {
      scanEWEntityTargets(station, stats, target => applyEWJamming(station, target, stats));
      applyEWJammingToProjectiles(station, stats);
    } else if (station.type === 'spoofingStation') {
      // Buildings can be scanned by EW, but static structures have no movement
      // order to corrupt and therefore are not valid deception targets.
      unitGrid.queryCircle(station.x, station.y, stats.range, queryScratchA);
      const units = queryScratchA.slice();
      for (const target of units) {
        if (!target.alive || target.playerId === station.playerId || target.garrisoned || !isPointInEWEmission(station, target.x, target.y, stats)) continue;
        applyEWSpoofing(station, target, stats);
      }
      for (const missile of game.projectiles) {
        if (missile.kind !== STRATEGIC_MISSILE_KIND || missile.playerId === station.playerId || missile.alive === false || missile.life <= 0) continue;
        if (!isPointInEWEmission(station, missile.x, missile.y, stats)) continue;
        spoofStrategicMissile(missile, station, stats);
      }
    }
  }

  function updateElectronicWarfare(dt) {
    for (const id of [...ewJammedEntityIds]) {
      const entity = game.entityById.get(id);
      if (!entity?.alive) { ewJammedEntityIds.delete(id); continue; }
      refreshEWJammingModifiers(entity);
      clearExpiredSpoofGoal(entity);
    }
    for (const u of game.units) if (u.alive && u.ewSpoofGoal && !hasStatus(u, 'spoofed')) u.ewSpoofGoal = null;

    for (const station of game.buildings) {
      if (!station.alive || !EW_STATION_TYPES.includes(station.type)) continue;
      const stats = getEWStationStats(station);
      if (!stats) continue;
      if (!Number.isFinite(station.ewNextEmissionAt)) station.ewNextEmissionAt = game.time + stats.interval;
      if (game.time + 1e-9 < station.ewNextEmissionAt) continue;
      emitElectronicWarfare(station, stats);
      station.ewNextEmissionAt = game.time + stats.interval;
    }
  }

  function getRadarDamageReceivedMultiplier(target, attackerPlayerId) {
    if (!target?.alive || !Number.isInteger(attackerPlayerId) || attackerPlayerId === target.playerId) return 1;
    if (isEntityStealthedForRadar(target)) return 1;
    const detectedUntil = target.ewRadarDetectedUntilByPlayer?.get(attackerPlayerId) || 0;
    if (detectedUntil < game.time) return 1;
    let strongest = 0;
    for (const radar of game.buildings) {
      if (!radar.alive || radar.playerId !== attackerPlayerId || radar.type !== 'radarStation') continue;
      const stats = getEWStationStats(radar);
      if (stats && isPointInEWEmission(radar, target.x, target.y, stats)) strongest = Math.max(strongest, stats.damageVulnerability || 0);
    }
    return 1 + strongest;
  }

  function updateAIElectronicWarfareHeadings(player, ownedBuildings = null) {
    if (!player?.alive) return;
    const owned = ownedBuildings || game.buildings.filter(b => b.alive && b.playerId === player.id);
    const enemies = game.players.filter(p => p.alive && p.id !== player.id && p.capital?.alive);
    if (!enemies.length) return;
    for (const station of owned) {
      if (!EW_STATION_TYPES.includes(station.type)) continue;
      let target = null, best = Infinity;
      for (const enemy of enemies) {
        const d2 = distSq(station, enemy.capital);
        if (d2 < best) { best = d2; target = enemy.capital; }
      }
      if (target) setEWAntennaHeading(station, Math.atan2(target.y - station.y, target.x - station.x));
    }
  }
