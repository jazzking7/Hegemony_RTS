'use strict';

const assert = require('assert');
const path = require('path');
const { bootProject } = require('./runtime-harness');

const ROOT = path.resolve(__dirname, '..');
const context = bootProject(ROOT, 24680);
const debug = context.__RTS_DEBUG__;
debug.game.enemyCount = 1;
debug.resetGame();

const city = debug.game.buildings.find(b => b.alive && b.playerId === 0 && b.type === 'city');
assert(city, 'Expected a friendly starting City.');
debug.game.selected = city;

const selection = context.document.getElementById('selectionContent');
const upgradeButton = { disabled: false };
const hpFill = { style: {} };
const hpText = { textContent: '' };
selection.innerHTML = 'SENTINEL_SELECTION_DOM';
selection.querySelector = selector => {
  if (selector === '[data-live-selection-hp-fill]') return hpFill;
  if (selector === '[data-live-selection-hp]') return hpText;
  if (selector === '[data-action="upgrade"]') return upgradeButton;
  return null;
};
selection.querySelectorAll = () => [];

const cost = context.getUpgradeCost(city);
debug.game.players[0].money = Math.max(0, cost - 1);
context.refreshSelectionPanelLiveState();
assert.equal(upgradeButton.disabled, true, 'Upgrade should be disabled while unaffordable.');

debug.game.players[0].money = cost + 1;
context.refreshSelectionPanelLiveState();
assert.equal(upgradeButton.disabled, false, 'Upgrade should enable immediately when it becomes affordable.');
assert.equal(selection.innerHTML, 'SENTINEL_SELECTION_DOM', 'Live refresh must not replace selection-panel DOM.');

context.updateHUD();
assert.equal(selection.innerHTML, 'SENTINEL_SELECTION_DOM', 'HUD refresh must not rebuild selection-panel DOM.');

console.log('PASS targeted selection live refresh enables actions without replacing hovered DOM');

for (const facilityType of ['militaryBase', 'airbase']) {
  const c = bootProject(ROOT, 24680);
  const d = c.__RTS_DEBUG__;
  d.game.enemyCount = 1;
  d.resetGame();
  d.game.players[0].money = 100000;
  const facility = facilityType === 'militaryBase' ? d.game.buildings.find(b => b.type === facilityType && b.playerId === 0)
    : d.createBuilding('airbase', 0, 900, 900);
  const type = facilityType === 'militaryBase' ? 'basic' : 'bomber';
  d.game.selected = facility;
  c.renderSelectionPanel();
  const root = c.document.getElementById('selectionContent');
  assert(root.innerHTML.includes('data-live-training-queue'), 'An idle facility needs a persistent progress placeholder');
  const fields = new Map();
  const node = selector => {
    if (!fields.has(selector)) fields.set(selector, { textContent: '', style: {}, hidden: false, querySelector: node });
    return fields.get(selector);
  };
  root.querySelector = selector => selector.startsWith('[data-live-training') ? node(selector) : null;
  const copy = { dataset: { liveTrainingCopy: type }, textContent: '' };
  root.querySelectorAll = selector => selector === '[data-live-training-copy]' ? [copy] : [];
  c.trainUnits(facility, type, 1);
  root.innerHTML = 'STABLE_TRAINING_CONTROLS';
  const duration = c.getQueuedTrainingTime(facility);
  const before = c.getFacilityAvailable(facility, type);
  c.updateTraining(duration / 2);
  c.refreshSelectionPanelLiveState();
  assert.equal(node('[data-live-training-percent]').textContent, '50%');
  assert.equal(node('[data-live-training-queue]').hidden, false);
  assert.equal(node('[data-live-training-fill]').style.width, '50%');

  const prefs = c.getDeploymentPreferences();
  prefs.mode = 'facility'; prefs.lastFacilityId = facility.id;
  c.openAttackModal(1200, 1200);
  const rows = c.document.getElementById('attackUnitRows');
  const available = { dataset: { liveDeploymentAvailable: type }, textContent: '' };
  const input = { dataset: { amount: type }, value: '', max: 0 };
  c.document.activeElement = input;
  rows.querySelectorAll = selector => selector === '[data-live-deployment-available]' ? [available] : selector === '[data-amount]' ? [input] : [];
  rows.innerHTML = 'STABLE_DEPLOYMENT_CONTROLS';
  c.refreshAttackModalLiveState();
  assert.equal(Number(available.textContent), before);
  c.updateTraining(duration / 2 + 0.01);
  c.updateHUD();
  assert.equal(Number(available.textContent), before + 1, 'Training completion updates an already-open deployment dialog');
  assert.equal(Number(input.max), before + 1);
  assert.equal(input.value, '', 'Live refresh preserves a focused empty input');
  assert.equal(node('[data-live-training-queue]').hidden, true, 'Completed queues disappear without selecting again');
  assert.equal(root.innerHTML, 'STABLE_TRAINING_CONTROLS');
  assert.equal(rows.innerHTML, 'STABLE_DEPLOYMENT_CONTROLS');
  assert(copy.textContent.includes(`${before + 1}`));
}
console.log('PASS military/airbase progress and open deployment inventories refresh in place through training completion');
