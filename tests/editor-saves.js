'use strict';
const assert = require('assert');
const path = require('path');
const { bootProject } = require('./runtime-harness');
const ROOT = path.resolve(__dirname, '..');
const search = '?debug=1&network=1&player=0&humans=0%2C1&commanders=2&seed=77';

{
  const c = bootProject(ROOT, 77, search), d = c.__RTS_DEBUG__, g = d.game;
  const center = d.createBuilding('militaryCommand', 0, 1100, 1000);
  const bridge = c.__FULL_NETWORK_BRIDGE__, outbound = [];
  bridge.setTransport(command => outbound.push(command));
  let confirmed = 0;
  const definition = { name:'Saved squad', basic:7, elite:2 };
  const button = { disabled:false };
  c.commitSelectionEditor(() => c.setConvoyDefinition(0,0,definition), () => confirmed++, button);
  assert.equal(outbound.length, 1); assert(outbound[0].requestId);
  assert.equal(g.players[0].convoys[0].basic, 0, 'Queued save must not invent local game state');
  assert.equal(confirmed, 0); assert(button.disabled);
  definition.basic = 99;
  bridge.queueCommand({ sequence:1, tick:1, playerId:0, command:outbound[0] });
  bridge.applyCommandsForTick(1);
  assert.equal(g.players[0].convoys[0].basic, 7, 'Sent definition is an immutable snapshot');
  assert.equal(confirmed, 1); assert(!button.disabled);
  assert.equal(g.players[0].convoys[0].name, 'Saved squad');

  const base = g.buildings.find(b => b.playerId===0 && b.type==='militaryBase');
  c.commitSelectionEditor(() => c.createAutomatedWarfare(center, { kind:'theater', facilityId:base.id, composition:{basic:2} }), () => confirmed++, button);
  bridge.queueCommand({ sequence:2, tick:2, playerId:0, command:outbound[1] });
  bridge.applyCommandsForTick(2);
  assert.equal(confirmed, 1, 'A rejected automation must not report success');
  assert(!button.disabled);
  assert(c.document.getElementById('notification').textContent.includes('Advanced Coordination unavailable'));
  c.commitSelectionEditor(() => c.setConvoyDefinition(0,0,{basic:3}), () => confirmed++, button);
  bridge.rejectPending('Disconnected before confirmation');
  assert(!button.disabled); assert.equal(confirmed, 1);
}
console.log('PASS multiplayer saves wait for execution, preserve payloads, and report actual failure/disconnection');

{
  const c = bootProject(ROOT, 22), d = c.__RTS_DEBUG__, g = d.game;
  d.resetGame();
  const e = d.createBuilding('militaryCommand',0,1000,1000);
  const root = c.document.getElementById('selectionContent');
  const field = { dataset:{convoyUnit:'0:basic'}, value:'17', tagName:'INPUT', checked:false };
  root.querySelectorAll = selector => selector === 'input, select, textarea' ? [field] : [];
  c.restoreSelectionEditorDraft(e);
  root.scrollTop = 240;
  c.rememberSelectionEditorDraft();
  field.value = '0'; root.scrollTop = 0;
  c.restoreSelectionEditorDraft(e);
  assert.equal(field.value, '17'); assert.equal(root.scrollTop, 240);
  c.clearSelectionEditorDraft(e.id);
  field.value = '0'; c.restoreSelectionEditorDraft(e); assert.equal(field.value, '0');
  let saved = false;
  c.commitSelectionEditor(() => ({ok:false,reason:'Insufficient funds'}), () => saved=true);
  assert(!saved); assert.equal(field.value, '0');
  c.commitSelectionEditor(() => c.setConvoyDefinition(0,0,{name:'Offline',basic:4}), () => saved=true);
  assert(saved); assert.equal(g.players[0].convoys[0].basic,4);
  field.value = '17'; c.restoreSelectionEditorDraft(e); c.rememberSelectionEditorDraft();
  d.resetGame(); field.value = '0'; c.restoreSelectionEditorDraft(e);
  assert.equal(field.value, '0', 'Starting a new match must not resurrect old editor drafts');
}
console.log('PASS draft values and scroll survive rerenders, explicit clearing works, and offline saves are immediate');
