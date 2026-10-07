'use strict';
const assert = require('assert');
const path = require('path');
const vm = require('vm');
const { bootProject, snapshot, snapshotHash } = require('./runtime-harness');
const ROOT = path.resolve(__dirname, '..');
const search = '?debug=1&network=1&player=0&humans=0%2C1&commanders=2&seed=77';

{
  const c = bootProject(ROOT, 77, search);
  const d = c.__RTS_DEBUG__;
  const unit = d.createUnit('basic', 0, 1000, 1000);
  unit.angle = Math.PI - 0.1;
  const projectile = { x: 1000, y: 1000, progress: 0, angle: 0 };
  d.game.projectiles.push(projectile);
  let steps = 0;
  c.update = () => { steps++; unit.x += 10; unit.angle = -Math.PI + 0.1; projectile.x += 20; projectile.progress += 0.1; };
  c.draw = () => {};
  const frame = c.__getFrameCallback();
  frame(0);
  c.__FULL_NETWORK_BRIDGE__.setTargetTick(3);
  frame(1000 / 60);
  assert.equal(steps, 1, 'A three-tick packet must not execute as a single burst');
  assert.equal(unit.x, 1010, 'Simulation advances a whole authoritative step');
  assert(Math.abs(c.getNetworkRenderEntity(unit).x - 1005) < 1e-8, 'Render position interpolates half a step');
  assert(Math.abs(c.getNetworkRenderEntity(unit).angle - Math.PI) < 1e-8, 'Turning uses the shortest arc');
  assert(Math.abs(c.getNetworkRenderEntity(projectile).x - 1010) < 1e-8, 'Projectiles interpolate too');
  assert.equal(unit.x, 1010, 'Rendering must not mutate simulation coordinates');
  for (let i = 2; i <= 12; i++) frame(i * 1000 / 60);
  assert.equal(steps, 3, 'Network stalls must not predict unconfirmed simulation ticks');
  assert.equal(c.getNetworkRenderEntity(unit).x, 1030, 'A stalled stream settles on the confirmed position');
  c.closeAttackModal();
  d.game.camera.x = 1500;
  const cameraX = d.game.camera.x;
  d.game.keys.add('d');
  frame(220);
  d.game.keys.delete('d');
  assert(d.game.camera.x > cameraX, 'Camera responds even while network ticks are stalled');
  c.captureNetworkRenderState();
  unit.x += 500;
  assert.strictEqual(c.getNetworkRenderEntity(unit), unit, 'Teleport-sized jumps snap instead of sweeping across the map');
}
console.log('PASS packet pacing, unit/projectile interpolation, short-angle turns, stalls and teleport handling');

{
  const paced = bootProject(ROOT, 77, search);
  const direct = bootProject(ROOT, 77, search);
  for (const c of [paced, direct]) {
    const base = c.__RTS_DEBUG__.game.buildings.find(b => b.type === 'militaryBase' && b.playerId === 0);
    c.__FULL_NETWORK_BRIDGE__.queueCommand({ sequence: 1, tick: 12, playerId: 0, command: { name: 'trainUnits', args: [{ $entity: base.id }, 'basic', 1] } });
  }
  paced.draw = () => {};
  const frame = paced.__getFrameCallback();
  let now = 0;
  frame(now);
  // Uneven delivery still produces the exact same sequence of simulation steps.
  for (let target = 3; target <= 60; target += 3) {
    paced.__FULL_NETWORK_BRIDGE__.setTargetTick(target);
    for (let i = 0; i < 8; i++) frame(now += [9, 27, 14, 21][i % 4]);
  }
  for (let tick = 1; tick <= 60; tick++) {
    direct.__FULL_NETWORK_BRIDGE__.applyCommandsForTick(tick);
    direct.__RTS_DEBUG__.update(1 / 30);
    direct.__FULL_NETWORK_BRIDGE__.setSimulationTick(tick);
  }
  assert.equal(paced.__FULL_NETWORK_BRIDGE__.getSimulationTick(), 60);
  assert.equal(snapshotHash(snapshot(paced.__RTS_DEBUG__)), snapshotHash(snapshot(direct.__RTS_DEBUG__)), 'Presentation timing must preserve deterministic game state');
  vm.runInContext('networkPresentationTick = 0; networkSimulationTick = 0;', paced);
  paced.__FULL_NETWORK_BRIDGE__.setTargetTick(600);
  frame(now += 16);
  assert(paced.__FULL_NETWORK_BRIDGE__.getSimulationTick() <= 90, 'Long catch-up is bounded per frame');
}
console.log('PASS uneven packet delivery preserves deterministic state and catch-up remains bounded');
