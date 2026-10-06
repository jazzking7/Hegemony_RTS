import assert from 'node:assert/strict';
import test from 'node:test';
import { MultiplayerWorld } from './MultiplayerWorld.js';

const commanders = [
  { id: 'host', name: 'Host', seat: 0, isAi: false },
  { id: 'guest', name: 'Guest', seat: 1, isAi: false }
];

test('world creates a full starting force for every commander', () => {
  const snapshot = new MultiplayerWorld({ mapSize: 'standard', seed: 7, commanders }).snapshot(0);
  assert.deepEqual(snapshot.map, { width: 3600, height: 2200, size: 'standard' });
  assert.equal(snapshot.players.length, 2);
  assert.equal(snapshot.entities.filter(entity => entity.type === 'capital').length, 2);
  assert.equal(snapshot.entities.filter(entity => entity.type !== 'capital').length, 12);
});

test('commands can only move units owned by their issuing commander', () => {
  const world = new MultiplayerWorld({ mapSize: 'standard', seed: 7, commanders });
  const initial = world.snapshot(0);
  const own = initial.entities.find(entity => entity.playerId === 'host' && entity.type !== 'capital');
  const enemy = initial.entities.find(entity => entity.playerId === 'guest' && entity.type !== 'capital');
  assert(own && enemy);
  assert.deepEqual(world.applyCommand('host', { kind: 'move', entityIds: [own.id], x: 1800, y: 1100 }), { ok: true });
  assert.match(world.applyCommand('host', { kind: 'move', entityIds: [enemy.id], x: 1800, y: 1100 }).reason ?? '', /owned/i);
  const moved = world.snapshot(1).entities.find(entity => entity.id === own.id);
  assert(moved && moved.orderX > 1700 && moved.orderX < 1900);
});

test('training is server-priced and deterministic simulation stays in sync', () => {
  const first = new MultiplayerWorld({ mapSize: 'large', seed: 42, commanders });
  const second = new MultiplayerWorld({ mapSize: 'large', seed: 42, commanders });
  assert.deepEqual(first.applyCommand('host', { kind: 'train', unitType: 'tank' }), { ok: true });
  assert.deepEqual(second.applyCommand('host', { kind: 'train', unitType: 'tank' }), { ok: true });
  for (let tick = 0; tick < 120; tick++) {
    first.step(1 / 30);
    second.step(1 / 30);
  }
  assert.deepEqual(first.snapshot(120), second.snapshot(120));
  assert.equal(first.snapshot(120).players.find(player => player.id === 'host')?.money, 228);
});

test('attack-move orders advance into server-resolved combat', () => {
  const world = new MultiplayerWorld({ mapSize: 'standard', seed: 19, commanders });
  const initial = world.snapshot(0);
  const hostUnits = initial.entities.filter(entity => entity.playerId === 'host' && entity.type !== 'capital');
  const guestCapital = initial.entities.find(entity => entity.playerId === 'guest' && entity.type === 'capital');
  assert(guestCapital);
  assert.deepEqual(world.applyCommand('host', {
    kind: 'move',
    entityIds: hostUnits.map(unit => unit.id),
    x: guestCapital.x,
    y: guestCapital.y
  }), { ok: true });
  for (let tick = 0; tick < 2100; tick++) world.step(1 / 30);
  const after = world.snapshot(2100);
  const remainingCapital = after.entities.find(entity => entity.id === guestCapital.id);
  assert(!remainingCapital || remainingCapital.hp < guestCapital.hp, 'enemy Capital should take authoritative combat damage');
});
