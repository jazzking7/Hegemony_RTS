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
