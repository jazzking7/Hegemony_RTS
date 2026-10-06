import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { CLIENT_MESSAGES, ROOM_NAME, SERVER_MESSAGES } from '../shared/multiplayer-protocol.js';

const endpoint = process.env.MULTIPLAYER_URL || 'http://localhost:2567';
const hostClient = new Client(endpoint);
const guestClient = new Client(endpoint);
const host = await hostClient.create(ROOM_NAME, { playerName: 'Host Commander' });
const guest = await guestClient.joinById(host.roomId, { playerName: 'Guest Commander' });

function nextMessage<T>(room: typeof host, type: string, timeoutMs = 7000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), timeoutMs);
    const off = room.onMessage(type, payload => {
      clearTimeout(timeout);
      off();
      resolve(payload as T);
    });
  });
}

const hostStatePromise = nextMessage<any>(host, SERVER_MESSAGES.LOBBY_STATE);
host.send(CLIENT_MESSAGES.REQUEST_STATE);
const initial = await hostStatePromise;
assert.equal(initial.players.length, 2);
assert.equal(initial.hostSessionId, host.sessionId);

host.send(CLIENT_MESSAGES.SET_READY, { ready: true });
guest.send(CLIENT_MESSAGES.SET_READY, { ready: true });

let readyState = initial;
for (let attempts = 0; attempts < 6; attempts++) {
  const statePromise = nextMessage<any>(host, SERVER_MESSAGES.LOBBY_STATE);
  host.send(CLIENT_MESSAGES.REQUEST_STATE);
  readyState = await statePromise;
  if (readyState.players.every((player: { ready: boolean }) => player.ready)) break;
  await new Promise(resolve => setTimeout(resolve, 50));
}
assert(readyState.players.every((player: { ready: boolean }) => player.ready));

const startedPromise = nextMessage<any>(guest, SERVER_MESSAGES.MATCH_STARTED);
host.send(CLIENT_MESSAGES.START_MATCH);
const match = await startedPromise;
assert.equal(match.players.length, 2);
assert.equal(match.tickRate, 30);
assert.equal(match.mapSize, 'standard');

await Promise.all([host.leave(true), guest.leave(true)]);
console.log(`PASS live two-client lobby ${match.roomCode} reached authoritative match start`);
