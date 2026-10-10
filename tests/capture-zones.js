'use strict';
const assert = require('assert');
const path = require('path');
const { bootProject } = require('./runtime-harness');
const ROOT = path.resolve(__dirname, '..');
const fresh = (search = '?debug=1') => {
  const c = bootProject(ROOT, 4242, search);
  if (!c.__RTS_DEBUG__.game.started) c.__RTS_DEBUG__.resetGame();
  return c;
};

for (const map of ['standard', 'large']) for (const seed of [1, 12, 77, 9001, ...Array.from({length:20},(_,i)=>i*7919+19)]) {
  const search = `?debug=1&network=1&player=0&humans=0%2C1&commanders=${2+seed%4}&map=${map}&seed=${seed}`;
  const c = fresh(search), g = c.__RTS_DEBUG__.game;
  const width=map === 'large' ? 5400 : 3600, height=map === 'large' ? 3300 : 2200;
  assert.equal(g.captureZones.length, map === 'large' ? 25 : 16);
  assert.equal(g.captureRegions.length, map === 'large' ? 8 : 6);
  assert.equal(g.captureRegions.reduce((n,r) => n + r.zones.length, 0), g.captureZones.length);
  assert(Math.abs(g.captureZones.reduce((n,z)=>n+z.territoryArea,0)-width*height)<1e-6, 'Polygons cover the complete map area');
  assert(g.captureZones.some(z=>Math.hypot(z.x-width/2,z.y-height/2)<height*.15), 'A zone covers the central map');
  for (const a of g.captureZones) {
    assert.equal(a.ownerId, null);
    assert.equal(a.radius, 60);
    assert(a.x >= 60 && a.y >= 60 && a.x <= (map === 'large' ? 5400 : 3600) - 60 && a.y <= (map === 'large' ? 3300 : 2200) - 60);
    for (const b of g.captureZones) if (a !== b) assert(Math.hypot(a.x-b.x,a.y-b.y) >= 200);
    assert(g.buildings.every(b => Math.hypot(a.x-b.x,a.y-b.y) > b.radius + 60));
    assert(c.territoryContainsCircle(a.territory,a,60), 'Full capture circle fits its polygon');
    const perimeter=a.territory.reduce((n,p,i)=>{const q=a.territory[(i+1)%a.territory.length];return n+Math.hypot(p.x-q.x,p.y-q.y);},0);
    assert(4*Math.PI*a.territoryArea/perimeter**2 > .45, 'Territories remain compact, without thin slivers');
    const box=a.territoryBounds, w=box.right-box.left, h=box.bottom-box.top;
    assert(Math.max(w/h,h/w)<3, 'Territories have bounded aspect ratios');
    for (const b of g.captureZones) if (a.id < b.id) {
      let intersection=a.territory;
      for (let i=0;i<b.territory.length;i++) {
        const p=b.territory[i],q=b.territory[(i+1)%b.territory.length],nx=q.y-p.y,ny=p.x-q.x;
        intersection=c.clipTerritoryPolygon(intersection,nx,ny,nx*p.x+ny*p.y);
      }
      assert(c.territoryPolygonArea(intersection)<1e-6, 'Territory interiors never overlap');
    }
  }
  for (const region of g.captureRegions) {
    const visited=new Set(), pending=[region.zones[0]];
    while(pending.length) {
      const z=pending.pop();if(visited.has(z.id))continue;visited.add(z.id);
      for(const edge of z.territoryEdges) if(edge.neighborId && !edge.regional) pending.push(g.captureZones.find(other=>other.id===edge.neighborId));
    }
    assert.equal(visited.size,region.zones.length,'Every region is one connected group of adjacent territories');
  }
  const peer = fresh(search.replace('player=0', 'player=1'));
  assert.equal(JSON.stringify(g.captureZones), JSON.stringify(peer.__RTS_DEBUG__.game.captureZones), 'All seats generate identical territory');
}
console.log('PASS exact zone/region counts, spacing, initial neutrality and shared-seed layouts');

{
  const c=fresh(),g=c.__RTS_DEBUG__.game,z=g.captureZones.find(z=>!c.isInsideFriendlyBuildZone(0,z.x,z.y,20));
  g.players[0].money=10000;
  const before=c.checkPlacement('city',z.x,z.y,0);
  c.advanceCaptureZone(z,1,20);c.rebuildCaptureIncome();
  assert.equal(g.territorialControl[0],z.territoryArea);
  assert.deepEqual(c.checkPlacement('city',z.x,z.y,0),before,'Territorial ownership never changes construction eligibility');
  assert.equal(before.reason,'Outside construction radius');
  c.advanceCaptureZone(z,2,9);c.rebuildCaptureIncome();
  assert.equal(g.territorialControl[0],z.territoryArea,'Grace retains owned area');
  assert.equal(g.captureIncome[0],0,'Contested grace has no income');
  c.advanceCaptureZone(z,2,1);c.rebuildCaptureIncome();
  assert.equal(g.territorialControl[0],0,'Revocation removes owned area');
  for(const zone of g.captureZones) {zone.ownerId=0;zone.contested=false;}
  c.rebuildCaptureIncome();c.updateHUD();
  assert.equal(c.document.getElementById('territorialControlValue').textContent,'100.00%');
  assert.equal(g.captureDetails,false);
  assert.doesNotThrow(()=>c.draw());g.captureDetails=true;assert.doesNotThrow(()=>c.draw());
}
console.log('PASS polygon coverage, compactness, area-based control, central coverage and unchanged construction rules');

{
  const c = fresh(), g = c.__RTS_DEBUG__.game, z = g.captureZones[0];
  const step = (mask, seconds) => c.advanceCaptureZone(z, mask, seconds);
  step(1, 12); assert.equal(z.progress, 12);
  step(3, 8); assert.equal(z.progress, 12); assert(z.contested);
  step(1, 7.9); assert.equal(z.ownerId, null);
  step(1, 0.1); assert.equal(z.ownerId, 0);
  step(3, 9.9); assert(z.contested); assert.equal(z.ownerId, 0);
  step(1, 0.1); assert.equal(z.ownerId, 0); assert(!z.contested); assert.equal(z.invasion, 0);
  step(2, 10); assert.equal(z.ownerId, null); assert.equal(z.progress, 0); assert(z.contested);
  step(2, 19.9); assert.equal(z.ownerId, null);
  step(2, 0.1); assert.equal(z.ownerId, 1);
  step(0, 59.9); assert.equal(z.ownerId, 1);
  step(2, 0.1); assert.equal(z.abandoned, 0);
  step(0, 60); assert.equal(z.ownerId, null);
  step(1, 15); step(0, 1); assert.equal(z.progress, 0); assert.equal(z.claimantId, null);
  step(1, 12); step(3, 2); step(2, 1); assert.equal(z.progress, 1); assert.equal(z.claimantId, 1);
  step(3, 10); step(0, 1); assert(!z.contested); assert.equal(z.progress, 0);
  step(1, 20); g.players[0].alive = false; step(0, 1); assert.equal(z.ownerId, null, 'Defeated owners lose territory');
}
console.log('PASS capture pause/reset, uninterrupted invasion grace, fresh recapture and abandonment boundaries');

{
  const c = fresh(), d = c.__RTS_DEBUG__, g = d.game, z = g.captureZones[0];
  const unit = d.createUnit('basic', 0, z.x + 60, z.y);
  unit.x += unit.radius;
  d.rebuildSpatialHashes();
  assert.equal(c.getCaptureZonePresence(z), 1, 'Entity edge overlap counts');
  unit.x += 0.01; d.rebuildSpatialHashes(); assert.equal(c.getCaptureZonePresence(z), 0);
  unit.x = z.x; unit.garrisoned = true; d.rebuildSpatialHashes(); assert.equal(c.getCaptureZonePresence(z), 0);
  const plane = d.createUnit('bomber', 1, z.x, z.y);
  const drone = d.createUnit('loiteringMunition', 1, z.x, z.y);
  d.rebuildSpatialHashes(); assert.equal(c.getCaptureZonePresence(z), 0, 'Aircraft cannot capture');
  plane.alive = false;
  drone.alive = false;
  const building = d.createBuilding('city', 1, z.x + z.radius, z.y);
  d.rebuildSpatialHashes(); assert.equal(c.getCaptureZonePresence(z), 2, 'Buildings capture by overlap');
  building.alive = false; unit.garrisoned = false; d.rebuildSpatialHashes();
  for (let i = 0; i < 600; i++) c.updateCaptureZones(1/30);
  assert.equal(z.ownerId, 0, 'Twenty seconds at real fixed timestep captures');
  const baseIncome = c.calculateIncome(0) - g.captureIncome[0];
  const region = g.captureRegions[0];
  for (const zone of region.zones) { zone.ownerId = 0; zone.contested = false; }
  c.rebuildCaptureIncome();
  assert.equal(g.captureIncome[0], region.zones.length * 300);
  const money = g.players[0].money;
  c.updateEconomy(60);
  assert(Math.abs(g.players[0].money - money - baseIncome - region.zones.length*300) < 1e-6);
  z.contested = true; c.rebuildCaptureIncome();
  assert.equal(g.captureIncome[0], (region.zones.length - 1) * 200, 'Contesting one zone removes that income and the complete region bonus');
  z.contested = false; z.abandoned = 59; c.rebuildCaptureIncome();
  assert.equal(g.captureIncome[0], region.zones.length * 300, 'Vacancy grace keeps zone and region income');
  g.selected = z; c.renderSelectionPanel(); c.refreshSelectionPanelLiveState();
  assert(c.document.getElementById('selectionContent').innerHTML.includes('DEPLOY TO THIS ZONE'));
  assert.doesNotThrow(() => c.draw(), 'Drawing a selected zone must not assume it is a building');
}
console.log('PASS eligible overlap, fixed-step capture, continuous income, region bonus and zone panel');

{
  const c = fresh(), d = c.__RTS_DEBUG__, g = d.game;
  for (const player of g.players) if (player.isAI) player.ai.captureTimer = 0;
  c.updateCaptureZoneAI(1/30);
  assert(g.units.some(u => u.alive && u.captureZoneId && g.players[u.playerId].isAI), 'AI dispatches real units toward territory');
}
console.log('PASS AI dispatches capture squads');
