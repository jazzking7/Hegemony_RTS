'use strict';

// Capture logic runs on the shared fixed-step simulation. Its layout has its
// own random stream so drawing or UI activity cannot change multiplayer state.
const CAPTURE_RULES = Object.freeze({ radius:60, spacing:200, captureSeconds:20, invasionSeconds:10, abandonmentSeconds:60, income:200, regionBonus:100 });
const captureQueryScratch = [];
let captureQueryPadding = 100;

function initializeCaptureZones() {
  game.captureZones = [];
  game.captureRegions = [];
  game.captureIncome = game.players.map(() => 0);
  for (const player of game.players) player.ai.captureTimer = 12 + player.id * 4;
  let seed = NETWORK_MATCH ? NETWORK_SEED : Math.floor(Math.random() * 4294967296);
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const large = game.mapSize === 'large';
  const side = large ? 5 : 4;
  const cellWidth = WORLD.width / side, cellHeight = WORLD.height / side;
  const seeds = [];
  // A bounded jittered lattice keeps cells broad and fills the whole map.
  // Pull one interior seed toward the center instead of leaving a central hole.
  for (let row = 0; row < side; row++) for (let col = 0; col < side; col++) {
    const central = row === Math.floor((side - 1) / 2) && col === Math.floor((side - 1) / 2);
    seeds.push({ x:central ? WORLD.width / 2 - cellWidth * 0.08 : (col + 0.5 + (random() - 0.5) * 0.22) * cellWidth,
      y:central ? WORLD.height / 2 - cellHeight * 0.08 : (row + 0.5 + (random() - 0.5) * 0.22) * cellHeight, row, col });
  }
  const regionColumns = large ? 4 : 3;
  for (let id = 0; id < regionColumns * 2; id++) game.captureRegions.push({ id, name:`Region ${String.fromCharCode(65 + id)}`, zones:[], ownerId:null });
  captureQueryPadding = Math.max(0, ...Object.values(BUILDINGS).map(d => d.radius || 0), ...Object.values(UNITS).map(d => d.radius || 0));
  for (const seedPoint of seeds) {
    let polygon = [{x:0,y:0},{x:WORLD.width,y:0},{x:WORLD.width,y:WORLD.height},{x:0,y:WORLD.height}];
    for (const other of seeds) {
      if (other === seedPoint) continue;
      const nx = other.x - seedPoint.x, ny = other.y - seedPoint.y;
      const limit = (other.x ** 2 + other.y ** 2 - seedPoint.x ** 2 - seedPoint.y ** 2) / 2;
      polygon = clipTerritoryPolygon(polygon, nx, ny, limit);
    }
    const band = seedPoint.row < Math.ceil(side / 2) ? 0 : 1;
    const regionId = band * regionColumns + Math.min(regionColumns - 1, Math.floor(seedPoint.col * regionColumns / side));
    const region = game.captureRegions[regionId];
    let point = null;
    // Zone positions are independent of polygon centers, but the entire circle
    // must fit inside its territory and stay clear of starting structures.
    for (let attempt = 0; attempt < 300; attempt++) {
      const spread = attempt < 100 ? 0.24 : 0.65;
      const candidate = { x:seedPoint.x + (random() - 0.5) * cellWidth * spread, y:seedPoint.y + (random() - 0.5) * cellHeight * spread };
      if (!territoryContainsCircle(polygon, candidate, CAPTURE_RULES.radius + 10)) continue;
      if (game.captureZones.some(z => distance(z, candidate) < CAPTURE_RULES.spacing)) continue;
      if (game.buildings.some(b => distance(b, candidate) < b.radius + CAPTURE_RULES.radius + 70)) continue;
      point = candidate; break;
    }
    if (!point) throw new Error('Unable to place a capture zone inside its territory.');
    const area = territoryPolygonArea(polygon);
    const zone = { ...point, id:`zone-${game.captureZones.length + 1}`, kind:'captureZone', type:'captureZone', alive:true,
      label:`${String.fromCharCode(65 + regionId)}${region.zones.length + 1}`, regionId, radius:CAPTURE_RULES.radius,
      territory:polygon, territoryArea:area,
      territoryBounds:{left:Math.min(...polygon.map(p=>p.x)),right:Math.max(...polygon.map(p=>p.x)),top:Math.min(...polygon.map(p=>p.y)),bottom:Math.max(...polygon.map(p=>p.y))},
      ownerId:null, claimantId:null, progress:0, invasion:0, abandoned:0, contested:false, presence:0 };
    game.captureZones.push(zone); region.zones.push(zone);
  }
  // Classify shared borders once. Region boundaries remain clear without
  // drawing artificial links between zone circles.
  for (const zone of game.captureZones) zone.territoryEdges = zone.territory.map((a, i) => {
    const b = zone.territory[(i + 1) % zone.territory.length];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const neighbor = game.captureZones.find(other => other !== zone && other.territory.some((c,j) => {
      const d = other.territory[(j + 1) % other.territory.length];
      return Math.abs((c.x+d.x)/2-mx) < 0.01 && Math.abs((c.y+d.y)/2-my) < 0.01;
    }));
    return {a,b,neighborId:neighbor?.id || null,regional:!neighbor || neighbor.regionId !== zone.regionId, draw:!neighbor || zone.id < neighbor.id};
  });
  game.captureDetails = false;
  document.getElementById('captureDetailsButton')?.setAttribute('aria-pressed', 'false');
  rebuildCaptureIncome();
}

// Convex half-plane clipping produces a complete, non-overlapping map partition.
function clipTerritoryPolygon(polygon, nx, ny, limit) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = a.x * nx + a.y * ny - limit, db = b.x * nx + b.y * ny - limit;
    if (da <= 0) result.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      result.push({x:a.x + (b.x-a.x)*t, y:a.y + (b.y-a.y)*t});
    }
  }
  return result;
}
function territoryPolygonArea(polygon) {
  return Math.abs(polygon.reduce((sum,a,i) => { const b=polygon[(i+1)%polygon.length]; return sum+a.x*b.y-b.x*a.y; },0)) / 2;
}
function territoryContainsCircle(polygon, point, radius = 0) {
  return polygon.every((a,i) => {
    const b=polygon[(i+1)%polygon.length], dx=b.x-a.x, dy=b.y-a.y;
    return dx*(point.y-a.y)-dy*(point.x-a.x) >= radius*Math.hypot(dx,dy)-1e-7;
  });
}

function getCaptureZonePresence(zone) {
  let mask = 0;
  for (const grid of [unitGrid, buildingGrid]) {
    grid.queryCircle(zone.x, zone.y, zone.radius + captureQueryPadding, captureQueryScratch);
    for (const entity of captureQueryScratch) {
      if (!entity.alive || !game.players[entity.playerId]?.alive || entity.airborne || entity.lowAltitudeDrone || entity.garrisoned || entity.parachuting) continue;
      if (entity.kind === 'unit' && entity.lifecycleState && entity.lifecycleState !== LIFECYCLE_STATES.ACTIVE) continue;
      if (distSq(entity, zone) <= (zone.radius + entity.radius) ** 2) mask |= 1 << entity.playerId;
    }
  }
  return mask;
}

function advanceCaptureZone(zone, mask, dt) {
  zone.presence = mask;
  if (zone.ownerId !== null && !game.players[zone.ownerId]?.alive) {
    zone.ownerId = null; zone.invasion = 0; zone.abandoned = 0;
  }
  if (zone.ownerId !== null) {
    const hostile = mask & ~(1 << zone.ownerId);
    zone.contested = hostile !== 0;
    if (hostile) {
      zone.abandoned = 0;
      zone.invasion += dt;
      if (zone.invasion + 1e-9 >= CAPTURE_RULES.invasionSeconds) {
        zone.ownerId = null; zone.claimantId = null; zone.progress = 0; zone.invasion = 0;
      }
      // Capture starts on the next step, after the full grace period.
      return;
    }
    zone.invasion = 0;
    zone.abandoned = mask ? 0 : zone.abandoned + dt;
    if (zone.abandoned + 1e-9 >= CAPTURE_RULES.abandonmentSeconds) {
      zone.ownerId = null; zone.abandoned = 0;
    }
    return;
  }
  const multiple = !!(mask & (mask - 1));
  zone.contested = multiple;
  if (zone.claimantId !== null && !(mask & (1 << zone.claimantId))) {
    zone.claimantId = null; zone.progress = 0;
  }
  if (!mask) { zone.claimantId = null; zone.progress = 0; return; }
  if (multiple) return;
  const playerId = Math.log2(mask);
  if (zone.claimantId !== playerId) { zone.claimantId = playerId; zone.progress = 0; }
  zone.progress += dt;
  if (zone.progress + 1e-9 >= CAPTURE_RULES.captureSeconds) {
    zone.ownerId = playerId; zone.claimantId = null; zone.progress = 0; zone.abandoned = 0;
  }
}

function rebuildCaptureIncome() {
  game.captureIncome = game.players.map(() => 0);
  game.territorialControl = game.players.map(() => 0);
  for (const zone of game.captureZones || []) {
    if (zone.ownerId !== null) game.territorialControl[zone.ownerId] += zone.territoryArea || 0;
    if (zone.ownerId !== null && !zone.contested) game.captureIncome[zone.ownerId] += CAPTURE_RULES.income;
  }
  for (const region of game.captureRegions || []) {
    const owner = region.zones[0].ownerId;
    region.ownerId = owner !== null && region.zones.every(z => z.ownerId === owner && !z.contested) ? owner : null;
    if (region.ownerId !== null) game.captureIncome[owner] += region.zones.length * CAPTURE_RULES.regionBonus;
  }
}

function updateCaptureZones(dt) {
  let incomeChanged = false;
  for (const zone of game.captureZones || []) {
    const owner = zone.ownerId, contested = zone.contested;
    advanceCaptureZone(zone, getCaptureZonePresence(zone), dt);
    if (owner !== zone.ownerId || contested !== zone.contested) incomeChanged = true;
  }
  // Counts/income are discrete: rebuild the cache only when ownership or
  // contest status changes, not for each timer update or HUD refresh.
  if (incomeChanged) rebuildCaptureIncome();
}

function captureZoneStatus(zone) {
  if (zone.ownerId !== null) {
    if (zone.contested) return `CONTESTED · ownership revoked in ${Math.ceil(CAPTURE_RULES.invasionSeconds - zone.invasion)}s`;
    if (zone.abandoned > 0) return `UNATTENDED · neutral in ${Math.ceil(CAPTURE_RULES.abandonmentSeconds - zone.abandoned)}s`;
    return 'CONTROLLED';
  }
  if (zone.contested) return `CONTESTED · capture paused${zone.progress ? ` at ${Math.floor(zone.progress)}s` : ''}`;
  if (zone.claimantId !== null) return `${game.players[zone.claimantId].name} · ${Math.ceil(CAPTURE_RULES.captureSeconds - zone.progress)}s to capture`;
  return 'NEUTRAL';
}

function updateCaptureZoneAI(dt) {
  for (const player of game.players) {
    if (!player.alive || !player.isAI) continue;
    player.ai.captureTimer -= dt;
    if (player.ai.captureTimer > 0) continue;
    player.ai.captureTimer = 25;
    if (entityCount() > MAX_ENTITIES - 3) continue;
    const assigned = new Set(game.units.filter(u => u.alive && u.playerId === player.id && u.captureZoneId).map(u => u.captureZoneId));
    const bases = game.buildings.filter(b => b.alive && b.playerId === player.id && isGroundMilitaryFacility(b) && getGroundDefinitionAvailable(b, 'basic') >= 6);
    let best = null;
    for (const base of bases) for (const zone of game.captureZones || []) {
      if (zone.ownerId === player.id || assigned.has(zone.id)) continue;
      const score = distance(base, zone) + (zone.ownerId !== null ? 800 : 0);
      if (!best || score < best.score) best = { base, zone, score };
    }
    if (!best) continue;
    const firstId = game.id;
    launchGroundComposition(best.base, { basic:3 }, best.zone.x, best.zone.y);
    for (const unit of game.units) if (unit.id >= firstId && unit.playerId === player.id) unit.captureZoneId = best.zone.id;
  }
}

function renderCaptureZonePanel(zone) {
  els.selectionSubtitle.textContent = `${game.captureRegions[zone.regionId].name} · Zone ${zone.label}`;
  els.selectionContent.className = 'selection-content';
  els.selectionContent.innerHTML = `<div class="stat-block"><div class="stat-head"><strong>CAPTURE ZONE ${zone.label}</strong><span>RADIUS 60</span></div><p data-zone-status></p><div class="progress-track"><div class="progress-fill" data-zone-progress></div></div><div class="stat-row"><span>Owner</span><strong data-zone-owner></strong></div><div class="stat-row"><span>Zone income</span><strong data-zone-income></strong></div><div class="stat-row"><span>Region control</span><strong data-zone-region></strong></div></div><p class="research-note">Ground units and buildings count, including edge overlap. Stay 20 seconds to capture. Rivals pause capture; leaving resets your progress.</p><button type="button" class="action-button" data-zone-deploy>DEPLOY TO THIS ZONE</button>`;
  els.selectionContent.querySelector('[data-zone-deploy]')?.addEventListener('click', () => openAttackModal(zone.x, zone.y));
  refreshCaptureZonePanel(zone);
}

function refreshCaptureZonePanel(zone) {
  const set = (selector, value) => { const el = els.selectionContent.querySelector(selector); if (el) el.textContent = value; };
  const region = game.captureRegions[zone.regionId];
  set('[data-zone-status]', captureZoneStatus(zone));
  set('[data-zone-owner]', zone.ownerId === null ? 'NONE' : game.players[zone.ownerId].name);
  set('[data-zone-income]', zone.ownerId !== null && !zone.contested ? `$${CAPTURE_RULES.income}/min` : '$0/min');
  const owned = region.zones.filter(z => z.ownerId === PLAYER_ID && !z.contested).length;
  set('[data-zone-region]', `${owned} / ${region.zones.length} yours · ${region.ownerId === PLAYER_ID ? '+' : 'complete for +'}$${region.zones.length * CAPTURE_RULES.regionBonus}/min`);
  const fill = els.selectionContent.querySelector('[data-zone-progress]');
  if (fill) fill.style.width = `${zone.ownerId !== null ? 100 : zone.progress / CAPTURE_RULES.captureSeconds * 100}%`;
}
