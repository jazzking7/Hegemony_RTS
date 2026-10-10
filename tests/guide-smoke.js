'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { bootProject } = require('./runtime-harness');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8');
const c = bootProject(ROOT, 42);
// Evaluate precisely the guide's scripts in their standalone order, without
// relying on game runtime globals being present.
const nodes = new Map();
const document = { getElementById(id) {
  if (!nodes.has(id)) nodes.set(id, { innerHTML:'', textContent:'', addEventListener() {}, querySelectorAll() { return []; } });
  return nodes.get(id);
} };
const standalone = vm.createContext({ document, console, location:{search:''}, Math, Map, Set });
for (const match of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  new vm.Script(fs.readFileSync(path.join(ROOT, match[1]), 'utf8'), { filename:match[1] }).runInContext(standalone);
}
const markup = nodes.get('doctrineGuide').innerHTML;
assert.equal((markup.match(/class="doctrine-card"/g) || []).length, 9);
assert.equal((markup.match(/class="research-entry"/g) || []).length, vm.runInContext('Object.keys(SPECIALIZED_RESEARCH).length', c));
for (const name of ['Capture zones', 'Define and use a convoy', 'Set up Automated Warfare', 'Save an Exosuit loadout']) assert(html.includes(name));
assert(!markup.includes('undefined'));
for (const page of ['index.html','online.html']) assert(fs.readFileSync(path.join(ROOT,page),'utf8').includes('href="guide.html"'));
console.log('PASS standalone guide renders every doctrine/research entry and both modes link to it');
