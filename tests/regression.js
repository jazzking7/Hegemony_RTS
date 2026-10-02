'use strict';

const assert = require('assert');
const path = require('path');
const { bootProject, snapshot, simulate, snapshotHash } = require('./runtime-harness');

const ROOT = path.resolve(__dirname, '..');
const EXPECTED_BASELINE_HASH = '0d03e02bb72f7edfa567fafe0098d686d7629ca41fbf536a73d4b9a2bc9173e1';

function fresh(seed = 123456) {
  const context = bootProject(ROOT, seed);
  const debug = context.__RTS_DEBUG__;
  debug.game.enemyCount = 2;
  debug.resetGame();
  return { context, debug };
}

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    throw error;
  }
}

test('plain modular runtime boots and exposes debug API', () => {
  const { debug } = fresh();
  assert.equal(debug.game.started, true);
  assert.equal(debug.game.players.length, 3);
});


test('Capital provides the guaranteed $100/min baseline income', () => {
  const { debug } = fresh();
  assert.equal(debug.calculateIncome(0), 200); // Capital $100 + starting City $100.
  const city = debug.game.buildings.find(b => b.alive && b.playerId === 0 && b.type === 'city');
  debug.destroyEntity(city);
  assert.equal(debug.calculateIncome(0), 100);
});

test('AI immediately prioritizes rebuilding its last destroyed Military Base', () => {
  const { debug } = fresh();
  const ai = debug.game.players[1];
  for (const base of debug.game.buildings.filter(b => b.alive && b.playerId === ai.id && b.type === 'militaryBase')) debug.destroyEntity(base);
  ai.money = 250;
  debug.aiBuild(ai);
  assert(debug.game.buildings.some(b => b.alive && b.playerId === ai.id && b.type === 'militaryBase'));
  assert.equal(ai.money, 50);
});

test('AI research uses normal DR/SR progression and prerequisites', () => {
  const { debug } = fresh(12345);
  const ai = debug.game.players[1];
  ai.money = 10000;
  debug.aiResearch(ai);
  const dr = ai.research.active.find(record => record.kind === 'DR');
  assert(dr, 'AI should start one implemented doctrine research');
  for (let i = 0; i < 3100; i++) debug.updateResearch(1 / 30);
  assert(debug.isDoctrineUnlocked(ai.id, dr.id));
  debug.aiResearch(ai);
  assert(ai.research.active.some(record => record.kind === 'SR'));
});

test('AI specialization checkpoint requires a completed branch plus meaningful SR depth', () => {
  const { debug } = fresh();
  const ai = debug.game.players[1];
  debug.completeResearch(ai.id, 'mechanizedWarfare');
  debug.completeResearch(ai.id, 'mwBetterArmour');
  debug.completeResearch(ai.id, 'mwStrongerEngine');
  debug.completeResearch(ai.id, 'mwTorrentOfSteel');
  assert.equal(debug.aiHasSubstantialResearch(ai, 'mechanizedWarfare'), false);
  debug.completeResearch(ai.id, 'mwUnlockAPC');
  assert.equal(debug.aiHasSubstantialResearch(ai, 'mechanizedWarfare'), true);
});

test('AI can build newly unlocked doctrine facilities', () => {
  const { debug } = fresh();
  const ai = debug.game.players[1];
  ai.money = 10000;
  debug.completeResearch(ai.id, 'advancedEngineering');
  debug.completeResearch(ai.id, 'aeUnlockComplex');
  debug.aiBuild(ai);
  assert(debug.game.buildings.some(b => b.alive && b.playerId === ai.id && b.type === 'advancedEngineeringComplex'));
});


test('AI production pool adopts unlocked ground and aircraft units', () => {
  const { debug } = fresh(777);
  const ai = debug.game.players[1];
  ai.money = 100000;
  debug.completeResearch(ai.id, 'mechanizedWarfare');
  debug.completeResearch(ai.id, 'mwUnlockAPC');
  debug.completeResearch(ai.id, 'mwAPCSurvivability');
  debug.completeResearch(ai.id, 'mwAPCMobility');
  debug.completeResearch(ai.id, 'mwUnlockIFV');
  debug.completeResearch(ai.id, 'airDominance');
  debug.completeResearch(ai.id, 'adUnlockFighter');
  debug.completeResearch(ai.id, 'adUnlockParatrooper');
  const cap = ai.capital;
  debug.createBuilding('airbase', ai.id, cap.x + 300, cap.y + 220);
  for (let i = 0; i < 80; i++) debug.aiTrain(ai, false);
  const bases = debug.game.buildings.filter(b => b.alive && b.playerId === ai.id && b.type === 'militaryBase');
  const airbase = debug.game.buildings.find(b => b.alive && b.playerId === ai.id && b.type === 'airbase');
  assert(bases.some(base => base.queue.includes('apc') || base.queue.includes('ifv')));
  assert(airbase.queue.some(type => type === 'superFighter' || type === 'paratrooperPlane'));
});

test('research baseline remains 2 Capital slots / $500 DR / 100s DR / $100 SR / 60s SR', () => {
  const { debug } = fresh();
  assert.equal(debug.getResearchSlotCount(0), 2);
  assert.equal(debug.getResearchCost(0, 'mechanizedWarfare'), 500);
  assert.equal(debug.getResearchDuration(0, 'mechanizedWarfare'), 100);
  assert.equal(debug.getResearchCost(0, 'mwUnlockAPC'), 100);
  assert.equal(debug.getResearchDuration(0, 'mwUnlockAPC'), 60);
});

test('Armored property still reduces a normal 100-damage hit to 80', () => {
  const { debug } = fresh();
  const tank = debug.createUnit('tank', 0, 1000, 1000);
  const before = tank.hp;
  debug.applyDamage(tank, 100, 1);
  assert.equal(Math.round((before - tank.hp) * 1000) / 1000, 80);
});

test('homing AA impact consumes lethal missile and companion missiles targeting the dead aircraft', () => {
  const { debug } = fresh();
  const tower = debug.createBuilding('airDefense', 0, 800, 800);
  const fighter = debug.createUnit('superFighter', 1, 850, 800);
  fighter.hp = 100;
  fighter.maxHp = 100;
  assert.equal(debug.launchAAMissile(tower, fighter, 0), true);
  assert.equal(debug.launchAAMissile(tower, fighter, 0), true);
  for (let i = 0; i < 120 && fighter.alive; i++) debug.updateProjectiles(1 / 30);
  // One extra update performs dead-target cleanup for any companion missile.
  debug.updateProjectiles(1 / 30);
  assert.equal(fighter.alive, false);
  assert.equal(debug.game.projectiles.filter(p => p.kind === 'aaMissile').length, 0);
  assert.equal(tower.aaActiveMissiles, 0);
});



test('Command & Automation doctrine exposes the complete 24-node SR tree', () => {
  const { debug } = fresh();
  const nodes = Object.values(debug.SPECIALIZED_RESEARCH).filter(row => row.doctrine === 'commandAutomation');
  assert.equal(nodes.length, 24);
  debug.completeResearch(0, 'commandAutomation');
  assert.equal(debug.hasResearchCapability(0, 'focusedMission'), true);
  assert.equal(debug.hasResearchCapability(0, 'scheduledDeployment'), true);
});

test('Focused Mission applies travel bonuses then permanent arrival damage bonuses', () => {
  const { debug } = fresh();
  debug.completeResearch(0, 'commandAutomation');
  for (const id of ['caFocusedDamage1','caFocusedSpeed1','caFocusedDamage2','caFocusedSpeed2']) debug.completeResearch(0, id);
  const unit = debug.createUnit('basic', 0, 1000, 1000);
  const baseSpeed = debug.getEntityStat(unit, 'speed', 76);
  const baseDamage = debug.getEntityStat(unit, 'damage', 13);
  debug.applyFocusedMission(unit, 1300, 1000);
  assert.equal(Math.round(debug.getEntityStat(unit, 'speed', 76) * 1000), Math.round(baseSpeed * 1.15 * 1000));
  debug.completeFocusedMission(unit);
  assert.equal(Math.round(debug.getEntityStat(unit, 'speed', 76) * 1000), Math.round(baseSpeed * 1000));
  assert.equal(Math.round(debug.getEntityStat(unit, 'damage', 13) * 1000), Math.round(baseDamage * 1.15 * 1000));
});

test('Scheduled Deployment production receives its dedicated discount and speed metadata', () => {
  const { debug } = fresh();
  const player = debug.game.players[0]; player.money = 100000;
  debug.completeResearch(0, 'commandAutomation');
  debug.completeResearch(0, 'caScheduledDiscount');
  debug.completeResearch(0, 'caScheduledSpeed');
  const base = debug.game.buildings.find(b => b.alive && b.playerId === 0 && b.type === 'militaryBase');
  debug.setScheduledDeployment(0, { name:'Regression Schedule', waits:[2,3], nodes:[
    { domain:'ground', focused:false, ground:{basic:12}, air:{}, escortsPerAircraft:0 },
    { domain:'ground', focused:true, ground:{elite:3}, air:{}, escortsPerAircraft:0 },
    { domain:'ground', focused:false, ground:{tank:2}, air:{}, escortsPerAircraft:0 }
  ]});
  const before = base.queue.length;
  const result = debug.trainScheduledDeployment(0);
  assert(result.queued > 0);
  assert.equal(base.queueMeta[before].source, 'scheduled');
  assert.equal(base.queueMeta[before].trainingTimeMultiplier, 0.9);
  const baseCost = debug.getTrainingPackageCost(0, base.queue[before], null);
  assert(Math.abs(base.queuePaidCosts[before] - baseCost * 0.95) < 0.001);
});

test('Advanced Coordination Center bandwidth, initiation fee, pause and cancel semantics work', () => {
  const { debug } = fresh();
  const player = debug.game.players[0]; player.money = 100000;
  debug.completeResearch(0, 'commandAutomation'); debug.completeResearch(0, 'caUnlockCoordinationCenter');
  const base = debug.game.buildings.find(b => b.alive && b.playerId === 0 && b.type === 'militaryBase');
  const center = debug.createBuilding('advancedCoordinationCenter', 0, player.capital.x + 260, player.capital.y + 260);
  assert.equal(debug.getCoordinationCenterBandwidth(center), 1);
  const cost = debug.getRoutineSetCost(0, {kind:'theater', templateType:'focused', composition:{basic:2}});
  const moneyBefore = player.money;
  const result = debug.createAutomatedWarfare(center, {kind:'theater', facilityId:base.id, templateType:'focused', composition:{basic:2}, focused:true, targetX:2500, targetY:1100});
  assert(result.ok);
  assert.equal(Math.round((moneyBefore - player.money) * 1000), Math.round(cost * 1000));
  assert.equal(debug.getCoordinationCenterUsedBandwidth(center), 1);
  assert.equal(debug.createAutomatedWarfare(center, {kind:'theater', facilityId:base.id, templateType:'focused', composition:{basic:1}, focused:true, targetX:2500, targetY:1100}).ok, false);
  debug.pauseAutomatedWarfare(center, result.routine.id, true);
  assert.equal(debug.getCoordinationCenterUsedBandwidth(center), 1);
  debug.cancelAutomatedWarfare(center, result.routine.id);
  assert.equal(debug.getCoordinationCenterUsedBandwidth(center), 0);
});

test('Passengers unloaded at destination enter a persistent 200-radius assault zone; early unloads do not', () => {
  const { debug } = fresh();
  const transport = debug.createUnit('apc', 0, 1200, 1200);
  transport.transportMissionX = 1500; transport.transportMissionY = 1300; transport.orderX = 1500; transport.orderY = 1300;
  transport.cargoRecords = [debug.createUnitRecord('basic', 0)];
  const ids = new Set(debug.game.units.map(u => u.id));
  debug.unloadCargo(transport, false);
  const deployed = debug.game.units.find(u => u.alive && u.type === 'basic' && !ids.has(u.id));
  assert(deployed); assert.equal(deployed.assaultZoneRadius, 200); assert.equal(deployed.assaultZoneX, 1500); assert.equal(deployed.hasOrder, false);
  const emergency = debug.createUnit('apc', 0, 1200, 1200);
  emergency.transportMissionX = 1700; emergency.transportMissionY = 1400; emergency.orderX = 1700; emergency.orderY = 1400;
  emergency.cargoRecords = [debug.createUnitRecord('basic', 0)];
  const ids2 = new Set(debug.game.units.map(u => u.id));
  debug.unloadCargo(emergency, true);
  const released = debug.game.units.find(u => u.alive && u.type === 'basic' && !ids2.has(u.id));
  assert(released); assert.equal(released.assaultZoneRadius || 0, 0); assert.equal(released.orderX, 1700); assert.equal(released.hasOrder, true);
});

test('200-second seeded no-research simulation has only finite live entity state', () => {
  const { debug } = fresh();
  simulate(debug, 200);
  for (const entity of [...debug.game.buildings, ...debug.game.units]) {
    if (!entity.alive) continue;
    assert(Number.isFinite(entity.x));
    assert(Number.isFinite(entity.y));
    assert(Number.isFinite(entity.hp));
    assert(entity.hp > 0);
  }
  assert(debug.game.liveEntityCount <= 1000);
});

test('200-second seeded AI/economy baseline simulation signature is stable', () => {
  const { debug } = fresh();
  simulate(debug, 200);
  const hash = snapshotHash(snapshot(debug));
  assert.equal(hash, EXPECTED_BASELINE_HASH);
});

console.log('\nAll architecture regression tests passed.');
