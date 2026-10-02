'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {bootProject}=require('./runtime-harness');
const ROOT=path.resolve(__dirname,'..');
function fresh(seed=919191){const context=bootProject(ROOT,seed);const d=context.__RTS_DEBUG__;d.game.enemyCount=1;d.resetGame();for(const p of d.game.players)p.money=250000;return {context,d};}
function unlock(d,ids,pid=0){for(const id of ids)d.completeResearch(pid,id);}
function advanceMLS(d,seconds,dt=1/30){for(let t=0;t<seconds-1e-9;t+=dt){d.game.time+=dt;d.updateMissileLaunchSites(dt);}}

{
  const {d}=fresh();
  const nodes=Object.values(d.SPECIALIZED_RESEARCH).filter(x=>x.doctrine==='missileBattery');
  assert.equal(d.DOCTRINE_RESEARCH.missileBattery.contentReady,true);
  assert.equal(nodes.length,48);
  unlock(d,['missileBattery','mbUnlockMLS']);
  const s=d.getStrategicMissileStats(0,'conventional');
  assert.deepEqual([s.cost,s.range,s.aoe,s.damage,s.speed],[300,1300,150,450,700]);
  const site=d.createBuilding('missileLaunchSite',0,1100,1000);
  d.ensureMissileLaunchSiteState(site);
  assert.equal(site.missileSilos.length,4);assert.equal(d.getMissileStorageCapacity(0),4);assert(site.missileSilos.every(x=>!x.active));
  d.toggleMissileSilo(site,0);
  advanceMLS(d,19.9);assert.equal(site.missileSilos[0].loadedType,null);assert.equal(site.missileSilos[0].stage,'building');
  advanceMLS(d,15.2);assert.equal(site.missileSilos[0].loadedType,'conventional');
  assert.equal(site.missileSilos[1].loadedType,null,'inactive silo must remain independent');
  site.missileStockpile.push('conventional');d.toggleMissileSilo(site,1);d.updateMissileLaunchSites(0);
  assert.equal(site.missileSilos[1].stage,'reloading');assert.equal(site.missileStockpile.length,0);
  advanceMLS(d,15.1);assert.equal(site.missileSilos[1].loadedType,'conventional');
  const r=d.launchStrategicMissile(site,0,1700,1000);assert(r.ok);d.updateMissileLaunchSites(0);
  assert.equal(site.missileSilos[0].stage,'building');assert.equal(site.missileSilos[1].loadedType,'conventional');
}
console.log('PASS MLS independent silo build/reload pipelines');


{
  const researchUI=fs.readFileSync(path.join(ROOT,'js/ui/research-ui.js'),'utf8');
  const missileSection=researchUI.slice(researchUI.indexOf('if (els.missileBatteryResearchTree)'), researchUI.indexOf('updateResearchProgressUI();', researchUI.indexOf('if (els.missileBatteryResearchTree)')));
  assert.equal((missileSection.match(/renderNode\('mbUnlockMLS'\)/g)||[]).length,1,'MLS unlock must render once as the shared root');
  assert(missileSection.includes('missile-tech-fork'),'Missile branches must share the root fork');
  const rendering=fs.readFileSync(path.join(ROOT,'js/render/rendering.js'),'utf8');
  assert(rendering.includes("b.type === 'missileLaunchSite'"),'MLS needs a dedicated battlefield renderer');
}
console.log('PASS MLS dedicated sprite and one-root seven-branch research presentation');

{
  const {context,d}=fresh();unlock(d,['missileBattery','mbUnlockMLS']);
  const site=d.createBuilding('missileLaunchSite',0,1100,1000);d.ensureMissileLaunchSiteState(site);
  site.missileSilos[0].active=true;site.missileSilos[0].loadedType='conventional';
  assert.equal(d.beginMissileAiming(site),true);
  assert.equal(context.document.getElementById('app').classList.contains('missile-aiming'),true);
  assert.equal(context.document.getElementById('missileAimHud').classList.contains('hidden'),false);
  d.updateMissileAimingHUD();
  assert(context.document.getElementById('missileAimCurrent').textContent.includes('Conventional Missile'));
  assert.equal(d.cancelMissileAiming(),true);
  assert.equal(context.document.getElementById('app').classList.contains('missile-aiming'),false);
}
console.log('PASS dedicated missile aiming HUD enters, reports current missile, and exits cleanly');


{
  const {d}=fresh();unlock(d,['missileBattery','mbUnlockMLS']);
  const site=d.createBuilding('missileLaunchSite',0,1100,1000);d.ensureMissileLaunchSiteState(site);
  assert(d.queueStockpileMissile(site,'conventional').ok);assert(d.queueStockpileMissile(site,'conventional').ok);
  advanceMLS(d,20.1);assert.equal(site.missileStockpile.length,1);advanceMLS(d,20.1);assert.equal(site.missileStockpile.length,2);
  unlock(d,['mbStockpileTime1','mbStorage1','mbStockpileTime2','mbStorage2','mbStockpileParallel']);
  assert.equal(d.getStockpileParallelism(0),2);assert.equal(d.getStockpileFillTime(0),16);assert.equal(d.getMissileStorageCapacity(0),12);
  assert(d.queueStockpileMissile(site,'conventional').ok);assert(d.queueStockpileMissile(site,'conventional').ok);d.updateMissileLaunchSites(0);
  assert.equal(site.missileStockpileJobs.length,2);advanceMLS(d,16.1);assert.equal(site.missileStockpile.length,4);
}
console.log('PASS stockpile FIFO and two-slot parallel production');

{
  const {d}=fresh();unlock(d,['missileBattery','mbUnlockMLS','mbUnlockHE']);
  const site=d.createBuilding('missileLaunchSite',0,1000,1000);d.ensureMissileLaunchSiteState(site);const silo=site.missileSilos[0];silo.active=true;silo.loadedType='highExplosive';
  const tank=d.createUnit('tank',1,1600,1000);const baseSpeed=d.getEntityStat(tank,'speed',50);
  const shot=d.launchStrategicMissile(site,0,1600,1000);assert(shot.ok);
  for(let i=0;i<40;i++){d.game.time+=1/30;d.updateProjectiles(1/30);if(!d.game.projectiles.some(p=>p.kind===d.STRATEGIC_MISSILE_KIND))break;}
  const fragmented=d.game.missileZones.find(z=>z.type==='fragmented');assert(fragmented);assert.equal(fragmented.radius,100);
  const slowed=d.getEntityStat(tank,'speed',50);assert(Math.abs(slowed-baseSpeed*0.9)<1e-6);
  assert.equal(d.isPointBlockedByFragmentedZone(1600,1000,20),true);
}
console.log('PASS HE Fragmented Zone applies ground slow and no-build terrain');

{
  const {d}=fresh();unlock(d,['missileBattery','mbUnlockMLS','mbUnlockIncendiary']);
  const site=d.createBuilding('missileLaunchSite',0,1000,1000);d.ensureMissileLaunchSiteState(site);const silo=site.missileSilos[0];silo.active=true;silo.loadedType='incendiary';
  const target=d.createBuilding('militaryBase',1,1600,1000);target.hp=target.maxHp=5000;
  const shot=d.launchStrategicMissile(site,0,1600,1000);assert(shot.ok);
  for(let i=0;i<40;i++){d.game.time+=1/30;d.updateProjectiles(1/30);if(!d.game.projectiles.some(p=>p.kind===d.STRATEGIC_MISSILE_KIND))break;}
  assert(d.game.missileZones.some(z=>z.type==='burning'));
  const before=target.hp;d.game.time+=1;d.updateMissileZones(1);assert(Math.abs((before-target.hp)-100)<1e-6,'base burn must deal 5% max HP capped at 100 DPS to buildings');
  const h=target.hp;d.applyDamage(target,100,0);assert(Math.abs((h-target.hp)-150)<1e-6,'base burn vulnerability is +50%');
}
console.log('PASS Incendiary Burning Zone damages and exposes buildings');

{
  const {context,d}=fresh();unlock(d,['missileBattery','mbUnlockMLS'],1);unlock(d,['electronicWarfare','ewUnlockJamming','ewUnlockSpoofing'],0);
  const site=d.createBuilding('missileLaunchSite',1,1200,1000);d.ensureMissileLaunchSiteState(site);site.missileSilos[0].active=true;site.missileSilos[0].loadedType='conventional';
  const shot=d.launchStrategicMissile(site,0,1800,1000);assert(shot.ok);const m=shot.projectile;const speed=m.speed;
  const jammer=d.createBuilding('jammingStation',0,1000,1000,{ewHeading:0});jammer.ewNextEmissionAt=0;context.Math.random=()=>.99;d.rebuildSpatialHashes();d.updateElectronicWarfare(0);assert.equal(m.speed,speed,'Jamming must never slow strategic missile movement'); jammer.ewNextEmissionAt=999;
  const spoofer=d.createBuilding('spoofingStation',0,1000,1000,{ewHeading:0});spoofer.ewNextEmissionAt=0;context.Math.random=()=>0;const fx=m.targetX,fy=m.targetY;d.game.time+=1;d.updateElectronicWarfare(0);assert(m.targetX!==fx||m.targetY!==fy);const forwardDot=(m.targetX-m.x)*m.vx+(m.targetY-m.y)*m.vy;assert(forwardDot>0,'spoof coordinate must remain forward, never U-turn');
}
console.log('PASS EW strategic-missile rules: no Jamming slow, permanent forward Spoof');

{
  const {d}=fresh();unlock(d,['missileBattery'],0);unlock(d,['missileBattery','mbUnlockMLS'],1);
  const tower=d.createBuilding('airDefense',0,1200,1000);tower.nextScan=0;const site=d.createBuilding('missileLaunchSite',1,1800,1000);d.ensureMissileLaunchSiteState(site);site.missileSilos[0].active=true;site.missileSilos[0].loadedType='conventional';
  const shot=d.launchStrategicMissile(site,0,900,1000);assert(shot.ok);const missile=shot.projectile;
  d.rebuildSpatialHashes();d.updateAirDefenseTower(tower);assert(d.game.projectiles.some(p=>p.kind==='aaMissile'&&p.targetProjectileId===missile.id));
  for(let i=0;i<180;i++){d.game.time+=1/30;d.updateProjectiles(1/30);if(missile.alive===false)break;}
  assert.equal(missile.alive,false,'AA must be able to intercept strategic missiles');
  assert.equal(d.BUILDINGS.airDefense.missileDamage,175);
}
console.log('PASS Air Defense acquires and intercepts strategic missiles with doctrine fuse');

{
  const {d}=fresh();unlock(d,['missileBattery'],0);unlock(d,['missileBattery','mbUnlockMLS'],1);
  const site=d.createBuilding('missileLaunchSite',1,1500,1000);d.ensureMissileLaunchSiteState(site);
  for(let i=0;i<2;i++){site.missileSilos[i].active=true;site.missileSilos[i].loadedType='conventional';}
  const a=d.launchStrategicMissile(site,0,900,1000).projectile;
  const b=d.launchStrategicMissile(site,1,900,1000).projectile;
  a.x=1200;a.y=1000;a.vx=-700;a.vy=0;
  b.x=1205;b.y=1025;b.vx=-700;b.vy=0;
  const aa={kind:'aaMissile',playerId:0,launcherId:null,x:1170,y:1000,vx:330,vy:0,speed:330,turnRate:5.2,targetId:null,initialTargetId:null,targetProjectileId:a.id,damage:d.BUILDINGS.airDefense.missileDamage,life:5};
  const outcome=d.updateHomingAirProjectile(aa,0);
  assert.equal(outcome,'remove');
  assert.equal(a.alive,false,'proximity-fuse target should take full AA projectile damage');
  assert.equal(b.alive,false,'radius-50 proximity blast should deal the same full damage to nearby hostile missiles');
}
console.log('PASS researched AD proximity fuse triggers at 40 and applies uniform radius-50 damage');



{
  const {context,d}=fresh();
  unlock(d,['missileBattery','mbUnlockMLS','mbUnlockHE']);
  unlock(d,['electronicWarfare','ewUnlockJamming']);
  const site=d.createBuilding('missileLaunchSite',0,1000,1000);d.ensureMissileLaunchSiteState(site);site.missileSilos[0].active=true;site.missileSilos[0].loadedType='highExplosive';
  const tank=d.createUnit('tank',1,1600,1000);const base=d.getEntityStat(tank,'speed',50);
  d.launchStrategicMissile(site,0,1600,1000);
  for(let i=0;i<40;i++){d.game.time+=1/30;d.updateProjectiles(1/30);if(!d.game.projectiles.some(p=>p.kind===d.STRATEGIC_MISSILE_KIND))break;}
  const jammer=d.createBuilding('jammingStation',0,1400,1000,{ewHeading:0});jammer.ewNextEmissionAt=0;context.Math.random=()=>.99;d.rebuildSpatialHashes();d.updateElectronicWarfare(0);
  assert(Math.abs(d.getEntityStat(tank,'speed',50)-base*0.65)<1e-6,'Jamming -25% and Fragmented -10% must stack additively across different sources');
}
console.log('PASS unrelated Jamming + Fragmented slow sources stack additively');

{
  const {d}=fresh();const ai=d.game.players[1];ai.money=250000;
  unlock(d,['missileBattery','mbUnlockMLS'],1);
  for(let i=0;i<20;i++)d.aiBuild(ai);
  const site=d.game.buildings.find(b=>b.alive&&b.playerId===1&&b.type==='missileLaunchSite');
  assert(site,'AI should adopt an unlocked Missile Launch Site');
  d.aiBuild(ai);d.ensureMissileLaunchSiteState(site);assert(site.missileSilos.some(s=>s.active),'AI should activate MLS silos');
}
console.log('PASS AI adopts researched Missile Launch Sites and activates silos');

console.log('PASS full Missile & Advanced Battery smoke');
