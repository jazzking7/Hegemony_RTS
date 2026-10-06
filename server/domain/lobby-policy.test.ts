import assert from 'node:assert/strict';
import test from 'node:test';
import { canStartLobby, clampAiCount, normalizePlayerName } from './lobby-policy.js';

test('player names are normalized and bounded', () => {
  assert.equal(normalizePlayerName('  Field   Marshal  '), 'Field Marshal');
  assert.equal(normalizePlayerName(''), 'Commander');
  assert.equal(normalizePlayerName('x'.repeat(40)).length, 24);
});

test('AI slots cannot push the room beyond five commanders', () => {
  assert.equal(clampAiCount(4, 2), 3);
  assert.equal(clampAiCount(-2, 2), 0);
  assert.equal(clampAiCount('2', 3), 2);
});

test('only a ready, connected lobby can start', () => {
  const members = [
    { sessionId: 'host', ready: true, connected: true },
    { sessionId: 'guest', ready: true, connected: true }
  ];
  assert.deepEqual(canStartLobby('host', 'host', members, 0), { ok: true });
  assert.match(canStartLobby('guest', 'host', members, 0).reason ?? '', /host/i);
  assert.match(canStartLobby('host', 'host', [{ ...members[0], ready: false }, members[1]], 0).reason ?? '', /ready/i);
  assert.match(canStartLobby('host', 'host', [members[0], { ...members[1], connected: false }], 0).reason ?? '', /return/i);
});
