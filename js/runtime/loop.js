'use strict';

  // ---------------------------------------------------------------------------
  // Fixed-step loop
  // ---------------------------------------------------------------------------
  let previous = performance.now();
  let accumulator = 0;
  let hudAccumulator = 0;
  let networkSimulationTick = 0;
  let networkPresentationTick = 0;

  function frame(now) {
    const frameDt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    let steps = 0;
    if (NETWORK_MATCH) {
      const bridge = window.__FULL_NETWORK_BRIDGE__;
      const targetTick = bridge?.getTargetTick?.() || 0;
      // Tick messages cover three simulation steps. Consume that buffer over
      // real time instead of running the entire packet on its arrival frame.
      const backlog = targetTick - networkPresentationTick;
      if (backlog > 30) networkPresentationTick = targetTick - 3;
      else networkPresentationTick = Math.min(targetTick, networkPresentationTick + frameDt / FIXED_DT * (backlog > 6 ? 1.1 : 1));
      const desiredTick = Math.min(targetTick, Math.ceil(networkPresentationTick));
      const catchupStarted = performance.now();
      while (networkSimulationTick < desiredTick && steps < 90) {
        const nextTick = networkSimulationTick + 1;
        captureNetworkRenderState();
        bridge?.applyCommandsForTick?.(nextTick);
        update(FIXED_DT);
        networkSimulationTick = nextTick;
        hudAccumulator += FIXED_DT;
        steps++;
        // Rejoining a long-running match must leave time to draw and handle input.
        if (performance.now() - catchupStarted >= 8) break;
      }
      bridge?.setSimulationTick?.(networkSimulationTick);
      networkRenderAlpha = clamp(networkPresentationTick - (networkSimulationTick - 1), 0, 1);
      updateCamera(frameDt);
      positionAttackMarker();
    } else {
      accumulator += frameDt;
      while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        update(FIXED_DT);
        accumulator -= FIXED_DT;
        hudAccumulator += FIXED_DT;
        steps++;
      }
      // Drop excessive catch-up time under heavy load instead of entering a
      // self-amplifying fixed-step spiral that makes the tab appear frozen.
      if (steps === MAX_STEPS_PER_FRAME && accumulator >= FIXED_DT) accumulator = 0;
    }
    if (hudAccumulator >= 0.16) {
      updateHUD();
      hudAccumulator = 0;
    }
    draw();
    updateResearchProgressUI();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
