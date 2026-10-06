import { CLIENT_MESSAGES, SERVER_MESSAGES } from '../../shared/multiplayer-protocol.js';

const bridge = window.__FULL_NETWORK_BRIDGE__;
const params = new URLSearchParams(location.search);
const roomId = params.get('room') || sessionStorage.getItem('commandRadius.roomId');
const token = sessionStorage.getItem('commandRadius.reconnectionToken');

function showConnection(label, kind = '') {
  const value = document.getElementById('statusValue');
  if (value) value.textContent = label;
  document.body.dataset.networkStatus = kind || label.toLowerCase();
}

async function connect() {
  if (!bridge || !roomId || !token) throw new Error('The multiplayer seat is missing its lobby connection.');
  showConnection('SYNCING', 'connecting');
  const client = new Colyseus.Client(location.origin);
  const room = await client.reconnect(token);
  sessionStorage.setItem('commandRadius.reconnectionToken', room.reconnectionToken);
  bridge.setTransport(command => room.send(CLIENT_MESSAGES.FULL_COMMAND, command));
  room.onMessage(SERVER_MESSAGES.LOBBY_STATE, () => {});
  room.onMessage(SERVER_MESSAGES.MATCH_TICK, () => {});
  room.onMessage(SERVER_MESSAGES.FULL_COMMAND, envelope => bridge.queueCommand(envelope));
  room.onMessage(SERVER_MESSAGES.FULL_TICK, payload => bridge.setTargetTick(payload?.tick || 0));
  room.onMessage(SERVER_MESSAGES.ERROR, payload => {
    if (typeof notify === 'function') notify(payload?.message || 'The server rejected that order.', 'warning', 3);
  });
  room.onDrop?.(() => showConnection('RECONNECTING', 'warning'));
  room.onReconnect?.(() => {
    sessionStorage.setItem('commandRadius.reconnectionToken', room.reconnectionToken);
    showConnection('ONLINE', 'online');
    room.send(CLIENT_MESSAGES.REQUEST_STATE);
  });
  room.onLeave(() => showConnection('DISCONNECTED', 'error'));
  room.send(CLIENT_MESSAGES.REQUEST_STATE);
  showConnection('ONLINE', 'online');
  window.__FULL_NETWORK_ROOM__ = room;
}

connect().catch(error => {
  console.error(error);
  showConnection('CONNECTION FAILED', 'error');
  if (typeof notify === 'function') notify(error?.message || 'Unable to reconnect to the match.', 'warning', 6);
});
