'use strict';
const crypto = require('crypto');
const { bootProject } = require('../server/runtime/headless.cjs');

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value;
}

function snapshot(debug) {
  const game = debug.game;
  return {
    time: round(game.time),
    captureZones: (game.captureZones || []).map(z => ({ id:z.id, x:round(z.x), y:round(z.y), regionId:z.regionId, ownerId:z.ownerId, claimantId:z.claimantId, contested:z.contested, progress:round(z.progress), invasion:round(z.invasion), abandoned:round(z.abandoned) })),
    captureIncome: [...(game.captureIncome || [])],
    territorialControl: (game.territorialControl || []).map(round),
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
