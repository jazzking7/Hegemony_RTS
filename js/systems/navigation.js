'use strict';

  // ---------------------------------------------------------------------------
  // Spatial hash: only local cells are scanned for targeting and avoidance.
  // ---------------------------------------------------------------------------
  class SpatialHash {
    constructor(cellSize = 150) {
      this.cellSize = cellSize;
      this.columns = Math.ceil(WORLD.width / cellSize) + 2;
      this.cells = new Map();
    }

    clear() { this.cells.clear(); }

    resizeWorld() {
      this.columns = Math.ceil(WORLD.width / this.cellSize) + 2;
      this.clear();
    }

    key(cx, cy) { return cx + cy * this.columns; }

    insert(entity) {
      const cx = Math.floor(entity.x / this.cellSize);
      const cy = Math.floor(entity.y / this.cellSize);
      const key = this.key(cx, cy);
      let list = this.cells.get(key);
      if (!list) {
        list = [];
        this.cells.set(key, list);
      }
      list.push(entity);
    }

    queryCircle(x, y, radius, out = []) {
      out.length = 0;
      const minX = Math.floor((x - radius) / this.cellSize);
      const maxX = Math.floor((x + radius) / this.cellSize);
      const minY = Math.floor((y - radius) / this.cellSize);
      const maxY = Math.floor((y + radius) / this.cellSize);
      const r2 = radius * radius;
      for (let cy = minY; cy <= maxY; cy++) {
        for (let cx = minX; cx <= maxX; cx++) {
          const list = this.cells.get(this.key(cx, cy));
          if (!list) continue;
          for (let i = 0; i < list.length; i++) {
            const e = list[i];
            const dx = e.x - x;
            const dy = e.y - y;
            if (dx * dx + dy * dy <= r2) out.push(e);
          }
        }
      }
      return out;
    }
  }

  const unitGrid = new SpatialHash(145);
  const buildingGrid = new SpatialHash(180);
  const queryScratchA = [];
  const queryScratchB = [];
  const queryScratchC = [];

  // Ground units intentionally use a slightly inset structure collision shell.
  // Buildings are already forced to keep a minimum spacing when placed, so
  // allowing a few pixels of visual overlap gives small units a reliable lane
  // between structures instead of turning narrow gaps into permanent traps.
  const BUILDING_PLACEMENT_GAP = 14;
  // All ground units are allowed a modest amount of visual overlap with the
  // circular building artwork. Placement already guarantees 14px edge-to-edge;
  // a 4px collision inset on each side leaves a 6px center corridor even for
  // the largest ground vehicle. This makes every legal building gap genuinely
  // traversable instead of merely theoretically traversable.
  const BUILDING_UNIT_CLEARANCE_CAP = 4;
  const BUILDING_AVOIDANCE_MARGIN = 7;
  const BUILDING_LOOKAHEAD_MIN = 12;
  const BUILDING_LOOKAHEAD_MAX = 34;

  function getBuildingUnitCollisionGap(unit, building) {
    const radius = Math.max(1, Number(unit?.radius) || 1);
    const assistedClearance = game.time < (unit?.gapAssistUntil || 0) ? 1.5 : BUILDING_UNIT_CLEARANCE_CAP;
    const unitClearance = Math.min(radius, assistedClearance);
    return Math.max(2, (building?.radius || 0) + unitClearance);
  }

  function pointSegmentDistanceSq(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 <= 0.000001) {
      const ex = px - x1;
      const ey = py - y1;
      return ex * ex + ey * ey;
    }
    const t = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    const ex = px - cx;
    const ey = py - cy;
    return ex * ex + ey * ey;
  }

  function isGroundSegmentClear(unit, x1, y1, x2, y2, goalX = x2, goalY = y2, extraClearance = 0) {
    const midX = (x1 + x2) * 0.5;
    const midY = (y1 + y2) * 0.5;
    const halfLength = Math.hypot(x2 - x1, y2 - y1) * 0.5;
    buildingGrid.queryCircle(midX, midY, halfLength + 95, queryScratchC);
    for (const b of queryScratchC) {
      if (!b.alive || b.type === 'landmine' || isGoalBuilding(b, goalX, goalY)) continue;
      const gap = getBuildingUnitCollisionGap(unit, b) + extraClearance;
      if (pointSegmentDistanceSq(b.x, b.y, x1, y1, x2, y2) < gap * gap) return false;
    }
    return true;
  }

  function isGoalBuilding(building, goalX, goalY) {
    if (!building?.alive) return false;
    return Math.hypot(goalX - building.x, goalY - building.y) <= building.radius + 4;
  }

  const NAV_DIRECTIONS = Object.freeze([
    Object.freeze([-1, 0, 1]), Object.freeze([1, 0, 1]),
    Object.freeze([0, -1, 1]), Object.freeze([0, 1, 1]),
    Object.freeze([-1, -1, 1.41421356]), Object.freeze([1, -1, 1.41421356]),
    Object.freeze([-1, 1, 1.41421356]), Object.freeze([1, 1, 1.41421356])
  ]);

  // Coarse static navigation grid. Local steering handles ordinary movement;
  // this grid is only used when buildings block a direct route or a unit stalls.
  class NavigationGrid {
    constructor(cellSize = 48) {
      this.cellSize = cellSize;
      this.cols = Math.ceil(WORLD.width / cellSize);
      this.rows = Math.ceil(WORLD.height / cellSize);
      this.count = this.cols * this.rows;
      this.blocked = new Uint8Array(this.count);
      this.gScore = new Float32Array(this.count);
      this.parent = new Int32Array(this.count);
      this.seen = new Uint32Array(this.count);
      this.closed = new Uint32Array(this.count);
      this.heapNodes = new Int32Array(this.count * 5);
      this.heapScores = new Float32Array(this.count * 5);
      this.searchId = 0;
      this.dirty = true;
      this.version = 0;
    }

    resizeWorld() {
      this.cols = Math.ceil(WORLD.width / this.cellSize);
      this.rows = Math.ceil(WORLD.height / this.cellSize);
      this.count = this.cols * this.rows;
      this.blocked = new Uint8Array(this.count);
      this.gScore = new Float32Array(this.count);
      this.parent = new Int32Array(this.count);
      this.seen = new Uint32Array(this.count);
      this.closed = new Uint32Array(this.count);
      this.heapNodes = new Int32Array(this.count * 5);
      this.heapScores = new Float32Array(this.count * 5);
      this.searchId = 0;
      this.dirty = true;
      this.version++;
    }

    markDirty() { this.dirty = true; }

    index(cx, cy) { return cx + cy * this.cols; }
    cellX(index) { return index % this.cols; }
    cellY(index) { return (index / this.cols) | 0; }
    inBounds(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows; }
    isBlocked(cx, cy) { return !this.inBounds(cx, cy) || this.blocked[this.index(cx, cy)] !== 0; }

    rebuild() {
      if (!this.dirty) return;
      this.blocked.fill(0);
      for (const b of game.buildings) {
        if (!b.alive || b.type === 'landmine') continue;
        // The grid represents the structure footprint, not a worst-case unit
        // footprint. Unit-specific soft collision is handled locally by moveUnit.
        // This keeps the guaranteed placement gaps navigable instead of merging
        // nearby buildings into one oversized blocked blob.
        const clearance = b.radius + 2;
        const minX = clamp(Math.floor((b.x - clearance) / this.cellSize), 0, this.cols - 1);
        const maxX = clamp(Math.floor((b.x + clearance) / this.cellSize), 0, this.cols - 1);
        const minY = clamp(Math.floor((b.y - clearance) / this.cellSize), 0, this.rows - 1);
        const maxY = clamp(Math.floor((b.y + clearance) / this.cellSize), 0, this.rows - 1);
        const r2 = clearance * clearance;
        for (let cy = minY; cy <= maxY; cy++) {
          const wy = (cy + 0.5) * this.cellSize;
          for (let cx = minX; cx <= maxX; cx++) {
            const wx = (cx + 0.5) * this.cellSize;
            const dx = wx - b.x;
            const dy = wy - b.y;
            if (dx * dx + dy * dy <= r2) this.blocked[this.index(cx, cy)] = 1;
          }
        }
      }
      this.dirty = false;
      this.version++;
    }

    worldToCell(x, y) {
      return {
        x: clamp(Math.floor(x / this.cellSize), 0, this.cols - 1),
        y: clamp(Math.floor(y / this.cellSize), 0, this.rows - 1)
      };
    }

    cellToWorld(index) {
      return {
        x: clamp((this.cellX(index) + 0.5) * this.cellSize, 1, WORLD.width - 1),
        y: clamp((this.cellY(index) + 0.5) * this.cellSize, 1, WORLD.height - 1)
      };
    }

    nearestOpenIndex(cx, cy, maxRadius = 14) {
      if (!this.isBlocked(cx, cy)) return this.index(cx, cy);
      for (let r = 1; r <= maxRadius; r++) {
        let best = -1;
        let bestD2 = Infinity;
        for (let x = cx - r; x <= cx + r; x++) {
          for (const y of [cy - r, cy + r]) {
            if (!this.inBounds(x, y) || this.isBlocked(x, y)) continue;
            const d2 = (x - cx) ** 2 + (y - cy) ** 2;
            if (d2 < bestD2) { bestD2 = d2; best = this.index(x, y); }
          }
        }
        for (let y = cy - r + 1; y <= cy + r - 1; y++) {
          for (const x of [cx - r, cx + r]) {
            if (!this.inBounds(x, y) || this.isBlocked(x, y)) continue;
            const d2 = (x - cx) ** 2 + (y - cy) ** 2;
            if (d2 < bestD2) { bestD2 = d2; best = this.index(x, y); }
          }
        }
        if (best >= 0) return best;
      }
      return -1;
    }

    lineClear(x1, y1, x2, y2) {
      this.rebuild();
      const dx = x2 - x1;
      const dy = y2 - y1;
      const distance = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(distance / (this.cellSize * 0.42)));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const c = this.worldToCell(x1 + dx * t, y1 + dy * t);
        if (this.isBlocked(c.x, c.y)) return false;
      }
      return true;
    }

    heuristic(ax, ay, bx, by) {
      const dx = Math.abs(ax - bx);
      const dy = Math.abs(ay - by);
      return Math.max(dx, dy) + 0.41421356 * Math.min(dx, dy);
    }

    findPath(startX, startY, goalX, goalY, maxExpanded = 4200) {
      this.rebuild();
      const startCell = this.worldToCell(startX, startY);
      const goalCell = this.worldToCell(goalX, goalY);
      const start = this.nearestOpenIndex(startCell.x, startCell.y);
      const goal = this.nearestOpenIndex(goalCell.x, goalCell.y);
      if (start < 0 || goal < 0) return null;
      if (start === goal) return [this.cellToWorld(goal)];

      this.searchId++;
      if (this.searchId === 0xffffffff) {
        this.seen.fill(0);
        this.closed.fill(0);
        this.searchId = 1;
      }
      const sid = this.searchId;
      let heapSize = 0;

      const heapPush = (node, score) => {
        if (heapSize >= this.heapNodes.length) return;
        let i = heapSize++;
        while (i > 0) {
          const parent = (i - 1) >> 1;
          if (this.heapScores[parent] <= score) break;
          this.heapNodes[i] = this.heapNodes[parent];
          this.heapScores[i] = this.heapScores[parent];
          i = parent;
        }
        this.heapNodes[i] = node;
        this.heapScores[i] = score;
      };

      const heapPop = () => {
        const node = this.heapNodes[0];
        heapSize--;
        if (heapSize > 0) {
          const lastNode = this.heapNodes[heapSize];
          const lastScore = this.heapScores[heapSize];
          let i = 0;
          while (true) {
            let child = i * 2 + 1;
            if (child >= heapSize) break;
            if (child + 1 < heapSize && this.heapScores[child + 1] < this.heapScores[child]) child++;
            if (this.heapScores[child] >= lastScore) break;
            this.heapNodes[i] = this.heapNodes[child];
            this.heapScores[i] = this.heapScores[child];
            i = child;
          }
          this.heapNodes[i] = lastNode;
          this.heapScores[i] = lastScore;
        }
        return node;
      };

      const gx = this.cellX(goal);
      const gy = this.cellY(goal);
      this.seen[start] = sid;
      this.gScore[start] = 0;
      this.parent[start] = -1;
      heapPush(start, this.heuristic(this.cellX(start), this.cellY(start), gx, gy));

      let expanded = 0;
      let found = false;

      while (heapSize > 0 && expanded < maxExpanded) {
        const current = heapPop();
        if (this.closed[current] === sid) continue;
        this.closed[current] = sid;
        expanded++;
        if (current === goal) { found = true; break; }

        const cx = this.cellX(current);
        const cy = this.cellY(current);
        const currentG = this.gScore[current];
        for (const [dx, dy, moveCost] of NAV_DIRECTIONS) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!this.inBounds(nx, ny) || this.isBlocked(nx, ny)) continue;
          if (dx !== 0 && dy !== 0 && (this.isBlocked(cx + dx, cy) || this.isBlocked(cx, cy + dy))) continue;
          const next = this.index(nx, ny);
          if (this.closed[next] === sid) continue;
          const tentative = currentG + moveCost;
          if (this.seen[next] !== sid || tentative < this.gScore[next]) {
            this.seen[next] = sid;
            this.gScore[next] = tentative;
            this.parent[next] = current;
            heapPush(next, tentative + this.heuristic(nx, ny, gx, gy));
          }
        }
      }

      if (!found) return null;
      const reverse = [];
      let cursor = goal;
      while (cursor >= 0 && cursor !== start && reverse.length < this.count) {
        reverse.push(cursor);
        cursor = this.parent[cursor];
      }
      reverse.reverse();
      if (!reverse.length) return [this.cellToWorld(goal)];

      // Smooth the coarse cell route into a small waypoint list.
      const raw = [start, ...reverse];
      const points = [];
      let anchor = 0;
      while (anchor < raw.length - 1) {
        const a = this.cellToWorld(raw[anchor]);
        let next = anchor + 1;
        for (let candidate = raw.length - 1; candidate > anchor + 1; candidate--) {
          const b = this.cellToWorld(raw[candidate]);
          if (this.lineClear(a.x, a.y, b.x, b.y)) { next = candidate; break; }
        }
        points.push(this.cellToWorld(raw[next]));
        anchor = next;
      }
      return points;
    }
  }

  const navGrid = new NavigationGrid(48);

