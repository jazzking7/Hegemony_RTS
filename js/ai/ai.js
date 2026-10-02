'use strict';

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------
  const AI_PERSONALITIES = Object.freeze([
    Object.freeze({ id:'growth', economyBias:1.16, defenseBias:0.94, attackMin:24, attackMax:34 }),
    Object.freeze({ id:'fortress', economyBias:1.02, defenseBias:1.24, attackMin:25, attackMax:36 }),
    Object.freeze({ id:'balanced', economyBias:1.05, defenseBias:1.06, attackMin:23, attackMax:33 }),
    Object.freeze({ id:'pressure', economyBias:0.98, defenseBias:1.00, attackMin:20, attackMax:30 })
  ]);

  function getAIPersonality(player) {
    return AI_PERSONALITIES[Math.max(0, (player.id - 1) % AI_PERSONALITIES.length)] || AI_PERSONALITIES[2];
  }

  function noteAIMacroAction(player, action) {
    if (!player?.ai) return;
    player.ai.macroIdleTime = 0;
    player.ai.lastMacroActionTime = game.time;
    player.ai.lastMacroAction = action || 'macro';
    player.ai.macroActions = (player.ai.macroActions || 0) + 1;
  }

  function getAIMacroTelemetry(player) {
    const owned = game.buildings.filter(b => b.alive && b.playerId === player.id);
    return {
      personality: getAIPersonality(player).id,
      money: player.money,
      income: calculateIncome(player.id),
      buildings: owned.length,
      settlements: owned.filter(b => b.type === 'city' || b.type === 'megacity').length,
      defenses: owned.filter(b => ['machineGun','cannon','mortar','hive','airDefense'].includes(b.type)).length,
      lastAction: player.ai.lastMacroAction,
      lastActionTime: player.ai.lastMacroActionTime,
      idleSeconds: player.ai.macroIdleTime,
      lastBuildFailure: player.ai.lastBuildFailure || '',
      attackTimer: player.ai.attackTimer
    };
  }
  function estimateUnitStrength(unit) {
    if (!unit?.alive) return 0;
    const def = UNITS[unit.type];
    return (def.hp / 100) + (def.damage / 12) + (def.range / 220);
  }

  function evaluateThreat(player) {
    const cap = player.capital;
    if (!cap?.alive) return null;
    unitGrid.queryCircle(cap.x, cap.y, BUILDINGS.capital.buildRange * 0.92, queryScratchC);
    let strength = 0;
    let x = 0;
    let y = 0;
    let count = 0;
    for (const unit of queryScratchC) {
      if (!unit.alive || unit.airborne || unit.garrisoned || unit.playerId === player.id) continue;
      const s = estimateUnitStrength(unit);
      strength += s;
      x += unit.x * s;
      y += unit.y * s;
      count++;
    }
    if (!count || strength < 2.2) return null;
    return { strength, x: x / strength, y: y / strength, count };
  }

  function evaluateAirThreat(player) {
    const cap = player.capital;
    if (!cap?.alive) return 0;
    unitGrid.queryCircle(cap.x, cap.y, 900, queryScratchC);
    let count = 0;
    for (const unit of queryScratchC) if (unit.alive && unit.airborne && unit.playerId !== player.id) count++;
    return count;
  }


  // ---------------------------------------------------------------------------
  // AI research / doctrine adoption
  // ---------------------------------------------------------------------------
  // AI research intentionally uses the exact same DR/SR APIs, providers, costs,
  // durations and prerequisite graph as the human player. The only AI-specific
  // logic here is choosing what to research next.
  const AI_RESEARCH_MIN_SR_FOR_DIVERSIFICATION = 4;

  function getAIImplementedDoctrineIds() {
    return Object.values(DOCTRINE_RESEARCH)
      .filter(def => def?.configured !== false && def?.contentReady !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(def => def.id);
  }

  function getAIDoctrineSRs(doctrineId) {
    return Object.values(SPECIALIZED_RESEARCH)
      .filter(def => def?.configured !== false && def?.doctrine === doctrineId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function getAICompletedDoctrineSRCount(playerId, doctrineId) {
    let count = 0;
    for (const def of getAIDoctrineSRs(doctrineId)) if (isResearchComplete(playerId, def.id)) count++;
    return count;
  }

  function getAICompletedDoctrineLanes(playerId, doctrineId) {
    const lanes = new Map();
    for (const def of getAIDoctrineSRs(doctrineId)) {
      const lane = def.lane || 'general';
      if (!lanes.has(lane)) lanes.set(lane, []);
      lanes.get(lane).push(def);
    }
    const completed = [];
    for (const [lane, defs] of lanes) {
      if (defs.length && defs.every(def => isResearchComplete(playerId, def.id))) completed.push(lane);
    }
    return completed;
  }

  function aiHasSubstantialResearch(player, doctrineId) {
    return getAICompletedDoctrineSRCount(player.id, doctrineId) >= AI_RESEARCH_MIN_SR_FOR_DIVERSIFICATION
      && getAICompletedDoctrineLanes(player.id, doctrineId).length >= 1;
  }

  function getAIMissingResearchStep(playerId, researchId, visited = new Set()) {
    if (!researchId || isResearchComplete(playerId, researchId)) return null;
    if (visited.has(researchId)) return null;
    visited.add(researchId);
    const def = getResearchDefinition(researchId);
    if (!def) return null;
    for (const dependencyId of def.requirements?.research || []) {
      if (isResearchComplete(playerId, dependencyId)) continue;
      const nested = getAIMissingResearchStep(playerId, dependencyId, visited);
      return nested || dependencyId;
    }
    return researchId;
  }

  function getAIIncompleteDoctrineLanes(playerId, doctrineId) {
    const lanes = new Map();
    for (const def of getAIDoctrineSRs(doctrineId)) {
      const lane = def.lane || 'general';
      if (!lanes.has(lane)) lanes.set(lane, []);
      lanes.get(lane).push(def);
    }
    return [...lanes.entries()].filter(([, defs]) => defs.some(def => !isResearchComplete(playerId, def.id)));
  }

  function getAINextFocusedSR(player, doctrineId) {
    if (!isDoctrineUnlocked(player.id, doctrineId)) return null;
    player.ai.researchLaneFocus ||= {};
    let lane = player.ai.researchLaneFocus[doctrineId];
    let incompleteLanes = getAIIncompleteDoctrineLanes(player.id, doctrineId);
    if (!incompleteLanes.length) return null;
    if (!lane || !incompleteLanes.some(([candidate]) => candidate === lane)) {
      lane = choose(incompleteLanes.map(([candidate]) => candidate));
      player.ai.researchLaneFocus[doctrineId] = lane;
    }

    const laneDefs = incompleteLanes.find(([candidate]) => candidate === lane)?.[1] || [];
    const terminal = laneDefs.slice().sort((a, b) => (b.order || 0) - (a.order || 0))[0];
    const stepId = terminal ? getAIMissingResearchStep(player.id, terminal.id) : null;
    if (stepId && !isResearchActive(player.id, stepId)) {
      const stepDef = getResearchDefinition(stepId);
      if (stepDef?.kind === 'SR' && meetsResearchRequirements(player.id, stepDef)) return stepId;
    }

    // A second research slot may be free while the focused branch waits on an
    // active prerequisite. Use that slot on another currently-eligible SR from
    // this doctrine rather than leaving research capacity idle.
    const eligible = getAIDoctrineSRs(doctrineId).filter(def =>
      !isResearchComplete(player.id, def.id)
      && !isResearchActive(player.id, def.id)
      && meetsResearchRequirements(player.id, def)
    );
    return eligible.length ? choose(eligible).id : null;
  }

  function getAIResearchReserve(player) {
    const hasMilitaryBase = game.buildings.some(b => b.alive && b.playerId === player.id && b.type === 'militaryBase');
    if (!hasMilitaryBase) return Infinity;
    const owned = game.buildings.filter(b => b.alive && b.playerId === player.id);
    const settlements = owned.filter(b => b.type === 'city' || b.type === 'megacity').length;
    const income = calculateIncome(player.id);
    const targetReserve = getAIStructureSavingsReserve(player);
    // Research is important, but it is not allowed to repeatedly consume the
    // exact cash packet needed for the next City/Megacity/defense expansion.
    let macroFloor = settlements < 4 ? 650 : income < 700 ? 500 : income < 1200 ? 380 : 300;
    return Math.max(targetReserve, macroFloor);
  }

  function aiTryStartResearch(player, researchId) {
    if (!researchId) return false;
    const reserve = getAIResearchReserve(player);
    if (!Number.isFinite(reserve)) return false;
    const cost = getResearchCost(player.id, researchId);
    if (!Number.isFinite(cost) || player.money < cost + reserve + 40) return false;
    const check = canStartResearch(player.id, researchId);
    if (!check.ok) return false;
    return !!startResearch(player.id, researchId).ok;
  }

  function aiChooseNextSR(player) {
    const unlocked = getAIImplementedDoctrineIds().filter(id => isDoctrineUnlocked(player.id, id));
    if (!unlocked.length) return null;
    if (!unlocked.includes(player.ai.researchFocusDoctrine)) {
      const unspecialized = unlocked.filter(id => !aiHasSubstantialResearch(player, id));
      player.ai.researchFocusDoctrine = choose(unspecialized.length ? unspecialized : unlocked);
    }

    const focus = getAINextFocusedSR(player, player.ai.researchFocusDoctrine);
    if (focus) return focus;

    const shuffled = unlocked.slice();
    while (shuffled.length) {
      const index = Math.floor(Math.random() * shuffled.length);
      const doctrineId = shuffled.splice(index, 1)[0];
      const candidate = getAINextFocusedSR(player, doctrineId);
      if (candidate) return candidate;
    }
    return null;
  }

  function aiResearch(player) {
    if (!player?.isAI || !player.alive || !player.capital?.alive) return 0;
    // Losing the ground-production core is an economic emergency. The AI keeps
    // its research progress but stops buying new research until a Base is back.
    if (!game.buildings.some(b => b.alive && b.playerId === player.id && b.type === 'militaryBase')) return 0;
    let started = 0;

    for (let attempt = 0; attempt < 4; attempt++) {
      const providerHasRoom = getResearchProviders(player.id).some(provider => getResearchProviderAvailableSlots(player.id, provider.id) > 0);
      if (!providerHasRoom) break;

      const implemented = getAIImplementedDoctrineIds();
      const unlocked = implemented.filter(id => isDoctrineUnlocked(player.id, id));
      const activeDR = player.research.active.some(record => record.kind === 'DR');
      const remainingDR = implemented.filter(id => !isDoctrineUnlocked(player.id, id) && !isResearchActive(player.id, id));
      const specializedEnough = unlocked.some(id => aiHasSubstantialResearch(player, id));

      let candidate = null;
      if (!activeDR && remainingDR.length && (unlocked.length === 0 || (specializedEnough && Math.random() < 0.28))) {
        candidate = choose(remainingDR);
        player.ai.researchFocusDoctrine = candidate;
      } else {
        candidate = aiChooseNextSR(player);
        // If every currently-eligible SR is already in progress, a specialized
        // AI may use the spare slot to begin its next doctrine immediately.
        if (!candidate && !activeDR && remainingDR.length && specializedEnough) {
          candidate = choose(remainingDR);
          player.ai.researchFocusDoctrine = candidate;
        }
      }

      if (!candidate || !aiTryStartResearch(player, candidate)) break;
      started++;
    }
    return started;
  }

  function updateAI(dt) {
    for (const player of game.players) {
      if (!player.isAI || !player.alive) continue;
      player.ai.buildTimer -= dt;
      player.ai.trainTimer -= dt;
      player.ai.attackTimer -= dt;
      player.ai.thinkTimer -= dt;
      player.ai.economyTimer -= dt;
      player.ai.researchTimer -= dt;
      player.ai.responseCooldown = Math.max(0, player.ai.responseCooldown - dt);
      player.ai.emergencyBuildCooldown = Math.max(0, (player.ai.emergencyBuildCooldown || 0) - dt);

      if (player.ai.thinkTimer <= 0) {
        const threat = evaluateThreat(player);
        if (threat) {
          player.ai.threatUntil = game.time + 5;
          player.ai.threatX = threat.x;
          player.ai.threatY = threat.y;
          player.ai.threatStrength = threat.strength;
          if (player.ai.responseCooldown <= 0) {
            aiReactToThreat(player, threat);
            player.ai.responseCooldown = rand(3.5, 5.5);
          }
        } else if (game.time > player.ai.threatUntil) {
          player.ai.threatStrength = 0;
        }
        player.ai.thinkTimer = rand(0.75, 1.20);
      }

      // Macro remains deliberately responsive. Humanization applies to major
      // offensive orders, not to economy/build/research housekeeping.
      if (player.ai.economyTimer <= 0) {
        aiDevelopEconomy(player);
        player.ai.economyTimer = game.time < player.ai.threatUntil ? rand(1.25, 2.1) : rand(0.75, 1.35);
      }
      if (player.ai.buildTimer <= 0) {
        aiBuild(player);
        player.ai.buildTimer = game.time < player.ai.threatUntil ? rand(1.45, 2.4) : rand(0.95, 1.70);
      }
      if (player.ai.researchTimer <= 0) {
        aiResearch(player);
        player.ai.researchTimer = rand(2.0, 3.2);
      }
      if (player.ai.trainTimer <= 0) {
        aiTrain(player, game.time < player.ai.threatUntil && player.ai.threatStrength >= 8);
        player.ai.trainTimer = game.time < player.ai.threatUntil ? rand(0.48, 0.82) : rand(0.72, 1.22);
      }

      // Anti-idle watchdog: a solvent AI with legal macro options is never
      // allowed to silently sit on its economy for long stretches.
      if (player.money >= BUILDINGS.machineGun.cost + 20) player.ai.macroIdleTime += dt;
      else player.ai.macroIdleTime = Math.min(player.ai.macroIdleTime, 2.5);
      if (player.ai.macroIdleTime >= 6.5) {
        if (aiForceMacroAction(player)) player.ai.macroIdleTime = 0;
        else player.ai.macroIdleTime = 4.5; // retry soon, but not every frame
      }

      if (player.ai.attackTimer <= 0) {
        let launched = 0;
        if (game.time >= player.ai.threatUntil) launched = aiAttack(player) || 0;
        const personality = getAIPersonality(player);
        player.ai.attackTimer = launched > 0
          ? rand(personality.attackMin, personality.attackMax)
          : rand(9, 15);
      }
    }
  }

  function aiBuildAt(player, type, centerX, centerY, minRadius, maxRadius, attempts = 22) {
    if (!BUILDINGS[type]) {
      player.ai.lastBuildFailure = `Unknown building: ${type}`;
      return false;
    }
    if (player.money < BUILDINGS[type].cost) {
      player.ai.lastBuildFailure = `Saving for ${type}: ${Math.floor(player.money)}/${BUILDINGS[type].cost}`;
      return false;
    }
    for (let attempt = 0; attempt < attempts; attempt++) {
      const angle = rand(0, Math.PI * 2);
      const radius = rand(minRadius, maxRadius);
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      if (placeBuilding(type, x, y, player.id)) {
        player.ai.lastBuildFailure = '';
        noteAIMacroAction(player, `build:${type}`);
        return true;
      }
    }
    player.ai.lastBuildFailure = `No legal ${type} placement near current anchor`;
    return false;
  }

  function getAIAdvancedDesiredCounts() {
    return {
      megacity: Math.min(7, 2 + Math.floor(game.time / 90)),
      cannon: Math.min(8, 2 + Math.floor(game.time / 120)),
      mortar: Math.min(6, 1 + Math.floor(game.time / 135)),
      hive: Math.min(5, 1 + Math.floor(game.time / 155))
    };
  }

  function countOwnedType(owned, type) {
    let count = 0;
    for (const b of owned) if (b.type === type) count++;
    return count;
  }

  function aiSavingsTargetStillNeeded(player, owned) {
    const target = player.ai.saveTarget;
    if (!target || !BUILDINGS[target]) return false;
    const desired = getAIAdvancedDesiredCounts();
    if (target in desired) return countOwnedType(owned, target) < desired[target];
    if (target === 'militaryCommand') return !owned.some(b => b.type === 'militaryCommand');
    return false;
  }

  function ensureAISavingsTarget(player, owned) {
    if (aiSavingsTargetStillNeeded(player, owned)) return player.ai.saveTarget;
    player.ai.saveTarget = null;

    const desired = getAIAdvancedDesiredCounts();
    const hasInitialAdvancedCore = countOwnedType(owned, 'megacity') >= 1
      && countOwnedType(owned, 'cannon') >= 2
      && countOwnedType(owned, 'mortar') >= 1
      && countOwnedType(owned, 'hive') >= 1;
    if (game.time >= 75 && hasInitialAdvancedCore && !owned.some(b => b.type === 'militaryCommand')) {
      player.ai.saveTarget = 'militaryCommand';
      return player.ai.saveTarget;
    }

    const sequence = ['megacity', 'cannon', 'mortar', 'hive'];
    for (let offset = 0; offset < sequence.length; offset++) {
      const index = (player.ai.advancedCycle + offset) % sequence.length;
      const type = sequence[index];
      if (countOwnedType(owned, type) < desired[type]) {
        player.ai.saveTarget = type;
        player.ai.advancedCycle = (index + 1) % sequence.length;
        return type;
      }
    }
    return null;
  }

  function getAIStructureSavingsReserve(player) {
    const type = player.ai.saveTarget;
    // Preserve a small completion buffer so training/SR purchases cannot keep the
    // AI permanently hovering a few dollars below its intended structure cost.
    return type && BUILDINGS[type] ? BUILDINGS[type].cost + 80 : 0;
  }

  function getAIEconomyReserve(player) {
    const income = calculateIncome(player.id);
    if (income < 500) return 160;
    if (income < 900) return 210;
    if (income < 1400) return 260;
    return 320;
  }

  function getAISavingsReserve(player) {
    // Production/research/optional construction cannot drain money earmarked for
    // the next economic expansion step. This gives the AI human-like macro
    // discipline instead of spending every small cash pulse immediately.
    return Math.max(getAIStructureSavingsReserve(player), getAIEconomyReserve(player));
  }

  function aiUpgradeEconomy(player, owned, reserve = 0) {
    const candidates = owned.filter(b => (b.type === 'city' || b.type === 'megacity') && (b.level || 1) < 5);
    if (!candidates.length) return false;
    // Highest-income settlement first gives the strongest absolute return per
    // click and naturally makes valuable Megacities become economic anchors.
    candidates.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'megacity' ? -1 : 1;
      return getBuildingIncome(b) - getBuildingIncome(a);
    });
    for (const target of candidates) {
      const cost = getUpgradeCost(target);
      const level = target.level || 1;
      // Levels 1→3 are treated as core economic development and may use most of
      // the reserve because they repay themselves quickly. Higher levels protect
      // the full advanced-structure savings target.
      const protectedReserve = level < 3 ? Math.min(reserve, 100) : reserve;
      if (player.money < cost + protectedReserve + 40) continue;
      player.money -= cost;
      target.level = Math.min(5, level + 1);
      noteAIMacroAction(player, `upgrade:${target.type}:L${target.level}`);
      return true;
    }
    return false;
  }

  function aiDevelopEconomy(player) {
    if (!player.capital?.alive || entityCount() >= MAX_ENTITIES - 8) return false;
    const owned = game.buildings.filter(b => b.alive && b.playerId === player.id);
    const settlements = owned.filter(b => b.type === 'city' || b.type === 'megacity');
    if (!owned.some(b => b.type === 'militaryBase')) return false;
    ensureAISavingsTarget(player, owned);
    const income = calculateIncome(player.id);
    const personality = getAIPersonality(player);
    const liquidReserve = Math.min(180, getAIEconomyReserve(player));
    const desiredSettlements = Math.min(18, Math.max(5, Math.round((6 + game.time / 55) * personality.economyBias)));
    const desiredMega = Math.min(9, Math.max(2, Math.round((2 + game.time / 85) * personality.economyBias)));
    const megaCount = countOwnedType(owned, 'megacity');

    // Establish several independent income sources quickly. The previous macro
    // pass over-saved for research/advanced structures and could hover below its
    // own spending gates for minutes; economy expansion now has first-class cash.
    if (settlements.length < Math.min(5, desiredSettlements) && player.money >= BUILDINGS.city.cost + 40) {
      if (aiBuildAt(player, 'city', player.capital.x, player.capital.y, 175, 690, 42)) return true;
    }

    // Once the basic tax base exists, save for Megacities before endlessly
    // polishing cheap City levels. This creates visible high-value economic hubs.
    if (settlements.length >= 4 && megaCount < desiredMega) {
      if (player.money >= BUILDINGS.megacity.cost + 35) {
        if (aiBuildAt(player, 'megacity', player.capital.x, player.capital.y, 190, 700, 48)) return true;
      }
      // Do not repeatedly spend the Megacity savings packet on City upgrades.
      // Let cash cross the threshold, then the next economy/build tick converts
      // it into a visible high-output economic hub.
      if (player.ai.saveTarget === 'megacity') return false;
    }

    // Cheap settlement upgrades compound income rapidly, but only after the
    // current Megacity target has had a chance to claim its cash packet.
    if (aiUpgradeEconomy(player, owned, liquidReserve)) return true;

    if (settlements.length < desiredSettlements && player.money >= BUILDINGS.city.cost + liquidReserve) {
      if (aiBuildAt(player, 'city', player.capital.x, player.capital.y, 175, 700, 44)) return true;
    }

    // Once the base is broad, keep compounding higher settlement levels whenever
    // there is spare liquidity rather than leaving cash idle.
    if (income >= 700 && aiUpgradeEconomy(player, owned, Math.min(320, getAIEconomyReserve(player)))) return true;
    return false;
  }

  function aiTryBuildSavingsTarget(player, owned, reserve = 0) {
    const target = ensureAISavingsTarget(player, owned);
    if (!target) return false;
    const cost = BUILDINGS[target].cost;
    // The target cost itself is the saved packet. Do not double-count it as both
    // cost and reserve; that regression was a major cause of macro inactivity.
    if (player.money < cost + Math.min(80, Math.max(0, reserve))) return false;

    let built = false;
    if (target === 'megacity') {
      built = aiBuildAt(player, target, player.capital.x, player.capital.y, 210, 690, 30);
    } else if (target === 'militaryCommand') {
      built = aiBuildAt(player, target, player.capital.x, player.capital.y, 130, 390, 30);
    } else {
      built = aiBuildAt(player, target, player.capital.x, player.capital.y, 230, 650, 30);
    }
    if (built) {
      if (target === 'megacity') {
        const desiredMega = getAIAdvancedDesiredCounts().megacity;
        const currentMega = game.buildings.filter(b => b.alive && b.playerId === player.id && b.type === 'megacity').length;
        player.ai.saveTarget = currentMega < desiredMega ? 'megacity' : null;
      } else {
        player.ai.saveTarget = null;
      }
    }
    return built;
  }

  function aiTryBuildUnlockedDoctrineFacility(player, owned, reserve = 0) {
    const targets = [
      { type: 'advancedEngineeringComplex', desired: 1, minRadius: 150, maxRadius: 430 },
      { type: 'droneHub', desired: 1, minRadius: 170, maxRadius: 470 },
      { type: 'researchCenter', desired: calculateIncome(player.id) >= 900 ? 2 : 1, minRadius: 135, maxRadius: 390 },
      { type: 'advancedCoordinationCenter', desired: getAdvancedCoordinationCenterLimit(player.id), minRadius: 155, maxRadius: 430 },
      { type: 'missileLaunchSite', desired: getMissileLaunchSiteLimit(player.id), minRadius: 170, maxRadius: 430 },
      { type: 'radarStation', desired: 1, minRadius: 180, maxRadius: 500 },
      { type: 'jammingStation', desired: 1, minRadius: 180, maxRadius: 500 },
      { type: 'spoofingStation', desired: 1, minRadius: 180, maxRadius: 500 },
      { type: 'energyGenerator', desired: Math.max(1, Math.ceil(owned.filter(b => ENERGY_CONSUMER_TYPES.includes(b.type)).reduce((sum,b)=>sum+getEnergyConsumerDemand(b),0) / Math.max(1,getGeneratorMaxPower(player.id)))), minRadius: 150, maxRadius: 390 },
      { type: 'orbitalBeamSystem', desired: 1, minRadius: 170, maxRadius: 430 },
      { type: 'energyFieldNode', desired: 4, minRadius: 170, maxRadius: 330 },
      { type: 'deathRayTower', desired: 2, minRadius: 190, maxRadius: 470 },
      { type: 'superiorMobilizationComplex', desired: 1, minRadius: 165, maxRadius: 420 }
    ].filter(item => isDefinitionUnlocked(player.id, 'building', item.type) && countOwnedType(owned, item.type) < item.desired);
    if (!targets.length) return false;
    const start = player.ai.doctrineBuildCycle % targets.length;
    for (let offset = 0; offset < targets.length; offset++) {
      const item = targets[(start + offset) % targets.length];
      const cost = BUILDINGS[item.type].cost;
      if (player.money < cost + reserve + 100) continue;
      if (aiBuildAt(player, item.type, player.capital.x, player.capital.y, item.minRadius, item.maxRadius, 30)) {
        player.ai.doctrineBuildCycle = (start + offset + 1) % Math.max(1, targets.length);
        return true;
      }
    }
    return false;
  }

  function aiAdoptUnlockedBuildingModes(player, owned) {
    if (hasResearchCapability(player.id, 'hiveSearchDestroyMode')) {
      for (const hive of owned) {
        if (hive.type !== 'hive' || hive.hiveMode === 'searchDestroy') continue;
        // Keep some UGV Hives for mixed defenses while allowing the AI to use the
        // newly unlocked autonomous drone mode without micromanagement.
        if (((hive.id + player.id) & 1) === 0) setHiveMode(hive, 'searchDestroy', { allowAI: true });
      }
    }
    updateAIElectronicWarfareHeadings(player, owned);
    aiAdoptMissileBattery(player, owned);
    aiAdoptDirectedEnergy(player, owned);
    aiAdoptAdvancedInfantry(player, owned);
    aiAdoptCommandAutomation(player, owned);
  }

  function aiAdoptDirectedEnergy(player, owned) {
    if (!isDoctrineUnlocked(player.id, 'directedEnergy')) return false;
    const generators = owned.filter(b => b.type === 'energyGenerator');
    const consumers = owned.filter(b => ENERGY_CONSUMER_TYPES.includes(b.type));
    for (const consumer of consumers) {
      if (consumer.type === 'orbitalBeamSystem') setEnergyPriority(consumer, 'high');
      else if (consumer.type === 'energyFieldNode') { setEnergyPriority(consumer, 'low'); consumer.energyNodeOn = true; }
      else setEnergyPriority(consumer, 'normal');
    }
    let remainingDemand = consumers.reduce((sum,b)=>sum+getEnergyConsumerDemand(b),0);
    for (const generator of generators.slice().sort((a,b)=>a.id-b.id)) {
      const output = Math.min(getGeneratorMaxPower(player.id), remainingDemand);
      setGeneratorOutput(generator, output);
      remainingDemand = Math.max(0, remainingDemand - output);
    }
    return generators.length > 0;
  }

  function aiAdoptAdvancedInfantry(player, owned) {
    if (!isDoctrineUnlocked(player.id, 'advancedInfantry') || !isResearchComplete(player.id, 'aiUnlockComplex')) return false;
    const complexes = owned.filter(b => b.type === 'superiorMobilizationComplex');
    if (!complexes.length) return false;
    const chooseFirst = (category, soldierType, preferred = []) => {
      const unlocked = getUnlockedInfantryEquipment(player.id, category, soldierType);
      for (const id of preferred) if (unlocked.some(([key]) => key === id)) return id;
      return unlocked[0]?.[0] || null;
    };
    const state = getAdvancedInfantryState(player.id);
    if (!state.loadouts.length) {
      const modules = getUnlockedInfantryEquipment(player.id, 'module', 'basic').slice(0,2).map(([id])=>id);
      saveInfantryLoadout(player.id, {
        name:'AI Line Exosuit', soldierType:'basic',
        helmet:chooseFirst('helmet','basic',['targetingAssistance','sniperOptics']),
        body:chooseFirst('body','basic',['compositeArmour','highSurvivability']),
        weapons:[chooseFirst('weapon','basic',['machineGun','grenadeLauncher'])].filter(Boolean),
        boots:chooseFirst('boots','basic',['swiftSpeed','greaterProtection']), modules
      });
    }
    const hasEliteGear = ['helmet','body','boots','module'].some(category => getUnlockedInfantryEquipment(player.id, category, 'elite').some(([,item])=>item.tier==='elite'));
    if (hasEliteGear && state.loadouts.length < getInfantryLoadoutCapacity(player.id) && !state.loadouts.some(l=>l.soldierType==='elite')) {
      const modules = getUnlockedInfantryEquipment(player.id,'module','elite').slice(0,4).map(([id])=>id);
      const weapons = getUnlockedInfantryEquipment(player.id,'weapon','elite').slice(0,2).map(([id])=>id);
      saveInfantryLoadout(player.id, {
        name:'AI Elite Exosuit', soldierType:'elite',
        helmet:chooseFirst('helmet','elite',['enemyAnalysis','hawkeyeOptics','comprehensiveProtection']),
        body:chooseFirst('body','elite',['multilayerComposite','extremeSurvivability']),
        weapons, boots:chooseFirst('boots','elite',['greatProtection','superfastSpeed']), modules
      });
    }
    const bases = owned.filter(b=>b.type==='militaryBase' && b.queue.length < 60);
    for (const base of bases) {
      const configuredQueued = (base.queueBuildConfigs||[]).filter(c=>c?.advancedInfantry).length;
      if (configuredQueued >= 4 || player.money < 300) continue;
      const loadout = state.loadouts[(base.id + Math.floor(game.time/30)) % state.loadouts.length];
      if (loadout) queueInfantryLoadoutTraining(base, loadout.id, Math.min(2,4-configuredQueued), {silent:true});
    }
    return state.loadouts.length > 0;
  }

  function aiAdoptMissileBattery(player, owned) {
    const sites = owned.filter(b => b.type === 'missileLaunchSite');
    const unlocked = getUnlockedMissileTypes(player.id);
    if (!sites.length || !unlocked.length) return false;
    for (const site of sites) {
      ensureMissileLaunchSiteState(site);
      for (const silo of site.missileSilos) {
        const desired = unlocked[(silo.index + player.id) % unlocked.length];
        if (silo.configuredType !== desired) configureMissileSilo(site, silo.index, desired);
        if (!silo.active) toggleMissileSilo(site, silo.index);
      }
      // Use the separate FIFO line opportunistically without monopolizing the
      // AI economy. Capacity enforcement inside queueStockpileMissile prevents
      // queued stockpile work plus silo jobs from exceeding MLS missile capacity.
      if (player.money > 2200 && site.missileStockpileQueue.length + site.missileStockpileJobs.length < getStockpileParallelism(player.id)) {
        const type = unlocked[(site.id + Math.floor(game.time / 20)) % unlocked.length];
        queueStockpileMissile(site, type);
      }
    }
    return true;
  }

  function aiLaunchStrategicMissiles(player, targetPlayer) {
    let launched = 0;
    const sites = game.buildings.filter(b => b.alive && b.playerId === player.id && b.type === 'missileLaunchSite');
    if (!sites.length) return 0;
    const enemyBuildings = game.buildings.filter(b => b.alive && b.playerId === targetPlayer.id && b.type !== 'landmine');
    const enemyUnits = game.units.filter(u => u.alive && u.playerId === targetPlayer.id && !u.airborne && !u.garrisoned);
    const value = target => target.kind === 'building' ? (target.type === 'capital' ? 20 : target.type === 'airDefense' ? 12 : target.type === 'militaryBase' || target.type === 'airbase' ? 10 : target.type === 'megacity' ? 9 : 5) : 2;
    for (const site of sites) {
      ensureMissileLaunchSiteState(site);
      for (const silo of site.missileSilos) {
        if (!silo.active || !silo.loadedType) continue;
        const stats = getStrategicMissileStats(player.id, silo.loadedType);
        const candidates = [...enemyBuildings, ...enemyUnits].filter(t => Math.hypot(t.x - site.x, t.y - site.y) <= stats.range);
        if (!candidates.length) continue;
        candidates.sort((a,b) => value(b)-value(a) || Math.hypot(a.x-site.x,a.y-site.y)-Math.hypot(b.x-site.x,b.y-site.y));
        const target = candidates[0];
        if (launchStrategicMissile(site, silo.index, target.x, target.y).ok) launched++;
      }
    }
    return launched;
  }

  function aiAdoptCommandAutomation(player, owned) {
    if (!hasResearchCapability(player.id, 'automatedWarfare')) return false;
    const centers = owned.filter(b => b.type === 'advancedCoordinationCenter');
    if (!centers.length) return false;
    const enemies = game.players.filter(other => other.alive && other.id !== player.id && other.capital?.alive);
    if (!enemies.length) return false;
    const enemy = enemies.reduce((best, other) => distance(player.capital, other.capital) < distance(player.capital, best.capital) ? other : best, enemies[0]);
    for (const center of centers) {
      if (getCoordinationCenterUsedBandwidth(center) >= getCoordinationCenterBandwidth(center)) continue;
      const existing = (center.automatedWarfare || []).filter(r => !r.cancelled);
      const base = owned.find(b => b.type === 'militaryBase');
      if (base && !existing.some(r => r.kind === 'theater')) {
        const composition = Object.fromEntries(COMMAND_GROUND_TYPES.map(type => [type, 0]));
        composition.basic = 6;
        composition.elite = isDefinitionUnlocked(player.id, 'unit', 'elite') ? 2 : 0;
        if (isDefinitionUnlocked(player.id, 'unit', 'tank')) composition.tank = 1;
        if (isDefinitionUnlocked(player.id, 'unit', 'apc')) composition.apc = 1;
        const result = createAutomatedWarfare(center, { kind:'theater', name:'AI Theater Routine', facilityId:base.id, templateType:'focused', composition, focused:true, targetX:enemy.capital.x, targetY:enemy.capital.y });
        if (result.ok) return true;
      }
      const airbase = owned.find(b => b.type === 'airbase');
      if (airbase && !existing.some(r => r.kind === 'areaDenial')) {
        const composition = { bomber: 1, superFighter: isDefinitionUnlocked(player.id, 'unit', 'superFighter') ? 1 : 0, paratrooperPlane: 0 };
        const result = createAutomatedWarfare(center, { kind:'areaDenial', name:'AI Area Denial', facilityId:airbase.id, composition, escortsPerAircraft:isDefinitionUnlocked(player.id,'unit','loyalWingman')?1:0, targetX:enemy.capital.x, targetY:enemy.capital.y });
        if (result.ok) return true;
      }
    }
    return false;
  }

  function getAIDefenseAnchor(player, settlements) {
    if (!settlements.length || Math.random() < 0.44) return player.capital;
    const ranked = settlements.slice().sort((a, b) => getBuildingIncome(b) - getBuildingIncome(a));
    return choose(ranked.slice(0, Math.min(5, ranked.length))) || player.capital;
  }

  function aiBuild(player) {
    if (entityCount() >= MAX_ENTITIES - 10 || !player.capital?.alive) return false;
    const owned = game.buildings.filter(b => b.alive && b.playerId === player.id);
    const settlements = owned.filter(b => b.type === 'city' || b.type === 'megacity');
    const bases = owned.filter(b => b.type === 'militaryBase');
    const airbases = owned.filter(b => b.type === 'airbase');
    const airDefense = owned.filter(b => b.type === 'airDefense');
    const command = owned.some(b => b.type === 'militaryCommand');
    const defenses = owned.filter(b => ['machineGun', 'cannon', 'mortar', 'hive', 'airDefense'].includes(b.type));
    const underThreat = game.time < player.ai.threatUntil;
    const emergencyThreat = underThreat && player.ai.threatStrength >= 8;
    const severeEmergency = underThreat && player.ai.threatStrength >= 16;
    const income = calculateIncome(player.id);
    const personality = getAIPersonality(player);
    const liquidReserve = getAIEconomyReserve(player);
    const desiredBases = Math.min(4, 2 + (income >= 850 ? 1 : 0) + (income >= 1600 ? 1 : 0));
    const desiredAirbases = Math.min(3, 1 + (income >= 1100 ? 1 : 0) + (income >= 2100 ? 1 : 0));
    const desiredDefenses = Math.min(42, Math.round((10 + income / 170 + game.time / 120) * personality.defenseBias));

    if (!bases.length) {
      if (player.money >= BUILDINGS.militaryBase.cost) return aiBuildAt(player, 'militaryBase', player.capital.x, player.capital.y, 125, 390, 42);
      return false;
    }

    aiAdoptUnlockedBuildingModes(player, owned);
    ensureAISavingsTarget(player, owned);

    const airThreat = evaluateAirThreat(player);
    if (airThreat > 0 && airDefense.length < Math.min(6, airThreat + 1) && player.money >= BUILDINGS.airDefense.cost + 20) {
      if (aiBuildAt(player, 'airDefense', player.capital.x, player.capital.y, 185, 570, 34)) return true;
    }

    if (emergencyThreat && player.ai.emergencyBuildCooldown <= 0 && defenses.length < Math.max(18, desiredDefenses)) {
      const threatAngle = Math.atan2(player.ai.threatY - player.capital.y, player.ai.threatX - player.capital.x);
      const defensiveTypes = player.ai.threatStrength > 12 ? ['mortar', 'cannon', 'hive', 'machineGun'] : ['cannon', 'machineGun', 'hive'];
      for (let attempt = 0; attempt < 18; attempt++) {
        const type = choose(defensiveTypes);
        if (player.money < BUILDINGS[type].cost) continue;
        const angle = threatAngle + rand(-0.9, 0.9);
        const radius = rand(205, 520);
        const x = player.capital.x + Math.cos(angle) * radius;
        const y = player.capital.y + Math.sin(angle) * radius;
        if (placeBuilding(type, x, y, player.id)) {
          noteAIMacroAction(player, `emergency-defense:${type}`);
          player.ai.emergencyBuildCooldown = rand(8, 12);
          return true;
        }
      }
    }

    // A genuinely cash-rich AI should convert researched doctrines into actual
    // battlefield infrastructure immediately. This does not affect ordinary
    // macro pacing; it only prevents rich late-game AIs from ignoring unlocks.
    if (!emergencyThreat && player.money >= 2500 && aiTryBuildUnlockedDoctrineFacility(player, owned, 0)) return true;

    // If an advanced savings target is already affordable, buy it immediately.
    // Never require target cost + target cost again.
    if (!severeEmergency && (settlements.length >= 5 || income >= 700) && aiTryBuildSavingsTarget(player, owned, liquidReserve)) return true;
    const savingsTarget = ensureAISavingsTarget(player, owned);
    if (!severeEmergency && savingsTarget && BUILDINGS[savingsTarget] && player.money < BUILDINGS[savingsTarget].cost + 35) {
      // Protect the final stretch of a deliberate macro purchase. Training and
      // research already honor this packet; optional construction must do so too.
      return false;
    }

    if (bases.length < desiredBases && player.money >= BUILDINGS.militaryBase.cost + Math.min(liquidReserve, 160)) {
      if (aiBuildAt(player, 'militaryBase', player.capital.x, player.capital.y, 120, 430, 36)) return true;
    }

    // Defense spending deliberately scales with income and is allowed to use
    // cash that used to be trapped behind huge generic reserves.
    const defenseReserve = income >= 900 ? 80 : liquidReserve;
    if (defenses.length < desiredDefenses && (settlements.length >= 5 || emergencyThreat) && (income >= 350 || game.time >= 85) && player.money >= BUILDINGS.machineGun.cost + defenseReserve) {
      const anchor = getAIDefenseAnchor(player, settlements);
      const roll = Math.random();
      const type = roll < 0.20 && player.money >= BUILDINGS.mortar.cost + defenseReserve ? 'mortar'
        : roll < 0.48 && player.money >= BUILDINGS.cannon.cost + defenseReserve ? 'cannon'
        : roll < 0.63 && player.money >= BUILDINGS.hive.cost + defenseReserve ? 'hive'
        : roll < 0.76 && player.money >= BUILDINGS.airDefense.cost + defenseReserve ? 'airDefense'
        : 'machineGun';
      const aroundCapital = anchor === player.capital;
      if (aiBuildAt(player, type, anchor.x, anchor.y, aroundCapital ? 175 : 85, aroundCapital ? 670 : 300, 40)) return true;
    }

    if (!command && settlements.length >= 2 && player.money >= BUILDINGS.militaryCommand.cost + Math.min(liquidReserve, 150)) {
      if (aiBuildAt(player, 'militaryCommand', player.capital.x, player.capital.y, 115, 390, 34)) return true;
    }

    if (game.time > 75 && airbases.length < desiredAirbases && player.money >= BUILDINGS.airbase.cost + Math.min(liquidReserve, 180)) {
      if (aiBuildAt(player, 'airbase', player.capital.x, player.capital.y, 145, 460, 36)) return true;
    }

    // Doctrine infrastructure is important but no longer preempts economy and
    // baseline defense every time the build timer fires.
    if (!emergencyThreat && (income >= 700 || game.time >= 180) && aiTryBuildUnlockedDoctrineFacility(player, owned, Math.min(liquidReserve, 220))) return true;

    if (settlements.length < 16 && player.money >= BUILDINGS.city.cost + 50) {
      if (aiBuildAt(player, 'city', player.capital.x, player.capital.y, 175, 700, 40)) return true;
    }
    return false;
  }

  function aiForceMacroAction(player) {
    if (!player?.alive || !player.capital?.alive || entityCount() >= MAX_ENTITIES - 8) return false;
    const owned = game.buildings.filter(b => b.alive && b.playerId === player.id);
    const bases = owned.filter(b => b.type === 'militaryBase');
    const settlements = owned.filter(b => b.type === 'city' || b.type === 'megacity');
    const defenses = owned.filter(b => ['machineGun','cannon','mortar','hive','airDefense'].includes(b.type));
    if (!bases.length && player.money >= BUILDINGS.militaryBase.cost) return aiBuildAt(player, 'militaryBase', player.capital.x, player.capital.y, 120, 410, 50);
    const savingsTarget = ensureAISavingsTarget(player, owned);
    if (savingsTarget && BUILDINGS[savingsTarget]) {
      if (player.money >= BUILDINGS[savingsTarget].cost + 20 && aiTryBuildSavingsTarget(player, owned, 0)) return true;
      if (player.money < BUILDINGS[savingsTarget].cost + 20) return false;
    }
    if (settlements.length < 8 && player.money >= BUILDINGS.city.cost + 20) {
      if (aiBuildAt(player, 'city', player.capital.x, player.capital.y, 165, 700, 54)) return true;
    }
    if (aiUpgradeEconomy(player, owned, 0)) return true;
    if (defenses.length < 18 && player.money >= BUILDINGS.machineGun.cost + 20) {
      const anchor = getAIDefenseAnchor(player, settlements);
      if (aiBuildAt(player, player.money >= BUILDINGS.cannon.cost + 30 ? 'cannon' : 'machineGun', anchor.x, anchor.y, anchor === player.capital ? 170 : 80, anchor === player.capital ? 670 : 290, 54)) return true;
    }
    if (player.money >= BUILDINGS.megacity.cost + 40) {
      if (aiBuildAt(player, 'megacity', player.capital.x, player.capital.y, 190, 700, 54)) return true;
    }
    return false;
  }

  function aiQueueStandardUnit(player, facility, type, reserve = 0) {
    if (!facility?.alive || !isDefinitionUnlocked(player.id, 'unit', type) || !isTrainingFacilityFor(facility, type)) return false;
    if (facility.type === 'airbase' && getAirbaseAvailableSlots(facility) <= 0) return false;
    if (facility.queue.length >= (facility.type === 'airbase' ? getAirbaseAircraftCapacity(player.id) : 55)) return false;
    if (['militaryBase','superiorMobilizationComplex'].includes(facility.type) && getGroundFacilityStoredCount(facility) + facility.queue.length >= getGroundFacilityStorageCapacity(facility)) return false;
    const configuration = TRANSPORT_UNIT_TYPES.includes(type) ? getVehicleBuildConfiguration(player.id, type)
      : (type === 'superFighter' || type === 'paratrooperPlane') ? getAircraftBuildConfiguration(player.id, type) : null;
    const cost = getTrainingPackageCost(player.id, type, configuration);
    if (!Number.isFinite(cost) || player.money < cost + reserve) return false;
    player.money -= cost;
    facility.queue.push(type);
    facility.queuePaidCosts ||= [];
    facility.queueBuildConfigs ||= [];
    facility.queueMeta ||= [];
    facility.queuePaidCosts.push(cost);
    facility.queueBuildConfigs.push(clonePlain(configuration));
    facility.queueMeta.push(null);
    return true;
  }

  function aiTrainDoctrineUnits(player, reserve) {
    const complexes = game.buildings.filter(b => b.alive && b.playerId === player.id && b.type === 'advancedEngineeringComplex');
    for (const complex of complexes) {
      const desired = Math.min(3, getEngineeringComplexCapacity(complex));
      if (getEngineeringComplexCommitment(complex) < desired && player.money >= getEngineerTrainingCost(player.id) + reserve && Math.random() < 0.35) {
        if (queueEngineerTraining(complex, 1, { silent: true })) return true;
      }
    }

    const hubs = game.buildings.filter(b => b.alive && b.playerId === player.id && b.type === 'droneHub');
    for (const hub of hubs) {
      if (isDefinitionUnlocked(player.id, 'unit', 'loyalWingman') && Math.random() < 0.16) {
        const cost = getDroneBatchCost(player.id, 'loyalWingman', 1);
        if (player.money >= cost + reserve && queueDroneBatch(hub, 'loyalWingman', 1, { silent: true })) return true;
      }
      if (isDefinitionUnlocked(player.id, 'unit', 'loiteringMunition')) {
        const targetStock = Math.min(getDroneHubCapacity(hub, 'loiteringMunition'), 50 + Math.floor(game.time / 180) * 20);
        const current = getDroneHubStoredCount(hub, 'loiteringMunition') + (hub.queue || []).filter(type => type === 'loiteringMunition').length;
        if (current < targetStock) {
          const room = targetStock - current;
          const batch = room >= 10 ? 10 : room >= 5 ? 5 : 1;
          const cost = getDroneBatchCost(player.id, 'loiteringMunition', batch);
          if (player.money >= cost + reserve && queueDroneBatch(hub, 'loiteringMunition', batch, { silent: true })) return true;
        }
      }
    }
    return false;
  }

  function aiTrain(player, emergency = false) {
    const bases = game.buildings.filter(b => b.alive && b.playerId === player.id && b.type === 'militaryBase');
    const airbases = game.buildings.filter(b => b.alive && b.playerId === player.id && b.type === 'airbase');
    const reserve = emergency ? 0 : Math.max(getAIStructureSavingsReserve(player), Math.min(360, getAIEconomyReserve(player)));
    // Military Base recovery owns the budget while the last Base is down.
    if (!bases.length) return;

    if (!emergency && aiTrainDoctrineUnits(player, reserve)) return;

    if (airbases.length && !emergency && Math.random() < 0.28) {
      const candidates = airbases.filter(b => getAirbaseAvailableSlots(b) > 0);
      if (candidates.length) {
        const airbase = candidates.reduce((best, b) => getAirbaseAircraftCommitment(b) < getAirbaseAircraftCommitment(best) ? b : best, candidates[0]);
        const types = MANNED_AIRCRAFT_TYPES.filter(type => type === 'bomber' || isDefinitionUnlocked(player.id, 'unit', type));
        const advanced = types.filter(type => type !== 'bomber');
        const type = advanced.length && Math.random() < 0.58 ? choose(advanced) : 'bomber';
        if (aiQueueStandardUnit(player, airbase, type, reserve)) return;
      }
    }

    const base = bases.reduce((best, b) => b.queue.length < best.queue.length ? b : best, bases[0]);
    if (base.queue.length >= 55) return;
    const advancedGround = ['apc', 'ifv'].filter(type => isDefinitionUnlocked(player.id, 'unit', type));
    let type;
    if (advancedGround.length && !emergency && Math.random() < 0.30) {
      type = choose(advancedGround);
      if (type === 'ifv' && isResearchComplete(player.id, 'mwIFVGrenade')) {
        player.vehicleConfig.ifvTurret = Math.random() < 0.5 ? 'grenade' : 'machineGun';
      }
    } else {
      const weighted = Math.random();
      if (emergency) type = weighted < 0.30 ? 'basic' : weighted < 0.50 ? 'elite' : weighted < 0.78 ? 'tank' : 'spg';
      else type = weighted < 0.34 ? 'basic' : weighted < 0.56 ? 'elite' : weighted < 0.80 ? 'tank' : 'spg';
    }
    aiQueueStandardUnit(player, base, type, reserve);
  }

  function aiReactToThreat(player, threat) {
    const bases = game.buildings.filter(b => b.alive && b.playerId === player.id && b.type === 'militaryBase');
    if (!bases.length || entityCount() >= MAX_ENTITIES - 4) return;
    const desiredStrength = Math.min(30, Math.max(5, Math.ceil(threat.strength * 0.8)));
    let deployed = 0;
    for (const base of bases) {
      if (deployed >= desiredStrength) break;
      const order = ['tank','ifv','elite','apc','basic','spg'].filter(type => isDefinitionUnlocked(player.id, 'unit', type));
      for (const type of order) {
        let amount = Math.min(base.storage[type] || 0, type === 'basic' ? 8 : type === 'elite' ? 5 : 3);
        while (amount-- > 0 && deployed < desiredStrength && entityCount() < MAX_ENTITIES) {
          const record = takeStoredUnit(base, type);
          if (!record) break;
          const a = (deployed % 10) / 10 * Math.PI * 2;
          const unit = createUnitFromRecord(record, base.x + Math.cos(a) * 45, base.y + Math.sin(a) * 45);
          if (!unit) { restoreStoredUnit(base, record); break; }
          unit.orderX = threat.x + rand(-70, 70);
          unit.orderY = threat.y + rand(-70, 70);
          unit.hasOrder = true;
          deployed++;
        }
      }
    }
    if (deployed > 0 && player.id !== PLAYER_ID) {
      // No UI spam for every response; the human gets one useful warning when the
      // AI visibly mobilizes against an incoming attack.
      const humanNearby = distance({x: threat.x, y: threat.y}, game.players[PLAYER_ID].capital) < BUILDINGS.capital.buildRange * 1.4;
      if (humanNearby) notify(`${player.name} is mobilizing a defensive response.`, 'warning', 3.2);
    }
  }

  function aiChooseAttackTarget(player, targets) {
    let best = null;
    let bestScore = -Infinity;
    for (const target of targets) {
      if (!target.capital?.alive) continue;
      const d = distance(player.capital, target.capital);
      const income = calculateIncome(target.id);
      const ownedBuildings = game.buildings.filter(b => b.alive && b.playerId === target.id).length;
      const capitalDamage = 1 - target.capital.hp / target.capital.maxHp;
      // Nearby, wealthy, or already-damaged rivals are attractive targets. A
      // little randomness prevents every AI from making identical choices.
      const score = (income / 180) + (ownedBuildings * 0.14) + (capitalDamage * 5.5) - (d / 900) + rand(-0.8, 0.8);
      if (score > bestScore) {
        bestScore = score;
        best = target;
      }
    }
    return best || choose(targets);
  }

  function aiLaunchMannedAircraft(player, airbase, type, targetX, targetY, spawnIndex = 0) {
    const aircraft = takeReadyAircraft(airbase, type);
    if (!aircraft) return null;
    const a = spawnIndex * 2.399963229728653;
    const common = { homeAirbaseId: airbase.id, bombTargetX: targetX, bombTargetY: targetY };
    let unit = null;
    if (type === 'bomber') {
      unit = createUnitFromRecord(aircraft, airbase.x + Math.cos(a) * 54, airbase.y + Math.sin(a) * 54, {
        ...common, airMissionState: 'outbound', bombTargetX: targetX + rand(-25, 25), bombTargetY: targetY + rand(-25, 25), bombReleased: false
      });
    } else if (type === 'superFighter') {
      const missiles = normalizeFighterMissileConfiguration(player.id, aircraft.configuration?.missiles);
      unit = createUnitFromRecord(aircraft, airbase.x + Math.cos(a) * 58, airbase.y + Math.sin(a) * 58, {
        ...common,
        airMissionState: missiles.airToGround > 0 ? 'fighterStrike' : missiles.airToAir > 0 ? 'fighterPatrol' : 'returning',
        fighterMissionX: targetX, fighterMissionY: targetY,
        fighterA2ARemaining: missiles.airToAir, fighterA2GRemaining: missiles.airToGround,
        payloadRemaining: missiles.airToAir + missiles.airToGround,
        enduranceRemaining: getDefinitionPlayerStat(player.id, 'unit', 'superFighter', 'endurance', AIR_DOMINANCE_BALANCE.fighterEndurance),
        flareCharges: Math.max(0, Math.floor(getDefinitionPlayerStat(player.id, 'unit', 'superFighter', 'flares', AIR_DOMINANCE_BALANCE.fighterFlares))),
        fighterMissileCooldown: 0, fighterPatrolAngle: rand(0, Math.PI * 2),
        fighterStealthed: isResearchComplete(player.id, 'adStealthFighter'), lastAttackAt: -99, lastTargetedAt: -99
      });
    } else if (type === 'paratrooperPlane') {
      const passengerCount = aircraft.cargoRecords?.length || 0;
      unit = createUnitFromRecord(aircraft, airbase.x + Math.cos(a) * 60, airbase.y + Math.sin(a) * 60, {
        ...common,
        airMissionState: passengerCount > 0 ? 'outbound' : 'returning',
        paratrooperMissionX: targetX, paratrooperMissionY: targetY,
        payloadRemaining: passengerCount, sortiePassengerCount: passengerCount, passengersDropped: 0,
        enduranceRemaining: AIR_DOMINANCE_BALANCE.paratrooperEndurance,
        flareCharges: Math.max(0, Math.floor(getDefinitionPlayerStat(player.id, 'unit', 'paratrooperPlane', 'flares', AIR_DOMINANCE_BALANCE.paratrooperFlares)))
      });
    }
    if (!unit) {
      airbase.bomberBay.push(aircraft);
      syncAirbaseStoredCount(airbase);
    }
    return unit;
  }

  function aiLaunchDroneWave(player, targetPlayer) {
    let launched = 0;
    const hubs = game.buildings.filter(b => b.alive && b.playerId === player.id && b.type === 'droneHub');
    for (const hub of hubs) {
      const available = getDroneHubStoredCount(hub, 'loiteringMunition');
      const amount = Math.min(available, game.time < 180 ? 10 : 20, MAX_ENTITIES - entityCount());
      for (let i = 0; i < amount; i++) {
        const record = takeStoredDrone(hub, 'loiteringMunition');
        if (!record) break;
        const angle = i / Math.max(1, amount) * Math.PI * 2;
        const missionX = targetPlayer.capital.x + rand(-90, 90);
        const missionY = targetPlayer.capital.y + rand(-90, 90);
        const drone = createUnitFromRecord(record, hub.x + Math.cos(angle) * (hub.radius + 16), hub.y + Math.sin(angle) * (hub.radius + 16), {
          droneMissionX: missionX, droneMissionY: missionY,
          orderX: missionX, orderY: missionY, hasOrder: true, lowAltitudeDrone: true
        });
        if (drone) launched++;
        else storeDroneAtHub(hub, record, 0);
      }
    }
    return launched;
  }

  function aiAttack(player) {
    if (entityCount() >= MAX_ENTITIES - 5) return 0;
    const bases = game.buildings.filter(b => b.alive && b.playerId === player.id && b.type === 'militaryBase');
    const airbases = game.buildings.filter(b => b.alive && b.playerId === player.id && b.type === 'airbase');
    const droneHubs = game.buildings.filter(b => b.alive && b.playerId === player.id && b.type === 'droneHub');
    const missileSites = game.buildings.filter(b => b.alive && b.playerId === player.id && b.type === 'missileLaunchSite');
    const orbitalSystems = game.buildings.filter(b => b.alive && b.playerId === player.id && b.type === 'orbitalBeamSystem');
    if (!bases.length && !airbases.length && !droneHubs.length && !missileSites.length && !orbitalSystems.length) return 0;
    const targets = game.players.filter(p => p.alive && p.id !== player.id);
    if (!targets.length) return 0;
    const targetPlayer = aiChooseAttackTarget(player, targets);
    if (!targetPlayer?.capital?.alive) return 0;

    const highValueTargets = game.buildings.filter(b => b.alive && b.playerId === targetPlayer.id && b.type !== 'landmine');
    highValueTargets.sort((a, b) => {
      const value = x => x.type === 'capital' ? 12 : x.type === 'megacity' ? 7 + (x.level || 1) : x.type === 'militaryCommand' ? 8 : x.type === 'airbase' ? 7 : x.type === 'militaryBase' ? 6 : x.type === 'airDefense' ? 5 : x.type === 'mortar' || x.type === 'hive' ? 4 : 2;
      return value(b) - value(a);
    });
    const airTarget = highValueTargets[0] || targetPlayer.capital;
    const missilesLaunched = aiLaunchStrategicMissiles(player, targetPlayer);
    for (const system of orbitalSystems) {
      const stats = getOrbitalBeamStats(player.id);
      if (system.energyPowered && (system.energyCharge || 0) + 1e-6 >= stats.rechargeTime) fireOrbitalBeamSystemAt(system, airTarget.x, airTarget.y);
    }

    let aircraftLaunched = 0;
    let escortsLaunched = 0;
    for (const airbase of airbases) {
      const totalReady = MANNED_AIRCRAFT_TYPES.reduce((sum, type) => sum + getAirbaseReadyCount(airbase, type), 0);
      let remaining = Math.min(totalReady, game.time < 180 ? 2 : 3, MAX_ENTITIES - entityCount());
      const masters = [];
      let spawnIndex = 0;
      while (remaining > 0) {
        const readyTypes = MANNED_AIRCRAFT_TYPES.filter(type => getAirbaseReadyCount(airbase, type) > 0);
        if (!readyTypes.length) break;
        const advanced = readyTypes.filter(type => type !== 'bomber');
        const type = advanced.length && Math.random() < 0.62 ? choose(advanced) : (readyTypes.includes('bomber') ? 'bomber' : choose(readyTypes));
        const unit = aiLaunchMannedAircraft(player, airbase, type, type === 'paratrooperPlane' ? targetPlayer.capital.x : airTarget.x, type === 'paratrooperPlane' ? targetPlayer.capital.y : airTarget.y, spawnIndex++);
        if (!unit) break;
        masters.push(unit);
        aircraftLaunched++;
        remaining--;
      }

      if (masters.length && getAirbaseReadyWingmanCount(airbase) > 0) {
        let escortRemaining = Math.min(getLoyalWingmanSortieCap(player.id), getAirbaseReadyWingmanCount(airbase));
        const perAircraft = clamp(Math.floor(player.droneConfig?.preferredEscortsPerAircraft || 1), 1, Math.max(1, getLoyalWingmanSortieCap(player.id)));
        for (const master of masters) {
          if (escortRemaining <= 0) break;
          const desired = Math.min(perAircraft, escortRemaining, getAirbaseReadyWingmanCount(airbase));
          for (let i = 0; i < desired; i++) {
            const record = takeReadyWingman(airbase);
            if (!record) break;
            const escort = launchLoyalWingmanEscort(airbase, record, master, i, desired);
            if (escort) { escortsLaunched++; escortRemaining--; }
            else airbase.loyalWingmanBay.push(record);
          }
          syncAirbaseWingmen(airbase);
        }
      }
    }

    const dronesLaunched = aiLaunchDroneWave(player, targetPlayer);

    let deployedTotal = 0;
    if (bases.length) {
      const totalStored = bases.reduce((sum, base) => sum + GROUND_UNIT_TYPES.reduce((a, type) => a + (base.storage[type] || 0), 0), 0);
      const minimumForce = game.time < 90 ? 9 : 12;
      if (totalStored >= minimumForce) {
        const attackFraction = rand(0.60, 0.82);
        const sortedBases = bases.slice().sort((a, b) => distance(a, targetPlayer.capital) - distance(b, targetPlayer.capital));
        for (const base of sortedBases) {
          let localIndex = 0;
          for (const type of GROUND_UNIT_TYPES) {
            const stored = base.storage[type] || 0;
            const amount = Math.max(0, Math.floor(stored * attackFraction));
            for (let i = 0; i < amount && game.liveEntityCount < MAX_ENTITIES; i++) {
              const record = takeStoredUnit(base, type);
              if (!record) break;
              const angle = (localIndex % 10) / 10 * Math.PI * 2;
              const ring = 45 + Math.floor(localIndex / 10) * 18;
              const unit = createUnitFromRecord(record, base.x + Math.cos(angle) * ring, base.y + Math.sin(angle) * ring);
              if (unit) {
                unit.orderX = targetPlayer.capital.x + rand(-90, 90);
                unit.orderY = targetPlayer.capital.y + rand(-90, 90);
                unit.hasOrder = true;
                deployedTotal++;
              } else {
                restoreStoredUnit(base, record);
              }
              localIndex++;
            }
          }
        }
      }
    }
    if (targetPlayer.id === PLAYER_ID && (deployedTotal > 0 || aircraftLaunched > 0 || dronesLaunched > 0 || missilesLaunched > 0)) {
      const parts = [];
      if (deployedTotal) parts.push(`${deployedTotal} ground units`);
      if (aircraftLaunched) parts.push(`${aircraftLaunched} aircraft${escortsLaunched ? ` + ${escortsLaunched} LW` : ''}`);
      if (dronesLaunched) parts.push(`${dronesLaunched} loitering munitions`);
      if (missilesLaunched) parts.push(`${missilesLaunched} strategic missiles`);
      notify(`${player.name} deployed ${parts.join(' and ')} toward your territory.`, 'danger', 5);
    }
    return deployedTotal + aircraftLaunched + escortsLaunched + dronesLaunched + missilesLaunched;
  }

