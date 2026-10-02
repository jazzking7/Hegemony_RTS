'use strict';

  // ---------------------------------------------------------------------------
  // Direct Energy Warfare
  // ---------------------------------------------------------------------------
  const ENERGY_CONSUMER_TYPES = Object.freeze(['orbitalBeamSystem', 'energyFieldNode', 'deathRayTower']);
  const ENERGY_PRIORITY_ORDER = Object.freeze({ low: 0, normal: 1, high: 2 });

  function ensureDirectedEnergyRuntimeState() {
    if (!game.energyFields) game.energyFields = [];
    if (game.energyAimingSystemId === undefined) game.energyAimingSystemId = null;
    if (game.energyAimTarget === undefined) game.energyAimTarget = null;
    if (!game.energyFieldRevision) game.energyFieldRevision = 0;
    if (game.energyFieldSignature === undefined) game.energyFieldSignature = '';
  }

  function getGeneratorMaxPower(playerId) {
    if (isResearchComplete(playerId, 'dePower150')) return 150;
    if (isResearchComplete(playerId, 'dePower120')) return 120;
    return DIRECTED_ENERGY_BALANCE.generatorBasePower;
  }

  function getGeneratorRange(playerId) {
    if (isResearchComplete(playerId, 'deRange850')) return 850;
    if (isResearchComplete(playerId, 'deRange750')) return 750;
    return DIRECTED_ENERGY_BALANCE.generatorBaseRange;
  }

  function getGeneratorPowerCostRate(playerId) {
    let discount = 0;
    if (isResearchComplete(playerId, 'dePowerCost1')) discount += 0.07;
    if (isResearchComplete(playerId, 'dePowerCost2')) discount += 0.08;
    if (isResearchComplete(playerId, 'dePowerCost3')) discount += 0.10;
    return DIRECTED_ENERGY_BALANCE.powerCostPerSecond * (1 - discount);
  }

  function getNodePowerDemand(playerId) {
    if (isResearchComplete(playerId, 'deNodePower15')) return 15;
    if (isResearchComplete(playerId, 'deNodePower20')) return 20;
    return DIRECTED_ENERGY_BALANCE.nodePower;
  }

  function getEnergyConsumerDemand(entity) {
    if (!entity?.alive) return 0;
    if (entity.type === 'orbitalBeamSystem') return DIRECTED_ENERGY_BALANCE.orbitalPower;
    if (entity.type === 'deathRayTower') return DIRECTED_ENERGY_BALANCE.deathRayPower;
    if (entity.type === 'energyFieldNode') return entity.energyNodeOn === false ? 0 : getNodePowerDemand(entity.playerId);
    return 0;
  }

  function getEnergyPriority(entity) {
    const value = entity?.energyPriority;
    return value === 'high' || value === 'low' ? value : 'normal';
  }

  function setEnergyPriority(entity, priority) {
    if (!entity?.alive || !ENERGY_CONSUMER_TYPES.includes(entity.type)) return false;
    entity.energyPriority = priority === 'high' || priority === 'low' ? priority : 'normal';
    return true;
  }

  function ensureEnergyBuildingState(building) {
    if (!building?.alive) return;
    if (building.type === 'energyGenerator') {
      const max = getGeneratorMaxPower(building.playerId);
      if (!Number.isFinite(building.energyOutputSet)) building.energyOutputSet = max;
      building.energyOutputSet = clamp(building.energyOutputSet, 0, max);
      building.energyNetworkId ??= null;
      building.energyEffectiveOutput ??= 0;
    } else if (ENERGY_CONSUMER_TYPES.includes(building.type)) {
      building.energyPriority ||= 'normal';
      building.energyPowered = !!building.energyPowered;
      building.energyNetworkId ??= null;
      if (building.type === 'energyFieldNode') building.energyNodeOn = building.energyNodeOn !== false;
      if (building.type === 'orbitalBeamSystem') {
        building.energyCharge ??= 0;
        building.energyFullyCharged = !!building.energyFullyCharged;
      }
      if (building.type === 'deathRayTower') { building.energyBeamTargetIds ||= []; building.energyBeamAttackMultipliers ||= {}; }
    }
  }

  function getOrbitalBeamStats(playerId) {
    let rechargeMultiplier = 1;
    if (isResearchComplete(playerId, 'deOrbitalRecharge1')) rechargeMultiplier -= 0.05;
    if (isResearchComplete(playerId, 'deOrbitalRecharge2')) rechargeMultiplier -= 0.10;
    let innerDamageBonus = 0;
    if (isResearchComplete(playerId, 'deOrbitalDamage1')) innerDamageBonus += 0.10;
    if (isResearchComplete(playerId, 'deOrbitalDamage2')) innerDamageBonus += 0.15;
    const innerDamage = DIRECTED_ENERGY_BALANCE.orbitalInnerDamage * (1 + innerDamageBonus);
    let outerRadius = DIRECTED_ENERGY_BALANCE.orbitalOuterRadius;
    let outerStartDamage = DIRECTED_ENERGY_BALANCE.orbitalOuterStartDamage;
    if (isResearchComplete(playerId, 'deOrbitalAoe1')) { outerRadius = 500; outerStartDamage = 600; }
    if (isResearchComplete(playerId, 'deOrbitalAoe2')) outerStartDamage = 700;
    return {
      power: DIRECTED_ENERGY_BALANCE.orbitalPower,
      rechargeTime: DIRECTED_ENERGY_BALANCE.orbitalRecharge * rechargeMultiplier,
      innerRadius: DIRECTED_ENERGY_BALANCE.orbitalInnerRadius,
      innerDamage,
      outerRadius,
      outerStartDamage,
      cap: isResearchComplete(playerId, 'deOrbitalCap3') ? 3 : 2
    };
  }

  function getDeathRayStats(entityOrPlayerId) {
    const entity = typeof entityOrPlayerId === 'object' ? entityOrPlayerId : null;
    const playerId = entity ? entity.playerId : entityOrPlayerId;
    let damageMult = 1;
    let rangeMult = 1;
    let targets = DIRECTED_ENERGY_BALANCE.deathRayTargets;
    if (isResearchComplete(playerId, 'deDeathDamage1')) damageMult += 0.08;
    if (isResearchComplete(playerId, 'deDeathDamage2')) damageMult += 0.12;
    if (isResearchComplete(playerId, 'deDeathRange1')) rangeMult += 0.05;
    if (isResearchComplete(playerId, 'deDeathRange2')) rangeMult += 0.10;
    if (isResearchComplete(playerId, 'deDeathTarget1')) targets++;
    if (isResearchComplete(playerId, 'deDeathTarget2')) targets++;
    return {
      power: DIRECTED_ENERGY_BALANCE.deathRayPower,
      dps: entity ? getEntityStatFromBase(entity, 'damage', DIRECTED_ENERGY_BALANCE.deathRayDps * damageMult) : DIRECTED_ENERGY_BALANCE.deathRayDps * damageMult,
      range: entity ? getEntityStatFromBase(entity, 'range', DIRECTED_ENERGY_BALANCE.deathRayRange * rangeMult) : DIRECTED_ENERGY_BALANCE.deathRayRange * rangeMult,
      targets,
      slow: isResearchComplete(playerId, 'deDeathSlow') ? DIRECTED_ENERGY_BALANCE.deathRaySlow : 0
    };
  }

  function getEnergyFieldCaps(playerId) {
    return {
      attack: isResearchComplete(playerId, 'deFieldAttack100') ? 1.00 : isResearchComplete(playerId, 'deFieldAttack75') ? 0.75 : DIRECTED_ENERGY_BALANCE.fieldBaseAttackCap,
      reduction: isResearchComplete(playerId, 'deFieldDR70') ? 0.70 : isResearchComplete(playerId, 'deFieldDR55') ? 0.55 : DIRECTED_ENERGY_BALANCE.fieldBaseReductionCap,
      density: isResearchComplete(playerId, 'deFieldDensity12') ? 12 : isResearchComplete(playerId, 'deFieldDensity10') ? 10 : DIRECTED_ENERGY_BALANCE.fieldBaseDensityCap
    };
  }

  function energyFieldBonusRatio(density) {
    const d = Math.max(0, density);
    const absoluteCap = DIRECTED_ENERGY_BALANCE.fieldAbsoluteDensityCap;
    const numerator = d / (d + 1);
    const denominator = absoluteCap / (absoluteCap + 1);
    return clamp(numerator / denominator, 0, 1);
  }

  function calculateEnergyOperatingCostPerMinute(playerId) {
    const rate = getGeneratorPowerCostRate(playerId);
    let output = 0;
    for (const generator of game.buildings) {
      if (!generator.alive || generator.playerId !== playerId || generator.type !== 'energyGenerator') continue;
      ensureEnergyBuildingState(generator);
      output += clamp(generator.energyOutputSet || 0, 0, getGeneratorMaxPower(playerId));
    }
    return output * rate * 60;
  }

  function setGeneratorOutput(generator, value) {
    if (!generator?.alive || generator.type !== 'energyGenerator') return false;
    generator.energyOutputSet = clamp(Number(value) || 0, 0, getGeneratorMaxPower(generator.playerId));
    return true;
  }

  function toggleEnergyNode(node) {
    if (!node?.alive || node.type !== 'energyFieldNode') return false;
    node.energyNodeOn = node.energyNodeOn === false;
    if (!node.energyNodeOn) node.energyPowered = false;
    game.energyFieldRevision++;
    return true;
  }

  function generatorCoverageOverlaps(a, b) {
    return distance(a, b) <= getGeneratorRange(a.playerId) + getGeneratorRange(b.playerId);
  }

  function buildGeneratorNetworks(playerId) {
    const generators = game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === 'energyGenerator');
    generators.forEach(ensureEnergyBuildingState);
    const remaining = new Set(generators.map(g => g.id));
    const byId = new Map(generators.map(g => [g.id, g]));
    const networks = [];
    let serial = 0;
    while (remaining.size) {
      const firstId = remaining.values().next().value;
      remaining.delete(firstId);
      const stack = [byId.get(firstId)];
      const component = [];
      while (stack.length) {
        const current = stack.pop();
        component.push(current);
        for (const id of [...remaining]) {
          const other = byId.get(id);
          if (!generatorCoverageOverlaps(current, other)) continue;
          remaining.delete(id);
          stack.push(other);
        }
      }
      const network = { id: `${playerId}:${serial++}`, generators: component, consumers: [], supply: 0, demand: 0, used: 0 };
      networks.push(network);
    }
    return networks;
  }

  function updateEnergyPowerNetworks(dt) {
    ensureDirectedEnergyRuntimeState();
    for (const building of game.buildings) {
      if (!building.alive) continue;
      if (building.type === 'energyGenerator' || ENERGY_CONSUMER_TYPES.includes(building.type)) ensureEnergyBuildingState(building);
      if (ENERGY_CONSUMER_TYPES.includes(building.type)) { building.energyPowered = false; building.energyNetworkId = null; building.energyNetworkSupply = 0; building.energyNetworkDemand = 0; building.energyNetworkUsed = 0; }
      if (building.type === 'energyGenerator') { building.energyNetworkId = null; building.energyNetworkSupply = 0; building.energyNetworkDemand = 0; building.energyNetworkUsed = 0; }
    }

    for (const player of game.players) {
      if (!player?.alive) continue;
      const networks = buildGeneratorNetworks(player.id);
      if (!networks.length) continue;

      const rate = getGeneratorPowerCostRate(player.id);
      let configuredOutput = 0;
      for (const network of networks) {
        for (const generator of network.generators) configuredOutput += clamp(generator.energyOutputSet || 0, 0, getGeneratorMaxPower(player.id));
      }
      const requestedCost = configuredOutput * rate * dt;
      const affordability = requestedCost > 0 ? clamp(player.money / requestedCost, 0, 1) : 1;
      const actualCost = requestedCost * affordability;
      if (actualCost > 0) player.money = Math.max(0, player.money - actualCost);

      for (const network of networks) {
        network.supply = 0;
        for (const generator of network.generators) {
          const max = getGeneratorMaxPower(player.id);
          generator.energyOutputSet = clamp(generator.energyOutputSet || 0, 0, max);
          generator.energyEffectiveOutput = generator.energyOutputSet * affordability;
          generator.energyNetworkId = network.id;
          network.supply += generator.energyEffectiveOutput;
        }
      }

      const consumers = game.buildings.filter(b => b.alive && b.playerId === player.id && ENERGY_CONSUMER_TYPES.includes(b.type));
      for (const consumer of consumers) {
        const demand = getEnergyConsumerDemand(consumer);
        if (demand <= 0) continue;
        let network = null;
        for (const candidate of networks) {
          if (candidate.generators.some(g => distance(g, consumer) <= getGeneratorRange(player.id))) { network = candidate; break; }
        }
        if (!network) continue;
        consumer.energyNetworkId = network.id;
        network.consumers.push(consumer);
        network.demand += demand;
      }

      for (const network of networks) {
        network.consumers.sort((a, b) => (ENERGY_PRIORITY_ORDER[getEnergyPriority(b)] - ENERGY_PRIORITY_ORDER[getEnergyPriority(a)]) || a.id - b.id);
        let remaining = network.supply;
        for (const consumer of network.consumers) {
          const demand = getEnergyConsumerDemand(consumer);
          if (remaining + 1e-6 >= demand) {
            consumer.energyPowered = true;
            remaining -= demand;
            network.used += demand;
          }
        }
        for (const generator of network.generators) {
          generator.energyNetworkSupply = network.supply;
          generator.energyNetworkDemand = network.demand;
          generator.energyNetworkUsed = network.used;
        }
        for (const consumer of network.consumers) {
          consumer.energyNetworkSupply = network.supply;
          consumer.energyNetworkDemand = network.demand;
          consumer.energyNetworkUsed = network.used;
        }
      }
    }
  }

  function circumcircleContains(triangle, point) {
    const ax = triangle.a.x - point.x, ay = triangle.a.y - point.y;
    const bx = triangle.b.x - point.x, by = triangle.b.y - point.y;
    const cx = triangle.c.x - point.x, cy = triangle.c.y - point.y;
    const det = (ax * ax + ay * ay) * (bx * cy - cx * by)
      - (bx * bx + by * by) * (ax * cy - cx * ay)
      + (cx * cx + cy * cy) * (ax * by - bx * ay);
    const orient = (triangle.b.x - triangle.a.x) * (triangle.c.y - triangle.a.y) - (triangle.b.y - triangle.a.y) * (triangle.c.x - triangle.a.x);
    return orient > 0 ? det > 1e-7 : det < -1e-7;
  }

  function delaunayTriangles(points) {
    if (points.length < 3) return [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) { minX = Math.min(minX,p.x); minY = Math.min(minY,p.y); maxX = Math.max(maxX,p.x); maxY = Math.max(maxY,p.y); }
    const span = Math.max(maxX - minX, maxY - minY, 1), cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const s1 = { id:'__s1', x:cx - span * 20, y:cy - span * 10 };
    const s2 = { id:'__s2', x:cx, y:cy + span * 20 };
    const s3 = { id:'__s3', x:cx + span * 20, y:cy - span * 10 };
    let triangles = [{ a:s1,b:s2,c:s3 }];
    const edgeKey = (a,b) => String(a.id) < String(b.id) ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    for (const point of points) {
      const bad = triangles.filter(t => circumcircleContains(t, point));
      const edges = new Map();
      for (const t of bad) {
        for (const [a,b] of [[t.a,t.b],[t.b,t.c],[t.c,t.a]]) {
          const key = edgeKey(a,b), record = edges.get(key);
          if (record) record.count++;
          else edges.set(key, { a,b,count:1 });
        }
      }
      const badSet = new Set(bad);
      triangles = triangles.filter(t => !badSet.has(t));
      for (const edge of edges.values()) if (edge.count === 1) triangles.push({ a:edge.a,b:edge.b,c:point });
    }
    return triangles.filter(t => !String(t.a.id).startsWith('__s') && !String(t.b.id).startsWith('__s') && !String(t.c.id).startsWith('__s'));
  }

  function triangleArea(t) {
    return Math.abs((t.a.x * (t.b.y - t.c.y) + t.b.x * (t.c.y - t.a.y) + t.c.x * (t.a.y - t.b.y)) / 2);
  }

  function pointInTriangle(x, y, t) {
    const sign = (px,py,a,b) => (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
    const d1 = sign(x,y,t.a,t.b), d2 = sign(x,y,t.b,t.c), d3 = sign(x,y,t.c,t.a);
    const hasNeg = d1 < -1e-6 || d2 < -1e-6 || d3 < -1e-6;
    const hasPos = d1 > 1e-6 || d2 > 1e-6 || d3 > 1e-6;
    return !(hasNeg && hasPos);
  }

  function regularPolygonArea(count, side) {
    if (count < 3) return 0;
    return count * side * side / (4 * Math.tan(Math.PI / count));
  }

  function rebuildEnergyFields() {
    ensureDirectedEnergyRuntimeState();
    const signatureParts = [];
    for (const player of game.players) {
      if (!player?.alive) continue;
      const caps = getEnergyFieldCaps(player.id);
      signatureParts.push(`p${player.id}:${caps.attack}:${caps.reduction}:${caps.density}`);
      for (const node of game.buildings) {
        if (!node.alive || node.playerId !== player.id || node.type !== 'energyFieldNode') continue;
        signatureParts.push(`${node.id}:${node.x.toFixed(2)}:${node.y.toFixed(2)}:${node.energyNodeOn === false ? 0 : 1}:${node.energyPowered ? 1 : 0}`);
      }
    }
    const signature = signatureParts.join('|');
    if (signature === game.energyFieldSignature) return;
    game.energyFieldSignature = signature;
    const fields = [];
    for (const player of game.players) {
      if (!player?.alive) continue;
      const nodes = game.buildings.filter(b => b.alive && b.playerId === player.id && b.type === 'energyFieldNode' && b.energyNodeOn !== false && b.energyPowered);
      if (nodes.length < 3) continue;
      const allTriangles = delaunayTriangles(nodes);
      const maxEdge = DIRECTED_ENERGY_BALANCE.nodeConnectionRadius;
      const validTriangles = allTriangles.filter(t => distance(t.a,t.b) <= maxEdge && distance(t.b,t.c) <= maxEdge && distance(t.c,t.a) <= maxEdge && triangleArea(t) > 1);
      if (!validTriangles.length) continue;

      const nodeToTriangles = new Map();
      validTriangles.forEach((t, index) => {
        for (const n of [t.a,t.b,t.c]) {
          if (!nodeToTriangles.has(n.id)) nodeToTriangles.set(n.id, []);
          nodeToTriangles.get(n.id).push(index);
        }
      });
      const remaining = new Set(validTriangles.map((_,i)=>i));
      while (remaining.size) {
        const seed = remaining.values().next().value;
        remaining.delete(seed);
        const queue = [seed], triIndices = [], nodeIds = new Set();
        while (queue.length) {
          const idx = queue.pop(); triIndices.push(idx);
          const tri = validTriangles[idx];
          for (const node of [tri.a,tri.b,tri.c]) {
            nodeIds.add(node.id);
            for (const otherIdx of nodeToTriangles.get(node.id) || []) if (remaining.delete(otherIdx)) queue.push(otherIdx);
          }
        }
        const triangles = triIndices.map(i => validTriangles[i]);
        const area = triangles.reduce((sum,t)=>sum + triangleArea(t),0);
        if (area <= 1 || nodeIds.size < 3) continue;
        const referenceArea = regularPolygonArea(nodeIds.size, DIRECTED_ENERGY_BALANCE.nodeReferenceSpacing);
        const totalPower = nodeIds.size * DIRECTED_ENERGY_BALANCE.nodeDensityContribution;
        const physicalDensity = totalPower / area;
        const referenceDensity = totalPower / Math.max(1, referenceArea);
        const rawDensity = physicalDensity / Math.max(1e-9, referenceDensity);
        const caps = getEnergyFieldCaps(player.id);
        const density = clamp(rawDensity, 0, caps.density);
        const ratio = energyFieldBonusRatio(density);
        fields.push({
          id:`${player.id}:${[...nodeIds].sort((a,b)=>a-b).join('-')}`,
          playerId:player.id, nodeIds:[...nodeIds], triangles, area, totalPower, physicalDensity, referenceDensity, rawDensity, density,
          attackBonus: caps.attack * ratio,
          damageReduction: caps.reduction * ratio
        });
      }
    }
    game.energyFields = fields;
  }

  function getEnergyFieldsAt(playerId, x, y) {
    ensureDirectedEnergyRuntimeState();
    return game.energyFields.filter(field => field.playerId === playerId && field.triangles.some(t => pointInTriangle(x,y,t)));
  }

  function getEnergyFieldAttackMultiplier(attacker) {
    if (!attacker?.alive) return 1;
    let best = 0;
    for (const field of getEnergyFieldsAt(attacker.playerId, attacker.x, attacker.y)) best = Math.max(best, field.attackBonus || 0);
    return 1 + best;
  }

  function getEnergyFieldDamageReduction(target) {
    if (!target?.alive) return 0;
    let best = 0;
    for (const field of getEnergyFieldsAt(target.playerId, target.x, target.y)) best = Math.max(best, field.damageReduction || 0);
    return clamp(best, 0, 0.90);
  }

  function getEnergyFieldSummaryForNode(node) {
    if (!node?.alive || node.type !== 'energyFieldNode') return null;
    const fields = game.energyFields.filter(field => field.playerId === node.playerId && field.nodeIds.includes(node.id));
    if (!fields.length) return null;
    return fields.reduce((best, field) => !best || field.density > best.density ? field : best, null);
  }

  function getDeathRaySlow(entity) {
    if (!entity?.alive) return 0;
    // The research check happens on the attacking tower. A transient marker on
    // the victim means at least one researched hostile beam is currently on it.
    return game.time < (entity.deathRaySlowUntil || 0) ? DIRECTED_ENERGY_BALANCE.deathRaySlow : 0;
  }

  function validDeathRayTarget(tower, target, range) {
    if (!target?.alive || target.playerId === tower.playerId || !Number.isFinite(target.hp) || target.hp <= 0) return false;
    if (target.kind === 'building') return target.type !== 'landmine' && distance(tower,target) <= range + target.radius;
    if (target.kind !== 'unit' || target.garrisoned || target.parachuting) return false;
    if (target.type === 'loiteringMunition') return distance(tower,target) <= range + target.radius;
    if (target.airborne) return false;
    return distance(tower,target) <= range + target.radius;
  }

  function updateDeathRayTower(tower, dt) {
    ensureEnergyBuildingState(tower);
    const previousMultipliers = tower.energyBeamAttackMultipliers || {};
    tower.energyBeamTargetIds = [];
    tower.energyBeamAttackMultipliers = {};
    if (!tower.energyPowered) return;
    const stats = getDeathRayStats(tower);
    const candidates = [];
    unitGrid.queryCircle(tower.x,tower.y,stats.range,queryScratchA);
    for (const target of queryScratchA) if (validDeathRayTarget(tower,target,stats.range)) candidates.push(target);
    buildingGrid.queryCircle(tower.x,tower.y,stats.range,queryScratchB);
    for (const target of queryScratchB) if (validDeathRayTarget(tower,target,stats.range)) candidates.push(target);
    candidates.sort((a,b)=>distSq(tower,a)-distSq(tower,b));
    const initiationMultiplier = getEnergyFieldAttackMultiplier(tower);
    for (const target of candidates.slice(0,stats.targets)) {
      tower.energyBeamTargetIds.push(target.id);
      const key = String(target.id);
      const mult = Number(previousMultipliers[key]) || initiationMultiplier;
      tower.energyBeamAttackMultipliers[key] = mult;
      applyDamage(target, stats.dps * mult * dt, tower.playerId);
      if (stats.slow > 0 && target.kind === 'unit') target.deathRaySlowUntil = Math.max(target.deathRaySlowUntil || 0, game.time + 0.20);
    }
  }

  function updateOrbitalBeamSystem(system, dt) {
    ensureEnergyBuildingState(system);
    const stats = getOrbitalBeamStats(system.playerId);
    if (system.energyCharge >= stats.rechargeTime) { system.energyCharge = stats.rechargeTime; system.energyFullyCharged = true; return; }
    system.energyFullyCharged = false;
    if (!system.energyPowered) return;
    system.energyCharge = Math.min(stats.rechargeTime, system.energyCharge + dt);
    if (system.energyCharge >= stats.rechargeTime) system.energyFullyCharged = true;
  }

  function applyOrbitalBeamDamage(system, x, y) {
    const stats = getOrbitalBeamStats(system.playerId);
    const attackMult = getEnergyFieldAttackMultiplier(system);
    const hit = target => {
      if (!target.alive || target.playerId === system.playerId || (target.kind === 'building' && target.type === 'landmine')) return;
      const d = Math.hypot(target.x-x,target.y-y);
      if (d > stats.outerRadius + target.radius) return;
      let damage;
      if (d <= stats.innerRadius) damage = stats.innerDamage;
      else {
        const t = clamp((d - stats.innerRadius) / Math.max(1, stats.outerRadius - stats.innerRadius), 0, 1);
        damage = stats.outerStartDamage * clamp(1 - t, 0.25, 1);
      }
      applyDamage(target, damage * attackMult, system.playerId);
    };
    unitGrid.queryCircle(x,y,stats.outerRadius,queryScratchA); queryScratchA.forEach(hit);
    buildingGrid.queryCircle(x,y,stats.outerRadius,queryScratchB); queryScratchB.forEach(hit);
    pushEffect({ type:'orbitalBeam', x, y, radius:stats.outerRadius, innerRadius:stats.innerRadius, life:0.55, maxLife:0.55 });
    pushEffect({ type:'shockwave', x, y, radius:stats.outerRadius, life:0.75, maxLife:0.75 });
  }

  function setEnergyAimingPresentation(active) {
    document.getElementById('app')?.classList.toggle('energy-aiming', !!active);
    document.getElementById('energyAimHud')?.classList.toggle('hidden', !active);
  }

  function beginOrbitalEnergyAiming(system) {
    if (!system?.alive || system.playerId !== PLAYER_ID || system.type !== 'orbitalBeamSystem') return {ok:false,reason:'Orbital Beam unavailable.'};
    ensureEnergyBuildingState(system);
    const stats = getOrbitalBeamStats(system.playerId);
    if (!system.energyPowered) return {ok:false,reason:'Orbital Beam is offline due to insufficient power.'};
    if ((system.energyCharge || 0) + 1e-6 < stats.rechargeTime) return {ok:false,reason:'Orbital Beam is still recharging.'};
    if (typeof cancelMissileAiming === 'function') cancelMissileAiming();
    if (game.coordinatePicker?.active) cancelCoordinatePicking(false);
    cancelEWAntennaAim();
    setBuildMode(null);
    game.energyAimingSystemId = system.id;
    game.energyAimTarget = null;
    setEnergyAimingPresentation(true);
    updateEnergyAimingHUD();
    return {ok:true};
  }

  function cancelOrbitalEnergyAiming() {
    if (!game.energyAimingSystemId) return false;
    game.energyAimingSystemId = null;
    game.energyAimTarget = null;
    setEnergyAimingPresentation(false);
    return true;
  }

  function setEnergyAimTarget(x,y) {
    if (!game.energyAimingSystemId) return false;
    game.energyAimTarget = {x:clamp(x,0,WORLD.width),y:clamp(y,0,WORLD.height)};
    updateEnergyAimingHUD();
    return true;
  }

  function fireOrbitalBeamSystemAt(system, x, y) {
    if (!system?.alive || system.type !== 'orbitalBeamSystem') return {ok:false,reason:'Orbital Beam unavailable.'};
    const stats = getOrbitalBeamStats(system.playerId);
    if (!system.energyPowered) return {ok:false,reason:'Orbital Beam lost power.'};
    if ((system.energyCharge || 0) + 1e-6 < stats.rechargeTime) return {ok:false,reason:'Orbital Beam is not charged.'};
    applyOrbitalBeamDamage(system,clamp(x,0,WORLD.width),clamp(y,0,WORLD.height));
    system.energyCharge = 0;
    system.energyFullyCharged = false;
    return {ok:true};
  }

  function fireOrbitalEnergyAt(x,y) {
    const system = game.entityById.get(game.energyAimingSystemId);
    const result = fireOrbitalBeamSystemAt(system, x, y);
    if (!result.ok) return result;
    cancelOrbitalEnergyAiming();
    if (game.selected === system) renderSelectionPanel();
    return result;
  }

  function confirmOrbitalEnergyAim() {
    if (!game.energyAimTarget) return {ok:false,reason:'Click a target location first.'};
    return fireOrbitalEnergyAt(game.energyAimTarget.x,game.energyAimTarget.y);
  }

  function updateEnergyAimingHUD() {
    const hud = document.getElementById('energyAimHud');
    if (!hud) return;
    const system = game.entityById.get(game.energyAimingSystemId);
    if (!system?.alive) { hud.classList.add('hidden'); return; }
    const stats = getOrbitalBeamStats(system.playerId);
    const info = document.getElementById('energyAimInfo');
    const confirm = document.getElementById('energyAimConfirm');
    if (info) {
      const point = game.energyAimTarget || (game.mouse.inside ? {x:game.mouse.worldX,y:game.mouse.worldY} : null);
      info.textContent = point ? `TARGET X ${Math.round(point.x)} · Y ${Math.round(point.y)} · INNER ${Math.round(stats.innerDamage)} / ${stats.innerRadius} · AOE ${stats.outerRadius}` : 'Click the battlefield to mark a strike point.';
    }
    if (confirm) confirm.disabled = !game.energyAimTarget;
  }

  function updateDirectedEnergy(dt) {
    ensureDirectedEnergyRuntimeState();
    if (game.energyAimingSystemId) {
      const aiming = game.entityById.get(game.energyAimingSystemId);
      if (!aiming?.alive) cancelOrbitalEnergyAiming();
    }
    updateEnergyPowerNetworks(dt);
    rebuildEnergyFields();
    for (const building of game.buildings) {
      if (!building.alive) continue;
      if (building.type === 'orbitalBeamSystem') updateOrbitalBeamSystem(building,dt);
      else if (building.type === 'deathRayTower') updateDeathRayTower(building,dt);
    }
  }
