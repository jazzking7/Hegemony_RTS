'use strict';

// Hidden rules state is deliberately separate from the public `game` graph.
let secretAgendaEngine = null;
let privateAgendaView = null;
let agendaModeEnabled = false;
let agendaAnnouncementShown = false;
let agendaDefeatShown = false;
function secretAgendasEnabled() { return agendaModeEnabled; }
function initializeSecretAgendas() {
  agendaModeEnabled = NETWORK_MATCH ? NETWORK_AGENDAS : document.getElementById('agendaMode')?.value === 'agendas';
  privateAgendaView = null; secretAgendaEngine = null; agendaAnnouncementShown = false; agendaDefeatShown = false;
  document.getElementById('agendaPanel')?.classList.add('hidden');
  if(agendaModeEnabled && (!NETWORK_MATCH || AGENDA_SERVER)) {
    const seed=AGENDA_SERVER ? globalThis.__AGENDA_SECRET_SEED__ : Math.floor(Math.random()*4294967296);
    secretAgendaEngine=new SecretAgendas(game.players,game.captureZones,game.captureRegions,seed);
  }
  refreshAgendaUI();
}
function agendaDamageMultiplier(playerId) {
  return secretAgendaEngine?.records.some(a=>a.playerId===playerId && a.kind==='annihilator') ? 1.3 : 1;
}
function recordAgendaElimination(victim,killer) { secretAgendaEngine?.recordDeath(victim,killer,game.time); }
function agendaWorld() { return {players:game.players,zones:game.captureZones,regions:game.captureRegions,time:game.time}; }
function updateSecretAgendas(dt) {
  if(!secretAgendaEngine) return;
  secretAgendaEngine.step(agendaWorld(),dt,id=>eliminatePlayer(id,null));
  if(secretAgendaEngine.winners) {
    game.over=true; game.paused=true;
    showAgendaOutcome(secretAgendaEngine.winners);
  }
  if(!AGENDA_SERVER) privateAgendaView=secretAgendaEngine.view(LOCAL_PLAYER_ID,game.time);
}
function showAgendaOutcome(winners) {
  const won=winners.includes(LOCAL_PLAYER_ID);
  els.gameOverTitle.textContent=won ? (winners.length>1?'CO-VICTORY':'VICTORY') : winners.length?'DEFEAT':'DRAW';
  els.gameOverText.textContent=winners.length ? `Agenda complete: ${winners.map(id=>game.players[id]?.name || `Commander ${id+1}`).join(', ')}.` : 'No commanders survived.';
  els.gameOverOverlay.classList.remove('hidden');
}
function receivePrivateAgenda(view) {
  privateAgendaView=view;
  if(view?.winners) showAgendaOutcome(view.winners);
  refreshAgendaUI();
}
function refreshAgendaUI() {
  if(AGENDA_SERVER) return;
  document.getElementById('agendaButton')?.classList.toggle('hidden',!agendaModeEnabled);
  if(!agendaModeEnabled) return;
  const a=privateAgendaView || secretAgendaEngine?.view(LOCAL_PLAYER_ID,game.time);
  const title=document.getElementById('agendaTitle'), description=document.getElementById('agendaDescription'), progress=document.getElementById('agendaProgress');
  if(!a) { if(title) title.textContent='Receiving your secret agenda…'; return; }
  const zone=id=>game.captureZones?.find(z=>z.id===id)?.label || id;
  const names=a.targets.map(id=>game.players[id]?.name || `Commander ${id+1}`).join(', ');
  const descriptions={
    expansionist:'Hold the strictly largest uncontested territorial area continuously for 4 minutes. Ties or losing the lead reset progress.',
    unifier:`Control every zone in ${game.captureRegions?.find(r=>r.id===a.regionId)?.name || 'your region'} uncontested for 4 continuous minutes.`,
    fanatic:`Control ${a.zones.map(zone).join(', ')} uncontested for 4 continuous minutes.`,
    opportunist:'Stay alive. Win when anyone completes an agenda, or become the only surviving commander.',
    warmonger:`Personally destroy ${a.requiredKills} enemy Capital${a.requiredKills>1?'s':''}. The killing blow determines credit.`,
    bountyHunter:`Ensure these commanders are eliminated: ${names}. Anyone can deliver the killing blow.`,
    pacifist:'Survive 15 continuous minutes without an elimination. The first death resets the timer; the second eliminates you immediately.',
    starchaser:`Capture ${a.zones.map(zone).join(', ') || 'all zones'} before the deadline. Complete 6 chases, or own every zone. Timeout eliminates you.`,
    annihilator:'Be the only surviving commander. All your damage is multiplied by 1.30. Your presence is announced after 5 minutes; your identity stays hidden.'
  };
  const clock=seconds=>`${Math.floor(Math.max(0,seconds)/60)}:${String(Math.floor(Math.max(0,seconds)%60)).padStart(2,'0')}`;
  let text=['expansionist','unifier','fanatic'].includes(a.kind)?`${clock(a.held)} / 4:00 continuous control`:
    a.kind==='warmonger'?`${a.kills.length} / ${a.requiredKills} personal eliminations`:
    a.kind==='bountyHunter'?`${a.targets.filter(id=>!game.players[id]?.alive).length} / ${a.targets.length} targets eliminated`:
    a.kind==='pacifist'?`${clock(a.peacefulSeconds)} / 15:00 peaceful · ${a.deaths} eliminations`:
    a.kind==='starchaser'?`${a.chases} / 6 chases · ${clock(a.deadline-game.time)} remaining`:
    `${game.players.filter(p=>p.alive).length} commanders remain`;
  if(!game.players[LOCAL_PLAYER_ID]?.alive) {
    text='You have been eliminated. You cannot win.';
    if(!agendaDefeatShown && !a.winners) {
      agendaDefeatShown=true;
      els.gameOverTitle.textContent='ELIMINATED'; els.gameOverText.textContent='Your Capital fell or your agenda failed. The remaining commanders continue.';
      els.gameOverOverlay.classList.remove('hidden');
    }
  }
  if(title) title.textContent=a.name;
  if(description) description.textContent=descriptions[a.kind];
  if(progress) progress.textContent=text;
  if(a.announced) {
    document.getElementById('agendaAnnouncement').textContent='An Annihilator is present. Their identity is unknown.';
    if(!agendaAnnouncementShown) { notify('An Annihilator is present. Their identity remains secret.','warning',8); agendaAnnouncementShown=true; }
  } else document.getElementById('agendaAnnouncement').textContent='';
}

// Territory agendas focus their squads on objectives. Pacifists defend instead
// of issuing deliberate Capital assaults. Combat agendas retain the macro AI.
function agendaCaptureCandidates(player,zones) {
  const a=secretAgendaEngine?.records.find(a=>a.playerId===player.id);
  if(!a) return zones;
  if(a.kind==='unifier') return zones.filter(z=>z.regionId===a.regionId);
  if(a.kind==='fanatic' || a.kind==='starchaser') return zones.filter(z=>a.zones.includes(z.id));
  if(['warmonger','bountyHunter','annihilator','opportunist','pacifist'].includes(a.kind)) return [];
  return zones;
}
function agendaAttackCandidates(player,targets) {
  const a=secretAgendaEngine?.records.find(a=>a.playerId===player.id);
  if(!a) return targets;
  if(['pacifist','unifier','fanatic','starchaser','expansionist','opportunist'].includes(a.kind)) return [];
  if(a.kind==='bountyHunter') return targets.filter(p=>a.targets.includes(p.id));
  return targets;
}
document.getElementById('agendaButton')?.addEventListener('click',()=>{
  refreshAgendaUI(); document.getElementById('agendaPanel').classList.toggle('hidden');
});
document.getElementById('closeAgenda')?.addEventListener('click',()=>document.getElementById('agendaPanel').classList.add('hidden'));

let agendaSnapshotAt=0, agendaSnapshotTick=0, agendaSnapshotInterval=0.1;
function receiveAgendaWorld(packet) {
  if(!NETWORK_AGENDAS || AGENDA_SERVER) return;
  const state=PublicWorldState.unpack(packet.world);
  // Retain entity/player identity so existing panel handlers and render views
  // keep pointing at the current objects while snapshots replace their values.
  const replacements=new Map();
  for(const entity of [...state.buildings,...state.units]) {
    const old=game.entityById.get(entity.id); if(old) replacements.set(entity,old);
  }
  for(const player of state.players) if(game.players[player.id]) replacements.set(player,game.players[player.id]);
  for(const zone of state.captureZones) { const old=game.captureZones.find(z=>z.id===zone.id); if(old) replacements.set(zone,old); }
  const visited=new Map();
  function reconcile(value) {
    if(!value || typeof value!=='object') return value;
    if(visited.has(value)) return visited.get(value);
    const target=replacements.get(value) || value; visited.set(value,target);
    if(value instanceof Map) { const entries=[...value]; value.clear(); entries.forEach(([k,v])=>value.set(reconcile(k),reconcile(v))); }
    else if(value instanceof Set) { const entries=[...value]; value.clear(); entries.forEach(v=>value.add(reconcile(v))); }
    else { const entries=Object.entries(value); if(target!==value) for(const key of Object.keys(target)) delete target[key]; for(const [key,v] of entries) target[key]=reconcile(v); }
    return target;
  }
  const selectedId=game.selected?.id;
  const uiStructure=()=>JSON.stringify([
    [...game.players[LOCAL_PLAYER_ID]?.research.completed || []],
    game.players[LOCAL_PLAYER_ID]?.research.active.map(r=>r.id),
    game.buildings.filter(b=>b.alive && b.playerId===LOCAL_PLAYER_ID).map(b=>[b.id,b.level,b.onsiteUpgradeLevel])
  ]);
  const oldStructure=uiStructure();
  captureNetworkRenderState();
  Object.assign(game,reconcile(state));
  game.selected=game.entityById.get(selectedId) || game.captureZones.find(z=>z.id===selectedId) || null;
  if(game.selected && !game.selected.alive) game.selected=null;
  game.buildingGridDirty=true; rebuildSpatialHashes();
  agendaSnapshotInterval=Math.max(1/30,Math.min(0.3,(packet.tick-agendaSnapshotTick)/30));
  agendaSnapshotTick=packet.tick; agendaSnapshotAt=performance.now();
  networkRenderAlpha=0;
  if(oldStructure!==uiStructure() || (selectedId && !game.selected)) { renderSelectionPanel(); renderResearchModal(); }
  refreshBuildButtons(); updateHUD();
}
