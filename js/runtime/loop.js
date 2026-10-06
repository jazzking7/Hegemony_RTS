'use strict';

  // ---------------------------------------------------------------------------
  // Fixed-step loop
  // ---------------------------------------------------------------------------
  let previous = performance.now();
  let accumulator = 0;
  let hudAccumulator = 0;
  let networkSimulationTick = 0;

  function frame(now) {
    const frameDt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    let steps = 0;
    if (NETWORK_MATCH) {
      const bridge = window.__FULL_NETWORK_BRIDGE__;
      const targetTick = bridge?.getTargetTick?.() || 0;
      const stepLimit = networkSimulationTick + 90 < targetTick ? 90 : 12;
      while (networkSimulationTick < targetTick && steps < stepLimit) {
        const nextTick = networkSimulationTick + 1;
        bridge?.applyCommandsForTick?.(nextTick);
        update(FIXED_DT);
        networkSimulationTick = nextTick;
        hudAccumulator += FIXED_DT;
        steps++;
      }
      bridge?.setSimulationTick?.(networkSimulationTick);
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
