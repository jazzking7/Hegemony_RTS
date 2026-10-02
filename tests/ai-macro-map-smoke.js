'use strict';

const assert = require('assert');
const path = require('path');
const { bootProject, simulate } = require('./runtime-harness');
const ROOT = path.resolve(__dirname, '..');

function fresh(seed = 123456, mapSize = 'standard', enemies = 2) {
  const context = bootProject(ROOT, seed);
  const d = context.__RTS_DEBUG__;
  d.game.enemyCount = enemies;
  d.game.mapSize = mapSize;
  d.resetGame();
  return { context, d };
}

function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}

test('map-size presets use exact 1.5x dimensions and resize navigation state', () => {
  const { d } = fresh(10101, 'large', 2);
  assert.equal(d.WORLD.width, 5400);
  assert.equal(d.WORLD.height, 3300);
  assert.equal(d.WORLD.width / d.MAP_SIZE_PRESETS.standard.width, 1.5);
  assert.equal(d.WORLD.height / d.MAP_SIZE_PRESETS.standard.height, 1.5);
  assert.equal(d.navGrid.cols, Math.ceil(5400 / d.navGrid.cellSize));
  assert.equal(d.navGrid.rows, Math.ceil(3300 / d.navGrid.cellSize));
  const human = d.game.players[0].capital;
  const enemy = d.game.players[1].capital;
  assert(Math.abs(human.x - 1020) < 1e-6);
  assert(enemy.x > 4300, 'large-map enemy start should scale outward instead of using standard-map coordinates');
});

test('standard map remains the original 3600x2200 battlefield', () => {
  const { d } = fresh(20202, 'standard', 1);
  assert.equal(d.WORLD.width, 3600);
  assert.equal(d.WORLD.height, 2200);
  assert(Math.abs(d.game.players[0].capital.x - 680) < 1e-6);
});

test('large-map AI establishes Megacities, production and layered defense instead of idling', () => {
  const { d } = fresh(123456, 'large', 2);
  simulate(d, 240);
  const ai = d.game.players[1];
  const owned = d.game.buildings.filter(b => b.alive && b.playerId === ai.id);
  const megacities = owned.filter(b => b.type === 'megacity');
  const groundBases = owned.filter(b => b.type === 'militaryBase');
  const defenses = owned.filter(b => ['machineGun','cannon','mortar','hive','airDefense'].includes(b.type));
  assert(megacities.length >= 3, `expected at least 3 Megacities, got ${megacities.length}`);
  assert(groundBases.length >= 2, `expected expanded ground production, got ${groundBases.length} Military Bases`);
  assert(defenses.length >= 6, `expected layered defenses, got ${defenses.length}`);
  assert(d.calculateIncome(ai.id) >= 2500, `expected strong cash flow, got ${d.calculateIncome(ai.id)}`);
  assert(ai.ai.macroActions >= 12, `expected frequent macro actions, got ${ai.ai.macroActions}`);
  const telemetry = d.getAIMacroTelemetry(ai);
  assert(telemetry.lastAction && telemetry.lastAction !== 'opening');
});

test('cash-rich researched AI still materializes doctrine infrastructure', () => {
  const { d } = fresh(30303, 'standard', 1);
  const ai = d.game.players[1];
  ai.money = 10000;
  d.completeResearch(ai.id, 'advancedEngineering', { silent: true });
  d.completeResearch(ai.id, 'aeUnlockComplex', { silent: true });
  assert(d.aiBuild(ai));
  assert(d.game.buildings.some(b => b.alive && b.playerId === ai.id && b.type === 'advancedEngineeringComplex'));
});

console.log('PASS full AI macro / map-size smoke');
