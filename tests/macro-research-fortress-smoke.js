'use strict';

const assert = require('assert');
const path = require('path');
const { bootProject, simulate } = require('./runtime-harness');
const ROOT = path.resolve(__dirname, '..');

function fresh(seed = 123456) {
  const context = bootProject(ROOT, seed);
  const debug = context.__RTS_DEBUG__;
  debug.game.enemyCount = 2;
  debug.resetGame();
  return { context, debug };
}
function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}
function clearGroundFacility(debug, facility) {
  facility.storedUnits = [];
  debug.syncGroundStorageCounts(facility);
  facility.queue = [];
  facility.queuePaidCosts = [];
  facility.queueBuildConfigs = [];
  facility.queueMeta = [];
  facility.queueProgress = 0;
}
function findFortressPoint(debug, playerId) {
  for (let y = 250; y <= 1950; y += 110) {
    for (let x = 250; x <= 3350; x += 110) {
      if (debug.checkPlacement('fortress', x, y, playerId).valid) return { x, y };
    }
  }
  return null;
}

test('Research Centers cap at two and all providers feed one globally modified research pool', () => {
  const { debug } = fresh();
  const p = debug.game.players[0];
  p.money = 100000;
  debug.completeResearch(0, 'advancedEngineering', { silent:true });
  debug.completeResearch(0, 'aeUnlockResearchCenter', { silent:true });
  debug.completeResearch(0, 'aeRCSpeed1', { silent:true });
  debug.completeResearch(0, 'aeRCCost', { silent:true });
  debug.completeResearch(0, 'aeRCSlot', { silent:true });
  debug.completeResearch(0, 'aeRCSpeed2', { silent:true });

  const rc1 = debug.createBuilding('researchCenter', 0, p.capital.x + 240, p.capital.y - 210);
  const rc2 = debug.createBuilding('researchCenter', 0, p.capital.x + 310, p.capital.y + 210);
  assert(rc1 && rc2);
  assert.equal(debug.getResearchSlotCount(0), 10); // Capital 2 + two upgraded RCs × 4.
  assert.equal(debug.checkPlacement('researchCenter', p.capital.x, p.capital.y, 0).valid, false);
  assert.match(debug.checkPlacement('researchCenter', p.capital.x, p.capital.y, 0).reason, /limit/i);

  debug.completeResearch(0, 'mechanizedWarfare', { silent:true });
  const capProvider = debug.getResearchProviders(0).find(x => x.type === 'capital');
  const rcProvider = debug.getResearchProviders(0).find(x => x.type === 'researchCenter');
  const capDuration = debug.getResearchDuration(0, 'mwUnlockAPC', capProvider.id);
  const rcDuration = debug.getResearchDuration(0, 'mwUnlockAPC', rcProvider.id);
  assert.equal(capDuration, rcDuration);
  assert(capDuration < 60, 'global Advanced Engineering speed should accelerate Capital-backed research too');

  assert(debug.startResearch(0, 'mwUnlockAPC').ok);
  assert(debug.startResearch(0, 'mwBetterArmour').ok);
  debug.completeResearch(0, 'droneWarfare', { silent:true });
  const third = debug.startResearch(0, 'dwUnlockDroneHub');
  assert(third.ok);
  const record = p.research.active.find(x => x.id === 'dwUnlockDroneHub');
  assert(record && record.providerType === 'researchCenter', 'shared pool should automatically use the next free RC slot');
});

test('Fortress construction recognizes named Exosuit infantry as its ten-soldier construction force', () => {
  const { debug } = fresh();
  const p = debug.game.players[0];
  p.money = 100000;
  const base = debug.game.buildings.find(b => b.alive && b.playerId === 0 && b.type === 'militaryBase');
  clearGroundFacility(debug, base);
  for (let i = 0; i < 10; i++) {
    const record = debug.createAndStoreUnit(base, 'elite', {
      variantId: 'loadout:fortress-test',
      configuration: { advancedInfantry:true, loadoutId:'fortress-test', loadoutName:'Fortress Test' }
    });
    assert(record);
  }
  const point = findFortressPoint(debug, 0);
  assert(point, 'expected a valid Fortress point');
  const fort = debug.placeBuilding('fortress', point.x, point.y, 0);
  assert(fort && fort.allowGarrisonConstruction);
  assert.equal(fort.builderIds.length, 10);
  const builders = fort.builderIds.map(id => debug.game.entityById.get(id));
  assert(builders.every(u => u?.variantId === 'loadout:fortress-test'));
});

test('Advanced Engineers construct a Fortress without a garrison at two percent per engineer per second', () => {
  const { debug } = fresh();
  const p = debug.game.players[0];
  p.money = 100000;
  for (const facility of debug.game.buildings.filter(b => b.alive && b.playerId === 0 && ['militaryBase','superiorMobilizationComplex'].includes(b.type))) clearGroundFacility(debug, facility);
  debug.completeResearch(0, 'advancedEngineering', { silent:true });
  debug.completeResearch(0, 'aeUnlockComplex', { silent:true });
  const complex = debug.createBuilding('advancedEngineeringComplex', 0, p.capital.x + 220, p.capital.y + 220);
  assert(complex);
  const engineers = [];
  for (let i = 0; i < 5; i++) engineers.push(debug.createUnit('advancedEngineer', 0, complex.x + i * 3, complex.y + i * 3, { homeComplexId:complex.id, engineerMode:'search' }));
  assert.equal(debug.getAvailableAdvancedEngineerCount(0), 5);
  const point = findFortressPoint(debug, 0);
  assert(point);
  const fort = debug.placeBuilding('fortress', point.x, point.y, 0);
  assert(fort && fort.allowGarrisonConstruction === false);
  assert.equal(fort.builderIds.length, 0);

  for (let i = 0; i < engineers.length; i++) {
    engineers[i].x = fort.x + fort.radius + 8 + i;
    engineers[i].y = fort.y;
    engineers[i].engineerTargetId = fort.id;
    engineers[i].engineerMode = 'fortressConstruction';
  }
  for (let step = 0; step < 102 && fort.constructionState !== 'operational'; step++) {
    for (const engineer of engineers) if (engineer.alive) debug.updateAdvancedEngineerUnit(engineer, 0.1);
    debug.updateFortresses(0.1);
  }
  assert.equal(fort.constructionState, 'operational');
  assert.equal(fort.garrisonIds.length, 0);
});

test('Military Base storage is hard-capped at 80 and a full base pauses training completion', () => {
  const { debug } = fresh();
  const base = debug.game.buildings.find(b => b.alive && b.playerId === 0 && b.type === 'militaryBase');
  clearGroundFacility(debug, base);
  assert.equal(debug.getGroundFacilityStorageCapacity(base), 80);
  for (let i = 0; i < 80; i++) assert(debug.createAndStoreUnit(base, 'basic'));
  assert.equal(debug.getGroundFacilityStoredCount(base), 80);
  assert.equal(debug.createAndStoreUnit(base, 'basic'), null);
  base.queue.push('basic');
  base.queuePaidCosts.push(15);
  base.queueBuildConfigs.push(null);
  base.queueMeta.push(null);
  base.queueProgress = 0;
  debug.updateTraining(30);
  assert.equal(base.queue.length, 1);
  assert.equal(base.queueProgress, 0);
  assert.equal(debug.getGroundFacilityStoredCount(base), 80);
});

test('Seeded AI macro builds a sustainable economy/defense while major attack orders are human-paced', () => {
  const { debug } = fresh(123456);
  simulate(debug, 200);
  const ai = debug.game.players[1];
  const owned = debug.game.buildings.filter(b => b.alive && b.playerId === ai.id);
  const settlements = owned.filter(b => b.type === 'city' || b.type === 'megacity');
  const defenses = owned.filter(b => ['machineGun','cannon','mortar','hive','airDefense'].includes(b.type));
  assert(settlements.length >= 3, 'AI should establish a broader economy by 200s');
  assert(debug.calculateIncome(ai.id) >= 800, 'AI should reach meaningful sustained income');
  assert(defenses.length >= 2, 'AI should layer defenses instead of spending only on attacks');
  assert(ai.ai.attackTimer > 0, 'major attack planner should be throttled between decisions');
});

console.log('PASS full macro/research/Fortress adjustment smoke');
