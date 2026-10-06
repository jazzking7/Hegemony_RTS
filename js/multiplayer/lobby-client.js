import {
  CLIENT_MESSAGES,
  LOBBY_PHASES,
  MAX_COMMANDERS,
  ROOM_NAME,
  SERVER_MESSAGES
} from '../../shared/multiplayer-protocol.js';
import { createMatchController } from './match-client.js';

const elements = Object.fromEntries([
  'connectionStatus', 'entryView', 'playerName', 'roomCode', 'createLobby', 'joinLobby', 'entryError',
  'lobbyView', 'lobbyCode', 'leaveLobby', 'inviteLink', 'copyInvite', 'rosterCount', 'playerRoster',
  'mapSize', 'aiCount', 'lobbyNotice', 'readyButton', 'startMatch', 'matchView', 'matchHeading',
  'matchSummary', 'serverTick', 'matchConnection', 'matchMoney', 'selectedCount', 'trainInfantry',
  'trainTank', 'battlefieldCanvas', 'matchBanner', 'matchRoster'
].map(id => [id, document.getElementById(id)]));

const savedName = localStorage.getItem('commandRadius.commanderName');
elements.playerName.value = savedName || '';

let client = null;
let room = null;
let snapshot = null;
let countdownTimer = null;
const matchController = createMatchController({
  elements,
  send: payload => room?.send(CLIENT_MESSAGES.MATCH_COMMAND, payload),
  getSessionId: () => room?.sessionId
});

function endpoint() {
  if (location.protocol === 'file:') throw new Error('Multiplayer must be opened through the local game server. Run npm run dev, then open http://localhost:2567/online.html.');
  return location.origin;
}

function commanderName() {
  const name = elements.playerName.value.trim().replace(/\s+/g, ' ').slice(0, 24) || 'Commander';
  elements.playerName.value = name;
  localStorage.setItem('commandRadius.commanderName', name);
  return name;
}

function setConnection(label, kind = '') {
  elements.connectionStatus.textContent = label;
  elements.connectionStatus.className = `connection-status ${kind}`.trim();
  if (elements.matchConnection) elements.matchConnection.textContent = label;
}

function setEntryError(message = '') {
  elements.entryError.textContent = message;
}

async function connect(mode) {
  setEntryError();
  setConnection('CONNECTING', 'warning');
  elements.createLobby.disabled = true;
  elements.joinLobby.disabled = true;
  try {
    client ||= new Colyseus.Client(endpoint());
    const options = { playerName: commanderName() };
    if (mode === 'create') {
      room = await client.create(ROOM_NAME, options);
    } else {
      const code = elements.roomCode.value.trim();
      if (!code) throw new Error('Enter a room code.');
      room = await client.joinById(code, options);
    }
    bindRoom(room);
    history.replaceState(null, '', `${location.pathname}?room=${encodeURIComponent(room.roomId)}`);
    elements.entryView.classList.add('hidden');
    elements.lobbyView.classList.remove('hidden');
    setConnection('CONNECTED');
    room.send(CLIENT_MESSAGES.REQUEST_STATE);
  } catch (error) {
    room = null;
    setConnection('CONNECTION FAILED', 'error');
    setEntryError(error?.message || 'Unable to connect to that lobby.');
  } finally {
    elements.createLobby.disabled = false;
    elements.joinLobby.disabled = false;
  }
}

function bindRoom(activeRoom) {
  activeRoom.onMessage(SERVER_MESSAGES.LOBBY_STATE, state => {
    snapshot = state;
    renderLobby();
  });
  activeRoom.onMessage(SERVER_MESSAGES.MATCH_STARTED, match => showMatch(match));
  activeRoom.onMessage(SERVER_MESSAGES.MATCH_SNAPSHOT, state => matchController.update(state));
  activeRoom.onMessage(SERVER_MESSAGES.MATCH_ENDED, result => matchController.end(result));
  activeRoom.onMessage(SERVER_MESSAGES.MATCH_TICK, payload => {
    elements.serverTick.textContent = String(payload.tick || 0);
  });
  activeRoom.onMessage(SERVER_MESSAGES.ERROR, payload => {
    const message = payload?.message || 'The server rejected that command.';
    if (!elements.matchView.classList.contains('hidden')) matchController.showNotice(message);
    else elements.lobbyNotice.textContent = message;
  });
  activeRoom.onDrop?.(() => setConnection('RECONNECTING', 'warning'));
  activeRoom.onReconnect?.(() => {
    setConnection('CONNECTED');
    activeRoom.send(CLIENT_MESSAGES.REQUEST_STATE);
  });
  activeRoom.onLeave(() => {
    if (room !== activeRoom) return;
    setConnection('DISCONNECTED', 'error');
  });
}

function renderLobby() {
  if (!snapshot || !room) return;
  const me = snapshot.players.find(player => player.sessionId === room.sessionId);
  const isHost = snapshot.hostSessionId === room.sessionId;
  const activePlayers = snapshot.players.length;
  elements.lobbyCode.textContent = snapshot.roomCode;
  elements.inviteLink.value = `${location.origin}${location.pathname}?room=${encodeURIComponent(snapshot.roomCode)}`;
  elements.rosterCount.textContent = `${activePlayers + snapshot.aiCount} / ${MAX_COMMANDERS}`;
  elements.playerRoster.innerHTML = snapshot.players.map(player => `
    <div class="player-row">
      <span class="player-seat">${player.seat + 1}</span>
      <span class="player-copy"><strong>${escapeHtml(player.name)}</strong><small>${player.host ? 'LOBBY HOST' : 'HUMAN COMMANDER'}${player.sessionId === room.sessionId ? ' · YOU' : ''}</small></span>
      <span class="player-state ${player.connected ? (player.ready ? 'ready' : '') : 'disconnected'}">${player.connected ? (player.ready ? 'READY' : 'WAITING') : 'OFFLINE'}</span>
    </div>`).join('') + Array.from({ length: snapshot.aiCount }, (_, index) => `
    <div class="player-row">
      <span class="player-seat">${activePlayers + index + 1}</span>
      <span class="player-copy"><strong>AI COMMANDER ${index + 1}</strong><small>SERVER CONTROLLED</small></span>
      <span class="player-state ready">READY</span>
    </div>`).join('');

  elements.mapSize.value = snapshot.mapSize;
  elements.mapSize.disabled = !isHost || snapshot.phase !== LOBBY_PHASES.LOBBY;
  elements.aiCount.disabled = !isHost || snapshot.phase !== LOBBY_PHASES.LOBBY;
  const maxAi = Math.max(0, MAX_COMMANDERS - activePlayers);
  elements.aiCount.innerHTML = Array.from({ length: maxAi + 1 }, (_, count) => `<option value="${count}">${count}</option>`).join('');
  elements.aiCount.value = String(Math.min(snapshot.aiCount, maxAi));
  elements.readyButton.disabled = snapshot.phase !== LOBBY_PHASES.LOBBY || !me?.connected;
  elements.readyButton.classList.toggle('active', Boolean(me?.ready));
  elements.readyButton.textContent = me?.ready ? 'READY ✓' : 'READY';

  const allReady = snapshot.players.length > 0 && snapshot.players.every(player => player.ready && player.connected);
  const enoughCommanders = snapshot.players.length + snapshot.aiCount >= 2;
  elements.startMatch.classList.toggle('hidden', !isHost);
  elements.startMatch.disabled = snapshot.phase !== LOBBY_PHASES.LOBBY || !allReady || !enoughCommanders;

  if (snapshot.phase === LOBBY_PHASES.COUNTDOWN) {
    runCountdown();
  } else if (!enoughCommanders) {
    elements.lobbyNotice.textContent = 'Add another human or AI commander to start.';
  } else if (!allReady) {
    elements.lobbyNotice.textContent = 'Waiting for every human commander to ready up.';
  } else if (isHost) {
    elements.lobbyNotice.textContent = 'All commanders ready. Start when prepared.';
  } else {
    elements.lobbyNotice.textContent = 'All commanders ready. Waiting for the host.';
  }
}

function runCountdown() {
  clearInterval(countdownTimer);
  const update = () => {
    const seconds = Math.max(0, Math.ceil((snapshot.countdownEndsAt - Date.now()) / 1000));
    elements.lobbyNotice.textContent = `MATCH STARTING IN ${seconds}`;
  };
  update();
  countdownTimer = setInterval(update, 100);
}

function showMatch(match) {
  clearInterval(countdownTimer);
  elements.lobbyView.classList.add('hidden');
  elements.matchView.classList.remove('hidden');
  const total = match.players.length + match.aiCount;
  elements.matchHeading.textContent = `MATCH ${match.roomCode} STARTED`;
  elements.matchSummary.textContent = `${match.mapSize.toUpperCase()} MAP · ${match.players.length} HUMAN${match.players.length === 1 ? '' : 'S'} · ${match.aiCount} AI · ${total} COMMANDERS`;
  matchController.start();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
}

elements.createLobby.addEventListener('click', () => connect('create'));
elements.joinLobby.addEventListener('click', () => connect('join'));
elements.roomCode.addEventListener('keydown', event => { if (event.key === 'Enter') connect('join'); });
elements.mapSize.addEventListener('change', () => room?.send(CLIENT_MESSAGES.SET_MAP, { mapSize: elements.mapSize.value }));
elements.aiCount.addEventListener('change', () => room?.send(CLIENT_MESSAGES.SET_AI_COUNT, { count: Number(elements.aiCount.value) }));
elements.readyButton.addEventListener('click', () => {
  const me = snapshot?.players.find(player => player.sessionId === room?.sessionId);
  room?.send(CLIENT_MESSAGES.SET_READY, { ready: !me?.ready });
});
elements.startMatch.addEventListener('click', () => room?.send(CLIENT_MESSAGES.START_MATCH));
elements.copyInvite.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(elements.inviteLink.value);
    elements.copyInvite.textContent = 'COPIED';
    setTimeout(() => { elements.copyInvite.textContent = 'COPY INVITE'; }, 1400);
  } catch {
    elements.inviteLink.select();
  }
});
elements.leaveLobby.addEventListener('click', async () => {
  const leaving = room;
  room = null;
  snapshot = null;
  clearInterval(countdownTimer);
  if (leaving) await leaving.leave(true);
  history.replaceState(null, '', location.pathname);
  elements.lobbyView.classList.add('hidden');
  elements.matchView.classList.add('hidden');
  elements.entryView.classList.remove('hidden');
  setConnection('SERVER READY');
});

const invitationCode = new URLSearchParams(location.search).get('room');
if (invitationCode) elements.roomCode.value = invitationCode;
