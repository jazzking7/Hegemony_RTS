import assert from 'node:assert/strict';
import test from 'node:test';
import { AgendaMatch } from './AgendaMatch.js';

const config={seed:77,mapSize:'standard',commanderCount:3,humanSeats:[0,1],players:[{seat:0,name:'Host'},{seat:1,name:'Guest'}]};
test('agenda authority sends public world and one private objective per seat',()=>{
  const match=new AgendaMatch(config);
  assert.equal(match.privateState(0).playerId,0);
  assert.equal(match.privateState(1).playerId,1);
  const wire=JSON.stringify(match.publicState());
  assert(!wire.includes('requiredKills'));
  assert(!wire.includes('peacefulSeconds'));
  assert(!wire.includes('secretAgenda'));
  assert(wire.includes('Host'));
});
test('authority validates ownership, executes orders and keeps private acknowledgements',()=>{
  const match=new AgendaMatch(config);
  match.enqueue({sequence:1,tick:1,playerId:0,command:{name:'startResearch',args:[1,'mechanizedWarfare'],requestId:'foreign'}});
  const rejected=match.step(1);
  assert.equal(rejected[0].result.ok,false);
  assert.equal(match.resultsFor(1).length,0);
  match.enqueue({sequence:2,tick:2,playerId:0,command:{name:'trainUnits',args:[{$entity:2},'basic',1],requestId:'train'}});
  assert.equal(match.step(2)[0].result.ok,true);
  assert.equal(match.resultsFor(0).length,2);
  for(let tick=3;tick<=300;tick++) match.step(tick);
  assert.equal(match.publicState().tick,300);
  assert.doesNotThrow(()=>JSON.stringify(match.publicState()));
});
test('pause freezes objective timers and resume continues authoritative simulation',()=>{
  const match=new AgendaMatch(config);
  const initial=match.privateState(0).peacefulSeconds;
  match.enqueue({sequence:1,tick:1,playerId:0,command:{name:'togglePause',args:[]}});
  for(let tick=1;tick<=90;tick++) match.step(tick);
  assert.equal(match.privateState(0).peacefulSeconds,initial);
  match.enqueue({sequence:2,tick:91,playerId:1,command:{name:'togglePause',args:[]}});
  match.step(91);
  assert(match.privateState(0).peacefulSeconds>initial);
});
