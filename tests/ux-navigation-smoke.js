'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { bootProject } = require('./runtime-harness');

const ROOT = path.resolve(__dirname, '..');
const context = bootProject(ROOT, 97531);
const debug = context.__RTS_DEBUG__;
debug.game.enemyCount = 1;
debug.resetGame();

// T-selection rule: highest READY count, then selected site, then camera distance.
const siteA = debug.createBuilding('missileLaunchSite', 0, 900, 900);
const siteB = debug.createBuilding('missileLaunchSite', 0, 1100, 900);
assert(siteA && siteB, 'Expected two friendly MLS instances.');
debug.ensureMissileLaunchSiteState(siteA);
debug.ensureMissileLaunchSiteState(siteB);
siteA.missileSilos[0].active = true; siteA.missileSilos[0].loadedType = 'conventional';
siteB.missileSilos[0].active = true; siteB.missileSilos[0].loadedType = 'conventional';
siteB.missileSilos[1].active = true; siteB.missileSilos[1].loadedType = 'conventional';
assert.equal(debug.findBestMissileLaunchSiteForAiming().id, siteB.id, 'Best MLS should be the site with the most READY missiles.');
siteA.missileSilos[1].active = true; siteA.missileSilos[1].loadedType = 'conventional';
debug.game.selected = siteA;
assert.equal(debug.findBestMissileLaunchSiteForAiming().id, siteA.id, 'Selected MLS should win a READY-count tie.');

// Coordinate picker writes selected map position back into the existing form fields.
const center = debug.createBuilding('advancedCoordinationCenter', 0, 1000, 1100);
assert(center, 'Expected Advanced Coordination Center.');
const xInput = { value: '1000', isConnected: true };
const yInput = { value: '1100', isConnected: true };
const selection = context.document.getElementById('selectionContent');
selection.querySelector = selector => {
  if (selector === '[data-aw-ground-x]') return xInput;
  if (selector === '[data-aw-ground-y]') return yInput;
  return null;
};
assert.equal(debug.beginAutomationCoordinatePicking(center, 'ground'), true, 'Coordinate picker should enter for a friendly ACC.');
debug.setCoordinatePickerTarget(1456.4, 778.6);
assert.equal(debug.confirmCoordinatePicking(), true, 'Coordinate picker should confirm a placed target.');
assert.equal(xInput.value, '1456');
assert.equal(yInput.value, '779');
assert.equal(debug.game.coordinatePicker, null, 'Coordinate picker should exit after confirmation.');

// Source-level UI structure guards for navigation/scroll/readability.
const researchSource = fs.readFileSync(path.join(ROOT, 'js/ui/research-ui.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert(researchSource.includes('data-doctrine-select'), 'Research UI should use doctrine navigation controls.');
assert(researchSource.includes("section.dataset.doctrineTree === selectedDoctrine?.id"), 'Only the selected doctrine tree should be shown.');
assert(researchSource.includes('installTechTreeEdgeScrolling'), 'Tech trees should install hover-edge scrolling.');
assert(researchSource.includes('captureResearchViewportState') && researchSource.includes('restoreResearchViewportState'), 'Research rerenders should preserve doctrine viewport position.');
assert(!researchSource.includes("missileBranch('A ·"), 'Missile branches must not use A/B/C presentation labels.');
assert(css.includes('.tech-scroll-shell::before'), 'Transparent tech-tree hover zones should be styled without intercepting controls.');
assert(css.includes('width: min(1320px, calc(100vw - 72px))') && css.includes('height: min(860px, calc(100vh - 72px))'), 'Research workspace should remain large without being full-screen.');
assert(css.includes('.command-coordinate-group { display:grid; grid-template-columns:1fr;'), 'Coordinate picker button must not squeeze X/Y fields horizontally.');
assert(css.includes('#app.coordinate-picking .topbar'), 'Coordinate-picking mode should suppress the normal HUD.');
assert(html.includes('<kbd>T</kbd> missile aim'), 'HUD should advertise the T missile-aim shortcut.');
assert(html.includes('coordinatePickerConfirm') && html.includes('coordinatePickerCancel'), 'Coordinate picker needs manual Confirm and Cancel actions.');

console.log('PASS doctrine navigation / edge scroll / MLS shortcut / coordinate picker UX');
