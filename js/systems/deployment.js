'use strict';

  // ---------------------------------------------------------------------------
  // Attack modal and deployment
  // ---------------------------------------------------------------------------
  const GROUND_DEPLOYMENT_FACILITY_TYPES = Object.freeze(['militaryBase', 'superiorMobilizationComplex']);

  function resetAttackAmounts() {
    game.attackAmounts = { basic: 0, elite: 0, tank: 0, spg: 0, apc: 0, ifv: 0, bomber: 0, superFighter: 0, paratrooperPlane: 0, loiteringMunition: 0 };
    if (typeof getPlayerGroundDefinitionTypes === 'function') {
      for (const type of getPlayerGroundDefinitionTypes(PLAYER_ID)) game.attackAmounts[type] ??= 0;
    }
  }

  function getDeploymentPreferences() {
    game.deploymentPrefs ||= { mode:'facility', globalCategory:'ground', lastFacilityId:null, bringUnmannedEscorts:false, escortsPerAircraft:1 };
    return game.deploymentPrefs;
  }

  function getPlayerDeploymentFacilities() {
    return game.buildings.filter(b => b.alive && b.playerId === PLAYER_ID && DEPLOYMENT_FACILITY_TYPES.includes(b.type));
  }

  function getDeploymentCategoryForFacility(facility) {
    if (!facility) return null;
    if (facility.type === 'superiorMobilizationComplex') return 'mobilization';
    if (facility.type === 'militaryBase') return 'ground';
    if (facility.type === 'airbase') return 'air';
    if (facility.type === 'droneHub') return 'drone';
    return null;
  }

  function getDeploymentFacilitiesForCategory(category) {
    const all = getPlayerDeploymentFacilities();
    // Ground remains the broad all-ground view so players can aggregate troops
    // across conventional bases and Mobilization Complexes. Mobilization is a
    // dedicated infantry/Exosuit view over SMCs only.
    if (category === 'ground') return all.filter(b => GROUND_DEPLOYMENT_FACILITY_TYPES.includes(b.type));
    if (category === 'mobilization') return all.filter(b => b.type === 'superiorMobilizationComplex');
    if (category === 'air') return all.filter(b => b.type === 'airbase');
    if (category === 'drone') return all.filter(b => b.type === 'droneHub');
    return [];
  }

  function getDeploymentContext() {
    const prefs = getDeploymentPreferences();
    if (prefs.mode === 'global') return { mode:'global', category:prefs.globalCategory, facilities:getDeploymentFacilitiesForCategory(prefs.globalCategory), facility:null };
    const facility = getChosenBase();
    return { mode:'facility', category:getDeploymentCategoryForFacility(facility), facilities:facility ? [facility] : [], facility };
  }

  function openAttackModal(targetX, targetY) {
    if (!game.players[PLAYER_ID].alive) return;
    cancelEWAntennaAim();
    const facilities = getPlayerDeploymentFacilities();
    if (!facilities.length) {
      notify('Construct a Military Base, Superior Mobilization Complex, Airbase, or Drone Hub before issuing deployment orders.', 'warning');
      return;
    }
    const prefs = getDeploymentPreferences();
    game.attackTarget = { x: clamp(targetX, 0, WORLD.width), y: clamp(targetY, 0, WORLD.height) };
    resetAttackAmounts();
    game.focusedDeployment = false;
    game.bringUnmannedEscorts = !!prefs.bringUnmannedEscorts;
    game.escortsPerAircraft = clamp(Math.floor(Number(prefs.escortsPerAircraft) || game.players[PLAYER_ID]?.droneConfig?.preferredEscortsPerAircraft || 1), 1, Math.max(1, getLoyalWingmanSortieCap(PLAYER_ID)));

    const remembered = facilities.find(b => b.id === prefs.lastFacilityId);
    game.chosenBaseId = (remembered || facilities[0]).id;
    if (!getDeploymentFacilitiesForCategory(prefs.globalCategory).length) prefs.globalCategory = getDeploymentCategoryForFacility(remembered || facilities[0]) || 'ground';

    els.attackCoordinates.textContent = `X ${Math.round(game.attackTarget.x)} · Y ${Math.round(game.attackTarget.y)}`;
    els.attackModal.classList.remove('hidden');
    positionAttackMarker();
    renderAttackModal();
  }

  function closeAttackModal() {
    els.attackModal.classList.add('hidden');
    els.attackMarker.classList.add('hidden');
    game.attackTarget = null;
  }

  function positionAttackMarker() {
    if (!game.attackTarget || els.attackModal.classList.contains('hidden')) {
      els.attackMarker.classList.add('hidden');
      return;
    }
    const p = worldToScreen(game.attackTarget.x, game.attackTarget.y);
    els.attackMarker.style.left = `${p.x}px`;
    els.attackMarker.style.top = `${p.y}px`;
    els.attackMarker.classList.remove('hidden');
  }

  function getChosenBase() {
    return game.buildings.find(b => b.id === game.chosenBaseId && b.alive && b.playerId === PLAYER_ID && DEPLOYMENT_FACILITY_TYPES.includes(b.type)) || null;
  }

  function getSelectedMannedAircraftCount() {
    return MANNED_AIRCRAFT_TYPES.reduce((sum, type) => sum + Math.max(0, Math.floor(Number(game.attackAmounts?.[type]) || 0)), 0);
  }

  function getDeploymentTypesForCategory(category) {
    if (category === 'air') return AIR_UNIT_TYPES.filter(type => type === 'bomber' || isDefinitionUnlocked(PLAYER_ID, 'unit', type));
    if (category === 'drone') return ['loiteringMunition'].filter(type => isDefinitionUnlocked(PLAYER_ID, 'unit', type));
    const groundTypes = (typeof getPlayerGroundDefinitionTypes === 'function' ? getPlayerGroundDefinitionTypes(PLAYER_ID) : GROUND_UNIT_TYPES)
      .filter(type => (typeof isInfantryLoadoutToken === 'function' && isInfantryLoadoutToken(type)) || isDefinitionUnlocked(PLAYER_ID, 'unit', type));
    if (category === 'mobilization') {
      return groundTypes.filter(type => type === 'basic' || type === 'elite' || (typeof isInfantryLoadoutToken === 'function' && isInfantryLoadoutToken(type)));
    }
    return groundTypes;
  }

  function getDeploymentAvailable(type, context = getDeploymentContext()) {
    if (!context?.facilities?.length) return 0;
    return context.facilities.reduce((sum, facility) => sum + getFacilityAvailable(facility, type), 0);
  }

  function getDeploymentReadyTotal(facility) {
    if (facility.type === 'airbase') { syncAirbaseStoredCount(facility); syncAirbaseWingmen(facility); return getAirbaseReadyCount(facility); }
    if (facility.type === 'droneHub') { syncDroneHubCounts(facility); return getDroneHubStoredCount(facility, 'loiteringMunition'); }
    if (GROUND_DEPLOYMENT_FACILITY_TYPES.includes(facility.type)) {
      const types = typeof getPlayerGroundDefinitionTypes === 'function' ? getPlayerGroundDefinitionTypes(facility.playerId) : GROUND_UNIT_TYPES;
      return types.reduce((sum, type) => sum + getFacilityAvailable(facility, type), 0);
    }
    return 0;
  }

  function deploymentModeIcon(mode) {
    if (mode === 'global') {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"></rect><path d="M8 8h8v8H8z"></path><path d="M12 3.5v4.5M12 16v4.5M3.5 12H8M16 12h4.5"></path></svg>`;
    }
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><rect x="14" y="14" width="6" height="6" rx="1"></rect></svg>`;
  }

  function deploymentFacilityLabel(facility) {
    if (facility.type === 'airbase') return 'Airbase';
    if (facility.type === 'droneHub') return 'Drone Hub';
    if (facility.type === 'superiorMobilizationComplex') return 'Superior Mobilization';
    return 'Military Base';
  }

  function deploymentCategoryDescription(context) {
    const count = context.facilities.length;
    const ready = context.facilities.reduce((sum,b) => sum + getDeploymentReadyTotal(b), 0);
    if (context.category === 'mobilization') return `Superior Mobilization · ${count} complex${count===1?'':'es'} · ${ready} infantry ready. Aggregated from all available Mobilization Complexes.`;
    if (context.category === 'air') return `Air · ${count} Airbase${count===1?'':'s'} · ${ready} aircraft ready. Global deployments draw automatically from every eligible Airbase.`;
    if (context.category === 'drone') return `Drone · ${count} Drone Hub${count===1?'':'s'} · ${ready} drones ready. Global deployments draw automatically from every eligible Drone Hub.`;
    return `Ground · ${count} ground facilit${count===1?'y':'ies'} · ${ready} deployable units. Global deployments draw automatically across Military Bases and Mobilization Complexes.`;
  }

  function renderDeploymentSelectors(facilities, context) {
    const prefs = getDeploymentPreferences();
    const availableCategories = ['ground','air','drone','mobilization'];
    const categoryLabel = { ground:'GROUND', air:'AIR', drone:'DRONE', mobilization:'SUPERIOR MOBILIZATION' };

    let html = `<div class="deployment-selector-shell">
      <div class="deployment-mode-icons" role="group" aria-label="Deployment source view">
        <button type="button" data-deployment-mode="global" class="deployment-mode-icon ${prefs.mode === 'global' ? 'active' : ''}" aria-label="Global overview" title="Global overview">${deploymentModeIcon('global')}</button>
        <button type="button" data-deployment-mode="facility" class="deployment-mode-icon ${prefs.mode === 'facility' ? 'active' : ''}" aria-label="Per-facility view" title="Per-facility view">${deploymentModeIcon('facility')}</button>
      </div>`;

    if (prefs.mode === 'global') {
      html += `<div class="deployment-category-grid">${availableCategories.map(category => { const enabled = getDeploymentFacilitiesForCategory(category).length > 0; return `<button type="button" data-deployment-category="${category}" class="${prefs.globalCategory === category ? 'active' : ''}" ${enabled ? '' : 'disabled'}>${categoryLabel[category]}</button>`; }).join('')}</div>`;
      html += `<div class="deployment-context-description">${deploymentCategoryDescription(context)}</div>`;
      els.baseSelector.classList.remove('deployment-facility-selector');
    } else {
      const typeCounts = new Map();
      html += `<div class="deployment-facility-grid">${facilities.map(b => {
        const ordinal = (typeCounts.get(b.type) || 0) + 1;
        typeCounts.set(b.type, ordinal);
        const total = getDeploymentReadyTotal(b);
        const label = deploymentFacilityLabel(b);
        return `<button type="button" class="deployment-facility-tile ${b.type==='superiorMobilizationComplex'?'smc-chip ':''}${b.id === game.chosenBaseId ? 'active' : ''}" data-base="${b.id}"><span>${label} ${ordinal}</span><strong>${total}</strong><small>READY</small></button>`;
      }).join('')}</div>`;
      const chosen = getChosenBase();
      const chosenTotal = chosen ? getDeploymentReadyTotal(chosen) : 0;
      html += `<div class="deployment-context-description">${chosen ? `${deploymentFacilityLabel(chosen)} · ${chosenTotal} units ready. Deploy from this facility only.` : 'Choose a facility to inspect and deploy its available units.'}</div>`;
      els.baseSelector.classList.add('deployment-facility-selector');
    }
    html += `</div>`;
    els.baseSelector.innerHTML = html;

    els.baseSelector.querySelectorAll('[data-deployment-mode]').forEach(button => button.addEventListener('click', () => {
      prefs.mode = button.dataset.deploymentMode === 'global' ? 'global' : 'facility';
      if (prefs.mode === 'global') {
        const chosen = getChosenBase();
        const category = getDeploymentCategoryForFacility(chosen);
        if (category && getDeploymentFacilitiesForCategory(category).length) prefs.globalCategory = category;
      }
      resetAttackAmounts();
      renderAttackModal();
    }));
    els.baseSelector.querySelectorAll('[data-deployment-category]').forEach(button => button.addEventListener('click', () => {
      prefs.mode = 'global'; prefs.globalCategory = button.dataset.deploymentCategory;
      resetAttackAmounts(); renderAttackModal();
    }));
    els.baseSelector.querySelectorAll('[data-base]').forEach(button => button.addEventListener('click', () => {
      game.chosenBaseId = Number(button.dataset.base);
      prefs.lastFacilityId = game.chosenBaseId;
      prefs.mode = 'facility';
      resetAttackAmounts();
      game.focusedDeployment = false;
      renderAttackModal();
    }));
  }

  function renderAttackModal() {
    const facilities = getPlayerDeploymentFacilities();
    if (!facilities.length) { closeAttackModal(); return; }
    const prefs = getDeploymentPreferences();
    if (!facilities.some(b => b.id === game.chosenBaseId)) game.chosenBaseId = facilities[0].id;
    if (prefs.mode === 'global' && !getDeploymentFacilitiesForCategory(prefs.globalCategory).length) prefs.mode = 'facility';
    let context = getDeploymentContext();
    if (!context.facilities.length) { prefs.mode = 'facility'; context = getDeploymentContext(); }
    renderDeploymentSelectors(facilities, context);

    const commandOnline = hasCommandCenter(PLAYER_ID);
    const deployTypes = getDeploymentTypesForCategory(context.category);
    els.attackUnitRows.innerHTML = deployTypes.map(type => {
      const available = getDeploymentAvailable(type, context);
      const def = UNITS[type] || { name:getGroundDefinitionName(PLAYER_ID,type), description:getGroundDefinitionDescription(PLAYER_ID,type) };
      const amount = clamp(game.attackAmounts[type] || 0, 0, available);
      game.attackAmounts[type] = amount;
      const quickDeploymentButtons = type === 'loiteringMunition'
        ? [100,50,10,5,1].map(count => `<button type="button" data-deploy-quick="${count}" data-type="${type}" ${available < count ? 'disabled' : ''}>${count}</button>`).join('')
        : `<button type="button" data-deploy-quick="max" data-type="${type}">MAX</button><button type="button" data-deploy-quick="10" data-type="${type}">10</button><button type="button" data-deploy-quick="5" data-type="${type}">5</button><button type="button" data-deploy-quick="1" data-type="${type}">1</button>`;
      return `<div class="attack-unit-row"><div class="attack-unit-copy"><strong>${def.name}</strong><span>${available} available · ${def.description}</span></div><div class="deployment-controls">${commandOnline ? `<div class="quick-buttons deployment-quick">${quickDeploymentButtons}</div>` : ''}<div class="stepper"><button type="button" data-step="-1" data-type="${type}">−</button><input data-amount="${type}" type="number" min="0" max="${available}" value="${amount}" /><button type="button" data-step="1" data-type="${type}">+</button></div></div></div>`;
    }).join('');

    if (context.category === 'air' && isDefinitionUnlocked(PLAYER_ID, 'unit', 'loyalWingman')) {
      const readyWingmen = context.facilities.reduce((sum,b) => sum + getAirbaseReadyWingmanCount(b), 0);
      const selectedAircraft = getSelectedMannedAircraftCount();
      const sortieCap = getLoyalWingmanSortieCap(PLAYER_ID);
      game.escortsPerAircraft = clamp(Math.floor(Number(game.escortsPerAircraft) || 1), 1, Math.max(1, sortieCap));
      const requestedEscorts = game.bringUnmannedEscorts ? Math.min(readyWingmen, selectedAircraft * game.escortsPerAircraft) : 0;
      const escortButtons = Array.from({length:Math.max(1,sortieCap)},(_,i)=>i+1).map(count => `<button type="button" data-escort-count="${count}" class="${game.escortsPerAircraft===count?'active':''}">${count}</button>`).join('');
      els.attackUnitRows.innerHTML += `<div class="escort-config"><label class="escort-toggle"><input type="checkbox" data-unmanned-escorts ${game.bringUnmannedEscorts?'checked':''} ${readyWingmen<=0?'disabled':''}/><span>INCLUDE LOYAL WINGMEN</span></label><div class="escort-count"><span>Escorts per aircraft</span>${escortButtons}</div><small>${readyWingmen} Loyal Wingmen ready across ${context.facilities.length} Airbase${context.facilities.length===1?'':'s'} · ${selectedAircraft<=0?'select at least 1 manned aircraft':`${requestedEscorts} requested`}</small></div>`;
    }

    if (context.category === 'ground' && commandOnline) {
      const configured = game.players[PLAYER_ID].convoys.filter(c => convoyTotal(c) > 0);
      if (configured.length) {
        els.attackUnitRows.innerHTML += `<div class="deployment-convoys"><div class="section-label">PREDEFINED CONVOYS</div><div class="convoy-button-grid">${configured.map(convoy => {
          const index=game.players[PLAYER_ID].convoys.indexOf(convoy);
          const types=typeof getPlayerGroundDefinitionTypes==='function'?getPlayerGroundDefinitionTypes(PLAYER_ID):GROUND_UNIT_TYPES;
          const canDeploy=types.every(type=>getDeploymentAvailable(type,context)>=Math.max(0,Math.floor(Number(convoy[type])||0)));
          return `<button type="button" class="convoy-action" data-deploy-convoy="${index}" ${canDeploy?'':'disabled'}><strong>ADD ${escapeHtml(convoy.name)}</strong><span>${convoyTotal(convoy)} units</span></button>`;
        }).join('')}</div></div>`;
      }
    }

    if ((context.category === 'ground' || context.category === 'mobilization') && hasResearchCapability(PLAYER_ID,'focusedMission')) {
      els.attackUnitRows.innerHTML += `<div class="escort-config"><label class="escort-toggle"><input type="checkbox" data-focused-deployment ${game.focusedDeployment?'checked':''}/><span>FOCUSED MISSION</span></label><small>Ignore distractions until entering 150 radius of the deployment coordinate.</small></div>`;
    }
    if (hasResearchCapability(PLAYER_ID,'scheduledDeployment')) {
      const schedule=normalizeScheduledDeployment(PLAYER_ID), total=getScheduledDeploymentTotal(schedule);
      els.attackUnitRows.innerHTML += `<div class="deployment-convoys"><div class="section-label">SCHEDULED DEPLOYMENT</div><button type="button" class="convoy-action" data-launch-scheduled ${total>0?'':'disabled'}><strong>LAUNCH ${escapeHtml(schedule.name)}</strong><span>${total} configured primary units · uses all required facilities</span></button></div>`;
    }

    const focusedToggle=els.attackUnitRows.querySelector('[data-focused-deployment]');
    if (focusedToggle) focusedToggle.addEventListener('change',()=>{game.focusedDeployment=!!focusedToggle.checked;updateAttackSummary();});
    const scheduledLaunch=els.attackUnitRows.querySelector('[data-launch-scheduled]');
    if (scheduledLaunch) scheduledLaunch.addEventListener('click',()=>{const result=startScheduledDeployment(PLAYER_ID,game.attackTarget.x,game.attackTarget.y);if(!result.ok)return notify(result.reason||'Scheduled Deployment could not start.','warning',3);closeAttackModal();});

    els.attackUnitRows.querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',()=>{const type=button.dataset.type, available=getDeploymentAvailable(type,context);game.attackAmounts[type]=clamp((game.attackAmounts[type]||0)+Number(button.dataset.step),0,available);renderAttackModal();}));
    els.attackUnitRows.querySelectorAll('[data-deploy-quick]').forEach(button=>button.addEventListener('click',()=>{const type=button.dataset.type, available=getDeploymentAvailable(type,context), amount=button.dataset.deployQuick==='max'?available:Number(button.dataset.deployQuick);game.attackAmounts[type]=clamp(amount,0,available);renderAttackModal();}));
    els.attackUnitRows.querySelectorAll('[data-deploy-convoy]').forEach(button=>button.addEventListener('click',()=>{const convoy=game.players[PLAYER_ID].convoys[Number(button.dataset.deployConvoy)];if(!convoy)return;const types=typeof getPlayerGroundDefinitionTypes==='function'?getPlayerGroundDefinitionTypes(PLAYER_ID):GROUND_UNIT_TYPES;for(const type of types)game.attackAmounts[type]=clamp((game.attackAmounts[type]||0)+Math.max(0,Math.floor(Number(convoy[type])||0)),0,getDeploymentAvailable(type,context));renderAttackModal();}));
    els.attackUnitRows.querySelectorAll('[data-amount]').forEach(input=>input.addEventListener('input',()=>{const type=input.dataset.amount;game.attackAmounts[type]=clamp(Number(input.value)||0,0,getDeploymentAvailable(type,context));updateAttackSummary();}));
    const escortToggle=els.attackUnitRows.querySelector('[data-unmanned-escorts]');
    if (escortToggle) escortToggle.addEventListener('change',()=>{game.bringUnmannedEscorts=!!escortToggle.checked;prefs.bringUnmannedEscorts=game.bringUnmannedEscorts;renderAttackModal();});
    els.attackUnitRows.querySelectorAll('[data-escort-count]').forEach(button=>button.addEventListener('click',()=>{const cap=getLoyalWingmanSortieCap(PLAYER_ID);game.escortsPerAircraft=clamp(Math.floor(Number(button.dataset.escortCount)||1),1,Math.max(1,cap));prefs.escortsPerAircraft=game.escortsPerAircraft;game.players[PLAYER_ID].droneConfig.preferredEscortsPerAircraft=game.escortsPerAircraft;renderAttackModal();}));
    updateAttackSummary();
  }

  function updateAttackSummary() {
    const context=getDeploymentContext();
    const selected=Object.values(game.attackAmounts).reduce((a,n)=>a+(Number(n)||0),0);
    let escorts=0;
    if (context.category==='air' && game.bringUnmannedEscorts) {
      const manned=getSelectedMannedAircraftCount(), ready=context.facilities.reduce((sum,b)=>sum+getAirbaseReadyWingmanCount(b),0);
      escorts=manned>0?Math.min(ready,manned*game.escortsPerAircraft,getLoyalWingmanSortieCap(PLAYER_ID)):0;
    }
    const total=selected+escorts, capacity=Math.max(0,MAX_ENTITIES-entityCount());
    els.attackSummary.textContent=`${selected} primary units${escorts?` + ${escorts} escorts`:''} · ${capacity} active slots available`;
    els.confirmAttack.disabled=selected<=0||total>capacity;
  }

  function takeGroundAcrossFacilities(facilities,type,amount) {
    const taken=[];
    let remaining=Math.max(0,amount|0);
    for(const facility of facilities){
      while(remaining>0 && getFacilityAvailable(facility,type)>0){
        const record=typeof takeGroundDefinitionRecord==='function'?takeGroundDefinitionRecord(facility,type):takeStoredUnit(facility,type);
        if(!record)break;
        taken.push({record,source:facility}); remaining--;
      }
      if(remaining<=0)break;
    }
    return taken;
  }

  function deployGroundContext(context, requested) {
    const deployTypes=getDeploymentTypesForCategory(context.category);
    const selected=[];
    for(const type of deployTypes){
      const amount=clamp(Math.floor(Number(game.attackAmounts[type])||0),0,getDeploymentAvailable(type,context));
      selected.push(...takeGroundAcrossFacilities(context.facilities,type,amount));
    }
    const sourceByRecord=new Map(selected.map(item=>[item.record,item.source]));
    const transports=selected.filter(item=>TRANSPORT_UNIT_TYPES.includes(item.record.type));
    const passengerPool=selected.filter(item=>INFANTRY_UNIT_TYPES.includes(item.record.type));
    const direct=selected.filter(item=>!TRANSPORT_UNIT_TYPES.includes(item.record.type)&&!INFANTRY_UNIT_TYPES.includes(item.record.type));
    for(const vehicleItem of transports){
      const vehicle=vehicleItem.record;
      while(passengerPool.length && (vehicle.cargoRecords?.length||0)<getTransportCapacityForType(PLAYER_ID,vehicle.type)){
        const passengerItem=passengerPool.shift();
        loadCargoRecord(vehicle,passengerItem.record,PLAYER_ID);
      }
    }
    direct.push(...transports,...passengerPool);
    let launched=0, spawnIndex=0;
    for(const item of direct){
      const record=item.record, source=item.source, type=record.type;
      const ring=46+Math.floor(spawnIndex/12)*18, angle=(spawnIndex%12)/12*Math.PI*2;
      const unit=createUnitFromRecord(record,source.x+Math.cos(angle)*ring,source.y+Math.sin(angle)*ring);
      if(unit){
        const isTransport=TRANSPORT_UNIT_TYPES.includes(type);
        unit.orderX=(game.focusedDeployment||isTransport)?game.attackTarget.x:game.attackTarget.x+rand(-35,35);
        unit.orderY=(game.focusedDeployment||isTransport)?game.attackTarget.y:game.attackTarget.y+rand(-35,35);
        if(isTransport){unit.transportMissionX=game.attackTarget.x;unit.transportMissionY=game.attackTarget.y;}
        unit.hasOrder=true;if(game.focusedDeployment)applyFocusedMission(unit,game.attackTarget.x,game.attackTarget.y); launched++;
      } else {
        for(const passenger of record.cargoRecords||[]){passenger.lifecycleState=LIFECYCLE_STATES.STORED;restoreStoredUnit(source,passenger);}record.cargoRecords=[];restoreStoredUnit(source,record);
      }
      spawnIndex++;
    }
    notify(`${launched} ground units deployed toward X ${Math.round(game.attackTarget.x)}, Y ${Math.round(game.attackTarget.y)}.`, 'good', 4);
  }

  function deployDroneContext(context) {
    let remaining=clamp(Math.floor(Number(game.attackAmounts.loiteringMunition)||0),0,getDeploymentAvailable('loiteringMunition',context)), launched=0;
    for(const hub of context.facilities){
      while(remaining>0 && getDroneHubStoredCount(hub,'loiteringMunition')>0){
        const record=takeStoredDrone(hub,'loiteringMunition'); if(!record)break;
        const a=launched/Math.max(1,remaining+launched)*Math.PI*2;
        const drone=createUnitFromRecord(record,hub.x+Math.cos(a)*(hub.radius+16),hub.y+Math.sin(a)*(hub.radius+16),{droneMissionX:game.attackTarget.x+rand(-18,18),droneMissionY:game.attackTarget.y+rand(-18,18),orderX:game.attackTarget.x,orderY:game.attackTarget.y,hasOrder:true,lowAltitudeDrone:true});
        if(drone){launched++;remaining--;}else{storeDroneAtHub(hub,record,0);remaining=0;}
      }
      if(remaining<=0)break;
    }
    notify(`${launched} Loitering Munition${launched===1?'':'s'} launched toward X ${Math.round(game.attackTarget.x)}, Y ${Math.round(game.attackTarget.y)}.`, 'good', 4);
  }

  function createDeployedAircraftFromRecord(base,type,aircraft,spawnIndex,total) {
    const a=spawnIndex/Math.max(1,total)*Math.PI*2;
    const common={homeAirbaseId:base.id,bombTargetX:game.attackTarget.x,bombTargetY:game.attackTarget.y};
    if(type==='bomber') return createUnitFromRecord(aircraft,base.x+Math.cos(a)*54,base.y+Math.sin(a)*54,{...common,airMissionState:'outbound',bombTargetX:game.attackTarget.x+rand(-18,18),bombTargetY:game.attackTarget.y+rand(-18,18),bombReleased:false});
    if(type==='superFighter'){
      const missiles=normalizeFighterMissileConfiguration(PLAYER_ID,aircraft.configuration?.missiles);
      return createUnitFromRecord(aircraft,base.x+Math.cos(a)*58,base.y+Math.sin(a)*58,{...common,airMissionState:missiles.airToGround>0?'fighterStrike':missiles.airToAir>0?'fighterPatrol':'returning',fighterMissionX:game.attackTarget.x,fighterMissionY:game.attackTarget.y,fighterA2ARemaining:missiles.airToAir,fighterA2GRemaining:missiles.airToGround,payloadRemaining:missiles.airToAir+missiles.airToGround,enduranceRemaining:getDefinitionPlayerStat(PLAYER_ID,'unit','superFighter','endurance',AIR_DOMINANCE_BALANCE.fighterEndurance),flareCharges:Math.max(0,Math.floor(getDefinitionPlayerStat(PLAYER_ID,'unit','superFighter','flares',AIR_DOMINANCE_BALANCE.fighterFlares))),fighterMissileCooldown:0,fighterPatrolAngle:rand(0,Math.PI*2),fighterStealthed:isResearchComplete(PLAYER_ID,'adStealthFighter'),lastAttackAt:-99,lastTargetedAt:-99});
    }
    if(type==='paratrooperPlane'){
      const passengerCount=aircraft.cargoRecords?.length||0;
      return createUnitFromRecord(aircraft,base.x+Math.cos(a)*60,base.y+Math.sin(a)*60,{...common,airMissionState:passengerCount>0?'outbound':'returning',paratrooperMissionX:game.attackTarget.x,paratrooperMissionY:game.attackTarget.y,payloadRemaining:passengerCount,sortiePassengerCount:passengerCount,passengersDropped:0,enduranceRemaining:AIR_DOMINANCE_BALANCE.paratrooperEndurance,flareCharges:Math.max(0,Math.floor(getDefinitionPlayerStat(PLAYER_ID,'unit','paratrooperPlane','flares',AIR_DOMINANCE_BALANCE.paratrooperFlares)))});
    }
    return null;
  }

  function deployAirContext(context, requested) {
    const launchedByType=Object.fromEntries(MANNED_AIRCRAFT_TYPES.map(type=>[type,0]));
    const masters=[]; let launched=0,spawnIndex=0;
    for(const type of MANNED_AIRCRAFT_TYPES){
      if(type!=='bomber'&&!isDefinitionUnlocked(PLAYER_ID,'unit',type))continue;
      let remaining=clamp(Math.floor(Number(game.attackAmounts[type])||0),0,getDeploymentAvailable(type,context));
      for(const base of context.facilities){
        while(remaining>0 && getAirbaseReadyCount(base,type)>0){
          const aircraft=takeReadyAircraft(base,type);if(!aircraft)break;
          const unit=createDeployedAircraftFromRecord(base,type,aircraft,spawnIndex++,requested);
          if(unit){launched++;launchedByType[type]++;masters.push({unit,base});remaining--;}
          else{base.bomberBay.push(aircraft);syncAirbaseStoredCount(base);remaining=0;}
        }
        if(remaining<=0)break;
      }
    }
    let escortLaunched=0;
    let escortBudget = game.bringUnmannedEscorts ? Math.min(getLoyalWingmanSortieCap(PLAYER_ID), masters.length * game.escortsPerAircraft) : 0;
    if(game.bringUnmannedEscorts){
      for(const {unit:master,base} of masters){
        if (escortBudget <= 0) break;
        const desired=Math.min(game.escortsPerAircraft,getAirbaseReadyWingmanCount(base),escortBudget);
        for(let i=0;i<desired;i++){
          const record=takeReadyWingman(base);if(!record)break;
          const escort=launchLoyalWingmanEscort(base,record,master,i,desired);
          if(escort){escortLaunched++;escortBudget--;}else base.loyalWingmanBay.push(record);
        }
        syncAirbaseWingmen(base);
      }
    }
    const parts=MANNED_AIRCRAFT_TYPES.filter(type=>launchedByType[type]>0).map(type=>`${launchedByType[type]} ${UNITS[type].name}${launchedByType[type]===1?'':'s'}`);
    notify(`${parts.join(' · ')||'No aircraft'} launched${escortLaunched?` with ${escortLaunched} Loyal Wingman escort${escortLaunched===1?'':'s'}`:''} toward X ${Math.round(game.attackTarget.x)}, Y ${Math.round(game.attackTarget.y)}.`, 'good', 4);
  }

  function deployAttack() {
    const context=getDeploymentContext();
    if(!context.facilities.length||!game.attackTarget)return;
    const deployTypes=getDeploymentTypesForCategory(context.category);
    let requested=0;
    for(const type of deployTypes) requested+=clamp(Math.floor(Number(game.attackAmounts[type])||0),0,getDeploymentAvailable(type,context));
    if(!requested)return;
    let requestedEscorts=0;
    if(context.category==='air'&&game.bringUnmannedEscorts){const ready=context.facilities.reduce((s,b)=>s+getAirbaseReadyWingmanCount(b),0);requestedEscorts=Math.min(ready,getSelectedMannedAircraftCount()*game.escortsPerAircraft,getLoyalWingmanSortieCap(PLAYER_ID));}
    if(requested+requestedEscorts>MAX_ENTITIES-entityCount()){notify('Deployment exceeds the 1000-entity active limit.','warning');return;}

    if(context.category==='drone') deployDroneContext(context);
    else if(context.category==='air') deployAirContext(context,requested);
    else deployGroundContext(context,requested);

    const prefs=getDeploymentPreferences();
    prefs.bringUnmannedEscorts=!!game.bringUnmannedEscorts;
    prefs.escortsPerAircraft=game.escortsPerAircraft;
    if(context.mode==='facility'&&context.facility) prefs.lastFacilityId=context.facility.id;
    closeAttackModal();
    if(game.selected?.alive&&context.facilities.some(b=>b.id===game.selected.id))renderSelectionPanel();
  }
