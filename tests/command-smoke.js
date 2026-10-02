'use strict';
const assert=require('assert');
const path=require('path');
const {bootProject}=require('./runtime-harness');
const ctx=bootProject(path.resolve(__dirname,'..'),424242); const d=ctx.__RTS_DEBUG__; d.game.enemyCount=1; d.resetGame();
const p=d.game.players[0]; p.money=100000;
d.completeResearch(0,'commandAutomation');
assert(d.hasResearchCapability(0,'focusedMission')); assert(d.hasResearchCapability(0,'scheduledDeployment'));
// Focused travel/arrival bonuses.
d.completeResearch(0,'caFocusedDamage1'); d.completeResearch(0,'caFocusedSpeed1'); d.completeResearch(0,'caFocusedDamage2'); d.completeResearch(0,'caFocusedSpeed2');
const u=d.createUnit('basic',0,1000,1000); const baseSpeed=d.getEntityStat(u,'speed',76); const baseDmg=d.getEntityStat(u,'damage',13);
d.applyFocusedMission(u,1300,1000); assert(Math.abs(d.getEntityStat(u,'speed',76)-baseSpeed*1.15)<1e-6); u.x=1160; d.completeFocusedMission(u); assert.equal(u.focusedMission,false); assert(Math.abs(d.getEntityStat(u,'damage',13)-baseDmg*1.15)<1e-6);
// Scheduled training discounts/time metadata and launch waits.
d.completeResearch(0,'caScheduledDiscount'); d.completeResearch(0,'caScheduledSpeed');
const mb=d.game.buildings.find(b=>b.alive&&b.playerId===0&&b.type==='militaryBase');
const schedule={name:'Test Schedule',waits:[5,7],nodes:[
 {domain:'ground',focused:false,ground:{basic:10},air:{},escortsPerAircraft:0},
 {domain:'ground',focused:true,ground:{basic:1},air:{},escortsPerAircraft:0},
 {domain:'ground',focused:false,ground:{},air:{},escortsPerAircraft:0}
]}; d.setScheduledDeployment(0,schedule); const beforeQ=mb.queue.length; const tr=d.trainScheduledDeployment(0); assert(tr.queued>=1); assert(mb.queue.length>beforeQ); assert.equal(mb.queueMeta[beforeQ].source,'scheduled'); assert.equal(mb.queueMeta[beforeQ].trainingTimeMultiplier,0.9);
// ACC & bandwidth / fee / pause.
d.completeResearch(0,'caUnlockCoordinationCenter'); const cap=p.capital; const acc=d.createBuilding('advancedCoordinationCenter',0,cap.x+300,cap.y+300); assert.equal(d.getCoordinationCenterBandwidth(acc),1); const money0=p.money;
const routine=d.createAutomatedWarfare(acc,{kind:'theater',facilityId:mb.id,templateType:'focused',composition:{basic:2},focused:true,targetX:2500,targetY:1100}); assert(routine.ok); assert(p.money<money0); assert.equal(d.getCoordinationCenterUsedBandwidth(acc),1); assert.equal(d.createAutomatedWarfare(acc,{kind:'theater',facilityId:mb.id,templateType:'focused',composition:{basic:1},focused:true,targetX:2500,targetY:1100}).ok,false); d.pauseAutomatedWarfare(acc,routine.routine.id,true); assert.equal(d.getCoordinationCenterUsedBandwidth(acc),1); d.cancelAutomatedWarfare(acc,routine.routine.id); assert.equal(d.getCoordinationCenterUsedBandwidth(acc),0);
// Transport destination unload => persistent 200-radius assault zone; emergency unload => ordinary move order.
const apc=d.createUnit('apc',0,1500,1500); apc.transportMissionX=1700; apc.transportMissionY=1600; apc.orderX=1700; apc.orderY=1600; apc.cargoRecords=[d.createUnitRecord('basic',0)]; const prevIds=new Set(d.game.units.map(x=>x.id)); d.unloadCargo(apc,false); const dis=d.game.units.find(x=>x.alive&&x.type==='basic'&&!prevIds.has(x.id)); assert(dis); assert.equal(dis.assaultZoneRadius,200); assert.equal(dis.assaultZoneX,1700); assert.equal(dis.hasOrder,false);
const apc2=d.createUnit('apc',0,1500,1500); apc2.transportMissionX=1900; apc2.transportMissionY=1700; apc2.orderX=1900; apc2.orderY=1700; apc2.cargoRecords=[d.createUnitRecord('basic',0)]; const prev2=new Set(d.game.units.map(x=>x.id)); d.unloadCargo(apc2,true); const dis2=d.game.units.find(x=>x.alive&&x.type==='basic'&&!prev2.has(x.id)); assert(dis2); assert(!dis2.assaultZoneRadius); assert.equal(dis2.orderX,1900); assert.equal(dis2.hasOrder,true);
console.log('PASS command automation smoke');

// Focused AI suppression until the 150-radius arrival threshold.
{
  const c=bootProject(path.resolve(__dirname,'..'),9393), x=c.__RTS_DEBUG__; x.game.enemyCount=1; x.resetGame(); x.completeResearch(0,'commandAutomation');
  const a=x.createUnit('basic',0,1000,1000), enemy=x.createUnit('basic',1,1060,1000); x.applyFocusedMission(a,1600,1000); a.nextTargetScan=0; x.updateUnits(1/30); assert.equal(a.target,null); assert.equal(a.focusedMission,true);
  a.x=1460; a.nextTargetScan=0; x.updateUnits(1/30); assert.equal(a.focusedMission,false);
}
// Scheduled wait timers begin at launch, not arrival.
{
  const c=bootProject(path.resolve(__dirname,'..'),9494), x=c.__RTS_DEBUG__; x.game.enemyCount=1; x.resetGame(); x.completeResearch(0,'commandAutomation');
  const state=x.getCommandAutomationState(0); x.setScheduledDeployment(0,{name:'Timing',waits:[5,7],nodes:[{domain:'ground',focused:false,ground:{basic:1},air:{}},{domain:'ground',focused:false,ground:{elite:1},air:{}},{domain:'ground',focused:false,ground:{}}]});
  const before=x.game.units.filter(u=>u.alive&&u.playerId===0).length; assert(x.startScheduledDeployment(0,2200,1100).ok); x.updateCommandAutomation(0); assert.equal(state.scheduledExecutions[0].currentNode,1); const after1=x.game.units.filter(u=>u.alive&&u.playerId===0).length; assert.equal(after1,before+1); x.game.time=4.9; x.updateCommandAutomation(0); assert.equal(x.game.units.filter(u=>u.alive&&u.playerId===0).length,after1); x.game.time=5.01; x.updateCommandAutomation(0); assert.equal(x.game.units.filter(u=>u.alive&&u.playerId===0).length,after1+1);
}
// Mature War Front applies beginning with deployment #3 from that individual routine.
{
  const c=bootProject(path.resolve(__dirname,'..'),9595), x=c.__RTS_DEBUG__; x.game.enemyCount=1; x.resetGame(); const pl=x.game.players[0]; pl.money=100000; x.completeResearch(0,'commandAutomation'); x.completeResearch(0,'caUnlockCoordinationCenter'); x.completeResearch(0,'caTheaterMature'); const mb=x.game.buildings.find(b=>b.alive&&b.playerId===0&&b.type==='militaryBase'); for(let i=0;i<10;i++) x.createAndStoreUnit(mb,'basic'); const center=x.createBuilding('advancedCoordinationCenter',0,pl.capital.x+260,pl.capital.y+260); const r=x.createAutomatedWarfare(center,{kind:'theater',facilityId:mb.id,templateType:'focused',composition:{basic:1},focused:true,targetX:2500,targetY:1100}).routine; for(const t of [0,.36,.72]){x.game.time=t; x.updateCommandAutomation(0);} assert.equal(r.deploymentsMade,3); const rows=x.game.units.filter(u=>u.alive&&u.automationRoutineId===r.id).sort((a,b)=>a.id-b.id); assert(rows.length>=3); assert(Math.abs(x.getEntityStat(rows[0],'damage',13)-13)<1e-6); assert(Math.abs(x.getEntityStat(rows[2],'damage',13)-13*1.12)<1e-6);
}
// Normal paratrooper landing creates the same destination assault state; emergency drop does not.
{
  const c=bootProject(path.resolve(__dirname,'..'),9696), x=c.__RTS_DEBUG__; x.game.enemyCount=1; x.resetGame();
  const plane=x.createUnit('paratrooperPlane',0,1000,1000,{cargoRecords:[x.createUnitRecord('basic',0)],paratrooperMissionX:1400,paratrooperMissionY:1200}); const before=new Set(x.game.units.map(u=>u.id)); x.dropParatroopers(plane,false); const falling=x.game.units.find(u=>u.alive&&u.parachuting&&!before.has(u.id)); assert(falling); x.game.time=falling.parachuteLandAt+0.01; x.updateParachutingTroop(falling,1/30); assert.equal(falling.assaultZoneRadius,200);
}
console.log('PASS extended command automation smoke');

// Full Command & Automation doctrine stress: concurrent ground + aerial routines remain finite
// and each can sustain repeated deployments through normal production/economy paths.
{
  const c=bootProject(path.resolve(__dirname,'..'),171717), x=c.__RTS_DEBUG__;
  x.game.enemyCount=1; x.resetGame();
  const player=x.game.players[0]; player.money=250000;
  const commandResearch=[
    'commandAutomation','caFocusedDamage1','caFocusedSpeed1','caFocusedDamage2','caFocusedSpeed2',
    'caScheduledDiscount','caScheduledSpeed','caMultiDomain','caUnlockCoordinationCenter',
    'caTheaterSpeed1','caTheaterCost1','caTheaterCap','caTheaterSpeed2','caTheaterCost2','caTheaterMature',
    'caAirSpeed1','caAirCost1','caAirTurnaround','caAirSpeed2','caAirMature',
    'caInitiationDiscount1','caBandwidth1','caInitiationDiscount2','caBandwidth2','caACC2'
  ];
  for(const id of commandResearch) x.completeResearch(0,id);
  const cap=player.capital;
  const acc=x.createBuilding('advancedCoordinationCenter',0,cap.x+260,cap.y+220);
  const mb=x.game.buildings.find(b=>b.alive&&b.playerId===0&&b.type==='militaryBase');
  const airbase=x.createBuilding('airbase',0,cap.x+420,cap.y+80);
  const enemyCap=x.game.players[1].capital;
  const ground=x.createAutomatedWarfare(acc,{kind:'theater',facilityId:mb.id,templateType:'focused',composition:{basic:4,elite:1,tank:1},focused:true,targetX:enemyCap.x,targetY:enemyCap.y});
  const aerial=x.createAutomatedWarfare(acc,{kind:'areaDenial',facilityId:airbase.id,composition:{bomber:1,superFighter:0,paratrooperPlane:0},escortsPerAircraft:0,targetX:enemyCap.x,targetY:enemyCap.y});
  assert(ground.ok&&aerial.ok);
  for(let i=0;i<180*30;i++) x.update(1/30);
  assert(ground.routine.deploymentsMade>=3,'Theater Routine should sustain repeated deployments.');
  assert(aerial.routine.deploymentsMade>=1,'Aerial automation should launch at least one sortie.');
  assert(x.game.liveEntityCount<=1000);
  for(const entity of [...x.game.units,...x.game.buildings]) if(entity.alive){
    assert(Number.isFinite(entity.x)&&Number.isFinite(entity.y)&&Number.isFinite(entity.hp),'Automation stress produced invalid entity state.');
  }
}
console.log('PASS full command automation stress');
