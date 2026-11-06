'use strict';

// Pure rules engine. Multiplayer instances and their random seed live ONLY on
// the server. The public map seed is never used to assign hidden objectives.
(function (root) {
  const kinds = ['expansionist','unifier','fanatic','opportunist','warmonger','bountyHunter','pacifist','starchaser','annihilator'];
  const names = { expansionist:'Expansionist', unifier:'Unifier', fanatic:'Fanatic', opportunist:'Opportunist', warmonger:'Warmonger', bountyHunter:'Bounty Hunter', pacifist:'Pacifist', starchaser:'Starchaser', annihilator:'Annihilator' };
  function rng(seed) { let state = seed >>> 0; return () => { state = (Math.imul(state,1664525)+1013904223)>>>0; return state/4294967296; }; }
  class SecretAgendas {
    constructor(players, zones, regions, seed) {
      this.random = rng(seed);
      this.deaths = [];
      this.lastDeathAt = 0;
      this.winners = null;
      this.announced = false;
      this.records = [];
      for (let attempt=0; attempt<200; attempt++) {
        this.records = [];
        const sharedZone = this.pick(zones).id;
        for (const player of players) {
          const allowed = kinds.filter(kind => !['opportunist','annihilator'].includes(kind) || !this.records.some(a=>a.kind===kind));
          const kind = this.pick(allowed);
          const others = players.filter(p=>p.id!==player.id).map(p=>p.id);
          this.records.push({ playerId:player.id, kind, held:0, chases:0, deadline:480, kills:[],
            regionId:kind==='unifier' ? this.pick(regions).id : null,
            zones:kind==='fanatic' ? [sharedZone,...this.sample(zones.filter(z=>z.id!==sharedZone).map(z=>z.id),2)] : kind==='starchaser' ? [this.pick(zones).id] : [],
            targets:kind==='bountyHunter' ? this.sample(others,players.length<4 ? 1 : 2) : [],
            requiredKills:players.length>4 ? 2 : 1 });
        }
        if (this.hasConflict()) break;
      }
      // Bounded deterministic fallback: two strict-largest-area objectives
      // cannot both hold, regardless of the remaining assignments.
      if (!this.hasConflict()) for (const a of this.records.slice(0,2)) Object.assign(a,{kind:'expansionist',zones:[],targets:[],regionId:null});
    }
    pick(items) { return items[Math.floor(this.random()*items.length)]; }
    sample(items,n) { const pool=items.slice(), result=[]; while(result.length<n && pool.length) result.push(pool.splice(Math.floor(this.random()*pool.length),1)[0]); return result; }
    hasConflict() {
      return this.records.some((a,i)=>this.records.slice(i+1).some(b=> {
        if (a.kind==='annihilator' || b.kind==='annihilator') return true;
        if (a.kind==='opportunist' || b.kind==='opportunist') return false;
        if (a.targets.includes(b.playerId) || b.targets.includes(a.playerId)) return true;
        if (a.kind==='warmonger' && b.kind==='warmonger') return true;
        if ((a.kind==='warmonger' && b.kind==='pacifist') || (b.kind==='warmonger' && a.kind==='pacifist')) return true;
        if (a.kind==='expansionist' && b.kind==='expansionist') return true;
        if (a.kind==='unifier' && b.kind==='unifier' && a.regionId===b.regionId) return true;
        return a.zones.some(id=>b.zones.includes(id));
      }));
    }
    recordDeath(victim, killer, time) {
      if (this.deaths.some(d=>d.victim===victim)) return;
      this.deaths.push({victim,killer,time}); this.lastDeathAt=time;
      const record=this.records.find(a=>a.playerId===killer);
      if (record && killer!==victim && !record.kills.includes(victim)) record.kills.push(victim);
    }
    step(world,dt,eliminate) {
      if (this.winners) return;
      const {players,zones,regions,time}=world;
      const alive=id=>players.some(p=>p.id===id && p.alive);
      const owns=(id,zoneId)=>zones.some(z=>z.id===zoneId && z.ownerId===id && !z.contested);
      const allOwned=id=>zones.length>0 && zones.every(z=>z.ownerId===id);
      // Resolve forced eliminations before victory, including Pacifist cascades.
      for (const a of this.records) {
        if (!alive(a.playerId) || a.kind!=='starchaser') continue;
        if (owns(a.playerId,a.zones[0])) {
          a.chases++;
          const candidates=zones.filter(z=>z.ownerId!==a.playerId);
          a.zones=candidates.length ? [this.pick(candidates).id] : [];
          a.deadline=time+480;
        } else if (time+1e-7>=a.deadline && !allOwned(a.playerId)) {
          eliminate(a.playerId); this.recordDeath(a.playerId,null,time);
        }
      }
      if (this.deaths.length>1) for (const a of this.records) if(a.kind==='pacifist' && alive(a.playerId)) {
        eliminate(a.playerId); this.recordDeath(a.playerId,null,time);
      }
      if(time+1e-7>=300 && this.records.some(a=>a.kind==='annihilator')) this.announced=true;
      const winners=[];
      for(const a of this.records) {
        if(!alive(a.playerId)) continue;
        let condition=false, win=false;
        if(a.kind==='expansionist') {
          const area=id=>zones.filter(z=>z.ownerId===id && !z.contested).reduce((s,z)=>s+z.territoryArea,0);
          const own=area(a.playerId);
          condition=own>0 && players.filter(p=>p.alive && p.id!==a.playerId).every(p=>own>area(p.id)+1e-7);
        } else if(a.kind==='unifier') {
          const region=regions.find(r=>r.id===a.regionId);
          condition=!!region && region.zones.every(z=>owns(a.playerId,typeof z==='object'?z.id:z));
        } else if(a.kind==='fanatic') condition=a.zones.every(id=>owns(a.playerId,id));
        if(['expansionist','unifier','fanatic'].includes(a.kind)) { a.held=condition ? a.held+dt : 0; win=a.held+1e-7>=240; }
        if(a.kind==='warmonger') win=a.kills.length>=a.requiredKills;
        if(a.kind==='bountyHunter') win=a.targets.every(id=>!alive(id));
        if(a.kind==='pacifist') win=time-this.lastDeathAt+1e-7>=900;
        if(a.kind==='starchaser') win=a.chases>=6 || allOwned(a.playerId);
        if(a.kind==='annihilator' || a.kind==='opportunist') win=players.filter(p=>p.alive).length===1;
        if(win) winners.push(a.playerId);
      }
      if(winners.length) {
        for(const a of this.records) if(a.kind==='opportunist' && alive(a.playerId) && !winners.includes(a.playerId)) winners.push(a.playerId);
        this.winners=winners.sort((a,b)=>a-b);
      } else if(!players.some(p=>p.alive)) this.winners=[];
    }
    view(playerId,time) {
      const a=this.records.find(a=>a.playerId===playerId);
      if(!a) return null;
      return { ...a, zones:[...a.zones], targets:[...a.targets], kills:[...a.kills], name:names[a.kind],
        peacefulSeconds:Math.max(0,time-this.lastDeathAt), deaths:this.deaths.length,
        announced:this.announced, winners:this.winners && [...this.winners] };
    }
  }
  root.SecretAgendas=SecretAgendas;
})(globalThis);
