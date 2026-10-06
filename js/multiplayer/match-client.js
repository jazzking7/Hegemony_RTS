const UNIT_COSTS = Object.freeze({ infantry: 50, tank: 140 });

export function createMatchController({ elements, send, getSessionId }) {
  const canvas = elements.battlefieldCanvas;
  const context = canvas.getContext('2d');
  const selected = new Set();
  const displayEntities = new Map();
  const keys = new Set();
  const camera = { x: 0, y: 0, zoom: 0.72 };
  let snapshot = null;
  let active = false;
  let cameraInitialized = false;
  let drag = null;
  let bannerTimer = null;
  let lastFrame = performance.now();

  function start() {
    active = true;
    cameraInitialized = false;
    selected.clear();
    elements.matchBanner.classList.add('hidden');
    canvas.focus();
  }

  function update(nextSnapshot) {
    snapshot = nextSnapshot;
    elements.serverTick.textContent = String(nextSnapshot.tick ?? 0);
    const liveIds = new Set(nextSnapshot.entities.map(entity => entity.id));
    nextSnapshot.entities.forEach(entity => {
      const displayed = displayEntities.get(entity.id);
      if (displayed) {
        displayed.targetX = entity.x;
        displayed.targetY = entity.y;
        Object.assign(displayed, entity, { x: displayed.x, y: displayed.y, targetX: entity.x, targetY: entity.y });
      } else {
        displayEntities.set(entity.id, { ...entity, targetX: entity.x, targetY: entity.y });
      }
    });
    displayEntities.forEach((_entity, id) => {
      if (!liveIds.has(id)) displayEntities.delete(id);
    });
    selected.forEach(id => { if (!liveIds.has(id)) selected.delete(id); });

    const me = nextSnapshot.players.find(player => player.id === getSessionId());
    elements.matchMoney.textContent = `$${me?.money ?? 0}`;
    elements.selectedCount.textContent = String(selected.size);
    elements.trainInfantry.disabled = !me?.alive || (me?.money ?? 0) < UNIT_COSTS.infantry || Boolean(nextSnapshot.winnerId);
    elements.trainTank.disabled = !me?.alive || (me?.money ?? 0) < UNIT_COSTS.tank || Boolean(nextSnapshot.winnerId);
    renderRoster(nextSnapshot.players);

    if (!cameraInitialized) {
      const capital = nextSnapshot.entities.find(entity => entity.playerId === getSessionId() && entity.type === 'capital');
      if (capital) {
        camera.x = capital.x;
        camera.y = capital.y;
        camera.zoom = nextSnapshot.map.size === 'large' ? 0.58 : 0.72;
        cameraInitialized = true;
      }
    }
  }

  function end(result) {
    const won = result.winnerId === getSessionId();
    showBanner(won ? 'VICTORY — YOUR CAPITAL ENDURES' : `${result.winnerName.toUpperCase()} WINS`, won ? '' : 'error', true);
    elements.trainInfantry.disabled = true;
    elements.trainTank.disabled = true;
  }

  function showNotice(message) {
    showBanner(message, 'error', false);
  }

  function showBanner(message, kind = '', persistent = false) {
    clearTimeout(bannerTimer);
    elements.matchBanner.textContent = message;
    elements.matchBanner.className = `match-banner ${kind}`.trim();
    if (!persistent) bannerTimer = setTimeout(() => elements.matchBanner.classList.add('hidden'), 1800);
  }

  function train(unitType) {
    if (!active) return;
    send({ kind: 'train', unitType });
  }

  function renderRoster(players) {
    const fragment = document.createDocumentFragment();
    players.forEach(player => {
      const item = document.createElement('span');
      if (!player.alive) item.classList.add('eliminated');
      const dot = document.createElement('i');
      dot.style.setProperty('--commander-color', player.color);
      item.append(dot, `${player.name}${player.isAi ? ' [AI]' : ''} · ${player.unitCount}`);
      fragment.append(item);
    });
    elements.matchRoster.replaceChildren(fragment);
  }

  function resizeCanvas() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const targetWidth = Math.round(width * ratio);
    const targetHeight = Math.round(height * ratio);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width, height };
  }

  function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    if (active) {
      updateCamera(dt);
      render();
    }
    requestAnimationFrame(frame);
  }

  function updateCamera(dt) {
    if (!snapshot) return;
    const speed = 720 / camera.zoom * dt;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) camera.x -= speed;
    if (keys.has('KeyD') || keys.has('ArrowRight')) camera.x += speed;
    if (keys.has('KeyW') || keys.has('ArrowUp')) camera.y -= speed;
    if (keys.has('KeyS') || keys.has('ArrowDown')) camera.y += speed;
    camera.x = clamp(camera.x, 0, snapshot.map.width);
    camera.y = clamp(camera.y, 0, snapshot.map.height);
  }

  function render() {
    const viewport = resizeCanvas();
    context.clearRect(0, 0, viewport.width, viewport.height);
    context.fillStyle = '#061215';
    context.fillRect(0, 0, viewport.width, viewport.height);
    if (!snapshot) {
      context.fillStyle = '#88a8a2';
      context.font = '12px ui-monospace, monospace';
      context.textAlign = 'center';
      context.fillText('WAITING FOR AUTHORITATIVE SNAPSHOT', viewport.width / 2, viewport.height / 2);
      return;
    }

    context.save();
    context.translate(viewport.width / 2, viewport.height / 2);
    context.scale(camera.zoom, camera.zoom);
    context.translate(-camera.x, -camera.y);
    drawWorld(viewport);
    context.restore();
    drawSelectionBox();
    drawMinimap(viewport);
  }

  function drawWorld(viewport) {
    const map = snapshot.map;
    const halfWidth = viewport.width / camera.zoom / 2;
    const halfHeight = viewport.height / camera.zoom / 2;
    const left = Math.max(0, camera.x - halfWidth);
    const right = Math.min(map.width, camera.x + halfWidth);
    const top = Math.max(0, camera.y - halfHeight);
    const bottom = Math.min(map.height, camera.y + halfHeight);

    context.fillStyle = '#07171a';
    context.fillRect(0, 0, map.width, map.height);
    context.strokeStyle = 'rgba(103,240,204,.075)';
    context.lineWidth = 1 / camera.zoom;
    context.beginPath();
    for (let x = Math.floor(left / 200) * 200; x <= right; x += 200) {
      context.moveTo(x, top); context.lineTo(x, bottom);
    }
    for (let y = Math.floor(top / 200) * 200; y <= bottom; y += 200) {
      context.moveTo(left, y); context.lineTo(right, y);
    }
    context.stroke();
    context.strokeStyle = 'rgba(103,240,204,.38)';
    context.lineWidth = 3 / camera.zoom;
    context.strokeRect(0, 0, map.width, map.height);

    for (const entity of displayEntities.values()) {
      entity.x += (entity.targetX - entity.x) * 0.28;
      entity.y += (entity.targetY - entity.y) * 0.28;
      drawEntity(entity);
    }
  }

  function drawEntity(entity) {
    const player = snapshot.players.find(candidate => candidate.id === entity.playerId);
    if (!player) return;
    const own = entity.playerId === getSessionId();
    const isSelected = selected.has(entity.id);
    context.save();
    context.translate(entity.x, entity.y);
    context.rotate(entity.heading || 0);
    if (entity.type === 'capital') {
      context.strokeStyle = `${player.color}55`;
      context.lineWidth = 2 / camera.zoom;
      context.beginPath(); context.arc(0, 0, 300, 0, Math.PI * 2); context.stroke();
      context.fillStyle = '#0c2428';
      context.strokeStyle = player.color;
      context.lineWidth = 4 / camera.zoom;
      context.beginPath();
      for (let point = 0; point < 6; point++) {
        const angle = point * Math.PI / 3;
        const x = Math.cos(angle) * entity.radius;
        const y = Math.sin(angle) * entity.radius;
        if (!point) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.closePath(); context.fill(); context.stroke();
      context.fillStyle = player.color;
      context.fillRect(-15, -15, 30, 30);
    } else if (entity.type === 'tank') {
      context.fillStyle = player.color;
      context.fillRect(-entity.radius, -entity.radius * .72, entity.radius * 2, entity.radius * 1.44);
      context.fillStyle = '#071215';
      context.fillRect(-5, -7, 17, 14);
      context.strokeStyle = player.color;
      context.lineWidth = 4 / camera.zoom;
      context.beginPath(); context.moveTo(6, 0); context.lineTo(entity.radius + 11, 0); context.stroke();
    } else {
      context.fillStyle = player.color;
      context.beginPath();
      context.moveTo(entity.radius + 4, 0);
      context.lineTo(-entity.radius, entity.radius * .8);
      context.lineTo(-entity.radius, -entity.radius * .8);
      context.closePath(); context.fill();
    }
    if (own && isSelected) {
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2 / camera.zoom;
      context.beginPath(); context.arc(0, 0, entity.radius + 8, 0, Math.PI * 2); context.stroke();
    }
    context.restore();

    if (entity.hp < entity.maxHp || isSelected || entity.type === 'capital') {
      const width = entity.type === 'capital' ? 92 : Math.max(28, entity.radius * 2.3);
      const height = 5 / camera.zoom;
      const y = entity.y - entity.radius - 14 / camera.zoom;
      context.fillStyle = 'rgba(0,0,0,.7)';
      context.fillRect(entity.x - width / 2, y, width, height);
      context.fillStyle = entity.hp / entity.maxHp > .35 ? player.color : '#ff6674';
      context.fillRect(entity.x - width / 2, y, width * Math.max(0, entity.hp / entity.maxHp), height);
    }
  }

  function drawSelectionBox() {
    if (!drag || drag.mode !== 'select' || !drag.moved) return;
    const x = Math.min(drag.startX, drag.x);
    const y = Math.min(drag.startY, drag.y);
    const width = Math.abs(drag.x - drag.startX);
    const height = Math.abs(drag.y - drag.startY);
    context.fillStyle = 'rgba(103,240,204,.08)';
    context.strokeStyle = '#67f0cc';
    context.lineWidth = 1;
    context.fillRect(x, y, width, height);
    context.strokeRect(x, y, width, height);
  }

  function drawMinimap(viewport) {
    if (!snapshot) return;
    const width = Math.min(190, viewport.width * .25);
    const height = width * snapshot.map.height / snapshot.map.width;
    const x = 12;
    const y = viewport.height - height - 12;
    context.fillStyle = 'rgba(3,12,14,.82)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = 'rgba(103,240,204,.45)';
    context.strokeRect(x, y, width, height);
    for (const entity of displayEntities.values()) {
      const player = snapshot.players.find(candidate => candidate.id === entity.playerId);
      context.fillStyle = player?.color || '#fff';
      const size = entity.type === 'capital' ? 5 : 2;
      context.fillRect(x + entity.x / snapshot.map.width * width - size / 2, y + entity.y / snapshot.map.height * height - size / 2, size, size);
    }
    const viewWidth = viewport.width / camera.zoom / snapshot.map.width * width;
    const viewHeight = viewport.height / camera.zoom / snapshot.map.height * height;
    context.strokeStyle = '#ffffff';
    context.strokeRect(
      x + camera.x / snapshot.map.width * width - viewWidth / 2,
      y + camera.y / snapshot.map.height * height - viewHeight / 2,
      viewWidth,
      viewHeight
    );
  }

  function pointerPosition(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function screenToWorld(point) {
    return {
      x: camera.x + (point.x - canvas.clientWidth / 2) / camera.zoom,
      y: camera.y + (point.y - canvas.clientHeight / 2) / camera.zoom
    };
  }

  function selectAt(point, additive) {
    if (!snapshot) return;
    const world = screenToWorld(point);
    const candidates = [...displayEntities.values()]
      .filter(entity => entity.playerId === getSessionId() && entity.type !== 'capital')
      .map(entity => ({ entity, distance: Math.hypot(entity.x - world.x, entity.y - world.y) }))
      .filter(candidate => candidate.distance <= 24 / camera.zoom + candidate.entity.radius)
      .sort((a, b) => a.distance - b.distance);
    if (!additive) selected.clear();
    if (candidates[0]) selected.add(candidates[0].entity.id);
    elements.selectedCount.textContent = String(selected.size);
  }

  function selectBox(additive) {
    if (!snapshot || !drag) return;
    const start = screenToWorld({ x: Math.min(drag.startX, drag.x), y: Math.min(drag.startY, drag.y) });
    const end = screenToWorld({ x: Math.max(drag.startX, drag.x), y: Math.max(drag.startY, drag.y) });
    if (!additive) selected.clear();
    displayEntities.forEach(entity => {
      if (entity.playerId === getSessionId() && entity.type !== 'capital' && entity.x >= start.x && entity.x <= end.x && entity.y >= start.y && entity.y <= end.y) selected.add(entity.id);
    });
    elements.selectedCount.textContent = String(selected.size);
  }

  canvas.addEventListener('pointerdown', event => {
    if (!active || event.button !== 0 && event.button !== 1) return;
    const point = pointerPosition(event);
    drag = { mode: event.button === 1 ? 'pan' : 'select', startX: point.x, startY: point.y, x: point.x, y: point.y, moved: false, cameraX: camera.x, cameraY: camera.y };
    canvas.setPointerCapture(event.pointerId);
    canvas.focus();
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag) return;
    const point = pointerPosition(event);
    drag.x = point.x; drag.y = point.y;
    drag.moved ||= Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 5;
    if (drag.mode === 'pan') {
      camera.x = drag.cameraX - (drag.x - drag.startX) / camera.zoom;
      camera.y = drag.cameraY - (drag.y - drag.startY) / camera.zoom;
    }
  });
  canvas.addEventListener('pointerup', event => {
    if (!drag) return;
    if (drag.mode === 'select') {
      if (drag.moved) selectBox(event.shiftKey); else selectAt({ x: drag.x, y: drag.y }, event.shiftKey);
    }
    drag = null;
  });
  canvas.addEventListener('contextmenu', event => {
    event.preventDefault();
    if (!snapshot || !selected.size) return;
    const destination = screenToWorld(pointerPosition(event));
    send({ kind: 'move', entityIds: [...selected], x: destination.x, y: destination.y });
  });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    camera.zoom = clamp(camera.zoom * Math.exp(-event.deltaY * 0.001), 0.28, 1.45);
  }, { passive: false });
  window.addEventListener('keydown', event => {
    if (!active) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Digit1') train('infantry');
    if (event.code === 'Digit2') train('tank');
    if (event.code === 'Space' && snapshot) {
      selected.clear();
      snapshot.entities.forEach(entity => {
        if (entity.playerId === getSessionId() && entity.type !== 'capital') selected.add(entity.id);
      });
      elements.selectedCount.textContent = String(selected.size);
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  elements.trainInfantry.addEventListener('click', () => train('infantry'));
  elements.trainTank.addEventListener('click', () => train('tank'));
  requestAnimationFrame(frame);

  return { start, update, end, showNotice };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}
