'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {bootProject}=require('./runtime-harness');
const ROOT=path.resolve(__dirname,'..');
function fresh(){const c=bootProject(ROOT,424242),d=c.__RTS_DEBUG__;d.game.enemyCount=1;d.resetGame();for(const p of d.game.players)p.money=500000;return {c,d};}
function unlock(d,ids){for(const id of ids)d.completeResearch(0,id,{silent:true});}

{
  const {d}=fresh();
  unlock(d,['advancedInfantry','aiUnlockComplex']);
  const mb=d.game.buildings.find(b=>b.alive&&b.playerId===0&&b.type==='militaryBase');
  const smc=d.createBuilding('superiorMobilizationComplex',0,mb.x+260,mb.y+220);
  const saved=d.saveInfantryLoadout(0,{name:'Global Suit',soldierType:'basic'}); assert(saved.ok);
  assert.equal(d.queueInfantryLoadoutTraining(mb,saved.loadout.id,2),2);
  assert.equal(d.queueInfantryLoadoutTraining(smc,saved.loadout.id,3),3);
  for(let i=0;i<6;i++) d.updateTraining(999);
  const token=d.getInfantryLoadoutToken(0,saved.loadout.id);
  assert.equal(d.getGroundDefinitionAvailable(mb,token),2,'Military Base must expose loadout inventory');
  assert.equal(d.getGroundDefinitionAvailable(smc,token),3,'SMC must expose loadout inventory as a ground facility');
  const prefs=d.getDeploymentPreferences();prefs.mode='global';prefs.globalCategory='ground';
  assert.equal(d.getDeploymentAvailable(token),5,'Global Ground overview must aggregate MB + SMC loadouts');
  prefs.globalCategory='mobilization';
  assert.equal(d.getDeploymentAvailable(token),3,'Superior Mobilization overview must aggregate SMC inventory only');
  prefs.globalCategory='ground';
  prefs.mode='facility';prefs.lastFacilityId=smc.id;d.game.chosenBaseId=smc.id;
  assert.equal(d.getDeploymentAvailable(token),3,'Individual SMC view must report its own loadout inventory');

  prefs.mode='global';prefs.globalCategory='ground';d.game.attackTarget={x:2200,y:1100};d.game.attackAmounts={basic:0,elite:0,tank:0,spg:0,apc:0,ifv:0,bomber:0,superFighter:0,paratrooperPlane:0,loiteringMunition:0,[token]:4};
  d.deployAttack();
  assert.equal(d.game.units.filter(u=>u.alive&&u.playerId===0&&u.variantId===token).length,4,'Global Ground deployment must actually draw from multiple facilities');
}
console.log('PASS Global Overview aggregates and deploys Exosuit loadouts across Military Bases and SMCs');

{
  const {d}=fresh();
  const prefs=d.getDeploymentPreferences();
  const cap=d.game.players[0].capital; const airbase=d.createBuilding('airbase',0,cap.x+320,cap.y+260);
  prefs.mode='global';prefs.globalCategory='air';prefs.bringUnmannedEscorts=true;prefs.escortsPerAircraft=2;prefs.lastFacilityId=airbase.id;
  d.openAttackModal(1800,900);
  assert.equal(d.getDeploymentPreferences().mode,'global');
  assert.equal(d.getDeploymentPreferences().globalCategory,'air');
  assert.equal(d.game.bringUnmannedEscorts,true,'escort preference must persist when deployment reopens');
  assert.equal(d.game.escortsPerAircraft,2);
  d.closeAttackModal();
  prefs.mode='facility';prefs.lastFacilityId=airbase.id;
  d.openAttackModal(1800,900);
  assert.equal(d.game.chosenBaseId,airbase.id,'last individual facility must be restored');
}
console.log('PASS deployment mode, category, facility and Loyal Wingman preferences persist for the match');

{
  const {d}=fresh();
  assert.equal(d.ADV_INF_CATALOG.module.healing.healPerSec,0.02);
  assert.equal(d.ADV_INF_CATALOG.module.immortal.healPerSec,0.04);
  assert.equal(d.getBurningZoneStats(0).damageRate,0.05);
}
console.log('PASS healing/Immortal rebalance and Incendiary base DOT adjustments');

{
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const css=fs.readFileSync(path.join(ROOT,'styles.css'),'utf8');
  const ui=fs.readFileSync(path.join(ROOT,'js/ui/ui-construction.js'),'utf8');
  const placement=fs.readFileSync(path.join(ROOT,'js/systems/building-placement.js'),'utf8');
  assert(html.includes('data-build-category="utility"')&&html.includes('data-build-category="defense"'));
  assert(html.includes('continuousBuildToggle')&&html.includes('cancelBuildMode'));
  assert(css.includes('calc(-100% + 66px)')&&css.includes('.left-panel-handle')&&css.includes('.left-panel-body'));
  assert(html.includes('class="left-panel-body"'));
  assert(css.includes('.deployment-mode-icon')&&css.includes('.deployment-facility-grid')&&css.includes('.deployment-category-grid'));
  assert(css.includes('.right-panel.selection-hidden'));
  assert(ui.includes("rightPanel?.classList.toggle('selection-hidden'"));
  assert(placement.includes('if (game.continuousBuild)'));
}
console.log('PASS construction tabs, continuous build, wide hover handle, and empty-selection panel hiding are wired');

console.log('PASS full workflow UX smoke');
