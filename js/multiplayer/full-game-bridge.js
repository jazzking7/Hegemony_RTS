'use strict';

(() => {
  if (!NETWORK_MATCH) return;

  const handlers = new Map();
  const actors = new Map();
  const queuedByTick = new Map();
  const seenSequences = new Set();
  const pendingOutbound = [];
  let transport = null;
  let targetTick = 0;
  let simulationTick = 0;
  let applying = false;
  let requestSequence = 0;
  const requestPrefix = window.crypto?.randomUUID?.() || `${LOCAL_PLAYER_ID}:${Date.now()}`;
  const commandCallbacks = new Map();
  const confirmedResults = new Set();

  function encode(value, seen = new WeakSet()) {
    if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value !== 'object') return null;
    if (Number.isInteger(value.id) && game.entityById.get(value.id) === value) return { $entity: value.id };
    if (seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) return value.map(item => encode(item, seen));
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item !== 'function') result[key] = encode(item, seen);
    }
    return result;
  }

  function decode(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Number.isInteger(value.$entity)) return game.entityById.get(value.$entity) || null;
    if (Array.isArray(value)) return value.map(decode);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
  }

  function send(name, args) {
    const requestId = `${requestPrefix}:${++requestSequence}`;
    const command = { name, args: encode(args), requestId };
    if (transport) transport(command);
    else pendingOutbound.push(command);
    return requestId;
  }

  function wrap(name, original, actorFromArgs, queuedResult = true) {
    handlers.set(name, args => original(...args.map(decode)));
    actors.set(name, actorFromArgs);
    return function networkCommandWrapper(...args) {
      if (applying || AGENDA_SERVER) return original(...args);
      const actor = Number(actorFromArgs(args));
      if (actor !== LOCAL_PLAYER_ID) return original(...args);
      const requestId = send(name, args);
      const result = typeof queuedResult === 'function' ? queuedResult(args) : queuedResult;
      return result && typeof result === 'object' ? { ...result, requestId } : result;
    };
  }

  function execute(envelope) {
    const handler = handlers.get(envelope?.command?.name);
    const actor = Number(envelope?.playerId);
    if (!handler || !Number.isInteger(actor) || actor < 0 || actor >= game.players.length) return;
    const remote = actor !== LOCAL_PLAYER_ID;
    const savedPlayerId = PLAYER_ID;
    const savedSelection = game.selected;
    const savedBuildMode = game.buildMode;
    const savedNotify = typeof notify === 'function' ? notify : null;
    let result;
    try {
      PLAYER_ID = actor;
      applying = true;
      if (remote && savedNotify && !AGENDA_SERVER) notify = () => {};
      result = handler(Array.isArray(envelope.command.args) ? envelope.command.args : []);
    } finally {
      if (remote && savedNotify) notify = savedNotify;
      applying = false;
      PLAYER_ID = savedPlayerId;
      if (remote) {
        game.selected = savedSelection?.alive ? savedSelection : null;
        game.buildMode = savedBuildMode;
        try { renderSelectionPanel(); refreshBuildButtons(); } catch (_) { /* UI may not be mounted yet. */ }
      }
    }
    if (!remote) {
      const requestId = envelope.command.requestId;
      const callback = commandCallbacks.get(requestId);
      commandCallbacks.delete(requestId);
      callback?.(result);
    }
    return result;
  }

  placeBuilding = wrap('placeBuilding', placeBuilding, args => args[3] ?? LOCAL_PLAYER_ID, () => null);
  removeOwnedBuilding = wrap('removeOwnedBuilding', removeOwnedBuilding, args => args[0]?.playerId);
  applyBuildingOnsiteUpgrade = wrap('applyBuildingOnsiteUpgrade', applyBuildingOnsiteUpgrade, args => args[0]?.playerId, () => ({ ok:true, queued:true }));
  upgradeSettlement = wrap('upgradeSettlement', upgradeSettlement, args => args[0]?.playerId);
  trainUnits = wrap('trainUnits', trainUnits, args => args[0]?.playerId);
  trainConvoy = wrap('trainConvoy', trainConvoy, args => args[0]?.playerId);
  queueEngineerTraining = wrap('queueEngineerTraining', queueEngineerTraining, args => args[0]?.playerId, args => Number(args[1]) || 1);
  queueDroneBatch = wrap('queueDroneBatch', queueDroneBatch, args => args[0]?.playerId, args => Number(args[2]) || 1);
  queueInfantryLoadoutTraining = wrap('queueInfantryLoadoutTraining', queueInfantryLoadoutTraining, args => args[0]?.playerId, args => Number(args[2]) || 1);
  queueGroundDefinitionTraining = wrap('queueGroundDefinitionTraining', queueGroundDefinitionTraining, args => args[0]?.playerId, args => Number(args[2]) || 1);
  startResearch = wrap('startResearch', startResearch, args => args[0], () => ({ ok:true, queued:true }));
  setFighterMissileConfiguration = wrap('setFighterMissileConfiguration', setFighterMissileConfiguration, args => args[0], () => ({ ok:true, queued:true }));
  setParatrooperComposition = wrap('setParatrooperComposition', setParatrooperComposition, args => args[0], () => ({ ok:true, queued:true }));
  setVehiclePassengerComposition = wrap('setVehiclePassengerComposition', setVehiclePassengerComposition, args => args[0], () => ({ ok:true, queued:true }));
  setIFVTurretConfiguration = wrap('setIFVTurretConfiguration', setIFVTurretConfiguration, args => args[0]);
  setConvoyDefinition = wrap('setConvoyDefinition', setConvoyDefinition, args => args[0], () => ({ ok:true, queued:true }));
  saveInfantryLoadout = wrap('saveInfantryLoadout', saveInfantryLoadout, args => args[0], () => ({ ok:true, queued:true }));
  deleteInfantryLoadout = wrap('deleteInfantryLoadout', deleteInfantryLoadout, args => args[0]);
  setScheduledDeployment = wrap('setScheduledDeployment', setScheduledDeployment, args => args[0], () => ({ ok:true, queued:true }));
  trainScheduledDeployment = wrap('trainScheduledDeployment', trainScheduledDeployment, args => args[0], () => ({ ok:true, queued:true }));
  createAutomatedWarfare = wrap('createAutomatedWarfare', createAutomatedWarfare, args => args[0]?.playerId, () => ({ ok:true, queued:true }));
  pauseAutomatedWarfare = wrap('pauseAutomatedWarfare', pauseAutomatedWarfare, args => args[0]?.playerId);
  cancelAutomatedWarfare = wrap('cancelAutomatedWarfare', cancelAutomatedWarfare, args => args[0]?.playerId);
  setEWAntennaHeading = wrap('setEWAntennaHeading', setEWAntennaHeading, args => args[0]?.playerId);
  queueStockpileMissile = wrap('queueStockpileMissile', queueStockpileMissile, args => args[0]?.playerId, () => ({ ok:true, queued:true }));
  configureMissileSilo = wrap('configureMissileSilo', configureMissileSilo, args => args[0]?.playerId);
  toggleMissileSilo = wrap('toggleMissileSilo', toggleMissileSilo, args => args[0]?.playerId);
  setEnergyPriority = wrap('setEnergyPriority', setEnergyPriority, args => args[0]?.playerId);
  setGeneratorOutput = wrap('setGeneratorOutput', setGeneratorOutput, args => args[0]?.playerId);
  toggleEnergyNode = wrap('toggleEnergyNode', toggleEnergyNode, args => args[0]?.playerId);
  setHiveMode = wrap('setHiveMode', setHiveMode, args => args[0]?.playerId);
  setEngineerDesiredCount = wrap('setEngineerDesiredCount', setEngineerDesiredCount, args => args[0]?.playerId);
  setEngineerAutoOUEnabled = wrap('setEngineerAutoOUEnabled', setEngineerAutoOUEnabled, args => args[0]?.playerId);
  setEngineerOUPriority = wrap('setEngineerOUPriority', setEngineerOUPriority, args => args[0]?.playerId);
  togglePause = wrap('togglePause', togglePause, () => LOCAL_PLAYER_ID);

  const deployAttackLocal = deployAttack;
  handlers.set('deployAttack', args => {
    const payload = decode(args[0]) || {};
    const saved = {
      attackTarget: game.attackTarget,
      attackAmounts: game.attackAmounts,
      chosenBaseId: game.chosenBaseId,
      deploymentPrefs: game.deploymentPrefs,
      focusedDeployment: game.focusedDeployment,
      bringUnmannedEscorts: game.bringUnmannedEscorts,
      escortsPerAircraft: game.escortsPerAircraft
    };
    for (const key of Object.keys(saved)) if (Object.hasOwn(payload,key)) game[key]=payload[key];
    deployAttackLocal();
    if (PLAYER_ID !== LOCAL_PLAYER_ID) Object.assign(game, saved);
  });
  deployAttack = function networkDeployAttack() {
    if (applying) return deployAttackLocal();
    send('deployAttack', [{
      attackTarget: game.attackTarget ? { ...game.attackTarget } : null,
      attackAmounts: { ...game.attackAmounts },
      chosenBaseId: game.chosenBaseId,
      deploymentPrefs: { ...game.deploymentPrefs },
      focusedDeployment: !!game.focusedDeployment,
      bringUnmannedEscorts: !!game.bringUnmannedEscorts,
      escortsPerAircraft: game.escortsPerAircraft
    }]);
    return true;
  };

  const confirmMissileLocal = confirmMissileAimTarget;
  handlers.set('confirmMissileAimTarget', args => {
    const payload = decode(args[0]) || {};
    game.missileAimingSiteId = payload.siteId;
    game.missileAimTarget = payload.target;
    return confirmMissileLocal();
  });
  confirmMissileAimTarget = function networkConfirmMissile() {
    if (applying) return confirmMissileLocal();
    send('confirmMissileAimTarget', [{ siteId:game.missileAimingSiteId, target:game.missileAimTarget ? { ...game.missileAimTarget } : null }]);
    return { ok:true, queued:true };
  };

  const fireAimedMissileLocal = fireAimedMissileAt;
  handlers.set('fireAimedMissileAt', args => {
    const payload = decode(args[0]) || {};
    game.missileAimingSiteId = payload.siteId;
    game.missileAimSiloIndex = payload.siloIndex;
    return fireAimedMissileLocal(payload.x, payload.y, false);
  });
  fireAimedMissileAt = function networkFireAimedMissile(x, y, confirmMark = false) {
    if (applying || confirmMark) return fireAimedMissileLocal(x, y, confirmMark);
    send('fireAimedMissileAt', [{ siteId:game.missileAimingSiteId, siloIndex:game.missileAimSiloIndex, x, y }]);
    return { ok:true, queued:true };
  };

  const confirmEnergyLocal = confirmOrbitalEnergyAim;
  handlers.set('confirmOrbitalEnergyAim', args => {
    const payload = decode(args[0]) || {};
    game.energyAimingSystemId = payload.systemId;
    game.energyAimTarget = payload.target;
    return confirmEnergyLocal();
  });
  confirmOrbitalEnergyAim = function networkConfirmEnergy() {
    if (applying) return confirmEnergyLocal();
    send('confirmOrbitalEnergyAim', [{ systemId:game.energyAimingSystemId, target:game.energyAimTarget ? { ...game.energyAimTarget } : null }]);
    return { ok:true, queued:true };
  };

  const fireOrbitalEnergyLocal = fireOrbitalEnergyAt;
  handlers.set('fireOrbitalEnergyAt', args => {
    const payload = decode(args[0]) || {};
    game.energyAimingSystemId = payload.systemId;
    return fireOrbitalEnergyLocal(payload.x, payload.y);
  });
  fireOrbitalEnergyAt = function networkFireOrbitalEnergy(x, y) {
    if (applying) return fireOrbitalEnergyLocal(x, y);
    send('fireOrbitalEnergyAt', [{ systemId:game.energyAimingSystemId, x, y }]);
    return { ok:true, queued:true };
  };

  window.__FULL_NETWORK_BRIDGE__ = {
    executeAuthoritative(envelope) {
      const actor=envelope.playerId, command=envelope.command;
      if(!game.players[actor]?.alive || game.over) return {ok:false,reason:'Your commander cannot issue orders.'};
      if(!handlers.has(command.name)) return {ok:false,reason:'Unknown order.'};
      const valid=value=> {
        if(typeof value==='number') return Number.isFinite(value);
        if(!value || typeof value!=='object') return true;
        if(Object.keys(value).some(k=>['__proto__','constructor','prototype'].includes(k))) return false;
        if(Object.hasOwn(value,'$entity')) return game.entityById.get(value.$entity)?.playerId===actor;
        return Object.values(value).every(valid);
      };
      if(!valid(command.args)) return {ok:false,reason:'Invalid order or foreign entity.'};
      if(command.name==='placeBuilding' && command.args.length<4) command.args[3]=actor;
      const playerCommands=new Set(['startResearch','setFighterMissileConfiguration','setParatrooperComposition','setVehiclePassengerComposition','setIFVTurretConfiguration','setConvoyDefinition','saveInfantryLoadout','deleteInfantryLoadout','setScheduledDeployment','trainScheduledDeployment']);
      const getActor=actors.get(command.name);
      if(getActor && !playerCommands.has(command.name) && !['placeBuilding','togglePause'].includes(command.name)) {
        if(!Number.isInteger(command.args[0]?.$entity)) return {ok:false,reason:'Orders require a real owned facility.'};
      }
      if(playerCommands.has(command.name) && command.args[0]!==actor) return {ok:false,reason:'Invalid commander.'};
      if(getActor && command.name!=='togglePause' && Number(getActor(command.args.map(decode)))!==actor) return {ok:false,reason:'You can only command your own forces.'};
      const payload=command.args[0];
      const facilityId=payload?.siteId ?? payload?.systemId ?? (payload?.chosenBaseId || null);
      if(facilityId!=null && game.entityById.get(facilityId)?.playerId!==actor) return {ok:false,reason:'That facility is not yours.'};
      const originalNotify=notify;
      let warning=null, message=null;
      notify=(text,tone)=>{ if(tone==='warning') warning=text; else message=text; };
      try {
        const result=execute(envelope);
        if(result===false || result===null || (result===undefined && warning)) return {ok:false,reason:warning || 'Order could not be completed.'};
        if(result?.kind==='building') return {ok:true,entityId:result.id,message};
        return result===undefined ? {ok:true,message} : result;
      } catch (_) { return {ok:false,reason:'Invalid battlefield order.'}; }
      finally { notify=originalNotify; }
    },
    confirmResult(requestId,result) {
      if(typeof requestId!=='string' || !requestId.startsWith(`${requestPrefix}:`) || confirmedResults.has(requestId)) return false;
      confirmedResults.add(requestId);
      const callback=commandCallbacks.get(requestId); commandCallbacks.delete(requestId); callback?.(result);
      return true;
    },
    onCommandResult(requestId, callback) { commandCallbacks.set(requestId, callback); },
    rejectPending(reason) {
      const callbacks = [...commandCallbacks.values()];
      commandCallbacks.clear();
      callbacks.forEach(callback => callback({ ok:false, reason }));
    },
    setTransport(nextTransport) {
      transport = nextTransport;
      while (pendingOutbound.length) transport(pendingOutbound.shift());
    },
    queueCommand(envelope) {
      const sequence = Number(envelope?.sequence);
      const tick = Number(envelope?.tick);
      if (!Number.isInteger(sequence) || !Number.isInteger(tick) || seenSequences.has(sequence)) return;
      seenSequences.add(sequence);
      const scheduledTick = Math.max(simulationTick + 1, tick);
      if (!queuedByTick.has(scheduledTick)) queuedByTick.set(scheduledTick, []);
      queuedByTick.get(scheduledTick).push(envelope);
    },
    applyCommandsForTick(tick) {
      const commands = queuedByTick.get(tick);
      if (!commands) return;
      commands.sort((a, b) => a.sequence - b.sequence).forEach(execute);
      queuedByTick.delete(tick);
    },
    setTargetTick(tick) { targetTick = Math.max(targetTick, Math.floor(Number(tick) || 0)); },
    getTargetTick() { return targetTick; },
    setSimulationTick(tick) { simulationTick = tick; },
    getSimulationTick() { return simulationTick; }
  };
})();
