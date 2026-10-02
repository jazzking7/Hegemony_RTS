'use strict';

const path = require('path');
const { bootProject } = require('./runtime-harness');

const root = path.resolve(__dirname, '..');
const context = bootProject(root, 9227);
const debug = context.__RTS_DEBUG__;
debug.resetGame();

function groups(containerId) {
  return context.document.getElementById(containerId).children;
}
function group(containerId, doctrineId) {
  return groups(containerId).find(item => item.dataset?.buildDoctrine === doctrineId);
}
function buttonIn(groupEl, type) {
  const items = groupEl?.children?.find(child => child.className === 'build-doctrine-items');
  return items?.children?.find(button => button.dataset?.buildType === type);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const generalUtility = group('utilityBuilds', 'general');
const ewUtility = group('utilityBuilds', 'electronicWarfare');
const energyUtility = group('utilityBuilds', 'directedEnergy');
assert(generalUtility && !generalUtility.hidden, 'General utility group should be visible at match start.');
assert(ewUtility && ewUtility.hidden, 'EW group should be hidden before an EW building is researched.');
assert(energyUtility && energyUtility.hidden, 'Directed Energy group should be hidden before the doctrine is researched.');
assert(buttonIn(ewUtility, 'radarStation')?.hidden, 'Unresearched Radar Station should not be visible.');

assert(debug.completeResearch(0, 'electronicWarfare', { silent: true }), 'EW doctrine completion failed.');
assert(ewUtility.hidden, 'EW heading should stay hidden until a building unlock is researched.');
assert(debug.completeResearch(0, 'ewUnlockRadar', { silent: true }), 'Radar unlock completion failed.');
assert(!ewUtility.hidden, 'EW heading should appear after Radar unlock.');
assert(!buttonIn(ewUtility, 'radarStation').hidden, 'Radar Station should appear immediately after unlock.');
assert(buttonIn(ewUtility, 'jammingStation').hidden, 'Jamming Station should remain hidden before its SR.');
assert(buttonIn(ewUtility, 'spoofingStation').hidden, 'Spoofing Station should remain hidden before its SR.');

assert(debug.completeResearch(0, 'directedEnergy', { silent: true }), 'Directed Energy doctrine completion failed.');
assert(!energyUtility.hidden, 'Directed Energy group should appear because Generator unlocks with the doctrine.');
assert(!buttonIn(energyUtility, 'energyGenerator').hidden, 'Energy Generator should appear with the doctrine.');
assert(buttonIn(energyUtility, 'orbitalBeamSystem').hidden, 'Orbital system should stay hidden until its SR.');

console.log('PASS locked buildings stay absent and unlocked buildings appear under doctrine groups');
