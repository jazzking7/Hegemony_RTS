'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { bootProject } = require('./runtime-harness');
const ROOT = path.resolve(__dirname, '..');
function fresh(seed=424242){
  const context=bootProject(ROOT,seed); const d=context.__RTS_DEBUG__;
  d.game.enemyCount=1; d.resetGame(); for(const p of d.game.players)p.money=250000;
  return {context,d};
}
function unlock(d, ids, pid=0){ for(const id of ids)d.completeResearch(pid,id); }
function nearly(a,b,eps=1e-5,msg=''){ assert(Math.abs(a-b)<=eps, `${msg} expected ${b}, got ${a}`); }

{
  const {d}=fresh();
  const nodes=Object.values(d.SPECIALIZED_RESEARCH).filter(x=>x.doctrine==='directedEnergy');
  assert.equal(d.DOCTRINE_RESEARCH.directedEnergy.contentReady,true);
  assert.equal(nodes.length,32);
  unlock(d,['directedEnergy']);
  assert.equal(d.isDefinitionUnlocked(0,'building','energyGenerator'),true);
  assert.equal(d.isDefinitionUnlocked(0,'building','orbitalBeamSystem'),false);
  assert.deepEqual([
    d.BUILDINGS.energyGenerator.cost,d.BUILDINGS.energyGenerator.hp,
    d.DIRECTED_ENERGY_BALANCE.generatorBaseRange,d.DIRECTED_ENERGY_BALANCE.generatorBasePower
  ],[1000,750,600,100]);
  assert.equal(d.getFragmentedZoneStats(0).radius,100);
  assert.equal(d.getBurningZoneStats(0).damageRate,0.05);
  assert.equal(d.getBurningZoneStats(0).maxDps,100);
  const ui=fs.readFileSync(path.join(ROOT,'js/ui/research-ui.js'),'utf8');
  assert(ui.includes("deLane('ENERGY-FIELD NETWORK'"));
  assert(ui.includes("'deFieldDensity10'") && ui.includes("'deFieldDensity12'"));
}
console.log('PASS Direct Energy doctrine/research definitions and missile-zone corrections');

{
  const {d}=fresh();
  unlock(d,['directedEnergy','deUnlockOrbital','deUnlockNodes','deUnlockDeathRay']);
  const g1=d.createBuilding('energyGenerator',0,1000,1000); d.setGeneratorOutput(g1,100);
  const orbital=d.createBuilding('orbitalBeamSystem',0,1120,1000);
  const node=d.createBuilding('energyFieldNode',0,1220,1000);
  const ray=d.createBuilding('deathRayTower',0,1320,1000);
  d.setEnergyPriority(node,'high'); d.setEnergyPriority(orbital,'normal'); d.setEnergyPriority(ray,'low');
  const before=d.game.players[0].money;
  d.updateEnergyPowerNetworks(1);
  nearly(before-d.game.players[0].money,20,1e-6,'100 power operating cost per second');
  assert.equal(node.energyPowered,true,'high priority node should stay powered');
  assert.equal(orbital.energyPowered,true,'normal priority orbital should stay powered');
  assert.equal(ray.energyPowered,false,'low priority death ray should shed when demand exceeds supply');
  const g2=d.createBuilding('energyGenerator',0,2100,1000); d.setGeneratorOutput(g2,100);
  d.updateEnergyPowerNetworks(0);
  assert.equal(g1.energyNetworkId,g2.energyNetworkId,'overlapping generator coverage should pool into one network');
  assert.equal(ray.energyPowered,true,'pooled 200 power should restore the shed consumer');
  nearly(g1.energyNetworkSupply,200,1e-6);
}
console.log('PASS pooled local generator networks, continuous operating cost, and High/Normal/Low shedding');

{
  const {d}=fresh(); unlock(d,['directedEnergy','deUnlockNodes']);
  const g=d.createBuilding('energyGenerator',0,1000,1000); d.setGeneratorOutput(g,100);
  const pts=[[800,900],[1200,900],[1000,1246.4101615]];
  const nodes=pts.map(([x,y])=>d.createBuilding('energyFieldNode',0,x,y));
  d.updateEnergyPowerNetworks(0); d.rebuildEnergyFields();
  assert.equal(d.game.energyFields.length,1,'three ~400-spaced powered nodes should create one closed field');
  const field=d.game.energyFields[0];
  nearly(field.density,1,0.015,'reference field density');
  assert(field.attackBonus>0 && field.attackBonus<0.60);
  assert(field.damageReduction>0 && field.damageReduction<0.40);
  const summary=d.getEnergyFieldSummaryForNode(nodes[0]); assert(summary && summary.id===field.id);

  const cannon=d.createBuilding('cannon',0,1000,1000);
  const enemy=d.createBuilding('militaryBase',1,1100,1000); enemy.hp=enemy.maxHp=5000;
  const baseDamage=d.getEntityStat(cannon,'damage',d.BUILDINGS.cannon.damage);
  assert(d.fireWeapon(cannon,enemy,d.BUILDINGS.cannon,'building'));
  const shot=d.game.projectiles[d.game.projectiles.length-1];
  nearly(shot.damage,baseDamage*(1+field.attackBonus),1e-5,'field attack snapshot');

  const friendly=d.createBuilding('militaryBase',0,1000,1050); friendly.hp=friendly.maxHp=5000;
  const hp=friendly.hp; d.applyDamage(friendly,100,1);
  nearly(hp-friendly.hp,100*(1-field.damageReduction),1e-5,'field damage reduction at impact');

  unlock(d,['deFieldAttack75','deFieldDR55','deFieldDensity10','deNodePower20','deFieldAttack100','deFieldDR70','deFieldDensity12','deNodePower15']);
  const caps=d.getEnergyFieldCaps(0); assert.deepEqual([caps.attack,caps.reduction,caps.density],[1,0.70,12]);
  assert.equal(d.getEnergyConsumerDemand(nodes[0]),15,'final Node efficiency consumes 15 power');
  d.updateEnergyPowerNetworks(0); d.rebuildEnergyFields();
  nearly(d.game.energyFields[0].density,1,0.015,'Node efficiency must keep 25-power density contribution');
}
console.log('PASS closed-field geometry, ~400 reference density, visible bonuses, attack snapshot and impact DR');

{
  const {context,d}=fresh(); unlock(d,['directedEnergy','deUnlockOrbital']);
  const g=d.createBuilding('energyGenerator',0,1000,1000); d.setGeneratorOutput(g,100);
  const orbital=d.createBuilding('orbitalBeamSystem',0,1200,1000);
  d.updateEnergyPowerNetworks(0); d.updateOrbitalBeamSystem(orbital,25); nearly(orbital.energyCharge,25);
  d.setGeneratorOutput(g,0); d.updateEnergyPowerNetworks(0); d.updateOrbitalBeamSystem(orbital,10); nearly(orbital.energyCharge,25,1e-6,'unpowered recharge must pause without resetting');
  d.setGeneratorOutput(g,100); d.updateEnergyPowerNetworks(0); d.updateOrbitalBeamSystem(orbital,30); assert(orbital.energyFullyCharged);
  const target=d.createBuilding('militaryBase',1,3000,1600); target.hp=target.maxHp=5000;
  const outer=d.createBuilding('militaryBase',1,3100,1600); outer.hp=outer.maxHp=5000;
  d.rebuildSpatialHashes();
  assert(d.beginOrbitalEnergyAiming(orbital).ok); assert(context.document.getElementById('app').classList.contains('energy-aiming'));
  d.setEnergyAimTarget(target.x,target.y); assert(d.confirmOrbitalEnergyAim().ok);
  nearly(5000-target.hp,750,1e-5,'orbital inner radius damage');
  assert(outer.hp<5000 && outer.hp>4500,'outer target should receive falloff damage below the 500 start');
  assert.equal(orbital.energyCharge,0); assert.equal(context.document.getElementById('app').classList.contains('energy-aiming'),false);

  unlock(d,['deOrbitalRecharge1','deOrbitalDamage1','deOrbitalAoe1','deOrbitalRecharge2','deOrbitalDamage2','deOrbitalAoe2','deOrbitalCap3']);
  const stats=d.getOrbitalBeamStats(0);
  nearly(stats.rechargeTime,42.5); nearly(stats.innerDamage,937.5); assert.deepEqual([stats.outerRadius,stats.outerStartDamage,stats.cap],[500,700,3]);
}
console.log('PASS Orbital Beam recharge pause/preserve, global fire-control strike, falloff and SR progression');

{
  const {d}=fresh(); unlock(d,['directedEnergy','deUnlockDeathRay']);
  const g=d.createBuilding('energyGenerator',0,1000,1000); d.setGeneratorOutput(g,100);
  const tower=d.createBuilding('deathRayTower',0,1200,1000);
  const ground=d.createUnit('basic',1,1350,1000); ground.hp=ground.maxHp=1000;
  const bomber=d.createUnit('bomber',1,1360,1010); bomber.hp=bomber.maxHp=1000;
  const lm=d.createUnit('loiteringMunition',1,1340,990); lm.hp=lm.maxHp=1000;
  d.updateEnergyPowerNetworks(0); d.rebuildSpatialHashes();
  d.updateDeathRayTower(tower,1);
  assert(ground.hp<1000,'Death Ray should hit ground entities');
  assert(lm.hp<1000,'Death Ray should hit Loitering Munitions');
  assert.equal(bomber.hp,1000,'Death Ray must not target aircraft');

  unlock(d,['deDeathDamage1','deDeathRange1','deDeathTarget1','deDeathDamage2','deDeathRange2','deDeathSlow','deDeathTarget2']);
  const stats=d.getDeathRayStats(tower); nearly(stats.dps,66); nearly(stats.range,575); assert.equal(stats.targets,7); assert.equal(stats.slow,0.10);
  ground.hp=ground.maxHp=1000; d.rebuildSpatialHashes(); d.updateDeathRayTower(tower,0.1);
  const baseSpeed=d.getEntityStatFromBase(ground,'speed',d.UNITS.basic.speed);
  nearly(d.getEntityStat(ground,'speed',d.UNITS.basic.speed),baseSpeed*0.9,1e-5,'Slow Beam');
}
console.log('PASS Death Ray ground/LM-only targeting, concurrent beam combat, SR damage/range/slow');

console.log('PASS full Direct Energy Warfare smoke');
