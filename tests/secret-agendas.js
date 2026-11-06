'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {bootProject}=require('../server/runtime/headless.cjs');
const ROOT=path.resolve(__dirname,'..');
const scope=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT,'shared/secret-agendas.js'),'utf8'),scope);
const Engine=scope.SecretAgendas;
function fixture(kinds) {
  const players=kinds.map((_,id)=>({id,alive:true}));
  const zones=Array.from({length:8},(_,i)=>({id:`z${i}`,ownerId:null,contested:false,territoryArea:i+1,regionId:i<4?0:1}));
  const regions=[0,1].map(id=>({id,zones:zones.filter(z=>z.regionId===id)}));
  const engine=new Engine(players,zones,regions,7);
  engine.records.forEach((a,i)=>Object.assign(a,{kind:kinds[i],regionId:0,zones:['z0','z1','z2'],targets:[(i+1)%players.length],held:0,kills:[],chases:0,deadline:480}));
  const world={players,zones,regions,time:0};
  const die=(id,killer=null)=>{players[id].alive=false;engine.recordDeath(id,killer,world.time);};
  const step=dt=>{world.time+=dt;engine.step(world,dt,id=>die(id));};
  return {players,zones,regions,engine,world,die,step};
}
for(let count=2;count<=5;count++) for(let seed=0;seed<250;seed++) {
  const f=fixture(Array(count).fill('expansionist'));
  const a=new Engine(f.players,f.zones,f.regions,seed);
  assert(a.hasConflict());
  for(const kind of ['opportunist','annihilator']) assert(a.records.filter(r=>r.kind===kind).length<=1);
  const fanatics=a.records.filter(r=>r.kind==='fanatic');
  if(fanatics.length>1) assert(fanatics[0].zones.some(id=>fanatics.every(r=>r.zones.includes(id))));
  for(const r of a.records) {
    if(r.kind==='bountyHunter') {assert.equal(r.targets.length,count<4?1:2);assert(!r.targets.includes(r.playerId));}
    if(r.kind==='warmonger') assert.equal(r.requiredKills,count>4?2:1);
  }
}
{
  const f=fixture(['expansionist','unifier','fanatic']);
  f.zones[7].ownerId=0;f.zones[0].ownerId=1;
  f.step(239);assert.equal(f.engine.winners,null);
  f.zones[7].contested=true;f.step(1);assert.equal(f.engine.records[0].held,0);
  f.zones[7].contested=false;f.step(240);assert.deepEqual([...f.engine.winners],[0]);
}
{
  const f=fixture(['unifier','fanatic']);
  f.zones.slice(0,4).forEach(z=>z.ownerId=0);
  f.step(100);f.zones[0].contested=true;f.step(1);assert.equal(f.engine.records[0].held,0);
  f.zones[0].contested=false;f.step(240);assert.deepEqual([...f.engine.winners],[0]);
}
{
  const f=fixture(['fanatic','expansionist']);f.zones.slice(0,3).forEach(z=>z.ownerId=0);
  f.step(239);assert.equal(f.engine.winners,null);f.step(1);assert.deepEqual([...f.engine.winners],[0]);
}
{
  const f=fixture(['warmonger','bountyHunter','opportunist','unifier']);
  f.engine.records[1].targets=[3];f.die(3,0);f.step(1/30);
  assert.deepEqual([...f.engine.winners],[0,1,2]);
}
{
  const f=fixture(['warmonger','bountyHunter','pacifist','unifier','fanatic']);
  f.engine.records[1].targets=[0,2];f.die(3,0);f.step(1);assert.equal(f.engine.winners,null);
  f.die(4,0);f.step(1);assert.deepEqual([...f.engine.winners],[0]);assert.equal(f.players[2].alive,false);
}
{
  const f=fixture(['pacifist','unifier','fanatic']);f.step(899);assert.equal(f.engine.winners,null);
  f.die(2,1);f.step(899);assert.equal(f.engine.winners,null);f.step(1);assert.deepEqual([...f.engine.winners],[0]);
}
{
  const f=fixture(['pacifist','pacifist','starchaser','fanatic']);
  f.die(3);f.step(480);assert.deepEqual([...f.engine.winners],[]);assert(f.players.every(p=>!p.alive));
}
{
  const f=fixture(['starchaser','unifier']);f.engine.records[0].zones=['z0'];f.zones[0].ownerId=0;
  f.step(480);assert(f.players[0].alive);assert.equal(f.engine.records[0].chases,1);
  assert.notEqual(f.engine.records[0].zones[0],'z0');
  for(let i=1;i<6;i++){const id=f.engine.records[0].zones[0];f.zones.forEach(z=>z.ownerId=null);f.zones.find(z=>z.id===id).ownerId=0;f.step(1);}
  assert.deepEqual([...f.engine.winners],[0]);
}
{
  const f=fixture(['starchaser','opportunist']);f.step(480);assert(!f.players[0].alive);assert.deepEqual([...f.engine.winners],[1]);
}
{
  const f=fixture(['starchaser','annihilator']);f.zones.forEach(z=>z.ownerId=0);f.step(1);assert.deepEqual([...f.engine.winners],[0]);
}
{
  const f=fixture(['annihilator','unifier','fanatic']);f.step(299);assert(!f.engine.announced);f.step(1);assert(f.engine.announced);
  f.die(1,2);f.die(2,0);f.step(1);assert.deepEqual([...f.engine.winners],[0]);
}
{
  const f=fixture(['unifier','expansionist','opportunist']);
  f.zones.slice(0,4).forEach(z=>z.ownerId=0);f.zones[6].ownerId=1;f.zones[7].ownerId=1;
  f.step(240);assert.deepEqual([...f.engine.winners],[0,1,2]);
}
console.log('PASS agenda assignments, constraints, timers, failures, attribution, alternative victories and co-winners');

const query='?debug=1&network=1&agendas=1&player=0&humans=0,1&commanders=3&seed=77';
const server=bootProject(ROOT,77,query,{__AGENDA_AUTHORITY__:true,__AGENDA_SECRET_SEED__:438});
const client=bootProject(ROOT,77,query);
assert.equal(vm.runInContext('secretAgendaEngine',client),null,'Clients must never assign agendas');
vm.runInContext("secretAgendaEngine.records[0].kind='annihilator';secretAgendaEngine.records[1].kind='bountyHunter';secretAgendaEngine.records[1].targets=[2];",server);
const packet=vm.runInContext('({tick:0,world:PublicWorldState.pack(game)})',server);
assert(!JSON.stringify(packet).includes('bountyHunter'));assert(!JSON.stringify(packet).includes('annihilator'));
assert(!JSON.stringify(packet).includes('secretAgenda'));
client.receiveAgendaWorld(JSON.parse(JSON.stringify(packet)));
assert.equal(client.__RTS_DEBUG__.game.players[0].capital,client.__RTS_DEBUG__.game.entityById.get(1));
assert(client.__RTS_DEBUG__.game.players[0].research.completed instanceof client.Set);
const target=server.__RTS_DEBUG__.game.players[1].capital;
const hp=target.hp;server.applyDamage(target,100,0);assert.equal(hp-target.hp,130);
const basic=server.__RTS_DEBUG__.createUnit('basic',1,1000,1000);const bhp=basic.hp;server.applyBurningZoneDot(basic,.1,100,1,0);assert.equal(bhp-basic.hp,13);
const enemy=server.__RTS_DEBUG__.game.buildings.find(b=>b.playerId===1 && b.type==='militaryBase');
const bridge=server.__FULL_NETWORK_BRIDGE__;
const command=(name,args,playerId=0)=>bridge.executeAuthoritative({playerId,command:{name,args}});
assert.equal(command('trainUnits',[{$entity:enemy.id},'basic',1]).ok,false);
assert.equal(command('startResearch',[1,'mechanizedWarfare']).ok,false);
assert.equal(command('notACommand',[]).ok,false);
assert.equal(command('removeOwnedBuilding',[{id:enemy.id,alive:true,playerId:0,type:'city',investment:999999}]).ok,false,'Forged entity objects are never accepted');
const money=server.__RTS_DEBUG__.game.players[0].money;
command('deployAttack',[{players:[],over:true,attackAmounts:{},attackTarget:{x:1000,y:1000}}]);
assert.equal(server.__RTS_DEBUG__.game.players.length,3);assert(!server.__RTS_DEBUG__.game.over);
const own=server.__RTS_DEBUG__.game.buildings.find(b=>b.playerId===0 && b.type==='militaryBase');
command('trainUnits',[{$entity:own.id},'basic',1]);assert(server.__RTS_DEBUG__.game.players[0].money<money);
const old=client.__RTS_DEBUG__.game.entityById.get(own.id);
client.receiveAgendaWorld(JSON.parse(JSON.stringify(vm.runInContext('({tick:1,world:PublicWorldState.pack(game)})',server))));
assert.equal(client.__RTS_DEBUG__.game.entityById.get(own.id),old,'Snapshot preserves live panel entity references');
console.log('PASS private server assignments, public serialization, client hydration, damage bonus and command ownership');
