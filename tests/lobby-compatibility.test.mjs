import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as protocol from '../shared/multiplayer-protocol.js';

function lobby() {
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', classList: { add() {}, remove() {}, toggle() {}, contains() { return true; } },
      handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; }
    });
    return elements.get(id);
  };
  const context = vm.createContext({ ...protocol,
    document: { getElementById: getElement }, localStorage: { getItem() { return null; } },
    location: { search: '', origin: 'http://localhost', pathname: '/online.html' },
    URLSearchParams, clearInterval, setInterval,
    createMatchController: () => ({})
  });
  const source = fs.readFileSync(new URL('../js/multiplayer/lobby-client.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '');
  vm.runInContext(source, context);
  const sent = [];
  context.testRoom = { sessionId: 'host', send: (...args) => sent.push(args),
    onMessage() {}, onLeave(handler) { this.leaveHandler = handler; } };
  context.testState = { players: [{ sessionId: 'host', connected: true, ready: true }],
    hostSessionId: 'host', roomCode: 'test', aiCount: 1, mapSize: 'standard', phase: 'lobby' };
  vm.runInContext('room = testRoom; snapshot = testState; bindRoom(room);', context);
  return { context, sent, getElement, render: () => vm.runInContext('renderLobby()', context) };
}

test('older server disables agendas and never receives an unsupported toggle', () => {
  const ui = lobby();
  ui.render();
  const selector = ui.getElement('lobbyAgendaMode');
  assert.equal(selector.disabled, true);
  assert.match(ui.getElement('lobbyNotice').textContent, /updated and restarted/);
  selector.value = 'agendas';
  selector.handlers.change();
  assert.equal(ui.sent.length, 0);
  assert.equal(selector.value, 'classic');
  assert.equal(ui.getElement('startMatch').disabled, false);
});

test('agenda-capable server accepts enabling and disabling the mode', () => {
  const ui = lobby();
  ui.context.testState.secretAgendas = false;
  ui.render();
  const selector = ui.getElement('lobbyAgendaMode');
  assert.equal(selector.disabled, false);
  selector.value = 'agendas'; selector.handlers.change();
  assert.equal(ui.sent[0][0], protocol.CLIENT_MESSAGES.SET_AGENDAS);
  assert.equal(ui.sent[0][1].enabled, true);
  ui.context.testState.secretAgendas = true;
  ui.render();
  assert.equal(selector.value, 'agendas');
  selector.value = 'classic'; selector.handlers.change();
  assert.equal(ui.sent[1][1].enabled, false);
});

test('non-hosts cannot send agenda changes and disconnect reasons are visible', () => {
  const ui = lobby();
  ui.context.testState.secretAgendas = false;
  ui.context.testState.hostSessionId = 'other';
  ui.render();
  ui.getElement('lobbyAgendaMode').handlers.change();
  assert.equal(ui.sent.length, 0);
  ui.context.testRoom.leaveHandler(4002, 'room onMessage for "set_agendas" not registered.');
  assert.match(ui.getElement('lobbyNotice').textContent, /4002.*set_agendas/);
});
