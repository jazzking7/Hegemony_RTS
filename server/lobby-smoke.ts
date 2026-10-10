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
const hostTickPromise = hostMessages.next<any>(SERVER_MESSAGES.FULL_TICK);
const guestTickPromise = guestMessages.next<any>(SERVER_MESSAGES.FULL_TICK);
host.send(CLIENT_MESSAGES.START_MATCH);
const match = await startedPromise;
const [hostTick, guestTick] = await Promise.all([hostTickPromise, guestTickPromise]);
assert.equal(match.players.length, 2);
assert.equal(match.tickRate, 30);
assert.equal(match.mapSize, 'standard');
assert.equal(match.commanderCount, 2);
assert.deepEqual(match.humanSeats, [0, 1]);
assert.equal(hostTick.tick, 0);
assert.deepEqual(hostTick, guestTick);

const hostCommandPromise = hostMessages.next<any>(SERVER_MESSAGES.FULL_COMMAND);
const guestCommandPromise = guestMessages.next<any>(SERVER_MESSAGES.FULL_COMMAND);
host.send(CLIENT_MESSAGES.FULL_COMMAND, { name: 'placeBuilding', args: ['city', 1000, 800, 0], requestId:'smoke-save-confirmation' });
const [hostCommand, guestCommand] = await Promise.all([hostCommandPromise, guestCommandPromise]);
assert.deepEqual(hostCommand, guestCommand);
assert.equal(hostCommand.sequence, 1);
assert.equal(hostCommand.playerId, 0);
assert.equal(hostCommand.command.name, 'placeBuilding');
assert.equal(hostCommand.command.requestId, 'smoke-save-confirmation');
assert(hostCommand.tick >= 12);

await Promise.all([host.leave(true), guest.leave(true)]);
console.log(`PASS live two-client lobby ${match.roomCode} synchronized full-game start and command sequencing`);
