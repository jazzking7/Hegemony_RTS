export const MULTIPLAYER_MAPS = Object.freeze({
  standard: { width: 3600, height: 2200 },
  large: { width: 5400, height: 3300 }
});

export const MULTIPLAYER_UNIT_STATS = Object.freeze({
  infantry: { cost: 50, hp: 100, speed: 82, radius: 10, range: 125, damage: 14, cooldown: 0.72 },
  tank: { cost: 140, hp: 360, speed: 54, radius: 17, range: 210, damage: 46, cooldown: 1.25 }
});

const CAPITAL_STATS = Object.freeze({ hp: 2600, radius: 48, range: 300, damage: 22, cooldown: 0.55 });
const COMMANDER_COLORS = ['#67f0cc', '#ff6f79', '#67a8ff', '#ffc45c', '#c88cff'];
const MAX_UNITS_PER_COMMANDER = 50;
const MAX_COMMAND_UNITS = 100;
const INCOME_PER_SECOND = 12;

export type MultiplayerMapSize = keyof typeof MULTIPLAYER_MAPS;
export type MultiplayerUnitType = keyof typeof MULTIPLAYER_UNIT_STATS;
export type MultiplayerEntityType = MultiplayerUnitType | 'capital';

export interface WorldCommanderConfig {
  id: string;
  name: string;
  seat: number;
  isAi: boolean;
}

export interface MultiplayerWorldConfig {
  mapSize: string;
  seed: number;
  commanders: WorldCommanderConfig[];
}

interface WorldCommander extends WorldCommanderConfig {
  color: string;
  money: number;
  alive: boolean;
  aiTimer: number;
}

interface WorldEntity {
  id: number;
  playerId: string;
  type: MultiplayerEntityType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  heading: number;
  orderX: number;
  orderY: number;
  cooldown: number;
}

export interface MatchCommandResult {
  ok: boolean;
  reason?: string;
}

export interface MultiplayerSnapshot {
  tick: number;
  map: { width: number; height: number; size: MultiplayerMapSize };
  players: Array<{
    id: string;
    name: string;
    seat: number;
    color: string;
    money: number;
    alive: boolean;
    isAi: boolean;
    unitCount: number;
  }>;
  entities: Array<{
    id: number;
    playerId: string;
    type: MultiplayerEntityType;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    radius: number;
    heading: number;
    orderX: number;
    orderY: number;
  }>;
  winnerId: string | null;
}

export class MultiplayerWorld {
  readonly mapSize: MultiplayerMapSize;
  readonly width: number;
  readonly height: number;
  private readonly players = new Map<string, WorldCommander>();
  private readonly entities = new Map<number, WorldEntity>();
  private nextEntityId = 1;
  private randomState: number;
  private winnerId: string | null = null;

  constructor(config: MultiplayerWorldConfig) {
    this.mapSize = config.mapSize === 'large' ? 'large' : 'standard';
    const dimensions = MULTIPLAYER_MAPS[this.mapSize];
    this.width = dimensions.width;
    this.height = dimensions.height;
    this.randomState = config.seed >>> 0 || 1;

    const ordered = [...config.commanders].sort((a, b) => a.seat - b.seat);
    ordered.forEach((commander, index) => {
      this.players.set(commander.id, {
        ...commander,
        color: COMMANDER_COLORS[index % COMMANDER_COLORS.length],
        money: 320,
        alive: true,
        aiTimer: 0.7 + index * 0.2
      });
    });
    this.createStartingForces(ordered);
  }

  step(dt: number): string | null {
    if (this.winnerId) return this.winnerId;
    const safeDt = Math.max(0, Math.min(dt, 0.1));
    this.updateCommanders(safeDt);
    this.updateEntities(safeDt);
    this.resolveWinner();
    return this.winnerId;
  }

  applyCommand(sessionId: string, payload: unknown): MatchCommandResult {
    const commander = this.players.get(sessionId);
    if (!commander || !commander.alive || commander.isAi) return { ok: false, reason: 'This commander cannot issue orders.' };
    if (!payload || typeof payload !== 'object') return { ok: false, reason: 'Malformed match command.' };
    const command = payload as Record<string, unknown>;
    if (command.kind === 'train') return this.train(commander, command.unitType);
    if (command.kind === 'move') return this.move(commander, command.entityIds, command.x, command.y);
    return { ok: false, reason: 'Unknown match command.' };
  }

  setAiControlled(playerId: string): void {
    const commander = this.players.get(playerId);
    if (commander) commander.isAi = true;
  }

  snapshot(tick: number): MultiplayerSnapshot {
    const unitCounts = new Map<string, number>();
    this.entities.forEach(entity => {
      if (entity.type !== 'capital') unitCounts.set(entity.playerId, (unitCounts.get(entity.playerId) ?? 0) + 1);
    });
    return {
      tick,
      map: { width: this.width, height: this.height, size: this.mapSize },
      players: [...this.players.values()].sort((a, b) => a.seat - b.seat).map(player => ({
        id: player.id,
        name: player.name,
        seat: player.seat,
        color: player.color,
        money: Math.floor(player.money),
        alive: player.alive,
        isAi: player.isAi,
        unitCount: unitCounts.get(player.id) ?? 0
      })),
      entities: [...this.entities.values()].map(entity => ({
        id: entity.id,
        playerId: entity.playerId,
        type: entity.type,
        x: round(entity.x),
        y: round(entity.y),
        hp: Math.max(0, round(entity.hp)),
        maxHp: entity.maxHp,
        radius: entity.radius,
        heading: round(entity.heading),
        orderX: round(entity.orderX),
        orderY: round(entity.orderY)
      })),
      winnerId: this.winnerId
    };
  }

  private createStartingForces(commanders: WorldCommanderConfig[]): void {
    const radiusX = this.width * 0.34;
    const radiusY = this.height * 0.34;
    commanders.forEach((commander, index) => {
      const angle = Math.PI + index * Math.PI * 2 / commanders.length;
      const x = this.width / 2 + Math.cos(angle) * radiusX;
      const y = this.height / 2 + Math.sin(angle) * radiusY;
      this.createEntity(commander.id, 'capital', x, y);
      for (let unit = 0; unit < 5; unit++) this.spawnUnit(commander.id, 'infantry', x, y);
      this.spawnUnit(commander.id, 'tank', x, y);
    });
  }

  private updateCommanders(dt: number): void {
    this.players.forEach(commander => {
      if (!commander.alive) return;
      commander.money = Math.min(9999, commander.money + INCOME_PER_SECOND * dt);
      if (!commander.isAi) return;
      commander.aiTimer -= dt;
      if (commander.aiTimer > 0) return;
      commander.aiTimer = 1.4 + this.random() * 0.8;
      const unitType: MultiplayerUnitType = commander.money >= MULTIPLAYER_UNIT_STATS.tank.cost && this.random() < 0.36 ? 'tank' : 'infantry';
      this.train(commander, unitType);
      const target = this.closestEnemyCapital(commander.id);
      if (!target) return;
      const ids = [...this.entities.values()]
        .filter(entity => entity.playerId === commander.id && entity.type !== 'capital')
        .map(entity => entity.id);
      this.move(commander, ids, target.x + (this.random() - 0.5) * 100, target.y + (this.random() - 0.5) * 100);
    });
  }

  private updateEntities(dt: number): void {
    const pendingDamage = new Map<number, number>();
    for (const entity of this.entities.values()) {
      entity.cooldown = Math.max(0, entity.cooldown - dt);
      const stats = entity.type === 'capital' ? CAPITAL_STATS : MULTIPLAYER_UNIT_STATS[entity.type];
      const target = this.closestHostileInRange(entity, stats.range, entity.type === 'capital');
      if (target) {
        entity.heading = Math.atan2(target.y - entity.y, target.x - entity.x);
        if (entity.cooldown <= 0) {
          pendingDamage.set(target.id, (pendingDamage.get(target.id) ?? 0) + stats.damage);
          entity.cooldown = stats.cooldown;
        }
      } else if (entity.type !== 'capital') {
        const unitStats = MULTIPLAYER_UNIT_STATS[entity.type];
        const dx = entity.orderX - entity.x;
        const dy = entity.orderY - entity.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 3) {
          const step = Math.min(distance, unitStats.speed * dt);
          entity.x += dx / distance * step;
          entity.y += dy / distance * step;
          entity.heading = Math.atan2(dy, dx);
        }
      }
    }

    pendingDamage.forEach((damage, targetId) => {
      const target = this.entities.get(targetId);
      if (target) target.hp -= damage;
    });
    const eliminated = new Set<string>();
    this.entities.forEach(entity => {
      if (entity.hp > 0) return;
      this.entities.delete(entity.id);
      if (entity.type === 'capital') eliminated.add(entity.playerId);
    });
    eliminated.forEach(playerId => this.eliminate(playerId));
  }

  private train(commander: WorldCommander, unitTypeValue: unknown): MatchCommandResult {
    const unitType = String(unitTypeValue) as MultiplayerUnitType;
    if (!(unitType in MULTIPLAYER_UNIT_STATS)) return { ok: false, reason: 'Unknown unit type.' };
    const unitCount = [...this.entities.values()].filter(entity => entity.playerId === commander.id && entity.type !== 'capital').length;
    if (unitCount >= MAX_UNITS_PER_COMMANDER) return { ok: false, reason: 'Unit cap reached.' };
    const stats = MULTIPLAYER_UNIT_STATS[unitType];
    if (commander.money < stats.cost) return { ok: false, reason: `You need $${stats.cost} to train that unit.` };
    const capital = this.getCapital(commander.id);
    if (!capital) return { ok: false, reason: 'Your capital has been destroyed.' };
    commander.money -= stats.cost;
    this.spawnUnit(commander.id, unitType, capital.x, capital.y);
    return { ok: true };
  }

  private move(commander: WorldCommander, entityIdsValue: unknown, xValue: unknown, yValue: unknown): MatchCommandResult {
    if (!Array.isArray(entityIdsValue)) return { ok: false, reason: 'Select units before issuing a move order.' };
    const x = Number(xValue);
    const y = Number(yValue);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: 'Invalid destination.' };
    const destinationX = clamp(x, 0, this.width);
    const destinationY = clamp(y, 0, this.height);
    const ids = [...new Set(entityIdsValue.slice(0, MAX_COMMAND_UNITS).map(Number).filter(Number.isInteger))];
    let moved = 0;
    ids.forEach((id, index) => {
      const entity = this.entities.get(id);
      if (!entity || entity.playerId !== commander.id || entity.type === 'capital') return;
      const column = index % 8;
      const row = Math.floor(index / 8);
      entity.orderX = clamp(destinationX + (column - 3.5) * 25, 0, this.width);
      entity.orderY = clamp(destinationY + row * 25, 0, this.height);
      moved++;
    });
    return moved ? { ok: true } : { ok: false, reason: 'No owned units were selected.' };
  }

  private spawnUnit(playerId: string, type: MultiplayerUnitType, capitalX: number, capitalY: number): WorldEntity {
    const angle = this.random() * Math.PI * 2;
    const distance = 75 + this.random() * 55;
    return this.createEntity(playerId, type, capitalX + Math.cos(angle) * distance, capitalY + Math.sin(angle) * distance);
  }

  private createEntity(playerId: string, type: MultiplayerEntityType, x: number, y: number): WorldEntity {
    const stats = type === 'capital' ? CAPITAL_STATS : MULTIPLAYER_UNIT_STATS[type];
    const entity: WorldEntity = {
      id: this.nextEntityId++,
      playerId,
      type,
      x: clamp(x, stats.radius, this.width - stats.radius),
      y: clamp(y, stats.radius, this.height - stats.radius),
      hp: stats.hp,
      maxHp: stats.hp,
      radius: stats.radius,
      heading: 0,
      orderX: x,
      orderY: y,
      cooldown: this.random() * stats.cooldown
    };
    this.entities.set(entity.id, entity);
    return entity;
  }

  private closestHostileInRange(entity: WorldEntity, range: number, unitsOnly: boolean): WorldEntity | undefined {
    let closest: WorldEntity | undefined;
    let closestDistance = range * range;
    for (const candidate of this.entities.values()) {
      if (candidate.playerId === entity.playerId || (unitsOnly && candidate.type === 'capital')) continue;
      const dx = candidate.x - entity.x;
      const dy = candidate.y - entity.y;
      const distance = dx * dx + dy * dy;
      if (distance <= closestDistance) {
        closest = candidate;
        closestDistance = distance;
      }
    }
    return closest;
  }

  private closestEnemyCapital(playerId: string): WorldEntity | undefined {
    const own = this.getCapital(playerId);
    if (!own) return undefined;
    return [...this.entities.values()]
      .filter(entity => entity.playerId !== playerId && entity.type === 'capital')
      .sort((a, b) => distanceSquared(own, a) - distanceSquared(own, b))[0];
  }

  private getCapital(playerId: string): WorldEntity | undefined {
    return [...this.entities.values()].find(entity => entity.playerId === playerId && entity.type === 'capital');
  }

  private eliminate(playerId: string): void {
    const commander = this.players.get(playerId);
    if (commander) commander.alive = false;
    this.entities.forEach(entity => {
      if (entity.playerId === playerId) this.entities.delete(entity.id);
    });
  }

  private resolveWinner(): void {
    const alive = [...this.players.values()].filter(player => player.alive);
    if (this.players.size > 1 && alive.length === 1) this.winnerId = alive[0].id;
  }

  private random(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }
}

function distanceSquared(a: Pick<WorldEntity, 'x' | 'y'>, b: Pick<WorldEntity, 'x' | 'y'>): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function seedFromRoomCode(roomCode: string): number {
  let hash = 2166136261;
  for (let index = 0; index < roomCode.length; index++) {
    hash ^= roomCode.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
