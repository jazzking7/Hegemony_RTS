'use strict';

  // ---------------------------------------------------------------------------
  // Fixed-step loop
  // ---------------------------------------------------------------------------
  let previous = performance.now();
  let accumulator = 0;
  let hudAccumulator = 0;

  function frame(now) {
    const frameDt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    accumulator += frameDt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      update(FIXED_DT);
      accumulator -= FIXED_DT;
      hudAccumulator += FIXED_DT;
      steps++;
    }
    // Drop excessive catch-up time under heavy load instead of entering a
    // self-amplifying fixed-step spiral that makes the tab appear frozen.
    if (steps === MAX_STEPS_PER_FRAME && accumulator >= FIXED_DT) accumulator = 0;
    if (hudAccumulator >= 0.16) {
      updateHUD();
      hudAccumulator = 0;
    }
    draw();
    updateResearchProgressUI();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
