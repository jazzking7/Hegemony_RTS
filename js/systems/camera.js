'use strict';

  // ---------------------------------------------------------------------------
  // Coordinate conversion and camera
  // ---------------------------------------------------------------------------
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    els.canvas.width = Math.floor(width * dpr);
    els.canvas.height = Math.floor(height * dpr);
    els.canvas.style.width = `${width}px`;
    els.canvas.style.height = `${height}px`;
    els.canvas._dpr = dpr;
  }

  function screenToWorld(sx, sy) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    return {
      x: game.camera.x + (sx - cx) / game.camera.zoom,
      y: game.camera.y + (sy - cy) / game.camera.zoom
    };
  }

  function worldToScreen(x, y) {
    return {
      x: (x - game.camera.x) * game.camera.zoom + window.innerWidth / 2,
      y: (y - game.camera.y) * game.camera.zoom + window.innerHeight / 2
    };
  }

  function clampCamera() {
    const halfW = window.innerWidth / (2 * game.camera.zoom);
    const halfH = window.innerHeight / (2 * game.camera.zoom);
    game.camera.x = clamp(game.camera.x, halfW - 100, WORLD.width - halfW + 100);
    game.camera.y = clamp(game.camera.y, halfH - 100, WORLD.height - halfH + 100);
  }

  function updateCamera(dt) {
    if (!game.started) return;
    const speed = 650 / game.camera.zoom;
    let dx = 0;
    let dy = 0;
    if (game.keys.has('w') || game.keys.has('arrowup')) dy--;
    if (game.keys.has('s') || game.keys.has('arrowdown')) dy++;
    if (game.keys.has('a') || game.keys.has('arrowleft')) dx--;
    if (game.keys.has('d') || game.keys.has('arrowright')) dx++;

    if (!els.attackModal.classList.contains('hidden')) { dx = 0; dy = 0; }

    const margin = 18;
    if (game.mouse.inside && game.buildMode === null && els.attackModal.classList.contains('hidden')) {
      if (game.mouse.x < margin) dx--;
      if (game.mouse.x > window.innerWidth - margin) dx++;
      if (game.mouse.y < margin) dy--;
      if (game.mouse.y > window.innerHeight - margin) dy++;
    }

    if (dx || dy) {
      const n = normalize(dx, dy);
      game.camera.x += n.x * speed * dt;
      game.camera.y += n.y * speed * dt;
    }
    game.camera.zoom = lerp(game.camera.zoom, game.camera.targetZoom, 1 - Math.pow(0.001, dt));
    clampCamera();
  }

