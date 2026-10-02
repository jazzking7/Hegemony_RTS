'use strict';

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function setWorldTransform() {
    const dpr = els.canvas._dpr || 1;
    ctx.setTransform(
      dpr * game.camera.zoom, 0, 0, dpr * game.camera.zoom,
      dpr * (window.innerWidth / 2 - game.camera.x * game.camera.zoom),
      dpr * (window.innerHeight / 2 - game.camera.y * game.camera.zoom)
    );
  }

  function setScreenTransform() {
    const dpr = els.canvas._dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function getVisibleBounds(padding = 120) {
    const halfW = window.innerWidth / (2 * game.camera.zoom);
    const halfH = window.innerHeight / (2 * game.camera.zoom);
    return {
      left: game.camera.x - halfW - padding,
      right: game.camera.x + halfW + padding,
      top: game.camera.y - halfH - padding,
      bottom: game.camera.y + halfH + padding
    };
  }

  function isVisible(e, bounds) {
    return e.x + e.radius >= bounds.left && e.x - e.radius <= bounds.right && e.y + e.radius >= bounds.top && e.y - e.radius <= bounds.bottom;
  }

  function draw() {
    const dpr = els.canvas._dpr || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#071014';
    ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);

    setWorldTransform();
    const bounds = getVisibleBounds();
    drawTerrain(bounds);
    drawMissileZones(bounds);
    drawEnergyFields(bounds);
    drawBuildRanges(bounds);
    drawOrders(bounds);

    for (const b of game.buildings) if (b.alive && isVisible(b, bounds)) drawBuilding(b);
    for (const u of game.units) if (u.alive && isVisible(u, bounds)) drawUnit(u);
    drawDeathRayBeams(bounds);
    for (const p of game.projectiles) drawProjectile(p);
    for (const fx of game.effects) drawEffect(fx);
    drawPlacementGhost();
    drawEWAimingOverlay();
    drawMissileAimingOverlay();
    drawEnergyAimingOverlay();
    drawCoordinatePickerOverlay();

    setScreenTransform();
    if (!game.missileAimingSiteId && !game.energyAimingSystemId && !game.coordinatePicker?.active) drawMinimap();
    updatePlacementBadge();
  }

  function drawEnergyFields(bounds) {
    // Draw active Node links even when they do not yet enclose a field, so the
    // player can diagnose an open chain before adding the closing Node.
    for (const player of game.players) {
      if (!player?.alive) continue;
      const nodes = game.buildings.filter(b => b.alive && b.playerId === player.id && b.type === 'energyFieldNode' && b.energyNodeOn !== false && b.energyPowered);
      if (nodes.length < 2) continue;
      ctx.save();
      ctx.strokeStyle = player.id === PLAYER_ID ? 'rgba(132,247,226,.20)' : `${player.color}24`;
      ctx.lineWidth = 1 / game.camera.zoom;
      for (let i=0;i<nodes.length;i++) for (let j=i+1;j<nodes.length;j++) {
        if (distance(nodes[i],nodes[j]) > DIRECTED_ENERGY_BALANCE.nodeConnectionRadius) continue;
        ctx.beginPath(); ctx.moveTo(nodes[i].x,nodes[i].y); ctx.lineTo(nodes[j].x,nodes[j].y); ctx.stroke();
      }
      ctx.restore();
    }
    if (!game.energyFields?.length) return;
    for (const field of game.energyFields) {
      const player = game.players[field.playerId];
      if (!player) continue;
      ctx.save();
      for (const tri of field.triangles || []) {
        const minX = Math.min(tri.a.x,tri.b.x,tri.c.x), maxX = Math.max(tri.a.x,tri.b.x,tri.c.x);
        const minY = Math.min(tri.a.y,tri.b.y,tri.c.y), maxY = Math.max(tri.a.y,tri.b.y,tri.c.y);
        if (maxX < bounds.left || minX > bounds.right || maxY < bounds.top || minY > bounds.bottom) continue;
        ctx.beginPath(); ctx.moveTo(tri.a.x,tri.a.y); ctx.lineTo(tri.b.x,tri.b.y); ctx.lineTo(tri.c.x,tri.c.y); ctx.closePath();
        ctx.fillStyle = field.playerId === PLAYER_ID ? 'rgba(103,240,204,.055)' : `${player.color}10`;
        ctx.fill();
        ctx.strokeStyle = field.playerId === PLAYER_ID ? 'rgba(103,240,204,.24)' : `${player.color}30`;
        ctx.lineWidth = 1.15 / game.camera.zoom; ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawDeathRayBeams(bounds) {
    for (const tower of game.buildings) {
      if (!tower.alive || tower.type !== 'deathRayTower' || !tower.energyPowered || !tower.energyBeamTargetIds?.length) continue;
      if (!isVisible({ ...tower, radius: getDeathRayStats(tower).range }, bounds)) continue;
      ctx.save();
      const pulse = 0.65 + Math.sin(game.time * 24 + tower.id) * 0.18;
      for (const id of tower.energyBeamTargetIds) {
        const target = game.entityById.get(id);
        if (!target?.alive) continue;
        ctx.strokeStyle = `rgba(143,255,239,${pulse})`;
        ctx.lineWidth = 2.2 / game.camera.zoom;
        ctx.beginPath(); ctx.moveTo(tower.x,tower.y); ctx.lineTo(target.x,target.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(242,255,252,.82)';
        ctx.lineWidth = 0.7 / game.camera.zoom;
        ctx.beginPath(); ctx.moveTo(tower.x,tower.y); ctx.lineTo(target.x,target.y); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawMissileZones(bounds) {
    if (!game.missileZones?.length) return;
    for (const zone of game.missileZones) {
      if (zone.x + zone.radius < bounds.left || zone.x - zone.radius > bounds.right || zone.y + zone.radius < bounds.top || zone.y - zone.radius > bounds.bottom) continue;
      ctx.save();
      ctx.beginPath(); ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
      if (zone.type === MISSILE_ZONE_BURNING) {
        const pulse = 0.55 + Math.sin(game.time * 8 + zone.id) * 0.12;
        ctx.fillStyle = `rgba(255,103,42,${0.12 + pulse * 0.04})`;
        ctx.strokeStyle = 'rgba(255,151,74,.65)';
      } else {
        ctx.fillStyle = 'rgba(177,154,120,.12)';
        ctx.strokeStyle = 'rgba(205,190,164,.55)';
        ctx.setLineDash([8 / game.camera.zoom, 6 / game.camera.zoom]);
      }
      ctx.fill(); ctx.lineWidth = 1.4 / game.camera.zoom; ctx.stroke();
      ctx.restore();
    }
  }

  function drawMissileAimingOverlay() {
    if (!game.missileAimingSiteId) return;
    const site = game.entityById.get(game.missileAimingSiteId);
    if (!site?.alive || site.playerId !== PLAYER_ID || site.type !== 'missileLaunchSite') return;
    ensureMissileLaunchSiteState(site);
    const silo = getAimingSilo(site);
    const target = game.missileAimTarget || (game.mouse.inside ? { x: game.mouse.worldX, y: game.mouse.worldY } : null);
    if (!silo?.loadedType) return;
    const stats = getStrategicMissileStats(site.playerId, silo.loadedType);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,196,87,.62)'; ctx.lineWidth = 1.4 / game.camera.zoom;
    ctx.setLineDash([10 / game.camera.zoom, 7 / game.camera.zoom]);
    ctx.beginPath(); ctx.arc(site.x, site.y, stats.range, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    if (target) {
      const valid = Math.hypot(target.x-site.x, target.y-site.y) <= stats.range + 1e-9;
      ctx.strokeStyle = valid ? 'rgba(111,244,196,.85)' : 'rgba(255,91,105,.9)';
      ctx.beginPath(); ctx.moveTo(site.x, site.y); ctx.lineTo(target.x, target.y); ctx.stroke();
      const r = 10 / game.camera.zoom;
      ctx.lineWidth = 2 / game.camera.zoom;
      ctx.beginPath(); ctx.moveTo(target.x-r,target.y-r); ctx.lineTo(target.x+r,target.y+r); ctx.moveTo(target.x+r,target.y-r); ctx.lineTo(target.x-r,target.y+r); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnergyAimingOverlay() {
    if (!game.energyAimingSystemId) return;
    const system = game.entityById.get(game.energyAimingSystemId);
    if (!system?.alive || system.type !== 'orbitalBeamSystem') return;
    const stats = getOrbitalBeamStats(system.playerId);
    const target = game.energyAimTarget || (game.mouse.inside ? { x:game.mouse.worldX, y:game.mouse.worldY } : null);
    if (!target) return;
    ctx.save();
    ctx.fillStyle = 'rgba(158,248,255,.035)';
    ctx.strokeStyle = 'rgba(158,248,255,.55)';
    ctx.lineWidth = 1.3 / game.camera.zoom;
    ctx.setLineDash([8 / game.camera.zoom,7 / game.camera.zoom]);
    ctx.beginPath(); ctx.arc(target.x,target.y,stats.outerRadius,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(237,255,255,.08)';
    ctx.strokeStyle = 'rgba(237,255,255,.86)';
    ctx.beginPath(); ctx.arc(target.x,target.y,stats.innerRadius,0,Math.PI*2); ctx.fill(); ctx.stroke();
    const r=11/game.camera.zoom;
    ctx.lineWidth=2/game.camera.zoom;
    ctx.beginPath(); ctx.moveTo(target.x-r,target.y);ctx.lineTo(target.x+r,target.y);ctx.moveTo(target.x,target.y-r);ctx.lineTo(target.x,target.y+r);ctx.stroke();
    ctx.restore();
  }

  function drawCoordinatePickerOverlay() {
    const picker = game.coordinatePicker;
    if (!picker?.active) return;
    const point = picker.target || (game.mouse.inside ? { x: game.mouse.worldX, y: game.mouse.worldY } : null);
    if (!point) return;
    const locked = !!picker.target;
    ctx.save();
    ctx.strokeStyle = locked ? 'rgba(103,240,204,.95)' : 'rgba(255,189,90,.80)';
    ctx.fillStyle = locked ? 'rgba(103,240,204,.08)' : 'rgba(255,189,90,.06)';
    ctx.lineWidth = 2 / game.camera.zoom;
    const r = 18 / game.camera.zoom;
    ctx.beginPath(); ctx.arc(point.x, point.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x-r*1.4, point.y); ctx.lineTo(point.x+r*1.4, point.y);
    ctx.moveTo(point.x, point.y-r*1.4); ctx.lineTo(point.x, point.y+r*1.4);
    ctx.stroke();
    ctx.restore();
  }

  function drawEWAimingOverlay() {
    if (!game.ewAimingBuildingId) return;
    const station = game.entityById.get(game.ewAimingBuildingId);
    if (!station?.alive || station.playerId !== PLAYER_ID || !EW_STATION_TYPES.includes(station.type)) return;
    const stats = getEWStationStats(station);
    if (!stats) return;
    let heading = station.ewHeading || 0;
    if (game.mouse.inside && Number.isFinite(game.mouse.worldX) && Number.isFinite(game.mouse.worldY)) heading = Math.atan2(game.mouse.worldY - station.y, game.mouse.worldX - station.x);
    const half = stats.angleRad * 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(station.x, station.y);
    ctx.arc(station.x, station.y, stats.range, heading - half, heading + half);
    ctx.closePath();
    ctx.fillStyle = station.type === 'radarStation' ? 'rgba(103,240,204,.075)' : station.type === 'jammingStation' ? 'rgba(255,189,90,.075)' : 'rgba(200,132,255,.075)';
    ctx.strokeStyle = station.type === 'radarStation' ? 'rgba(103,240,204,.72)' : station.type === 'jammingStation' ? 'rgba(255,189,90,.72)' : 'rgba(200,132,255,.72)';
    ctx.lineWidth = 1.4 / game.camera.zoom;
    ctx.setLineDash([9 / game.camera.zoom, 7 / game.camera.zoom]);
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawTerrain(bounds) {
    ctx.fillStyle = '#09171b';
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    // Large strategic zones.
    ctx.fillStyle = 'rgba(63, 129, 118, 0.035)';
    ctx.beginPath();
    ctx.ellipse(840, 1050, 720, 470, -0.15, 0, Math.PI * 2);
    ctx.ellipse(2800, 520, 630, 390, 0.08, 0, Math.PI * 2);
    ctx.ellipse(2860, 1740, 670, 400, -0.08, 0, Math.PI * 2);
    ctx.fill();

    const grid = 100;
    const startX = Math.floor(Math.max(0, bounds.left) / grid) * grid;
    const endX = Math.ceil(Math.min(WORLD.width, bounds.right) / grid) * grid;
    const startY = Math.floor(Math.max(0, bounds.top) / grid) * grid;
    const endY = Math.ceil(Math.min(WORLD.height, bounds.bottom) / grid) * grid;
    ctx.lineWidth = 1 / game.camera.zoom;
    ctx.strokeStyle = 'rgba(116, 191, 178, 0.055)';
    ctx.beginPath();
    for (let x = startX; x <= endX; x += grid) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
    for (let y = startY; y <= endY; y += grid) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(103, 240, 204, 0.14)';
    ctx.lineWidth = 3 / game.camera.zoom;
    ctx.strokeRect(0, 0, WORLD.width, WORLD.height);

    // Roads connecting the strategic areas.
    ctx.lineWidth = 42;
    ctx.strokeStyle = 'rgba(14, 34, 38, 0.78)';
    ctx.beginPath();
    ctx.moveTo(780, 1100); ctx.bezierCurveTo(1500, 980, 2100, 820, 2880, 610);
    ctx.moveTo(780, 1100); ctx.bezierCurveTo(1500, 1220, 2140, 1450, 2890, 1690);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 20]);
    ctx.strokeStyle = 'rgba(120, 180, 170, 0.12)';
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawBuildRanges(bounds) {
    for (const p of game.players) {
      const cap = p.capital;
      if (!p.alive || !cap || !cap.alive || !isVisible({ ...cap, radius: BUILDINGS.capital.buildRange }, bounds)) continue;
      ctx.beginPath();
      ctx.arc(cap.x, cap.y, BUILDINGS.capital.buildRange, 0, Math.PI * 2);
      ctx.fillStyle = p.id === PLAYER_ID ? 'rgba(103, 240, 204, 0.018)' : 'rgba(255, 102, 116, 0.009)';
      ctx.fill();
      ctx.strokeStyle = p.id === PLAYER_ID ? 'rgba(103, 240, 204, 0.15)' : `${p.color}18`;
      ctx.lineWidth = 1.5 / game.camera.zoom;
      ctx.setLineDash([12 / game.camera.zoom, 12 / game.camera.zoom]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const fort of game.buildings) {
      if (!isCompletedFortress(fort) || !isVisible({ ...fort, radius: BUILDINGS.fortress.buildRange }, bounds)) continue;
      ctx.beginPath();
      ctx.arc(fort.x, fort.y, BUILDINGS.fortress.buildRange, 0, Math.PI * 2);
      ctx.fillStyle = fort.playerId === PLAYER_ID ? 'rgba(103, 240, 204, 0.012)' : `${game.players[fort.playerId].color}08`;
      ctx.fill();
      ctx.strokeStyle = fort.playerId === PLAYER_ID ? 'rgba(103,240,204,.12)' : `${game.players[fort.playerId].color}13`;
      ctx.lineWidth = 1.2 / game.camera.zoom;
      ctx.setLineDash([7 / game.camera.zoom, 12 / game.camera.zoom]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (game.selected?.alive) {
      const def = BUILDINGS[game.selected.type];
      let r = def.range ? getEntityStat(game.selected, 'range', def.range) : (game.selected.type === 'capital' ? def.buildRange : 0);
      if (game.selected.type === 'energyGenerator') r = getGeneratorRange(game.selected.playerId);
      else if (game.selected.type === 'energyFieldNode') r = DIRECTED_ENERGY_BALANCE.nodeConnectionRadius;
      else if (game.selected.type === 'deathRayTower') r = getDeathRayStats(game.selected).range;
      if (r) {
        ctx.beginPath();
        ctx.arc(game.selected.x, game.selected.y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(103,240,204,.02)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(103,240,204,.38)';
        ctx.lineWidth = 1 / game.camera.zoom;
        ctx.setLineDash([7 / game.camera.zoom, 8 / game.camera.zoom]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (game.selected.type === 'fortress' && isCompletedFortress(game.selected)) {
        ctx.beginPath();
        ctx.arc(game.selected.x, game.selected.y, BUILDINGS.fortress.buildRange, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(126,208,255,.42)';
        ctx.lineWidth = 1.2 / game.camera.zoom;
        ctx.setLineDash([3 / game.camera.zoom, 6 / game.camera.zoom]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  function drawOrders(bounds) {
    ctx.lineWidth = 1 / game.camera.zoom;
    ctx.setLineDash([8 / game.camera.zoom, 9 / game.camera.zoom]);
    for (const u of game.units) {
      if (!u.alive || u.garrisoned || u.playerId !== PLAYER_ID || !u.hasOrder || !isVisible(u, bounds)) continue;
      ctx.strokeStyle = 'rgba(103,240,204,.12)';
      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(u.orderX, u.orderY);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawBuilding(b) {
    const def = BUILDINGS[b.type];
    const color = game.players[b.playerId].color;
    const dark = game.players[b.playerId].dark;
    const selected = game.selected === b;

    if (b.type === 'landmine' && b.playerId !== PLAYER_ID) return;

    ctx.save();
    ctx.translate(b.x, b.y);

    if (selected) {
      const pulse = 1 + Math.sin(game.time * 5) * 0.08;
      ctx.beginPath();
      ctx.arc(0, 0, (b.radius + 10) * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 / game.camera.zoom;
      ctx.stroke();
    }

    if (b.type === 'capital') {
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = dark;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.fillRect(-34, -34, 68, 68);
      ctx.strokeRect(-34, -34, 68, 68);
      ctx.fillStyle = '#0a191c';
      ctx.fillRect(-19, -19, 38, 38);
      ctx.strokeRect(-19, -19, 38, 38);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = color;
      drawStar(ctx, 0, 0, 5, 13, 5.5);
      ctx.fill();
    } else if (b.type === 'militaryBase') {
      ctx.fillStyle = dark;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      roundRect(ctx, -34, -27, 68, 54, 5);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0b1b1f';
      ctx.fillRect(-22, -15, 44, 30);
      ctx.strokeRect(-22, -15, 44, 30);
      ctx.fillStyle = color;
      ctx.fillRect(-4, -19, 8, 38);
      ctx.fillRect(-19, -4, 38, 8);
    } else if (b.type === 'advancedEngineeringComplex') {
      // Industrial service complex: wide workshop body, paired service bays,
      // central gear and articulated maintenance arms. Deliberately rectangular
      // so it cannot be confused with a turret footprint.
      ctx.fillStyle = dark;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      roundRect(ctx, -38, -27, 76, 54, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#091a1d';
      roundRect(ctx, -28, -18, 56, 36, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(-34, -13, 11, 26);
      ctx.fillRect(23, -13, 11, 26);
      ctx.strokeStyle = 'rgba(229,245,242,.38)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-19, -20); ctx.lineTo(-19, 20); ctx.moveTo(19, -20); ctx.lineTo(19, 20); ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 11, Math.sin(a) * 11); ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16); ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-25, 18); ctx.lineTo(-12, 7); ctx.moveTo(25, 18); ctx.lineTo(12, 7); ctx.stroke();
    } else if (b.type === 'researchCenter') {
      // Research campus: octagonal main laboratory with a bright central core,
      // side wings and antenna/radar mast. Distinct from circular defenses.
      ctx.fillStyle = dark;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-29, -23); ctx.lineTo(29, -23); ctx.lineTo(38, -12); ctx.lineTo(38, 12);
      ctx.lineTo(29, 23); ctx.lineTo(-29, 23); ctx.lineTo(-38, 12); ctx.lineTo(-38, -12);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#091a1d';
      ctx.fillRect(-33, -10, 15, 20); ctx.strokeRect(-33, -10, 15, 20);
      ctx.fillRect(18, -10, 15, 20); ctx.strokeRect(18, -10, 15, 20);
      ctx.beginPath(); ctx.arc(0, 2, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(10, 2); ctx.lineTo(0, 12); ctx.lineTo(-10, 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -31); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -31, 6, Math.PI * 0.08, Math.PI * 0.92); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -31, 2.6, 0, Math.PI * 2); ctx.fill();
    } else if (b.type === 'militaryCommand') {
      ctx.fillStyle = dark;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      hexPath(ctx, 0, 0, 36); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#09191d';
      hexPath(ctx, 0, 0, 23); ctx.fill(); ctx.stroke();
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = color;
      ctx.fillRect(-4, -21, 8, 42);
      ctx.fillRect(-21, -4, 42, 8);
      ctx.rotate(-Math.PI / 4);
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    } else if (b.type === 'advancedCoordinationCenter') {
      // Strategic coordination bunker: broad command slab, twin antenna pylons
      // and a bright central command diamond. Intentionally distinct from MCC.
      ctx.fillStyle = dark; ctx.strokeStyle = color; ctx.lineWidth = 2.2;
      roundRect(ctx, -39, -25, 78, 50, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#081719'; roundRect(ctx, -28, -16, 56, 32, 3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-25,-16); ctx.lineTo(-25,-33); ctx.moveTo(25,-16); ctx.lineTo(25,-33); ctx.stroke();
      ctx.beginPath(); ctx.arc(-25,-33,6,Math.PI*.15,Math.PI*.85); ctx.arc(25,-33,6,Math.PI*.15,Math.PI*.85); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(0,-12); ctx.lineTo(13,0); ctx.lineTo(0,12); ctx.lineTo(-13,0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(229,245,242,.34)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-31,13); ctx.lineTo(-15,5); ctx.moveTo(31,13); ctx.lineTo(15,5); ctx.stroke();
    } else if (b.type === 'airbase') {
      ctx.fillStyle = dark;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      roundRect(ctx, -39, -27, 78, 54, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(229,245,242,.28)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-31, 0); ctx.lineTo(31, 0); ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-31, -10); ctx.lineTo(31, -10); ctx.moveTo(-31, 10); ctx.lineTo(31, 10); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-7, 8); ctx.lineTo(-3, 2); ctx.lineTo(-18, 2); ctx.lineTo(-18, -2); ctx.lineTo(-3, -2); ctx.lineTo(-7, -8); ctx.closePath(); ctx.fill();
    } else if (b.type === 'droneHub') {
      // Drone production / storage hub: low hexagonal hangar with six launch
      // cells and a central command core. It reads as a production structure,
      // not another circular defense tower.
      ctx.fillStyle = dark;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-33, -24); ctx.lineTo(25, -24); ctx.lineTo(38, -11); ctx.lineTo(38, 11);
      ctx.lineTo(25, 24); ctx.lineTo(-33, 24); ctx.lineTo(-40, 12); ctx.lineTo(-40, -12);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#09191d';
      roundRect(ctx, -26, -15, 45, 30, 4); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(229,245,242,.35)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const yy = -10 + i * 10;
        ctx.strokeRect(22, yy - 3, 12, 6);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.lineTo(Math.cos(a) * 19, Math.sin(a) * 19);
        ctx.stroke();
      }
      ctx.fillStyle = color;
      hexPath(ctx, -4, 0, 7); ctx.fill();
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.arc(-4, 0, 13, 0, Math.PI * 2); ctx.stroke();
    } else if (b.type === 'superiorMobilizationComplex') {
      // Superior Mobilization Complex: broad exosuit production hall with three
      // configuration bays, matching its three-loadout contribution.
      ctx.fillStyle = dark; ctx.strokeStyle = color; ctx.lineWidth = 2.3;
      ctx.beginPath(); ctx.moveTo(-39,-25); ctx.lineTo(28,-25); ctx.lineTo(40,-13); ctx.lineTo(40,25); ctx.lineTo(-39,25); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#07171a'; roundRect(ctx,-31,-18,60,36,4); ctx.fill(); ctx.stroke();
      for (let i=0;i<3;i++) {
        const x=-25+i*21;
        ctx.fillStyle='rgba(103,240,204,.08)'; roundRect(ctx,x,-12,16,24,3); ctx.fill();
        ctx.strokeStyle=color;ctx.lineWidth=1.4;roundRect(ctx,x,-12,16,24,3);ctx.stroke();
        ctx.beginPath();ctx.arc(x+8,-5,3,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x+8,-2);ctx.lineTo(x+8,7);ctx.moveTo(x+3,2);ctx.lineTo(x+13,2);ctx.moveTo(x+8,7);ctx.lineTo(x+4,11);ctx.moveTo(x+8,7);ctx.lineTo(x+12,11);ctx.stroke();
      }
      ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(31,-10);ctx.lineTo(36,-3);ctx.lineTo(31,4);ctx.lineTo(26,-3);ctx.closePath();ctx.fill();
    } else if (b.type === 'energyGenerator') {
      ensureEnergyBuildingState(b);
      ctx.fillStyle = dark; ctx.strokeStyle = color; ctx.lineWidth = 2.2;
      hexPath(ctx,0,0,34); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#07181b'; hexPath(ctx,0,0,24); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = b.energyEffectiveOutput > 0 ? '#9fffe9' : 'rgba(125,159,155,.55)'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0,0,13,0,Math.PI*2); ctx.stroke();
      ctx.rotate(game.time * 0.55);
      for (let i=0;i<4;i++) { ctx.rotate(Math.PI/2); ctx.beginPath(); ctx.moveTo(5,0);ctx.lineTo(18,0);ctx.stroke(); }
      ctx.rotate(-game.time * 0.55);
      ctx.fillStyle = b.energyEffectiveOutput > 0 ? '#9fffe9' : color;
      ctx.beginPath(); ctx.moveTo(-3,-14);ctx.lineTo(6,-3);ctx.lineTo(1,-3);ctx.lineTo(5,13);ctx.lineTo(-6,2);ctx.lineTo(-1,2);ctx.closePath();ctx.fill();
    } else if (b.type === 'orbitalBeamSystem') {
      ensureEnergyBuildingState(b);
      ctx.fillStyle=dark;ctx.strokeStyle=color;ctx.lineWidth=2.2;
      roundRect(ctx,-37,-29,74,58,6);ctx.fill();ctx.stroke();
      ctx.fillStyle='#07171a';roundRect(ctx,-29,-21,58,42,4);ctx.fill();ctx.stroke();
      ctx.strokeStyle=b.energyPowered?'#a8fbff':'rgba(125,159,155,.55)';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(0,2,15,Math.PI*1.05,Math.PI*1.95);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-14,0);ctx.lineTo(0,10);ctx.lineTo(14,0);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,10);ctx.lineTo(0,22);ctx.stroke();
      const stats=getOrbitalBeamStats(b.playerId), ready=(b.energyCharge||0)>=stats.rechargeTime-1e-6;
      ctx.fillStyle=ready?'#ecffff':color;ctx.beginPath();ctx.arc(0,-3,4.2,0,Math.PI*2);ctx.fill();
    } else if (b.type === 'energyFieldNode') {
      ensureEnergyBuildingState(b);
      ctx.rotate(Math.PI/4);ctx.fillStyle=dark;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.fillRect(-12,-12,24,24);ctx.strokeRect(-12,-12,24,24);ctx.rotate(-Math.PI/4);
      ctx.strokeStyle=b.energyNodeOn && b.energyPowered?'#9fffe9':'rgba(125,159,155,.52)';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle=b.energyNodeOn && b.energyPowered?'#dffff7':color;ctx.beginPath();ctx.arc(0,0,3.5,0,Math.PI*2);ctx.fill();
    } else if (b.type === 'deathRayTower') {
      ensureEnergyBuildingState(b);
      ctx.fillStyle=dark;ctx.strokeStyle=color;ctx.lineWidth=2.2;hexPath(ctx,0,0,27);ctx.fill();ctx.stroke();
      ctx.fillStyle='#07171a';ctx.beginPath();ctx.arc(0,0,15,0,Math.PI*2);ctx.fill();ctx.stroke();
      const targets=b.energyBeamTargetIds||[];
      let heading=-Math.PI/2;
      if(targets.length){const t=game.entityById.get(targets[0]);if(t?.alive)heading=Math.atan2(t.y-b.y,t.x-b.x);}
      ctx.rotate(heading);ctx.strokeStyle=b.energyPowered?'#a8fbff':color;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(2,0);ctx.lineTo(24,0);ctx.stroke();
      ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(20,-6);ctx.lineTo(28,0);ctx.lineTo(20,6);ctx.stroke();ctx.rotate(-heading);
      ctx.fillStyle=b.energyPowered?'#dfffff':color;ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();
    } else if (EW_STATION_TYPES.includes(b.type)) {
      // Shared EW station chassis with type-specific core. The directional mast
      // visibly follows the configured antenna heading; coverage itself is only
      // drawn by drawEWAimingOverlay() while the player is actively rotating it.
      const kind = b.type;
      ctx.fillStyle = dark; ctx.strokeStyle = color; ctx.lineWidth = 2.1;
      hexPath(ctx, 0, 0, 31); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#08181b';
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(229,245,242,.28)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 19, Math.sin(a) * 19); ctx.lineTo(Math.cos(a) * 28, Math.sin(a) * 28); ctx.stroke();
      }
      if (kind === 'radarStation') {
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 2.7, 0, Math.PI * 2); ctx.fill();
      } else if (kind === 'jammingStation') {
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-10,-5); ctx.bezierCurveTo(-4,-12,4,2,10,-5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-10,5); ctx.bezierCurveTo(-4,-2,4,12,10,5); ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(0,-11); ctx.lineTo(11,0); ctx.lineTo(0,11); ctx.lineTo(-11,0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#08181b'; ctx.beginPath(); ctx.arc(0,0,4,0,Math.PI*2); ctx.fill();
      }
      const heading = Number.isFinite(b.ewHeading) ? b.ewHeading : 0;
      ctx.rotate(heading);
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(6,0); ctx.lineTo(29,0); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(30,0,8,-Math.PI*.38,Math.PI*.38); ctx.stroke();
      ctx.rotate(-heading);
    } else if (b.type === 'missileLaunchSite') {
      // Hardened strategic launch compound. A broad slab, control bunker and
      // individual silo hatches make the MLS read as infrastructure rather than
      // falling through to the generic circular-turret renderer.
      ensureMissileLaunchSiteState(b);
      ctx.fillStyle = dark; ctx.strokeStyle = color; ctx.lineWidth = 2.4;
      roundRect(ctx, -43, -32, 86, 64, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#08171a';
      roundRect(ctx, -37, -26, 74, 52, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(229,245,242,.24)'; ctx.lineWidth = 1.2;
      ctx.strokeRect(-37, -26, 74, 52);
      // Left-side fire-control bunker.
      ctx.fillStyle = '#0a1b1f'; ctx.strokeStyle = color; ctx.lineWidth = 1.6;
      roundRect(ctx, -34, -19, 22, 38, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(-29, -12, 12, 3); ctx.fillRect(-29, -4, 12, 3); ctx.fillRect(-29, 4, 12, 3);
      // Up to six visibly separate silo hatches, 2 columns × 3 rows.
      const slots = Math.max(4, b.missileSilos?.length || 4);
      for (let i = 0; i < Math.min(6, slots); i++) {
        const col = i % 2, row = Math.floor(i / 2);
        const sx = 3 + col * 21, sy = -19 + row * 19;
        const silo = b.missileSilos?.[i];
        ctx.fillStyle = silo?.loadedType ? 'rgba(103,240,204,.16)' : silo?.active ? 'rgba(255,189,90,.10)' : '#071215';
        ctx.strokeStyle = silo?.active ? color : 'rgba(125,159,155,.38)';
        ctx.lineWidth = 1.4;
        roundRect(ctx, sx, sy, 15, 13, 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = silo?.loadedType ? color : 'rgba(229,245,242,.20)';
        ctx.beginPath(); ctx.moveTo(sx + 3, sy + 6.5); ctx.lineTo(sx + 12, sy + 6.5); ctx.stroke();
      }
      // Strategic missile insignia / launch arrow.
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(-1,-10); ctx.lineTo(7,-2); ctx.lineTo(3,-2); ctx.lineTo(3,12); ctx.lineTo(-3,12); ctx.lineTo(-3,-2); ctx.lineTo(-7,-2); ctx.closePath(); ctx.fill();
    } else if (b.type === 'fortress') {
      ctx.fillStyle = b.constructionState === 'operational' ? dark : 'rgba(24,31,32,.92)';
      ctx.strokeStyle = color;
      ctx.lineWidth = b.constructionState === 'operational' ? 3 : 1.8;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + Math.PI / 8;
        const px = Math.cos(a) * 39, py = Math.sin(a) * 39;
        if (i === 0) ctx.beginPath(), ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#09181b';
      roundRect(ctx, -24, -20, 48, 40, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      for (const [tx,ty] of [[-27,-27],[27,-27],[-27,27],[27,27]]) { ctx.fillRect(tx-5,ty-5,10,10); }
      if (b.constructionState !== 'operational') {
        const progress = clamp((b.constructionProgress || 0) / 20, 0, 1);
        ctx.fillStyle = 'rgba(8,15,16,.9)'; ctx.fillRect(-30, 31, 60, 5);
        ctx.fillStyle = color; ctx.fillRect(-30, 31, 60 * progress, 5);
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(-30, 31, 60, 5);
      } else {
        ctx.fillStyle = color; drawStar(ctx, 0, 0, 4, 10, 4); ctx.fill();
      }
    } else if (b.type === 'city' || b.type === 'megacity') {
      const towers = b.type === 'megacity' ? 5 : 3;
      ctx.fillStyle = dark;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      for (let i = 0; i < towers; i++) {
        const a = i / towers * Math.PI * 2 - Math.PI / 2;
        const rr = b.type === 'megacity' ? 14 : 10;
        const w = b.type === 'megacity' ? 11 : 10;
        const h = b.type === 'megacity' ? 25 + (i % 2) * 7 : 20;
        ctx.fillStyle = '#0c2024';
        ctx.fillRect(Math.cos(a) * rr - w / 2, Math.sin(a) * rr - h / 2, w, h);
        ctx.strokeRect(Math.cos(a) * rr - w / 2, Math.sin(a) * rr - h / 2, w, h);
      }
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    } else if (b.type === 'landmine') {
      ctx.strokeStyle = color;
      ctx.fillStyle = `${dark}`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14); ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = dark;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, b.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.rotate(b.angle);
      if (b.type === 'machineGun') {
        ctx.fillStyle = '#0b1a1d'; ctx.fillRect(-9, -9, 18, 18); ctx.strokeRect(-9, -9, 18, 18);
        ctx.fillStyle = color; ctx.fillRect(2, -3, 26, 2); ctx.fillRect(2, 2, 26, 2);
      } else if (b.type === 'cannon') {
        ctx.fillStyle = '#0b1a1d'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = color; ctx.fillRect(3, -4, 30, 8);
      } else if (b.type === 'mortar') {
        ctx.fillStyle = '#0b1a1d'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(16, -17); ctx.stroke();
      } else if (b.type === 'airDefense') {
        ctx.fillStyle = '#0b1a1d'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(18, -11); ctx.moveTo(2, 7); ctx.lineTo(22, -3); ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(18,-11); ctx.lineTo(12,-10); ctx.lineTo(16,-5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(22,-3); ctx.lineTo(16,-3); ctx.lineTo(20,2); ctx.closePath(); ctx.fill();
      } else if (b.type === 'hive') {
        ctx.rotate(-b.angle);
        hexPath(ctx, 0, 0, 18); ctx.fillStyle = '#0b1a1d'; ctx.fill(); ctx.stroke();
        hexPath(ctx, 0, 0, 9); ctx.strokeStyle = color; ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    ctx.restore();
    drawHealthBar(b);
  }

  function drawUnit(u) {
    if (u.garrisoned) return;
    const color = game.players[u.playerId].color;
    const dark = game.players[u.playerId].dark;
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.rotate(u.angle);
    ctx.strokeStyle = color;
    ctx.fillStyle = dark;
    ctx.lineWidth = 1.4;

    if (u.parachuting) {
      // One-second descent state: a compact canopy makes the troop visibly
      // airborne without making it look like another aircraft type.
      ctx.rotate(-u.angle);
      ctx.strokeStyle = color;
      ctx.fillStyle = 'rgba(220,245,238,.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, -8, 9, Math.PI, Math.PI * 2); ctx.lineTo(8, -8); ctx.lineTo(0, 3); ctx.lineTo(-8, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 5, 2.8, 0, Math.PI * 2); ctx.fill();
    } else if (u.type === 'bomber') {
      ctx.fillStyle = dark;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(19, 0); ctx.lineTo(3, 5); ctx.lineTo(-6, 14); ctx.lineTo(-10, 13); ctx.lineTo(-5, 3);
      ctx.lineTo(-18, 5); ctx.lineTo(-20, 1.5); ctx.lineTo(-8, 0); ctx.lineTo(-20, -1.5); ctx.lineTo(-18, -5);
      ctx.lineTo(-5, -3); ctx.lineTo(-10, -13); ctx.lineTo(-6, -14); ctx.lineTo(3, -5); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(4, 0, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(229,245,242,.35)';
      ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(-34, 0); ctx.stroke();
      if (u.hp / Math.max(1, u.maxHp) < BOMBER_DAMAGED_HP_THRESHOLD) {
        ctx.strokeStyle = 'rgba(220,225,220,.48)';
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(-19, 3); ctx.lineTo(-29, 7); ctx.lineTo(-38, 4); ctx.stroke();
      }
    } else if (u.type === 'superFighter') {
      // Sharp swept fighter silhouette, intentionally narrower and more pointed
      // than the Bomber or Loyal Wingman's broad delta wing.
      ctx.fillStyle = dark; ctx.strokeStyle = color; ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(23, 0); ctx.lineTo(2, 4); ctx.lineTo(-7, 13); ctx.lineTo(-11, 12);
      ctx.lineTo(-6, 3); ctx.lineTo(-17, 5); ctx.lineTo(-14, 0);
      ctx.lineTo(-17, -5); ctx.lineTo(-6, -3); ctx.lineTo(-11, -12); ctx.lineTo(-7, -13); ctx.lineTo(2, -4); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(11,0); ctx.lineTo(1,2.4); ctx.lineTo(-4,0); ctx.lineTo(1,-2.4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(229,245,242,.32)'; ctx.beginPath(); ctx.moveTo(-13, 5); ctx.lineTo(-22, 7); ctx.moveTo(-13,-5); ctx.lineTo(-22,-7); ctx.stroke();
    } else if (u.type === 'paratrooperPlane') {
      // Large straight-wing transport profile with a broad cargo fuselage.
      ctx.fillStyle = dark; ctx.strokeStyle = color; ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(22,0); ctx.lineTo(9,5); ctx.lineTo(0,6); ctx.lineTo(-5,18); ctx.lineTo(-10,18);
      ctx.lineTo(-8,6); ctx.lineTo(-19,5); ctx.lineTo(-22,2); ctx.lineTo(-12,0);
      ctx.lineTo(-22,-2); ctx.lineTo(-19,-5); ctx.lineTo(-8,-6); ctx.lineTo(-10,-18); ctx.lineTo(-5,-18); ctx.lineTo(0,-6); ctx.lineTo(9,-5); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(-5,-2.2,15,4.4);
      ctx.strokeStyle = 'rgba(229,245,242,.32)'; ctx.strokeRect(-12,-4,10,8);
    } else if (u.type === 'tank') {
      // Compact assault-tank silhouette: broad hull, centered turret, short gun.
      roundRect(ctx, -17, -11, 34, 22, 4); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(229,245,242,.32)';
      ctx.beginPath(); ctx.moveTo(-14, -8); ctx.lineTo(-14, 8); ctx.moveTo(14, -8); ctx.lineTo(14, 8); ctx.stroke();
      ctx.strokeStyle = color;
      ctx.fillStyle = '#0a181b'; ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(4, -3, 18, 6);
    } else if (u.type === 'spg') {
      // Artillery profile is intentionally long and rear-heavy so it cannot be
      // confused with a tank even at normal gameplay zoom.
      roundRect(ctx, -19, -9, 38, 18, 3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(229,245,242,.28)';
      ctx.beginPath(); ctx.moveTo(-15, -7); ctx.lineTo(-15, 7); ctx.moveTo(15, -7); ctx.lineTo(15, 7); ctx.stroke();
      ctx.strokeStyle = color;
      ctx.fillStyle = '#0a181b'; ctx.fillRect(-14, -7, 15, 14); ctx.strokeRect(-14, -7, 15, 14);
      ctx.fillStyle = color;
      ctx.fillRect(-1, -2.2, 34, 4.4);
      ctx.beginPath(); ctx.moveTo(-13, -9); ctx.lineTo(-3, -14); ctx.lineTo(4, -9); ctx.closePath(); ctx.fill();
    } else if (u.type === 'apc') {
      // APC: broad low troop carrier with rear compartment marker.
      roundRect(ctx, -18, -10, 36, 20, 5); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(229,245,242,.28)';
      ctx.beginPath(); ctx.moveTo(-13, -8); ctx.lineTo(-13, 8); ctx.moveTo(12, -8); ctx.lineTo(12, 8); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(8, 0, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color; ctx.strokeRect(-9, -6, 12, 12);
    } else if (u.type === 'ifv') {
      // IFV keeps the transport hull but adds a clearly armed forward turret.
      roundRect(ctx, -18, -10, 36, 20, 5); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(229,245,242,.28)';
      ctx.beginPath(); ctx.moveTo(-13, -8); ctx.lineTo(-13, 8); ctx.moveTo(12, -8); ctx.lineTo(12, 8); ctx.stroke();
      ctx.fillStyle = '#0a181b'; ctx.beginPath(); ctx.arc(3, 0, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = color; ctx.stroke();
      ctx.fillStyle = color;
      if (u.configuration?.turret === 'grenade' && isResearchComplete(u.playerId, 'mwIFVGrenade')) { ctx.fillRect(6, -2.4, 14, 4.8); ctx.beginPath(); ctx.arc(21, 0, 3.2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(7, -1.4, 18, 2.8);
    } else if (u.type === 'loiteringMunition') {
      // Tiny low-altitude dart. The narrow silhouette reinforces its disposable,
      // very-fast attack role while remaining visible in large swarms.
      ctx.fillStyle = dark;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(9, 0); ctx.lineTo(-2, 4); ctx.lineTo(-6, 2); ctx.lineTo(-4, 0);
      ctx.lineTo(-6, -2); ctx.lineTo(-2, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(1.5, 0, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(229,245,242,.28)';
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-12, 0); ctx.stroke();
    } else if (u.type === 'loyalWingman') {
      // Unmanned delta/flying-wing silhouette. No fuselage/tail profile: this is
      // intentionally a very different visual language from bombers/fighters.
      ctx.fillStyle = dark;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(17, 0);          // delta nose
      ctx.lineTo(-13, 13);        // broad swept left wing
      ctx.lineTo(-7, 2.8);        // recessed rear center
      ctx.lineTo(-7, -2.8);
      ctx.lineTo(-13, -13);       // broad swept right wing
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(8, 0); ctx.lineTo(-5, 5); ctx.lineTo(-2, 0); ctx.lineTo(-5, -5); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(103,240,204,.34)';
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-14, 0); ctx.stroke();
    } else if (u.type === 'advancedEngineer') {
      // Engineering unit: compact armored service chassis with a visible tool arm.
      roundRect(ctx, -11, -8, 22, 16, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(6, -2, 12, 4);
      ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(-5, 0, 4.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3, -7); ctx.lineTo(2, -12); ctx.moveTo(-3, 7); ctx.lineTo(2, 12); ctx.stroke();
    } else if (u.type === 'elite') {
      // Elite infantry gets a larger armored diamond, shoulder fins, and a long
      // rifle. It is a different silhouette, not merely a bigger center dot.
      ctx.beginPath();
      ctx.moveTo(12, 0); ctx.lineTo(2, 8); ctx.lineTo(-8, 5); ctx.lineTo(-11, 0); ctx.lineTo(-8, -5); ctx.lineTo(2, -8); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(1, -6); ctx.lineTo(7, 0); ctx.lineTo(1, 6); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill();
      ctx.fillRect(7, -1.4, 11, 2.8);
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(-5, -7); ctx.lineTo(-1, -11); ctx.moveTo(-5, 7); ctx.lineTo(-1, 11); ctx.stroke();
    } else if (u.type === 'hiveSoldier') {
      // Small hex/needle drone-like hunter with a persistent Hive ring marker.
      ctx.beginPath(); ctx.moveTo(11,0); ctx.lineTo(-5,6); ctx.lineTo(-8,0); ctx.lineTo(-5,-6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(1, 0, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
    } else {
      // Basic infantry stays deliberately simple for immediate visual hierarchy.
      ctx.beginPath();
      ctx.moveTo(10, 0); ctx.lineTo(-6, 7); ctx.lineTo(-4, 0); ctx.lineTo(-6, -7); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(1, 0, 2.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    if (hasStatus(u, 'stunned')) {
      ctx.strokeStyle = '#8fc8ff';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(u.x, u.y, u.radius + 7 + Math.sin(game.time * 8) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    if (u.hp < u.maxHp || game.time - u.lastHitAt < 2) drawHealthBar(u);
  }

  function drawHealthBar(e) {
    if (e.hp >= e.maxHp && game.selected !== e && game.time - (e.lastHitAt || -99) > 2) return;
    const width = Math.max(24, e.radius * 1.8);
    const y = e.y - e.radius - 13;
    ctx.fillStyle = 'rgba(0,0,0,.58)';
    ctx.fillRect(e.x - width / 2, y, width, 4);
    ctx.fillStyle = e.hp / e.maxHp > 0.45 ? '#7ce99a' : e.hp / e.maxHp > 0.2 ? '#ffbd5a' : '#ff6674';
    ctx.fillRect(e.x - width / 2, y, width * clamp(e.hp / e.maxHp, 0, 1), 4);
  }

  function drawProjectile(p) {
    if (p.kind === STRATEGIC_MISSILE_KIND) {
      const n = normalize(p.vx, p.vy);
      ctx.strokeStyle = p.missileType === 'hypersonic' ? 'rgba(196,229,255,.55)' : p.missileType === 'incendiary' ? 'rgba(255,132,64,.58)' : 'rgba(255,224,154,.5)';
      ctx.lineWidth = p.missileType === 'hypersonic' ? 3 : 2.2;
      ctx.beginPath(); ctx.moveTo(p.x - n.x * 22, p.y - n.y * 22); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = p.missileType === 'incendiary' ? '#ff9657' : p.missileType === 'highExplosive' ? '#ffd98d' : p.missileType === 'hypersonic' ? '#d8f2ff' : '#fff0b3';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.missileType === 'hypersonic' ? 4 : 3.5, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'flare') {
      const alpha = clamp(p.life / Math.max(0.01, p.maxLife || AIR_DOMINANCE_BALANCE.flareLife), 0, 1);
      ctx.fillStyle = `rgba(255,245,183,${0.9 * alpha})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.2, 0, Math.PI * 2); ctx.fill();
      const n = normalize(p.vx, p.vy);
      ctx.strokeStyle = `rgba(255,177,73,${0.7 * alpha})`; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(p.x - n.x * 14, p.y - n.y * 14); ctx.lineTo(p.x, p.y); ctx.stroke();
    } else if (p.kind === 'fighterA2AMissile') {
      const n = normalize(p.vx, p.vy);
      ctx.strokeStyle = 'rgba(139,211,255,.48)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x - n.x * 15, p.y - n.y * 15); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = '#b7e7ff'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'fighterA2GMissile') {
      const n = normalize(p.vx, p.vy);
      ctx.strokeStyle = 'rgba(255,173,99,.45)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(p.x - n.x * 16, p.y - n.y * 16); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = '#ffc078'; ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'wingmanMissile') {
      const n = normalize(p.vx, p.vy);
      ctx.strokeStyle = 'rgba(103,240,204,.38)';
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(p.x - n.x * 12, p.y - n.y * 12); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = '#9ff8df';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.7, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'aaMissile') {
      const n = normalize(p.vx, p.vy);
      ctx.strokeStyle = 'rgba(255,224,154,.42)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x - n.x * 16, p.y - n.y * 16); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = '#ffe6a6';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'mortar') {
      const arc = Math.sin(clamp(p.progress, 0, 1) * Math.PI) * 85;
      ctx.fillStyle = '#ffd98d';
      ctx.beginPath(); ctx.arc(p.x, p.y - arc, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,217,141,.24)';
      ctx.beginPath(); ctx.moveTo(p.x, p.y - arc); ctx.lineTo(p.x, p.y); ctx.stroke();
    } else {
      ctx.fillStyle = p.kind === 'shell' ? '#ffcf77' : '#dffdf6';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'shell' ? 3.2 : 1.8, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawEffect(fx) {
    const t = 1 - fx.life / fx.maxLife;
    if (fx.type === 'explosion') {
      ctx.fillStyle = `rgba(255, 171, 74, ${0.42 * (1 - t)})`;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.radius * (0.2 + t * 0.9), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255, 225, 157, ${0.85 * (1 - t)})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (fx.type === 'debris') {
      ctx.strokeStyle = `rgba(170, 225, 213, ${0.55 * (1 - t)})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2 + t;
        ctx.beginPath(); ctx.moveTo(fx.x, fx.y); ctx.lineTo(fx.x + Math.cos(a) * fx.radius * t, fx.y + Math.sin(a) * fx.radius * t); ctx.stroke();
      }
    } else if (fx.type === 'shockwave') {
      ctx.strokeStyle = `rgba(255, 102, 116, ${0.75 * (1 - t)})`;
      ctx.lineWidth = 8 * (1 - t) + 1;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.radius * t, 0, Math.PI * 2); ctx.stroke();
    } else if (fx.type === 'orbitalBeam') {
      const fade = 1 - t;
      const column = 9 + 22 * (1 - fade);
      ctx.strokeStyle = `rgba(225,255,255,${0.96 * fade})`;
      ctx.lineWidth = column;
      ctx.beginPath(); ctx.moveTo(fx.x, fx.y - Math.min(520, fx.radius * 1.2)); ctx.lineTo(fx.x, fx.y); ctx.stroke();
      ctx.strokeStyle = `rgba(126,244,255,${0.62 * fade})`; ctx.lineWidth = column * 2.2;
      ctx.beginPath(); ctx.moveTo(fx.x, fx.y - Math.min(520, fx.radius * 1.2)); ctx.lineTo(fx.x, fx.y); ctx.stroke();
      ctx.fillStyle = `rgba(230,255,255,${0.34 * fade})`; ctx.beginPath(); ctx.arc(fx.x,fx.y,fx.innerRadius*(.45+t*.65),0,Math.PI*2);ctx.fill();
    } else if (fx.type === 'wingmanLaunch' || fx.type === 'fighterLaunch') {
      const fighter = fx.type === 'fighterLaunch';
      ctx.strokeStyle = fighter ? `rgba(143, 216, 255, ${0.95 * (1 - t)})` : `rgba(159, 248, 223, ${0.95 * (1 - t)})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.radius * (0.25 + t * 0.8), 0, Math.PI * 2); ctx.stroke();
    } else if (fx.type === 'flareBurst') {
      ctx.strokeStyle = `rgba(255, 218, 126, ${0.9 * (1 - t)})`;
      ctx.lineWidth = 2.1;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.radius * (0.3 + t), 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawPlacementGhost() {
    if (!game.buildMode || !game.mouse.inside || !game.started) return;
    const type = game.buildMode;
    const def = BUILDINGS[type];
    const x = game.mouse.worldX;
    const y = game.mouse.worldY;
    const valid = checkPlacement(type, x, y).valid;
    ctx.save();
    ctx.globalAlpha = 0.58;
    ctx.strokeStyle = valid ? '#67f0cc' : '#ff6674';
    ctx.fillStyle = valid ? 'rgba(103,240,204,.12)' : 'rgba(255,102,116,.12)';
    ctx.lineWidth = 2 / game.camera.zoom;
    ctx.beginPath(); ctx.arc(x, y, def.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    let previewRange = def.range || (type === 'hive' ? BUILDINGS.hive.range : 0);
    if (type === 'energyGenerator') previewRange = getGeneratorRange(PLAYER_ID);
    else if (type === 'energyFieldNode') previewRange = DIRECTED_ENERGY_BALANCE.nodeConnectionRadius;
    else if (type === 'deathRayTower') previewRange = getDeathRayStats(PLAYER_ID).range;
    if (previewRange) {
      ctx.setLineDash([8 / game.camera.zoom, 7 / game.camera.zoom]);
      ctx.beginPath(); ctx.arc(x, y, previewRange, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (type === 'fortress') {
      ctx.strokeStyle = valid ? 'rgba(126,208,255,.65)' : 'rgba(255,102,116,.5)';
      ctx.setLineDash([4 / game.camera.zoom, 7 / game.camera.zoom]);
      ctx.beginPath(); ctx.arc(x, y, BUILDINGS.fortress.buildRange, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function updatePlacementBadge() {
    if (!game.buildMode || !game.mouse.inside || !game.started) {
      els.placementBadge.classList.add('hidden');
      return;
    }
    const result = checkPlacement(game.buildMode, game.mouse.worldX, game.mouse.worldY);
    els.placementBadge.style.left = `${game.mouse.x}px`;
    els.placementBadge.style.top = `${game.mouse.y}px`;
    els.placementBadge.style.color = result.valid ? '#67f0cc' : '#ff6674';
    els.placementBadge.textContent = `${BUILDINGS[game.buildMode].name} · ${result.reason}`;
    els.placementBadge.classList.remove('hidden');
  }

  function drawMinimap() {
    if (window.innerWidth < 760) return;
    const width = 186;
    const height = 112;
    const x = window.innerWidth / 2 - width / 2;
    const y = 96;
    ctx.fillStyle = 'rgba(5,14,17,.82)';
    ctx.strokeStyle = 'rgba(103,240,204,.22)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, width, height, 5); ctx.fill(); ctx.stroke();
    const sx = width / WORLD.width;
    const sy = height / WORLD.height;
    for (const b of game.buildings) {
      if (!b.alive || (b.type === 'landmine' && b.playerId !== PLAYER_ID)) continue;
      ctx.fillStyle = game.players[b.playerId].color;
      const size = b.type === 'capital' ? 5 : 2;
      ctx.fillRect(x + b.x * sx - size / 2, y + b.y * sy - size / 2, size, size);
    }
    const viewW = window.innerWidth / game.camera.zoom * sx;
    const viewH = window.innerHeight / game.camera.zoom * sy;
    ctx.strokeStyle = 'rgba(229,245,242,.52)';
    ctx.strokeRect(x + (game.camera.x - window.innerWidth / (2 * game.camera.zoom)) * sx, y + (game.camera.y - window.innerHeight / (2 * game.camera.zoom)) * sy, viewW, viewH);
  }

  function roundRect(context, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + w, y, x + w, y + h, radius);
    context.arcTo(x + w, y + h, x, y + h, radius);
    context.arcTo(x, y + h, x, y, radius);
    context.arcTo(x, y, x + w, y, radius);
    context.closePath();
  }

  function hexPath(context, x, y, r) {
    context.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) context.moveTo(px, py); else context.lineTo(px, py);
    }
    context.closePath();
  }

  function drawStar(context, cx, cy, spikes, outerRadius, innerRadius) {
    let rotation = Math.PI / 2 * 3;
    const step = Math.PI / spikes;
    context.beginPath();
    context.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      context.lineTo(cx + Math.cos(rotation) * outerRadius, cy + Math.sin(rotation) * outerRadius);
      rotation += step;
      context.lineTo(cx + Math.cos(rotation) * innerRadius, cy + Math.sin(rotation) * innerRadius);
      rotation += step;
    }
    context.lineTo(cx, cy - outerRadius);
    context.closePath();
  }

