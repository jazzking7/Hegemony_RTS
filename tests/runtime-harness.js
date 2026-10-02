'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function makeClassList() {
  const values = new Set();
  return {
    add: (...items) => items.forEach(item => values.add(item)),
    remove: (...items) => items.forEach(item => values.delete(item)),
    toggle(item, force) {
      const enabled = force === undefined ? !values.has(item) : !!force;
      enabled ? values.add(item) : values.delete(item);
      return enabled;
    },
    contains: item => values.has(item)
  };
}

function createRuntimeContext(seed = 123456) {
  let randomState = seed >>> 0;
  const seededRandom = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };

  const elements = new Map();
  function createElement(id = '') {
    const target = {
      id,
      classList: makeClassList(),
      style: {},
      dataset: {},
      children: [],
      childNodes: [],
      textContent: '',
      innerHTML: '',
      value: '',
      disabled: false,
      checked: false,
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 800,
      clientHeight: 600,
      offsetWidth: 800,
      offsetHeight: 600,
      appendChild(child) { this.children.push(child); this.childNodes.push(child); return child; },
      append(...children) { children.forEach(child => this.appendChild(child)); },
      replaceChildren(...children) { this.children.length = 0; this.childNodes.length = 0; this.append(...children); },
      remove() {}, focus() {}, blur() {}, click() {},
      addEventListener() {}, removeEventListener() {},
      setAttribute(key, value) { this[key] = String(value); },
      getAttribute(key) { return this[key] ?? null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
      getBoundingClientRect() { return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 }; },
      setPointerCapture() {}, releasePointerCapture() {}
    };
    return new Proxy(target, {
      get(obj, prop) {
        if (prop in obj) return obj[prop];
        if (typeof prop === 'string' && prop.startsWith('on')) return null;
        return undefined;
      },
      set(obj, prop, value) { obj[prop] = value; return true; }
    });
  }

  const canvas = createElement('gameCanvas');
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const canvasContext = new Proxy({
    canvas,
    measureText: text => ({ width: String(text).length * 7 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null
  }, {
    get(obj, prop) { return prop in obj ? obj[prop] : noop; },
    set(obj, prop, value) { obj[prop] = value; return true; }
  });
  canvas.getContext = () => canvasContext;

  const requiredIds = [
    'gameCanvas', 'moneyValue', 'incomeValue', 'forceValue', 'statusValue',
    'utilityBuilds', 'defenseBuilds', 'selectionSubtitle', 'selectionContent',
    'notification', 'placementBadge', 'attackMarker', 'attackModal',
    'attackCoordinates', 'baseSelector', 'attackUnitRows', 'attackSummary',
    'confirmAttack', 'closeAttackModal', 'researchModal', 'researchSlotSummary',
    'researchActiveList', 'doctrineResearchList', 'mechanizedResearchSection',
    'mechanizedResearchTree', 'droneWarfareResearchSection', 'droneWarfareResearchTree',
    'advancedEngineeringResearchSection', 'advancedEngineeringResearchTree',
    'airDominanceResearchSection', 'airDominanceResearchTree', 'commandAutomationResearchSection', 'commandAutomationResearchTree', 'electronicWarfareResearchSection', 'electronicWarfareResearchTree', 'directedEnergyResearchSection', 'directedEnergyResearchTree', 'researchProviderSelect',
    'closeResearchModal', 'pauseButton', 'startOverlay', 'startButton', 'gameOverOverlay',
    'gameOverTitle', 'gameOverText', 'restartButton', 'energyAimHud', 'energyAimInfo', 'energyAimConfirm', 'energyAimCancel', 'app'
  ];
  for (const id of requiredIds) elements.set(id, id === 'gameCanvas' ? canvas : createElement(id));

  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement(id));
      return elements.get(id);
    },
    createElement(tag) { const el = createElement(); el.tagName = String(tag).toUpperCase(); return el; },
    createTextNode(text) { return { nodeType: 3, textContent: String(text) }; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {}, removeEventListener() {},
    body: createElement('body'),
    documentElement: createElement('html')
  };

  const seededMath = Object.create(Math);
  seededMath.random = seededRandom;
  let frameCallback = null;
  const globals = {
    console,
    Math: seededMath,
    Date, Map, Set, WeakMap, WeakSet, Array, Object, Number, String, Boolean,
    JSON, RegExp, Error, TypeError, RangeError, Promise, Symbol, Intl,
    document,
    performance: { now: () => 0 },
    location: { search: '?debug=1' },
    navigator: { userAgent: 'node-regression' },
    devicePixelRatio: 1,
    innerWidth: 1280,
    innerHeight: 720,
    requestAnimationFrame(callback) { frameCallback = callback; return 1; },
    cancelAnimationFrame() {},
    setTimeout() { return 0; },
    clearTimeout() {},
    addEventListener() {},
    removeEventListener() {}
  };
  globals.window = globals;
  globals.globalThis = globals;
  globals.self = globals;
  globals.__getFrameCallback = () => frameCallback;
  return vm.createContext(globals);
}

function getModulePaths(projectRoot) {
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+\.js)"><\/script>/g)].map(match => match[1]);
}

function bootProject(projectRoot, seed = 123456) {
  const context = createRuntimeContext(seed);
  for (const relativePath of getModulePaths(projectRoot)) {
    const filename = path.join(projectRoot, relativePath);
    const code = fs.readFileSync(filename, 'utf8');
    new vm.Script(code, { filename: relativePath }).runInContext(context);
  }
  if (!context.__RTS_DEBUG__) throw new Error('Debug API did not initialize.');
  return context;
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value;
}

function snapshot(debug) {
  const game = debug.game;
  return {
    time: round(game.time),
    players: game.players.map(player => ({
      id: player.id,
      alive: player.alive,
      money: round(player.money),
      completed: [...(player.research?.completed || [])].sort(),
      doctrines: [...(player.research?.unlockedDoctrines || [])].sort(),
      activeResearch: (player.research?.active || []).map(record => ({ id: record.id, progress: round(record.progress), duration: round(record.duration) })).sort((a, b) => a.id.localeCompare(b.id)),
      reserve: (player.capitalReserve || []).length
    })),
    buildings: game.buildings.filter(entity => entity.alive).map(building => ({
      id: building.id,
      type: building.type,
      playerId: building.playerId,
      x: round(building.x),
      y: round(building.y),
      hp: round(building.hp),
      maxHp: round(building.maxHp),
      level: building.level || 0,
      ou: building.onsiteUpgradeLevel || 0,
      storage: building.storage ? { ...building.storage } : null,
      aircraftQueue: building.aircraftQueue?.length || 0,
      trainingQueue: building.trainingQueue?.length || 0
    })).sort((a, b) => a.id - b.id),
    units: game.units.filter(entity => entity.alive).map(unit => ({
      id: unit.id,
      instanceId: unit.instanceId,
      type: unit.type,
      playerId: unit.playerId,
      x: round(unit.x),
      y: round(unit.y),
      hp: round(unit.hp),
      maxHp: round(unit.maxHp),
      order: unit.order ? { type: unit.order.type, x: round(unit.order.x), y: round(unit.order.y) } : null,
      targetId: unit.targetId || null,
      state: unit.airState || unit.engineerState || null
    })).sort((a, b) => a.id - b.id),
    projectiles: game.projectiles.map(projectile => ({
      kind: projectile.type || projectile.kind || '',
      playerId: projectile.playerId,
      x: round(projectile.x),
      y: round(projectile.y),
      targetId: projectile.targetId || null,
      life: round(projectile.life)
    })),
    effects: game.effects.length,
    liveEntityCount: game.liveEntityCount
  };
}

function simulate(debug, seconds, dt = 1 / 30) {
  const steps = Math.round(seconds / dt);
  for (let index = 0; index < steps; index++) debug.update(dt);
}

function snapshotHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

module.exports = { bootProject, snapshot, simulate, snapshotHash };
