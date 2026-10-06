import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { CLIENT_MESSAGES, ROOM_NAME, SERVER_MESSAGES } from '../shared/multiplayer-protocol.js';

const endpoint = process.env.MULTIPLAYER_URL || 'http://localhost:2567';
const hostClient = new Client(endpoint);
const guestClient = new Client(endpoint);
const host = await hostClient.create(ROOM_NAME, { playerName: 'Host Commander' });
const hostMessages = collectMessages(host);
const guest = await guestClient.joinById(host.roomId, { playerName: 'Guest Commander' });
const guestMessages = collectMessages(guest);

function collectMessages(room: typeof host) {
  const queued = new Map<string, unknown[]>();
  const waiting = new Map<string, Array<(payload: unknown) => void>>();
  room.onMessage('*', (messageType, payload) => {
    const type = String(messageType);
    const resolver = waiting.get(type)?.shift();
    if (resolver) resolver(payload);
    else queued.set(type, [...(queued.get(type) ?? []), payload]);
  });
  return {
    next<T>(type: string, timeoutMs = 7000): Promise<T> {
      const available = queued.get(type)?.shift();
      if (available !== undefined) return Promise.resolve(available as T);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), timeoutMs);
        const resolvers = waiting.get(type) ?? [];
        resolvers.push(payload => {
          clearTimeout(timeout);
          resolve(payload as T);
        });
        waiting.set(type, resolvers);
      });
    }
  };
}

host.send(CLIENT_MESSAGES.REQUEST_STATE);
let initial = await hostMessages.next<any>(SERVER_MESSAGES.LOBBY_STATE);
for (let attempts = 0; initial.players.length < 2 && attempts < 4; attempts++) {
  initial = await hostMessages.next<any>(SERVER_MESSAGES.LOBBY_STATE);
}
assert.equal(initial.players.length, 2);
assert.equal(initial.hostSessionId, host.sessionId);

host.send(CLIENT_MESSAGES.SET_READY, { ready: true });
guest.send(CLIENT_MESSAGES.SET_READY, { ready: true });

let readyState = initial;
for (let attempts = 0; attempts < 6; attempts++) {
  host.send(CLIENT_MESSAGES.REQUEST_STATE);
  readyState = await hostMessages.next<any>(SERVER_MESSAGES.LOBBY_STATE);
  if (readyState.players.every((player: { ready: boolean }) => player.ready)) break;
  await new Promise(resolve => setTimeout(resolve, 50));
}
assert(readyState.players.every((player: { ready: boolean }) => player.ready));

const startedPromise = guestMessages.next<any>(SERVER_MESSAGES.MATCH_STARTED);
const hostWorldPromise = hostMessages.next<any>(SERVER_MESSAGES.MATCH_SNAPSHOT);
const guestWorldPromise = guestMessages.next<any>(SERVER_MESSAGES.MATCH_SNAPSHOT);
host.send(CLIENT_MESSAGES.START_MATCH);
const match = await startedPromise;
const [hostWorld, guestWorld] = await Promise.all([hostWorldPromise, guestWorldPromise]);
assert.equal(match.players.length, 2);
assert.equal(match.tickRate, 30);
assert.equal(match.mapSize, 'standard');
assert.equal(hostWorld.entities.length, 14);
assert.deepEqual(hostWorld, guestWorld);

host.send(CLIENT_MESSAGES.MATCH_COMMAND, { kind: 'train', unitType: 'infantry' });
let trainedWorld = hostWorld;
for (let attempts = 0; attempts < 10; attempts++) {
  trainedWorld = await hostMessages.next<any>(SERVER_MESSAGES.MATCH_SNAPSHOT);
  const commander = trainedWorld.players.find((player: { id: string }) => player.id === host.sessionId);
  if (commander?.unitCount === 7) break;
}
assert.equal(trainedWorld.players.find((player: { id: string }) => player.id === host.sessionId)?.unitCount, 7);

const ownedUnit = trainedWorld.entities.find((entity: { playerId: string; type: string }) => entity.playerId === host.sessionId && entity.type !== 'capital');
assert(ownedUnit);
host.send(CLIENT_MESSAGES.MATCH_COMMAND, { kind: 'move', entityIds: [ownedUnit.id], x: 1800, y: 1100 });
let orderedUnit = ownedUnit;
for (let attempts = 0; attempts < 10; attempts++) {
  const world = await hostMessages.next<any>(SERVER_MESSAGES.MATCH_SNAPSHOT);
  orderedUnit = world.entities.find((entity: { id: number }) => entity.id === ownedUnit.id);
  if (orderedUnit?.orderX > 1700) break;
}
assert(orderedUnit.orderX > 1700 && orderedUnit.orderX < 1900);

await Promise.all([host.leave(true), guest.leave(true)]);
console.log(`PASS live two-client lobby ${match.roomCode} synchronized start, production, and movement`);
