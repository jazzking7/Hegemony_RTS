import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { bootProject } = require('../runtime/headless.cjs');
function workspaceRoot(): string {
  let directory=path.dirname(fileURLToPath(import.meta.url));
  while(!fs.existsSync(path.join(directory,'index.html'))) {
    const parent=path.dirname(directory);
    if(parent===directory) throw new Error('Game runtime files are missing.');
    directory=parent;
  }
  return directory;
}
export interface AgendaOrder {
  sequence:number; tick:number; playerId:number;
  command:{name:string; args:unknown[]; requestId?:string};
}
export class AgendaMatch {
  private context: any;
  private queue = new Map<number,AgendaOrder[]>();
  private tick=0;
  private acknowledgements: Array<{playerId:number;requestId?:string;name:string;result:any}> = [];
  constructor(match:{seed:number; mapSize:string; commanderCount:number; humanSeats:number[]; players:Array<{seat:number;name:string}>}) {
    const query=`?debug=1&network=1&agendas=1&player=0&humans=${match.humanSeats.join(',')}&commanders=${match.commanderCount}&map=${match.mapSize}&seed=${match.seed}`;
    this.context=bootProject(workspaceRoot(),match.seed,query,{
      __AGENDA_AUTHORITY__:true,
      __AGENDA_SECRET_SEED__:randomBytes(4).readUInt32LE(0)
    });
    for(const player of match.players) this.context.__RTS_DEBUG__.game.players[player.seat].name=player.name;
  }
  enqueue(order:AgendaOrder) {
    const orders=this.queue.get(order.tick) || []; orders.push(order); this.queue.set(order.tick,orders);
  }
  step(tick:number) {
    this.tick=tick;
    const results=[];
    for(const order of this.queue.get(tick) || []) {
      const result=this.context.__FULL_NETWORK_BRIDGE__.executeAuthoritative(order);
      results.push({playerId:order.playerId,name:order.command.name,requestId:order.command.requestId,result: result===false || result===null ? {ok:false,reason:'Order could not be completed.'} : typeof result==='object' && 'ok' in result ? result : {ok:true}});
    }
    this.acknowledgements.push(...results);
    if(this.acknowledgements.length>500) this.acknowledgements.splice(0,this.acknowledgements.length-500);
    this.queue.delete(tick);
    this.context.__RTS_DEBUG__.update(1/30);
    return results;
  }
  resultsFor(playerId:number) { return this.acknowledgements.filter(r=>r.playerId===playerId); }
  publicState() { return {tick:this.tick,world:vm.runInContext('PublicWorldState.pack(game)',this.context)}; }
  privateState(playerId:number) { return vm.runInContext(`secretAgendaEngine.view(${playerId},game.time)`,this.context); }
  get ended():boolean { return this.context.__RTS_DEBUG__.game.over; }
}
