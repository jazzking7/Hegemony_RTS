import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { CLIENT_MESSAGES as C, SERVER_MESSAGES as S, ROOM_NAME } from '../shared/multiplayer-protocol.js';

const client=new Client(process.env.MULTIPLAYER_URL || 'http://localhost:2567');
const host=await client.create(ROOM_NAME,{playerName:'Agenda Host'});
let guest=await client.joinById(host.roomId,{playerName:'Agenda Guest'});
function inbox(room:typeof host) {
  const messages:Array<{type:string;data:any}>=[];
  room.onMessage('*',(type,data)=>messages.push({type:String(type),data}));
  return {messages, async next(type:string,predicate:(data:any)=>boolean=()=>true) {
    const end=Date.now()+10000;
    while(Date.now()<end) {
      const index=messages.findIndex(m=>m.type===type && predicate(m.data));
      if(index>=0) return messages.splice(index,1)[0].data;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    throw new Error(`Timed out: ${type}`);
  }};
}
const h=inbox(host); let g=inbox(guest);
try {
  host.send('unsupported_future_command', {});
  await h.next(S.ERROR, s=>s.message.includes('Unsupported command'));
  host.send(C.SET_AGENDAS,{enabled:true});
  await h.next(S.LOBBY_STATE,s=>s.secretAgendas===true);
  host.send(C.SET_AGENDAS,{enabled:false});
  await h.next(S.LOBBY_STATE,s=>s.secretAgendas===false);
  host.send(C.SET_AGENDAS,{enabled:true});
  await h.next(S.LOBBY_STATE,s=>s.secretAgendas===true);
  guest.send(C.SET_AGENDAS,{enabled:false});
  await g.next(S.ERROR);
  host.send(C.SET_READY,{ready:true});guest.send(C.SET_READY,{ready:true});
  await h.next(S.LOBBY_STATE,s=>s.players.every((p:any)=>p.ready));
  host.send(C.START_MATCH);
  const descriptor=await g.next(S.MATCH_STARTED);
  assert(descriptor.secretAgendas);
  const privateHost=await h.next(S.PRIVATE_AGENDA), privateGuest=await g.next(S.PRIVATE_AGENDA);
  assert.equal(privateHost.playerId,0);assert.equal(privateGuest.playerId,1);
  const publicWorld=await g.next(S.AGENDA_WORLD);
  assert(!JSON.stringify(publicWorld).includes('requiredKills'));
  assert(!JSON.stringify(publicWorld).includes('secretAgenda'));
  host.send(C.FULL_COMMAND,{name:'trainUnits',args:[{$entity:2},'basic',1],requestId:'own-order'});
  assert.equal((await h.next(S.ORDER_RESULT,r=>r.requestId==='own-order')).result.ok,true);
  guest.send(C.FULL_COMMAND,{name:'trainUnits',args:[{$entity:2},'basic',1],requestId:'foreign-order'});
  assert.equal((await g.next(S.ORDER_RESULT,r=>r.requestId==='foreign-order')).result.ok,false);
  assert(!g.messages.some(m=>m.type===S.ORDER_RESULT && m.data.requestId==='own-order'));
  const token=guest.reconnectionToken;
  guest.reconnection.enabled=false;
  await guest.leave(false);
  guest=await client.reconnect(token);g=inbox(guest);
  guest.send(C.REQUEST_STATE);
  const restored=await g.next(S.PRIVATE_AGENDA);
  assert.equal(restored.playerId,1);assert.equal(restored.kind,privateGuest.kind);
  assert.deepEqual(restored.targets,privateGuest.targets);
  assert((await g.next(S.AGENDA_WORLD)).tick>=publicWorld.tick);
  assert.equal((await g.next(S.ORDER_RESULT,r=>r.requestId==='foreign-order')).result.ok,false);
  assert(!g.messages.some(m=>m.type===S.PRIVATE_AGENDA && m.data.playerId!==1));
  console.log('PASS live agenda lobby, host setting, private objectives, authoritative orders and reconnect');
} finally {
  await Promise.all([host.leave(true),guest.leave(true)]);
}
