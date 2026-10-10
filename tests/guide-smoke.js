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
for (const id of vm.runInContext('Object.keys(SPECIALIZED_RESEARCH)', c)) {
  assert(markup.includes(`data-tree-node="${id}"`), `Full tree contains ${id}`);
}
const entries=vm.runInContext('Object.values(SPECIALIZED_RESEARCH)',c);
for (const entry of entries) {
  const dependencies=entry.requirements?.research || [entry.doctrine];
  assert(markup.includes(`data-tree-requires="${dependencies.join(' ')}"`), 'Every prerequisite appears in the visual graph');
}
for (const page of ['index.html','online.html']) assert(fs.readFileSync(path.join(ROOT,page),'utf8').includes('href="guide.html"'));
const index=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
assert(!index.slice(0,index.indexOf('<div id="startOverlay"')).includes('href="guide.html"'),'Full guide is absent from gameplay UI');
assert(html.includes('href="index.html"'),'Guide returns to start menu');
c.__RTS_DEBUG__.resetGame();
const game=c.__RTS_DEBUG__.game;
c.toggleQuickRead();assert(c.isQuickReadOpen());
assert(c.document.getElementById('quickReadContent').innerHTML.includes('Grow'));
const key=key=>({key,preventDefault(){},target:{matches(){return false;}}});
c.handleKeyDown(key('a'));assert(!game.keys.has('a'),'Quick read does not issue movement/deploy commands');
c.handleKeyDown(key('Escape'));assert(!c.isQuickReadOpen());
c.handleKeyDown(key('h'));assert(c.isQuickReadOpen());
c.handleKeyDown(key('h'));assert(!c.isQuickReadOpen());
c.renderQuickRead('territory');assert(c.document.getElementById('quickReadContent').innerHTML.includes('$200'));
c.toggleQuickRead();c.openResearchModal();assert(!c.isQuickReadOpen(),'Research closes quick read');
console.log('PASS standalone guide renders every doctrine/research entry and both modes link to it');
