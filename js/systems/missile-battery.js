'use strict';

  // ---------------------------------------------------------------------------
  // Missile & Advanced Battery
  // ---------------------------------------------------------------------------
  // Missile Launch Sites (MLS) maintain independent silo pipelines plus a
  // separate FIFO stockpile production line. Strategic missiles are lightweight
  // one-use aerial projectiles with 1 HP so AA/EW can intercept them without
  // burdening the normal unit/pathfinding systems.
  const STRATEGIC_MISSILE_KIND = 'strategicMissile';
  const MISSILE_ZONE_FRAGMENTED = 'fragmented';
  const MISSILE_ZONE_BURNING = 'burning';
  const MISSILE_ZONE_SLOW_SOURCE = 'missile:fragmented-zone';
  const MISSILE_TYPE_ORDER = Object.freeze(['conventional', 'hypersonic', 'highExplosive', 'incendiary']);

  function ensureMissileRuntimeState() {
    game.missileZones ||= [];
    if (game.missileAimingSiteId === undefined) game.missileAimingSiteId = null;
    if (game.missileAimSiloIndex === undefined) game.missileAimSiloIndex = null;
    if (game.missileAimTarget === undefined) game.missileAimTarget = null;
  }

  function getMissileTypeDefinition(type) {
    return MISSILE_TYPES[type] || null;
  }

  function isMissileTypeUnlocked(playerId, type) {
    if (type === 'conventional') return isResearchComplete(playerId, 'mbUnlockMLS');
    if (type === 'hypersonic') return isResearchComplete(playerId, 'mbUnlockHypersonic');
    if (type === 'highExplosive') return isResearchComplete(playerId, 'mbUnlockHE');
    if (type === 'incendiary') return isResearchComplete(playerId, 'mbUnlockIncendiary');
    return false;
  }

  function getUnlockedMissileTypes(playerId) {
    return MISSILE_TYPE_ORDER.filter(type => isMissileTypeUnlocked(playerId, type));
  }

  function getMissileCostDiscount(playerId) {
    let discount = 0;
    if (isResearchComplete(playerId, 'mbCostDiscount1')) discount += 0.05;
    if (isResearchComplete(playerId, 'mbCostDiscount2')) discount += 0.10;
    if (isResearchComplete(playerId, 'mbCostDiscount3')) discount += 0.10;
    return clamp(discount, 0, 0.95);
  }

  function getMissileGlobalRangeBonus(playerId) {
    let bonus = 0;
    if (isResearchComplete(playerId, 'mbGlobalRange1')) bonus += 0.05;
    if (isResearchComplete(playerId, 'mbGlobalRange2')) bonus += 0.10;
    if (isResearchComplete(playerId, 'mbGlobalRange3')) bonus += 0.15;
    return bonus;
  }

  function getMissileGlobalSpeedBonus(playerId) {
    let bonus = 0;
    if (isResearchComplete(playerId, 'mbGlobalSpeed1')) bonus += 0.05;
    if (isResearchComplete(playerId, 'mbGlobalSpeed2')) bonus += 0.10;
    return bonus;
  }

  function getStrategicMissileStats(playerId, type) {
    const def = getMissileTypeDefinition(type);
    if (!def) return null;
    let damageBonus = 0, speedBonus = getMissileGlobalSpeedBonus(playerId), rangeBonus = getMissileGlobalRangeBonus(playerId), aoeBonus = 0;
    const result = {
      type,
      name: def.name,
      cost: Math.max(0, Math.round(def.cost * (1 - getMissileCostDiscount(playerId)))),
      range: def.range,
      aoe: def.aoe,
      damage: def.damage,
      speed: def.speed
    };
    if (type === 'hypersonic') {
      if (isResearchComplete(playerId, 'mbHypDamage1')) damageBonus += 0.10;
      if (isResearchComplete(playerId, 'mbHypSpeed1')) speedBonus += 0.05;
      if (isResearchComplete(playerId, 'mbHypRange1')) rangeBonus += 0.05;
      if (isResearchComplete(playerId, 'mbHypDamage2')) damageBonus += 0.10;
      if (isResearchComplete(playerId, 'mbHypSpeed2')) speedBonus += 0.05;
      if (isResearchComplete(playerId, 'mbHypRange2')) rangeBonus += 0.10;
    } else if (type === 'highExplosive') {
      if (isResearchComplete(playerId, 'mbHEDamage1')) damageBonus += 0.20;
      if (isResearchComplete(playerId, 'mbHEAoe1')) aoeBonus += 0.10;
      if (isResearchComplete(playerId, 'mbHEDamage2')) damageBonus += 0.30;
      if (isResearchComplete(playerId, 'mbHEAoe2')) aoeBonus += 0.15;
      if (isResearchComplete(playerId, 'mbHERange')) rangeBonus += 0.30;
    }
    result.damage *= 1 + damageBonus;
    result.speed *= 1 + speedBonus;
    result.range *= 1 + rangeBonus;
    result.aoe *= 1 + aoeBonus;
    return result;
  }

  function getFragmentedZoneStats(playerId) {
    let radiusBonus = 0;
    let slow = MISSILE_BATTERY_BALANCE.fragmentedSlow;
    if (isResearchComplete(playerId, 'mbHEFragmentRadius1')) radiusBonus += 0.10;
    if (isResearchComplete(playerId, 'mbHEFragmentSlow1')) slow += 0.05;
    if (isResearchComplete(playerId, 'mbHEFragmentRadius2')) radiusBonus += 0.15;
    if (isResearchComplete(playerId, 'mbHEFragmentSlow2')) slow += 0.05;
    return {
      radius: MISSILE_BATTERY_BALANCE.fragmentedRadius * (1 + radiusBonus),
      duration: MISSILE_BATTERY_BALANCE.fragmentedDuration,
      slow
    };
  }

  function getBurningZoneStats(playerId) {
    let duration = MISSILE_BATTERY_BALANCE.burningDuration;
    let radiusBonus = 0;
    let damageRate = MISSILE_BATTERY_BALANCE.burningDamageRate;
    let maxDps = MISSILE_BATTERY_BALANCE.burningDamageCapPerSecond;
    let vulnerability = MISSILE_BATTERY_BALANCE.burningDamageVulnerability;
    if (isResearchComplete(playerId, 'mbBurnDuration1')) duration += 2;
    if (isResearchComplete(playerId, 'mbBurnRadius1')) radiusBonus += 0.10;
    if (isResearchComplete(playerId, 'mbBurnDamage1')) { damageRate = 0.055; maxDps = 110; }
    if (isResearchComplete(playerId, 'mbBurnVulnerability1')) vulnerability += 0.25;
    if (isResearchComplete(playerId, 'mbBurnDuration2')) duration += 5;
    if (isResearchComplete(playerId, 'mbBurnRadius2')) radiusBonus += 0.10;
    if (isResearchComplete(playerId, 'mbBurnDamage2')) { damageRate = 0.06; maxDps = 120; }
    if (isResearchComplete(playerId, 'mbBurnVulnerability2')) vulnerability += 0.25;
    return {
      radius: MISSILE_BATTERY_BALANCE.burningRadius * (1 + radiusBonus),
      duration,
      damageRate,
      maxDps,
      vulnerability
    };
  }

  function getMissileSiloBuildTime(playerId) {
    if (isResearchComplete(playerId, 'mbSiloBuild2')) return 16;
    if (isResearchComplete(playerId, 'mbSiloBuild1')) return 18;
    return MISSILE_BATTERY_BALANCE.siloBuildTime;
  }

  function getMissileSiloReloadTime(playerId) {
    if (isResearchComplete(playerId, 'mbReload3')) return 12;
    if (isResearchComplete(playerId, 'mbReload2')) return 13;
    if (isResearchComplete(playerId, 'mbReload1')) return 14;
    return MISSILE_BATTERY_BALANCE.siloReloadTime;
  }

  function getStockpileFillTime(playerId) {
    if (isResearchComplete(playerId, 'mbStockpileTime2')) return 16;
    if (isResearchComplete(playerId, 'mbStockpileTime1')) return 18;
    return MISSILE_BATTERY_BALANCE.stockpileFillTime;
  }

  function getMissileStorageCapacity(playerId) {
    if (isResearchComplete(playerId, 'mbStorage2')) return 12;
    if (isResearchComplete(playerId, 'mbStorage1')) return 8;
    return MISSILE_BATTERY_BALANCE.baseStorage;
  }

  function getMissileSiloCount(playerId) {
    let count = MISSILE_BATTERY_BALANCE.baseSilos;
    if (isResearchComplete(playerId, 'mbMaxSilo1')) count += 1;
    if (isResearchComplete(playerId, 'mbMaxSilo2')) count += 1;
    return count;
  }

  function getMissileLaunchSiteLimit(playerId) {
    return isResearchComplete(playerId, 'mbSecondMLS') ? 2 : 1;
  }

  function getStockpileParallelism(playerId) {
    return isResearchComplete(playerId, 'mbStockpileParallel') ? 2 : 1;
  }

  function makeMissileSilo(index) {
    return {
      index,
      active: false,
      configuredType: 'conventional',
      loadedType: null,
      stage: 'idle', // idle | building | reloading
      pipelineType: null,
      progress: 0,
      paidCost: 0
    };
  }

  function ensureMissileLaunchSiteState(site) {
    if (!site || site.type !== 'missileLaunchSite') return site;
    site.missileSilos ||= [];
    const desired = getMissileSiloCount(site.playerId);
    while (site.missileSilos.length < desired) site.missileSilos.push(makeMissileSilo(site.missileSilos.length));
    site.missileStockpile ||= [];
    site.missileStockpileQueue ||= [];
    site.missileStockpileJobs ||= [];
    return site;
  }

  function countStoredMissiles(site, type = null) {
    ensureMissileLaunchSiteState(site);
    return site.missileStockpile.reduce((sum, item) => sum + (!type || item === type ? 1 : 0), 0);
  }

  function countLoadedMissiles(site) {
    ensureMissileLaunchSiteState(site);
    return site.missileSilos.reduce((sum, silo) => sum + (silo.loadedType ? 1 : 0), 0);
  }

  function countMissileCommitments(site) {
    ensureMissileLaunchSiteState(site);
    const siloJobs = site.missileSilos.filter(s => s.stage === 'building' || s.stage === 'reloading').length;
    return countLoadedMissiles(site) + site.missileStockpile.length + siloJobs + site.missileStockpileJobs.length + site.missileStockpileQueue.length;
  }

  function takeStockpiledMissile(site, type) {
    const index = site.missileStockpile.indexOf(type);
    if (index < 0) return false;
    site.missileStockpile.splice(index, 1);
    return true;
  }

  function queueStockpileMissile(site, type) {
    if (!site?.alive || site.type !== 'missileLaunchSite' || !isMissileTypeUnlocked(site.playerId, type)) return { ok: false, reason: 'Missile type locked' };
    ensureMissileLaunchSiteState(site);
    const capacity = getMissileStorageCapacity(site.playerId) + getMissileSiloCount(site.playerId);
    if (countMissileCommitments(site) >= capacity) return { ok: false, reason: 'Maximum missile commitment reached' };
    const stats = getStrategicMissileStats(site.playerId, type);
    const player = game.players[site.playerId];
    if (!player || player.money + 1e-9 < stats.cost) return { ok: false, reason: 'Insufficient funds' };
    player.money -= stats.cost;
    site.missileStockpileQueue.push({ type, paidCost: stats.cost });
    if (site.playerId === PLAYER_ID) {
      notify(`${stats.name} added to stockpile FIFO.`, 'good', 2);
      if (game.selected === site) renderSelectionPanel();
    }
    return { ok: true };
  }

  function configureMissileSilo(site, index, type) {
    ensureMissileLaunchSiteState(site);
    const silo = site.missileSilos[index];
    if (!silo || !isMissileTypeUnlocked(site.playerId, type)) return false;
    silo.configuredType = type;
    return true;
  }

  function toggleMissileSilo(site, index) {
    ensureMissileLaunchSiteState(site);
    const silo = site.missileSilos[index];
    if (!silo) return false;
    silo.active = !silo.active;
    return true;
  }

  function tryStartSiloReplenishment(site, silo) {
    if (!site?.alive || !silo?.active || silo.loadedType || silo.stage !== 'idle') return false;
    const type = silo.configuredType || 'conventional';
    if (!isMissileTypeUnlocked(site.playerId, type)) return false;
    if (takeStockpiledMissile(site, type)) {
      silo.stage = 'reloading';
      silo.pipelineType = type;
      silo.progress = 0;
      silo.paidCost = 0;
      return true;
    }
    const capacity = getMissileStorageCapacity(site.playerId) + getMissileSiloCount(site.playerId);
    if (countMissileCommitments(site) >= capacity) return false;
    const stats = getStrategicMissileStats(site.playerId, type);
    const player = game.players[site.playerId];
    if (!player || player.money + 1e-9 < stats.cost) return false;
    player.money -= stats.cost;
    silo.stage = 'building';
    silo.pipelineType = type;
    silo.progress = 0;
    silo.paidCost = stats.cost;
    return true;
  }

  function updateMissileSilo(site, silo, dt) {
    if (!silo.active) return;
    if (silo.loadedType) return;
    if (silo.stage === 'idle') tryStartSiloReplenishment(site, silo);
    if (silo.stage === 'building') {
      silo.progress += dt;
      const buildTime = getMissileSiloBuildTime(site.playerId);
      if (silo.progress + 1e-9 >= buildTime) {
        silo.stage = 'reloading';
        silo.progress = 0;
      }
    } else if (silo.stage === 'reloading') {
      silo.progress += dt;
      const reloadTime = getMissileSiloReloadTime(site.playerId);
      if (silo.progress + 1e-9 >= reloadTime) {
        silo.loadedType = silo.pipelineType || silo.configuredType || 'conventional';
        silo.stage = 'idle';
        silo.pipelineType = null;
        silo.progress = 0;
        silo.paidCost = 0;
      }
    }
  }

  function startStockpileJobs(site) {
    ensureMissileLaunchSiteState(site);
    const slots = getStockpileParallelism(site.playerId);
    while (site.missileStockpileJobs.length < slots && site.missileStockpileQueue.length) {
      site.missileStockpileJobs.push({ ...site.missileStockpileQueue.shift(), progress: 0, complete: false });
    }
  }

  function updateStockpileProduction(site, dt) {
    startStockpileJobs(site);
    const maxStorage = getMissileStorageCapacity(site.playerId);
    const fillTime = getStockpileFillTime(site.playerId);
    for (const job of site.missileStockpileJobs) {
      if (job.complete) continue;
      job.progress += dt;
      if (job.progress + 1e-9 >= fillTime) job.complete = true;
    }
    // Completion is FIFO by production-slot order. A finished job waits at the
    // end of the line if storage is full rather than overfilling the stockpile.
    for (let i = 0; i < site.missileStockpileJobs.length;) {
      const job = site.missileStockpileJobs[i];
      if (!job.complete || site.missileStockpile.length >= maxStorage) { i++; continue; }
      site.missileStockpile.push(job.type);
      site.missileStockpileJobs.splice(i, 1);
    }
    startStockpileJobs(site);
  }

  function updateMissileLaunchSites(dt) {
    for (const site of game.buildings) {
      if (!site.alive || site.type !== 'missileLaunchSite') continue;
      ensureMissileLaunchSiteState(site);
      for (const silo of site.missileSilos) updateMissileSilo(site, silo, dt);
      updateStockpileProduction(site, dt);
    }
  }

  function getAimingSilo(site) {
    ensureMissileLaunchSiteState(site);
    const selected = Number.isInteger(game.missileAimSiloIndex) ? site.missileSilos[game.missileAimSiloIndex] : null;
    if (selected) return selected;
    return site.missileSilos.find(silo => silo.active && silo.loadedType) || null;
  }

  function setMissileAimingPresentation(active) {
    document.getElementById('app')?.classList.toggle('missile-aiming', !!active);
    const hud = document.getElementById('missileAimHud');
    if (hud) hud.classList.toggle('hidden', !active);
  }

  function clearMissileAimTarget() {
    game.missileAimTarget = null;
    updateMissileAimingHUD();
    return true;
  }

  function updateMissileAimingHUD() {
    const hud = document.getElementById('missileAimHud');
    if (!hud) return;
    const site = game.entityById.get(game.missileAimingSiteId);
    if (!site?.alive || site.playerId !== PLAYER_ID || site.type !== 'missileLaunchSite') {
      hud.classList.add('hidden');
      document.getElementById('app')?.classList.remove('missile-aiming');
      return;
    }
    ensureMissileLaunchSiteState(site);
    const silo = getAimingSilo(site);
    const current = document.getElementById('missileAimCurrent');
    const targetInfo = document.getElementById('missileAimTargetInfo');
    const siloHost = document.getElementById('missileAimSilos');
    const confirm = document.getElementById('missileAimConfirm');
    const clear = document.getElementById('missileAimClear');
    const target = game.missileAimTarget;
    if (current) {
      if (silo?.loadedType) {
        const def = getMissileTypeDefinition(silo.loadedType), stats = getStrategicMissileStats(site.playerId, silo.loadedType);
        current.textContent = `SILO ${silo.index + 1} · ${def.name} · RNG ${Math.round(stats.range)} · DMG ${Math.round(stats.damage)} · AOE ${Math.round(stats.aoe)}`;
      } else current.textContent = Number.isInteger(game.missileAimSiloIndex) ? `SILO ${game.missileAimSiloIndex + 1} · EMPTY / NOT READY` : 'NO ACTIVE LOADED SILO';
    }
    if (targetInfo) {
      if (target && silo?.loadedType) {
        const check = canMissileSiloFireAt(site, silo, target.x, target.y);
        const distance = Math.round(Math.hypot(target.x-site.x, target.y-site.y));
        targetInfo.textContent = check.ok ? `X MARK LOCKED · DIST ${distance} · READY TO CONFIRM` : `X MARK INVALID · ${check.reason}`;
        targetInfo.classList.toggle('invalid', !check.ok);
      } else if (silo?.loadedType && game.mouse.inside) {
        const stats = getStrategicMissileStats(site.playerId, silo.loadedType);
        const distance = Math.round(Math.hypot(game.mouse.worldX-site.x, game.mouse.worldY-site.y));
        targetInfo.textContent = distance <= stats.range ? `POINTER DIST ${distance} / ${Math.round(stats.range)} · SPACE TO FIRE` : `OUT OF RANGE · ${distance} / ${Math.round(stats.range)}`;
        targetInfo.classList.toggle('invalid', distance > stats.range);
      } else {
        targetInfo.textContent = 'Select a ready silo with 1–6.';
        targetInfo.classList.remove('invalid');
      }
    }
    if (confirm) confirm.disabled = !target;
    if (clear) clear.disabled = !target;
    if (siloHost) siloHost.innerHTML = site.missileSilos.map(s => {
      const loaded = s.loadedType ? getMissileTypeDefinition(s.loadedType).shortName : 'EMPTY';
      const selected = Number.isInteger(game.missileAimSiloIndex) ? game.missileAimSiloIndex === s.index : silo?.index === s.index;
      const stageTime = s.stage === 'building' ? getMissileSiloBuildTime(site.playerId) : s.stage === 'reloading' ? getMissileSiloReloadTime(site.playerId) : 0;
      const pct = stageTime ? Math.min(100, Math.round(s.progress / stageTime * 100)) : (s.loadedType ? 100 : 0);
      const status = s.loadedType ? 'READY' : s.stage === 'building' ? `BUILD ${pct}%` : s.stage === 'reloading' ? `LOAD ${pct}%` : s.active ? 'WAIT' : 'OFF';
      return `<div class="missile-aim-silo ${selected?'selected':''} ${s.loadedType?'ready':''} ${s.active?'online':'offline'}"><span>S${s.index+1}</span><strong>${loaded}</strong><small>${status}</small></div>`;
    }).join('');
  }

  function getReadyMissileCount(site) {
    if (!site?.alive || site.type !== 'missileLaunchSite') return 0;
    ensureMissileLaunchSiteState(site);
    return site.missileSilos.reduce((sum, silo) => sum + (silo.active && silo.loadedType ? 1 : 0), 0);
  }

  function findBestMissileLaunchSiteForAiming() {
    const sites = game.buildings.filter(site => site.alive && site.playerId === PLAYER_ID && site.type === 'missileLaunchSite');
    if (!sites.length) return null;
    const selectedId = game.selected?.type === 'missileLaunchSite' && game.selected?.playerId === PLAYER_ID ? game.selected.id : null;
    return sites.sort((a, b) => {
      const readyDiff = getReadyMissileCount(b) - getReadyMissileCount(a);
      if (readyDiff) return readyDiff;
      if (a.id === selectedId && b.id !== selectedId) return -1;
      if (b.id === selectedId && a.id !== selectedId) return 1;
      const da = Math.hypot(a.x - game.camera.x, a.y - game.camera.y);
      const db = Math.hypot(b.x - game.camera.x, b.y - game.camera.y);
      return da - db || a.id - b.id;
    })[0];
  }

  function beginBestMissileAiming() {
    const site = findBestMissileLaunchSiteForAiming();
    if (!site) return { ok: false, reason: 'No Missile Launch Site is available.' };
    beginMissileAiming(site);
    return { ok: true, site, ready: getReadyMissileCount(site) };
  }

  function beginMissileAiming(site) {
    if (!site?.alive || site.type !== 'missileLaunchSite' || site.playerId !== PLAYER_ID) return false;
    ensureMissileLaunchSiteState(site);
    setBuildMode(null);
    if (typeof cancelCoordinatePicking === 'function') cancelCoordinatePicking(false);
    cancelEWAntennaAim();
    game.missileAimingSiteId = site.id;
    game.missileAimSiloIndex = null;
    game.missileAimTarget = null;
    setSelection(site);
    setMissileAimingPresentation(true);
    updateMissileAimingHUD();
    notify('Missile fire control active · 1–6 select silo · Space fires · click places X · Esc exits.', 'good', 3);
    return true;
  }

  function cancelMissileAiming() {
    if (!game.missileAimingSiteId) return false;
    game.missileAimingSiteId = null;
    game.missileAimSiloIndex = null;
    game.missileAimTarget = null;
    setMissileAimingPresentation(false);
    return true;
  }

  function selectMissileAimSilo(index) {
    const site = game.entityById.get(game.missileAimingSiteId);
    if (!site?.alive || site.type !== 'missileLaunchSite') return false;
    ensureMissileLaunchSiteState(site);
    if (index < 0 || index >= site.missileSilos.length) return false;
    game.missileAimSiloIndex = game.missileAimSiloIndex === index ? null : index;
    game.missileAimTarget = null;
    updateMissileAimingHUD();
    return true;
  }

  function canMissileSiloFireAt(site, silo, x, y) {
    if (!site?.alive || !silo?.active || !silo.loadedType) return { ok: false, reason: 'Silo is not active and loaded' };
    const stats = getStrategicMissileStats(site.playerId, silo.loadedType);
    const distanceToTarget = Math.hypot(x - site.x, y - site.y);
    if (distanceToTarget > stats.range + 1e-9) return { ok: false, reason: `Target exceeds ${Math.round(stats.range)} range`, stats };
    return { ok: true, stats, distance: distanceToTarget };
  }

  function launchStrategicMissile(site, siloIndex, x, y) {
    ensureMissileRuntimeState();
    ensureMissileLaunchSiteState(site);
    const silo = site.missileSilos[siloIndex];
    const check = canMissileSiloFireAt(site, silo, x, y);
    if (!check.ok || game.projectiles.length >= MAX_PROJECTILES) return { ok: false, reason: check.reason || 'Projectile limit reached' };
    const type = silo.loadedType;
    const stats = check.stats;
    const dx = x - site.x, dy = y - site.y;
    const n = normalize(dx, dy);
    const projectile = {
      id: game.id++,
      kind: STRATEGIC_MISSILE_KIND,
      missileType: type,
      playerId: site.playerId,
      launcherId: site.id,
      siloIndex,
      x: site.x + n.x * (site.radius + 8),
      y: site.y + n.y * (site.radius + 8),
      vx: n.x * stats.speed,
      vy: n.y * stats.speed,
      speed: stats.speed,
      targetX: x,
      targetY: y,
      originalTargetX: x,
      originalTargetY: y,
      attackMultiplier: typeof getEnergyFieldAttackMultiplier === 'function' ? getEnergyFieldAttackMultiplier(site) : 1,
      damage: stats.damage * (typeof getEnergyFieldAttackMultiplier === 'function' ? getEnergyFieldAttackMultiplier(site) : 1),
      aoe: stats.aoe,
      maxRange: stats.range,
      travelled: 0,
      hp: 1,
      maxHp: 1,
      airborne: true,
      life: Math.max(0.1, check.distance / Math.max(1, stats.speed) + 0.35),
      alive: true,
      ewProbabilityCooldowns: new Map(),
      spoofedByEW: false
    };
    game.projectiles.push(projectile);
    silo.loadedType = null;
    silo.stage = 'idle';
    silo.pipelineType = null;
    silo.progress = 0;
    silo.paidCost = 0;
    pushEffect({ type: 'missileLaunch', x: projectile.x, y: projectile.y, radius: 34, life: 0.5, maxLife: 0.5 });
    return { ok: true, projectile, type, stats };
  }

  function fireAimedMissileAt(x, y, confirmMark = false) {
    const site = game.entityById.get(game.missileAimingSiteId);
    if (!site?.alive || site.type !== 'missileLaunchSite' || site.playerId !== PLAYER_ID) {
      cancelMissileAiming();
      return { ok: false, reason: 'Missile Launch Site unavailable' };
    }
    const silo = getAimingSilo(site);
    if (!silo) return { ok: false, reason: 'No active loaded silo available' };
    const check = canMissileSiloFireAt(site, silo, x, y);
    if (!check.ok) return check;
    if (confirmMark) {
      game.missileAimTarget = { x, y, siloIndex: silo.index };
      updateMissileAimingHUD();
      return { ok: true, pending: true };
    }
    const result = launchStrategicMissile(site, silo.index, x, y);
    if (result.ok) {
      game.missileAimTarget = null;
      notify(`${getMissileTypeDefinition(result.type).name} launched from Silo ${silo.index + 1}.`, 'good', 2.3);
      updateMissileAimingHUD();
    }
    return result;
  }

  function confirmMissileAimTarget() {
    const site = game.entityById.get(game.missileAimingSiteId);
    const target = game.missileAimTarget;
    if (!site?.alive || !target) return { ok: false, reason: 'No target mark' };
    ensureMissileLaunchSiteState(site);
    const silo = site.missileSilos[target.siloIndex];
    const check = canMissileSiloFireAt(site, silo, target.x, target.y);
    if (!check.ok) return check;
    const result = launchStrategicMissile(site, target.siloIndex, target.x, target.y);
    if (result.ok) {
      game.missileAimTarget = null;
      notify(`${getMissileTypeDefinition(result.type).name} launch confirmed.`, 'good', 2.3);
      updateMissileAimingHUD();
    }
    return result;
  }

  function findStrategicMissileById(id) {
    if (!Number.isFinite(id)) return null;
    return game.projectiles.find(p => p.kind === STRATEGIC_MISSILE_KIND && p.id === id && p.alive !== false && p.life > 0) || null;
  }

  function damageStrategicMissile(missile, amount, attackerPlayerId) {
    if (!missile || missile.kind !== STRATEGIC_MISSILE_KIND || missile.alive === false || missile.life <= 0 || missile.playerId === attackerPlayerId) return false;
    if (!Number.isFinite(amount) || amount <= 0) return false;
    missile.hp -= amount;
    if (missile.hp <= 0) {
      missile.alive = false;
      missile.life = 0;
      pushEffect({ type: 'missileIntercept', x: missile.x, y: missile.y, radius: 30, life: 0.42, maxLife: 0.42 });
    }
    return true;
  }

  function createMissileZone(type, playerId, x, y, attackMultiplier = 1) {
    ensureMissileRuntimeState();
    if (type === MISSILE_ZONE_FRAGMENTED) {
      const stats = getFragmentedZoneStats(playerId);
      game.missileZones.push({ id: game.id++, type, playerId, x, y, radius: stats.radius, slow: stats.slow, attackMultiplier, expiresAt: game.time + stats.duration });
    } else if (type === MISSILE_ZONE_BURNING) {
      const stats = getBurningZoneStats(playerId);
      game.missileZones.push({ id: game.id++, type, playerId, x, y, radius: stats.radius, damageRate: stats.damageRate, maxDps: stats.maxDps, vulnerability: stats.vulnerability, attackMultiplier, expiresAt: game.time + stats.duration });
    }
  }

  function detonateStrategicMissile(missile) {
    if (!missile || missile.kind !== STRATEGIC_MISSILE_KIND || missile.alive === false) return false;
    missile.alive = false;
    missile.life = 0;
    explode(missile.x, missile.y, missile.playerId, missile.damage, missile.aoe);
    if (missile.missileType === 'highExplosive') createMissileZone(MISSILE_ZONE_FRAGMENTED, missile.playerId, missile.x, missile.y, missile.attackMultiplier || 1);
    else if (missile.missileType === 'incendiary') createMissileZone(MISSILE_ZONE_BURNING, missile.playerId, missile.x, missile.y, missile.attackMultiplier || 1);
    return true;
  }

  function updateStrategicMissile(missile, dt) {
    if (!missile || missile.kind !== STRATEGIC_MISSILE_KIND || missile.alive === false) return 'remove';
    missile.life -= dt;
    const beforeX = missile.x, beforeY = missile.y;
    const dx = missile.targetX - missile.x, dy = missile.targetY - missile.y;
    const remaining = Math.hypot(dx, dy);
    const step = missile.speed * dt;
    if (remaining <= Math.max(9, step)) {
      missile.x = missile.targetX;
      missile.y = missile.targetY;
      detonateStrategicMissile(missile);
      return 'remove';
    }
    const n = normalize(dx, dy);
    missile.vx = n.x * missile.speed;
    missile.vy = n.y * missile.speed;
    missile.x += missile.vx * dt;
    missile.y += missile.vy * dt;
    missile.travelled += Math.hypot(missile.x - beforeX, missile.y - beforeY);
    if (missile.life <= 0 || missile.travelled > missile.maxRange + 20 || missile.x < -80 || missile.y < -80 || missile.x > WORLD.width + 80 || missile.y > WORLD.height + 80) {
      // Fuel/range exhaustion still detonates the warhead at its terminal point.
      detonateStrategicMissile(missile);
      return 'remove';
    }
    return 'keep';
  }

  function spoofStrategicMissile(missile, station, stats) {
    if (!missile || missile.kind !== STRATEGIC_MISSILE_KIND || missile.playerId === station.playerId || missile.alive === false) return false;
    const networkStats = getStrongestEWCoverageStats('spoofingStation', station.playerId, missile.x, missile.y, stats) || stats;
    if (!tryEWProbability(missile, 'spoof', station.playerId, networkStats.interval, networkStats.spoofChance)) return false;
    const forward = normalize(missile.vx, missile.vy);
    const baseAngle = Math.atan2(forward.y, forward.x);
    const deviation = (Math.random() * 2 - 1) * (Math.PI * 0.44); // always inside forward hemisphere
    const distance = 220 + Math.random() * 420;
    let x = clamp(missile.x + Math.cos(baseAngle + deviation) * distance, 20, WORLD.width - 20);
    let y = clamp(missile.y + Math.sin(baseAngle + deviation) * distance, 20, WORLD.height - 20);
    // Clamping at the battlefield edge must never turn the fake destination into
    // a U-turn. Fall back to a shorter point directly ahead if necessary.
    const dot = (x - missile.x) * forward.x + (y - missile.y) * forward.y;
    if (dot <= 1) {
      x = clamp(missile.x + forward.x * 180, 20, WORLD.width - 20);
      y = clamp(missile.y + forward.y * 180, 20, WORLD.height - 20);
    }
    missile.targetX = x;
    missile.targetY = y;
    missile.spoofedByEW = true;
    return true;
  }

  function getFragmentedZoneSlow(entity) {
    ensureMissileRuntimeState();
    if (!entity?.alive || entity.kind !== 'unit' || entity.airborne) return 0;
    let strongest = 0;
    for (const zone of game.missileZones) {
      if (zone.type !== MISSILE_ZONE_FRAGMENTED || zone.expiresAt <= game.time || zone.playerId === entity.playerId) continue;
      if (Math.hypot(entity.x - zone.x, entity.y - zone.y) <= zone.radius + entity.radius) strongest = Math.max(strongest, zone.slow || 0);
    }
    return strongest;
  }

  function getBurningZoneDamageReceivedMultiplier(target) {
    ensureMissileRuntimeState();
    if (!target?.alive || target.airborne) return 1;
    let strongest = 0;
    for (const zone of game.missileZones) {
      if (zone.type !== MISSILE_ZONE_BURNING || zone.expiresAt <= game.time || zone.playerId === target.playerId) continue;
      if (Math.hypot(target.x - zone.x, target.y - zone.y) <= zone.radius + target.radius) strongest = Math.max(strongest, zone.vulnerability || 0);
    }
    return 1 + strongest;
  }

  function applyBurningZoneDot(target, rate, maxDps, dt, attackerPlayerId) {
    if (!target?.alive || target.airborne || rate <= 0) return;
    let amount = Math.max(0, Math.min(target.maxHp * rate, Number.isFinite(maxDps) ? maxDps : Infinity) * dt);
    if (typeof getEnergyFieldDamageReduction === 'function') amount *= (1 - getEnergyFieldDamageReduction(target));
    if (amount <= 0) return;
    target.hp -= amount;
    target.lastHitAt = game.time;
    if (target.hp <= 0) destroyEntity(target, attackerPlayerId);
  }

  function updateMissileZones(dt) {
    ensureMissileRuntimeState();
    game.missileZones = game.missileZones.filter(zone => zone.expiresAt > game.time);
    if (!game.missileZones.length) return;
    const targets = [...game.units, ...game.buildings];
    for (const target of targets) {
      if (!target.alive || target.airborne || (target.kind === 'building' && target.type === 'landmine')) continue;
      let strongestRate = 0;
      let strongestCap = 0;
      let attackerPlayerId = null;
      let strongestAttackMultiplier = 1;
      for (const zone of game.missileZones) {
        if (zone.type !== MISSILE_ZONE_BURNING || zone.playerId === target.playerId) continue;
        if (Math.hypot(target.x - zone.x, target.y - zone.y) > zone.radius + target.radius) continue;
        if ((zone.damageRate || 0) > strongestRate) { strongestRate = zone.damageRate || 0; strongestCap = zone.maxDps || Infinity; attackerPlayerId = zone.playerId; strongestAttackMultiplier = zone.attackMultiplier || 1; }
      }
      if (strongestRate > 0) applyBurningZoneDot(target, strongestRate * strongestAttackMultiplier, strongestCap * strongestAttackMultiplier, dt, attackerPlayerId);
    }
  }

  function isPointBlockedByFragmentedZone(x, y, radius = 0) {
    ensureMissileRuntimeState();
    for (const zone of game.missileZones) {
      if (zone.type !== MISSILE_ZONE_FRAGMENTED || zone.expiresAt <= game.time) continue;
      if (Math.hypot(x - zone.x, y - zone.y) < zone.radius + Math.max(0, radius)) return true;
    }
    return false;
  }

  function refundMissileLaunchSiteQueues(site) {
    if (!site || site.type !== 'missileLaunchSite') return 0;
    ensureMissileLaunchSiteState(site);
    let refund = 0;
    for (const silo of site.missileSilos) {
      if (silo.stage === 'building' && Number.isFinite(silo.paidCost)) refund += silo.paidCost;
      silo.stage = 'idle'; silo.pipelineType = null; silo.progress = 0; silo.paidCost = 0; silo.loadedType = null;
    }
    for (const job of site.missileStockpileQueue) refund += Number(job.paidCost) || 0;
    for (const job of site.missileStockpileJobs) refund += Number(job.paidCost) || 0;
    site.missileStockpileQueue = [];
    site.missileStockpileJobs = [];
    site.missileStockpile = [];
    return refund;
  }
