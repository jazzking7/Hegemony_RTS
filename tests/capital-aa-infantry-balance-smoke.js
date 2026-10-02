'use strict';
const assert=require('assert');
const path=require('path');
const {bootProject}=require('./runtime-harness');
const ROOT=path.resolve(__dirname,'..');
function fresh(seed=818181){const c=bootProject(ROOT,seed),d=c.__RTS_DEBUG__;d.game.enemyCount=1;d.resetGame();for(const p of d.game.players)p.money=500000;return d;}
{
  const d=fresh();
  const cap=d.game.players[0].capital;
  assert.equal(d.BUILDINGS.capital.emergencyAARange,400);
  assert.equal(d.BUILDINGS.capital.emergencyAASalvo,4);
  assert.equal(d.BUILDINGS.capital.emergencyAACooldown,4);
  assert.equal(d.BUILDINGS.capital.airDamageResistance,0.20);
  const bomber=d.createUnit('bomber',1,cap.x+250,cap.y,{airborne:true});
  d.rebuildSpatialHashes();
  cap.nextScan=0; cap.nextAABatchAt=0; cap.aaActiveMissiles=0;
  d.updateCapitalEmergencyAA(cap);
  const missiles=d.game.projectiles.filter(p=>p.kind==='aaMissile'&&p.launcherId===cap.id);
  assert.equal(missiles.length,4,'Capital must fire a four-missile emergency AA salvo');
  assert(missiles.every(p=>p.damage===d.BUILDINGS.airDefense.missileDamage),'Capital AA must reuse Air-Defense projectile damage');
  assert(cap.nextAABatchAt>=d.game.time+3.99,'Capital AA must use its own 4s salvo cooldown');
  void bomber;
}
console.log('PASS Capital emergency AA four-missile salvo');
{
  const d=fresh();
  const cap=d.game.players[0].capital;
  const before=cap.hp;
  d.applyDamage(cap,100,1,null,{airDelivered:true});
  assert.equal(before-cap.hp,80,'Capital air resistance must reduce air-delivered damage by 20%');
  const before2=cap.hp;
  d.applyDamage(cap,100,1);
  assert.equal(before2-cap.hp,100,'Capital resistance must not reduce ordinary/non-air damage');
}
console.log('PASS Capital 20% air-delivered damage resistance');
{
  const d=fresh();
  const cat=d.ADV_INF_CATALOG;
  assert.equal(cat.helmet.sniperOptics.cost,4);
  assert.equal(cat.helmet.hawkeyeOptics.cost,8);
  assert.equal(cat.weapon.machineGun.cost,6);
  assert.equal(cat.module.healing.cost,7);
  assert.equal(cat.module.immortal.cost,14);
  assert.equal(cat.module.healing.healPerSec,0.02);
  assert.equal(cat.module.immortal.healPerSec,0.04);
}
console.log('PASS Advanced Infantry recovery and equipment surcharge rebalance');
