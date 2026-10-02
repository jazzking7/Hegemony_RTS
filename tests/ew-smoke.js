'use strict';
const assert=require('assert');
const path=require('path');
const {bootProject}=require('./runtime-harness');
const ROOT=path.resolve(__dirname,'..');
function fresh(seed=515151){const context=bootProject(ROOT,seed);const d=context.__RTS_DEBUG__;d.game.enemyCount=1;d.resetGame();return {context,d};}
function unlock(d,idList){for(const id of idList)d.completeResearch(0,id);}

{
  const {d}=fresh();
  const nodes=Object.values(d.SPECIALIZED_RESEARCH).filter(x=>x.doctrine==='electronicWarfare');
  assert.equal(nodes.length,49);
  assert.equal(d.DOCTRINE_RESEARCH.electronicWarfare.contentReady,true);
  unlock(d,['electronicWarfare','ewUnlockRadar','ewRadarAngle1','ewRadarRange1','ewRadarAngle2','ewRadarRange2','ewRadarAngle3','ewRadarRange3','ewRadarAngle4','ewRadarRange4','ewRadarFreq1','ewRadarVuln1','ewRadarFreq2','ewRadarVuln2','ewRadarFreq3','ewRadarVuln3','ewRadarFreq4','ewRadarVuln4']);
  const radar=d.createBuilding('radarStation',0,1000,1000,{ewHeading:0});
  const stats=d.getEWStationStats(radar);
  assert.equal(stats.angleDeg,35);
  assert(Math.abs(stats.range-1224)<1e-9);
  assert.equal(stats.interval,0.48);
  assert(Math.abs(stats.damageVulnerability-0.75)<1e-9);
  const victim=d.createBuilding('militaryBase',1,1200,1000);
  d.rebuildSpatialHashes(); radar.ewNextEmissionAt=0; d.updateElectronicWarfare(0);
  const hp=victim.hp; d.applyDamage(victim,100,0); assert(Math.abs((hp-victim.hp)-175)<1e-6);
}
console.log('PASS EW radar tree / geometry / vulnerability');

{
  const {context,d}=fresh();
  unlock(d,['electronicWarfare','ewUnlockJamming','ewJammingSlow','ewJammingRangeReduction','ewJammingShutdown']);
  const jammer=d.createBuilding('jammingStation',0,1000,1000,{ewHeading:0}); jammer.ewNextEmissionAt=0;
  const soldier=d.createUnit('basic',1,1200,1000);
  const drone=d.createUnit('loiteringMunition',1,1250,1000);
  d.game.projectiles.push({kind:'fighterA2AMissile',playerId:1,x:1300,y:1000,vx:1,vy:0,speed:380,turnRate:6,targetId:soldier.id,initialTargetId:soldier.id,damage:300,life:5});
  context.Math.random=()=>0;
  d.rebuildSpatialHashes(); d.updateElectronicWarfare(0);
  assert(Math.abs(d.getEntityStat(soldier,'speed',76)-45.6)<1e-6);
  assert(Math.abs(d.getEntityStat(soldier,'range',95)-52.25)<1e-6);
  assert.equal(drone.alive,false);
  assert.equal(d.game.projectiles.some(p=>p.kind==='fighterA2AMissile'),false);
}
console.log('PASS EW jamming slow / range / drone+missile shutdown');

{
  const {context,d}=fresh();
  unlock(d,['electronicWarfare','ewUnlockSpoofing']);
  const victim=d.createUnit('basic',1,1200,1000); victim.orderX=2000;victim.orderY=1000;victim.hasOrder=true;
  for(let i=0;i<10;i++){const s=d.createBuilding('spoofingStation',0,1000,1000,{ewHeading:0});s.ewNextEmissionAt=0;}
  let rolls=0; context.Math.random=()=>{rolls++;return .99;};
  d.rebuildSpatialHashes(); d.updateElectronicWarfare(0);
  assert.equal(rolls,1,'overlapping spoofers must produce only one probability roll in an eligibility window');
  assert.equal(victim.orderX,2000); // order is never destroyed by deception.
  context.Math.random=()=>0;
  d.game.time=0.67; for(const s of d.game.buildings)if(s.type==='spoofingStation')s.ewNextEmissionAt=0;
  d.updateElectronicWarfare(0);
  assert.equal(d.hasStatus(victim,'spoofed'),true);
  assert(d.getSpoofedGoal(victim));
  assert.equal(victim.orderX,2000);
  for(let i=0;i<61;i++){d.game.time+=1/30;d.updateStatuses(1/30);}
  assert.equal(d.hasStatus(victim,'spoofed'),false);
  assert.equal(victim.orderX,2000);
}
console.log('PASS EW spoof anti-stacking / temporary order override');

{
  const {context,d}=fresh();
  unlock(d,['electronicWarfare','ewUnlockJamming']);
  const victim=d.createUnit('loiteringMunition',1,1200,1000);
  for(let i=0;i<10;i++){const s=d.createBuilding('jammingStation',0,1000,1000,{ewHeading:0});s.ewNextEmissionAt=0;}
  let rolls=0; context.Math.random=()=>{rolls++;return .99;};
  d.rebuildSpatialHashes();d.updateElectronicWarfare(0);
  assert.equal(rolls,1,'overlapping jammers must produce only one shutdown roll per eligibility window');
  assert.equal(victim.alive,true);
}
console.log('PASS EW shutdown probability anti-stacking');

{
  const {context,d}=fresh(818181);
  unlock(d,['electronicWarfare','ewUnlockJamming','ewJammingRangeReduction']);
  const jammer=d.createBuilding('jammingStation',0,1000,1000,{ewHeading:0});jammer.ewNextEmissionAt=0;
  const turret=d.createBuilding('machineGun',1,1250,1000);
  const enemyRadar=d.createBuilding('radarStation',1,1300,1000,{ewHeading:Math.PI});
  d.rebuildSpatialHashes(); context.Math.random=()=>.99; d.updateElectronicWarfare(0);
  assert(Math.abs(d.getEntityStat(turret,'range',d.BUILDINGS.machineGun.range)-d.BUILDINGS.machineGun.range*.55)<1e-6);
  assert(Math.abs(d.getEWStationStats(enemyRadar).range-850*.55)<1e-6);
  jammer.ewNextEmissionAt=999; d.game.time=2.1; d.updateElectronicWarfare(0);
  assert(Math.abs(d.getEntityStat(turret,'range',d.BUILDINGS.machineGun.range)-d.BUILDINGS.machineGun.range)<1e-6);
}
console.log('PASS EW jamming affects defensive buildings and opposing EW range, then expires');

{
  const {context,d}=fresh(828282);
  unlock(d,['electronicWarfare','ewUnlockRadar']);
  const fighter=d.createUnit('superFighter',1,1200,1000); fighter.fighterStealthed=true;
  for(let i=0;i<10;i++){const r=d.createBuilding('radarStation',0,1000,1000,{ewHeading:0});r.ewNextEmissionAt=0;}
  let rolls=0;context.Math.random=()=>{rolls++;return .99;};d.rebuildSpatialHashes();d.updateElectronicWarfare(0);
  assert.equal(rolls,1);assert.equal(d.hasStatus(fighter,'revealed'),false);
  context.Math.random=()=>0;d.game.time=.67;for(const r of d.game.buildings)if(r.type==='radarStation')r.ewNextEmissionAt=0;d.updateElectronicWarfare(0);
  assert.equal(d.hasStatus(fighter,'revealed'),true);
}
console.log('PASS EW radar reveal probability is target-throttled across overlapping stations');

{
  const {context,d}=fresh(838383);const p=d.game.players[0];p.money=100000;
  unlock(d,['electronicWarfare','ewUnlockRadar','ewUnlockJamming','ewUnlockSpoofing']);
  const radar=d.createBuilding('radarStation',0,1000,1000,{ewHeading:0});
  d.game.selected=radar;d.openResearchModal();d.renderResearchModal();
  assert(context.document.getElementById('electronicWarfareResearchTree').innerHTML.includes('ewRadarVuln4'));
  assert(d.isPointInEWEmission(radar,1200,1000,d.getEWStationStats(radar)));
  assert(!d.isPointInEWEmission(radar,1000,1200,d.getEWStationStats(radar)));
}
console.log('PASS EW research tree renders and directional cone geometry is respected');

{
  const {d}=fresh(848484); const ai=d.game.players[1]; ai.money=100000;
  unlock({completeResearch:(pid,id)=>d.completeResearch(ai.id,id)},['electronicWarfare','ewUnlockRadar','ewUnlockJamming','ewUnlockSpoofing']);
  for(let i=0;i<12;i++) d.aiBuild(ai);
  const stations=d.game.buildings.filter(b=>b.alive&&b.playerId===ai.id&&['radarStation','jammingStation','spoofingStation'].includes(b.type));
  assert(stations.length>=1);
  d.aiBuild(ai);
  const enemy=d.game.players.find(p=>p.alive&&p.id!==ai.id)?.capital;
  const st=stations[0];
  const expected=Math.atan2(enemy.y-st.y,enemy.x-st.x);
  const delta=Math.atan2(Math.sin(st.ewHeading-expected),Math.cos(st.ewHeading-expected));
  assert(Math.abs(delta)<1e-6);
}
console.log('PASS AI adopts EW facilities and points antennas toward an enemy capital');

// Full EW doctrine stress: both sides fully researched, overlapping directional
// stations, ground/air/drone targets and normal combat all remain finite.
{
  const {d}=fresh(858585);
  for(const player of d.game.players) player.money=250000;
  const ewIds=Object.values(d.SPECIALIZED_RESEARCH).filter(r=>r.doctrine==='electronicWarfare').map(r=>r.id);
  for(const pid of [0,1]) {
    d.completeResearch(pid,'electronicWarfare');
    for(const id of ewIds) d.completeResearch(pid,id);
  }
  const layouts=[
    {pid:0,x:1250,y:900,heading:0},
    {pid:1,x:2150,y:900,heading:Math.PI}
  ];
  for(const side of layouts) {
    for(let copy=0;copy<2;copy++) {
      d.createBuilding('radarStation',side.pid,side.x,side.y+copy*90,{ewHeading:side.heading});
      d.createBuilding('jammingStation',side.pid,side.x,side.y+180+copy*90,{ewHeading:side.heading});
      d.createBuilding('spoofingStation',side.pid,side.x,side.y+360+copy*90,{ewHeading:side.heading});
    }
    d.createBuilding('machineGun',side.pid,side.x+(side.pid===0?180:-180),1080);
    for(let i=0;i<18;i++) d.createUnit(i%4===0?'elite':'basic',side.pid,1600+(side.pid===0?-80:80)+(i%6)*10,850+Math.floor(i/6)*24);
    for(let i=0;i<10;i++) d.createUnit('loiteringMunition',side.pid,1550+(side.pid===0?-90:90)+(i%5)*12,1020+Math.floor(i/5)*18);
    for(let i=0;i<3;i++) d.createUnit('superFighter',side.pid,1500+(side.pid===0?-120:120),1180+i*26);
  }
  for(let i=0;i<120*30;i++) d.update(1/30);
  assert(d.game.liveEntityCount<=1000,'EW stress exceeded live entity cap.');
  assert(d.game.projectiles.length<=2600,'EW stress exceeded projectile cap.');
  for(const entity of [...d.game.units,...d.game.buildings]) if(entity.alive) {
    assert(Number.isFinite(entity.x)&&Number.isFinite(entity.y)&&Number.isFinite(entity.hp)&&Number.isFinite(entity.maxHp),'EW stress produced invalid entity state.');
  }
  for(const projectile of d.game.projectiles) {
    assert(Number.isFinite(projectile.x)&&Number.isFinite(projectile.y)&&Number.isFinite(projectile.life),'EW stress produced invalid projectile state.');
  }
}
console.log('PASS full Electronic Warfare stress');
