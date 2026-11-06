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

function createRuntimeContext(seed = 123456, search = '?debug=1', options = {}) {
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
    ...options,
    console,
    Math: seededMath,
    Date, Map, Set, WeakMap, WeakSet, Array, Object, Number, String, Boolean,
    JSON, RegExp, Error, TypeError, RangeError, Promise, Symbol, Intl,
    document,
    performance: { now: () => 0 },
    location: { search },
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

function bootProject(projectRoot, seed = 123456, search = '?debug=1', options = {}) {
  const context = createRuntimeContext(seed, search, options);
  for (const relativePath of getModulePaths(projectRoot)) {
    const filename = path.join(projectRoot, relativePath);
    const code = fs.readFileSync(filename, 'utf8');
    new vm.Script(code, { filename: relativePath }).runInContext(context);
  }
  if (!context.__RTS_DEBUG__) throw new Error('Debug API did not initialize.');
  return context;
}


module.exports = { bootProject };
