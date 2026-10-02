'use strict';

  // ---------------------------------------------------------------------------
  // UI construction
  // ---------------------------------------------------------------------------
  const buildMenuButtons = new Map();
  const buildMenuGroups = new Map();
  const BUILD_MENU_TYPE_ORDER = Object.freeze({
    city: 10, megacity: 20, militaryBase: 30, militaryCommand: 40, airbase: 50, fortress: 60,
    machineGun: 10, cannon: 20, mortar: 30, landmine: 40, hive: 50, airDefense: 60,
    droneHub: 10,
    advancedEngineeringComplex: 10, researchCenter: 20,
    missileLaunchSite: 10,
    radarStation: 10, jammingStation: 20, spoofingStation: 30,
    energyGenerator: 10, orbitalBeamSystem: 20, energyFieldNode: 30, deathRayTower: 10,
    advancedCoordinationCenter: 10,
    superiorMobilizationComplex: 10
  });

  function getBuildMenuDoctrineId(type) {
    const requirement = BUILDINGS[type]?.researchRequirement;
    if (!requirement) return 'general';
    if (requirement.doctrine) return requirement.doctrine;
    if (requirement.research) return SPECIALIZED_RESEARCH[requirement.research]?.doctrine || 'general';
    return 'general';
  }

  function getBuildMenuDoctrineOrder(doctrineId) {
    if (doctrineId === 'general') return 0;
    return Number(DOCTRINE_RESEARCH[doctrineId]?.order) || 999;
  }

  function getBuildMenuDoctrineLabel(doctrineId) {
    if (doctrineId === 'general') return 'GENERAL';
    return (DOCTRINE_RESEARCH[doctrineId]?.name || doctrineId).toUpperCase();
  }

  function createBuildButtons() {
    buildMenuButtons.clear();
    buildMenuGroups.clear();
    els.utilityBuilds.replaceChildren();
    els.defenseBuilds.replaceChildren();

    const entries = Object.entries(BUILDINGS)
      .filter(([, def]) => def.category === 'utility' || def.category === 'defense')
      .sort(([typeA, defA], [typeB, defB]) => {
        if (defA.category !== defB.category) return defA.category === 'utility' ? -1 : 1;
        const doctrineA = getBuildMenuDoctrineId(typeA);
        const doctrineB = getBuildMenuDoctrineId(typeB);
        const doctrineDelta = getBuildMenuDoctrineOrder(doctrineA) - getBuildMenuDoctrineOrder(doctrineB);
        if (doctrineDelta) return doctrineDelta;
        const itemDelta = (BUILD_MENU_TYPE_ORDER[typeA] || 999) - (BUILD_MENU_TYPE_ORDER[typeB] || 999);
        if (itemDelta) return itemDelta;
        return defA.name.localeCompare(defB.name);
      });

    for (const [type, def] of entries) {
      const doctrineId = getBuildMenuDoctrineId(type);
      const groupKey = `${def.category}:${doctrineId}`;
      let group = buildMenuGroups.get(groupKey);
      if (!group) {
        const element = document.createElement('section');
        element.className = 'build-doctrine-group';
        element.dataset.buildDoctrine = doctrineId;
        element.innerHTML = `<div class="build-doctrine-label"><span>${getBuildMenuDoctrineLabel(doctrineId)}</span></div>`;
        const items = document.createElement('div');
        items.className = 'build-doctrine-items';
        element.appendChild(items);
        (def.category === 'utility' ? els.utilityBuilds : els.defenseBuilds).appendChild(element);
        group = { element, items, types: [] };
        buildMenuGroups.set(groupKey, group);
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'build-button';
      button.dataset.buildType = type;
      // Doctrine-locked content starts hidden even before a match/player exists;
      // refreshBuildButtons reveals it only after the actual unlock requirement is met.
      button.hidden = !!def.researchRequirement;
      button.innerHTML = `
        <span class="build-icon">${def.icon}</span>
        <span class="build-copy"><strong>${def.name}</strong><span>${def.description}</span></span>
        <span class="build-cost">$${def.cost}</span>`;
      button.addEventListener('click', () => setBuildMode(game.buildMode === type ? null : type));
      group.items.appendChild(button);
      group.types.push(type);
      buildMenuButtons.set(type, button);
    }

    // Before a match begins, hide doctrine groups that contain only locked content.
    for (const group of buildMenuGroups.values()) {
      group.element.hidden = !group.types.some(type => !buildMenuButtons.get(type)?.hidden);
    }
  }

  function setBuildMenuCategory(category) {
    category = category === 'defense' ? 'defense' : 'utility';
    game.buildMenuCategory = category;
    document.querySelectorAll('[data-build-category]').forEach(button => button.classList.toggle('active', button.dataset.buildCategory === category));
    document.querySelectorAll('[data-build-section]').forEach(section => section.classList.toggle('hidden', section.dataset.buildSection !== category));
  }

  function refreshBuildModeControls() {
    const toggle = document.getElementById('continuousBuildToggle');
    const cancel = document.getElementById('cancelBuildMode');
    if (toggle) toggle.checked = !!game.continuousBuild;
    if (cancel) cancel.disabled = !game.buildMode;
  }

  function refreshBuildButtons() {
    const player = game.players[PLAYER_ID];
    for (const [type, button] of buildMenuButtons) {
      const def = BUILDINGS[type];
      const commandLimitReached = type === 'militaryCommand' && player && game.buildings.some(b => b.alive && b.playerId === PLAYER_ID && b.type === 'militaryCommand');
      const fortressCrewUnavailable = type === 'fortress' && player && getStoredGroundUnitCount(PLAYER_ID) < 10 && getAvailableAdvancedEngineerCount(PLAYER_ID) < 1;
      const coordinationLimitReached = type === 'advancedCoordinationCenter' && player && game.buildings.filter(b => b.alive && b.playerId === PLAYER_ID && b.type === 'advancedCoordinationCenter').length >= getAdvancedCoordinationCenterLimit(PLAYER_ID);
      const missileSiteLimitReached = type === 'missileLaunchSite' && player && game.buildings.filter(b => b.alive && b.playerId === PLAYER_ID && b.type === 'missileLaunchSite').length >= getMissileLaunchSiteLimit(PLAYER_ID);
      const orbitalLimitReached = type === 'orbitalBeamSystem' && player && game.buildings.filter(b => b.alive && b.playerId === PLAYER_ID && b.type === 'orbitalBeamSystem').length >= getOrbitalBeamStats(PLAYER_ID).cap;
      const researchCenterLimitReached = type === 'researchCenter' && player && game.buildings.filter(b => b.alive && b.playerId === PLAYER_ID && b.type === 'researchCenter').length >= RESEARCH_CENTER_BUILD_CAP;
      const researchLocked = !player || !isDefinitionUnlocked(PLAYER_ID, 'building', type);

      // Locked buildings are intentionally absent from the construction menu,
      // rather than displayed as disabled spoilers for future doctrine content.
      button.hidden = researchLocked;
      button.disabled = !player || !player.alive || player.money < def.cost || entityCount() >= MAX_ENTITIES || commandLimitReached || coordinationLimitReached || missileSiteLimitReached || orbitalLimitReached || researchCenterLimitReached || fortressCrewUnavailable;
      button.classList.toggle('active', !researchLocked && game.buildMode === type);
    }

    // Hide empty doctrine headings. A doctrine section appears the moment its
    // first building unlock is completed and disappears on a fresh match reset.
    for (const group of buildMenuGroups.values()) {
      group.element.hidden = !group.types.some(type => !buildMenuButtons.get(type)?.hidden);
    }
  }

  function setBuildMode(type) {
    if (type && game.ewAimingBuildingId) cancelEWAntennaAim();
    if (type && typeof cancelMissileAiming === 'function') cancelMissileAiming();
    if (type && typeof cancelOrbitalEnergyAiming === 'function') cancelOrbitalEnergyAiming();
    game.buildMode = type;
    document.querySelectorAll('.build-button').forEach(button => {
      button.classList.toggle('active', button.dataset.buildType === type);
    });
    if (!type) {
      els.placementBadge.classList.add('hidden');
      els.canvas.style.cursor = 'crosshair';
    } else {
      setSelection(null);
      els.placementBadge.classList.remove('hidden');
      els.canvas.style.cursor = 'cell';
    }
    refreshBuildModeControls();
  }

  function setSelection(entity) {
    game.selected = entity && entity.alive ? entity : null;
    renderSelectionPanel();
  }

  function hasCommandCenter(playerId) {
    return game.buildings.some(b => b.alive && b.playerId === playerId && b.type === 'militaryCommand');
  }

  function getTrainingMultiplier(playerId, unitType = null) {
    const context = unitType ? modifierContext('unit', unitType) : { kind: 'unit', type: null, tags: [] };
    return getPlayerModifiedStat(playerId, 'trainingTimeMultiplier', 1, context);
  }

  function getQueuedTrainingTime(facility, index = 0) {
    const type = facility?.queue?.[index];
    if (!type) return 0;
    return getUnitTrainingTime(facility.playerId, type) * Math.max(0.05, Number(facility.queueMeta?.[index]?.trainingTimeMultiplier) || 1);
  }

  function getStoredGroundUnitCount(playerId) {
    let total = 0;
    for (const b of game.buildings) {
      if (!b.alive || b.playerId !== playerId || !['militaryBase','superiorMobilizationComplex'].includes(b.type)) continue;
      for (const record of b.storedUnits || []) {
        if (record?.lifecycleState === LIFECYCLE_STATES.STORED && INFANTRY_UNIT_TYPES.includes(record.type)) total++;
      }
    }
    return total;
  }

  function getAvailableAdvancedEngineerCount(playerId) {
    let total = 0;
    for (const unit of game.units) if (unit.alive && unit.playerId === playerId && unit.type === 'advancedEngineer') total++;
    for (const complex of game.buildings) {
      if (!complex.alive || complex.playerId !== playerId || complex.type !== 'advancedEngineeringComplex') continue;
      total += (complex.engineerBay || []).filter(record => (record.readyAt || 0) <= game.time).length;
    }
    return total;
  }

  function isCompletedFortress(building) {
    return building?.alive && building.type === 'fortress' && building.constructionState === 'operational';
  }

  function isInsideFriendlyBuildZone(playerId, x, y, radius = 0) {
    const player = game.players[playerId];
    if (player?.capital?.alive && Math.hypot(x - player.capital.x, y - player.capital.y) + radius <= BUILDINGS.capital.buildRange) return true;
    for (const b of game.buildings) {
      if (!isCompletedFortress(b) || b.playerId !== playerId) continue;
      if (Math.hypot(x - b.x, y - b.y) + radius <= BUILDINGS.fortress.buildRange) return true;
    }
    return false;
  }

  function getConvoyGroundTypes(playerId, convoy = null) {
    const live = typeof getPlayerGroundDefinitionTypes === 'function' ? getPlayerGroundDefinitionTypes(playerId) : [...GROUND_UNIT_TYPES];
    const saved = Object.keys(convoy || {}).filter(type => typeof isInfantryLoadoutToken === 'function' && isInfantryLoadoutToken(type));
    return [...new Set([...live, ...saved])];
  }

  function convoyTotal(convoy) {
    return getConvoyGroundTypes(PLAYER_ID, convoy).reduce((sum, type) => sum + Math.max(0, Math.floor(Number(convoy?.[type]) || 0)), 0);
  }

  function convoyCost(convoy) {
    return getConvoyGroundTypes(PLAYER_ID, convoy).reduce((sum, type) => sum + Math.max(0, Math.floor(Number(convoy?.[type]) || 0)) * getGroundDefinitionCost(PLAYER_ID, type), 0);
  }

  function renderScheduledDeploymentEditor(playerId) {
    const schedule = normalizeScheduledDeployment(playerId);
    const multi = isResearchComplete(playerId, 'caMultiDomain');
    const nodeHtml = schedule.nodes.map((node, index) => {
      const domain = multi ? node.domain : 'ground';
      const scheduleGroundTypes = getCommandGroundTypes(playerId, node.ground);
      const groundFields = scheduleGroundTypes.filter(type => isInfantryLoadoutToken(type) ? !!getAdvancedInfantryDefinitionBaseType(playerId,type) : (type === 'basic' || isDefinitionUnlocked(playerId, 'unit', type))).map(type => `<label><span>${escapeHtml(getGroundDefinitionName(playerId,type).replace(' Soldier',''))}</span><input data-command-field data-schedule-ground="${index}:${type}" type="number" min="0" max="99" value="${node.ground[type] || 0}" /></label>`).join('');
      const airFields = COMMAND_AIR_TYPES.filter(type => type === 'bomber' || isDefinitionUnlocked(playerId, 'unit', type)).map(type => `<label><span>${UNITS[type].name}</span><input data-command-field data-schedule-air="${index}:${type}" type="number" min="0" max="24" value="${node.air[type] || 0}" /></label>`).join('');
      return `<div class="command-node-card">
        <div class="command-node-head"><strong>DEPLOYMENT ${index + 1}</strong>${multi ? `<select data-command-field data-schedule-domain="${index}"><option value="ground" ${domain === 'ground' ? 'selected' : ''}>GROUND</option><option value="air" ${domain === 'air' ? 'selected' : ''}>AIR</option></select>` : '<span>GROUND</span>'}</div>
        <div class="section-label">GROUND COMPOSITION</div><div class="command-fields">${groundFields}</div>
        ${multi ? `<div class="section-label">AIR COMPOSITION</div><div class="command-fields">${airFields}</div><label class="command-toggle"><span>LW escorts / aircraft</span><input data-command-field data-schedule-escorts="${index}" type="number" min="0" max="${getLoyalWingmanSortieCap(playerId)}" value="${node.escortsPerAircraft || 0}" /></label>` : ''}
        ${hasResearchCapability(playerId, 'focusedMission') ? `<label class="command-check"><input data-command-field data-schedule-focused="${index}" type="checkbox" ${node.focused ? 'checked' : ''} ${domain === 'air' ? 'disabled' : ''}/><span>Focused Mission</span></label>` : ''}
        ${index < 2 ? `<label class="command-toggle"><span>Wait after launch</span><input data-command-field data-schedule-wait="${index}" type="number" min="0" max="600" step="0.5" value="${schedule.waits[index] || 0}" /><b>sec</b></label>` : ''}
      </div>`;
    }).join('');
    return `<div class="section-label">SCHEDULED DEPLOYMENT</div><div class="command-editor"><input data-command-field data-schedule-name class="convoy-name" maxlength="28" value="${escapeHtml(schedule.name)}" />${nodeHtml}<div class="command-actions"><button type="button" data-save-schedule>SAVE SCHEDULE</button><button type="button" data-train-schedule>TRAIN REQUIRED UNITS</button></div><div class="research-note">Up to 3 deployment nodes. Wait timers start when the previous node launches. A node waits until its full force is available.</div></div>`;
  }

  function readScheduledDeploymentFromEditor() {
    const current = normalizeScheduledDeployment(PLAYER_ID);
    const multi = isResearchComplete(PLAYER_ID, 'caMultiDomain');
    const schedule = { name: els.selectionContent.querySelector('[data-schedule-name]')?.value || current.name, waits: [0,0], nodes: [] };
    for (let index = 0; index < 3; index++) {
      const domain = multi && els.selectionContent.querySelector(`[data-schedule-domain="${index}"]`)?.value === 'air' ? 'air' : 'ground';
      const groundTypes = getCommandGroundTypes(PLAYER_ID, current.nodes?.[index]?.ground);
      const ground = Object.fromEntries(groundTypes.map(type => [type, Math.max(0, Math.floor(Number(els.selectionContent.querySelector(`[data-schedule-ground="${index}:${type}"]`)?.value) || 0))]));
      const air = Object.fromEntries(COMMAND_AIR_TYPES.map(type => [type, Math.max(0, Math.floor(Number(els.selectionContent.querySelector(`[data-schedule-air="${index}:${type}"]`)?.value) || 0))]));
      schedule.nodes.push({ domain, focused: domain === 'ground' && !!els.selectionContent.querySelector(`[data-schedule-focused="${index}"]`)?.checked, ground, air, escortsPerAircraft: domain === 'air' ? Math.max(0, Math.floor(Number(els.selectionContent.querySelector(`[data-schedule-escorts="${index}"]`)?.value) || 0)) : 0 });
      if (index < 2) schedule.waits[index] = Math.max(0, Number(els.selectionContent.querySelector(`[data-schedule-wait="${index}"]`)?.value) || 0);
    }
    return normalizeScheduledDeployment(PLAYER_ID, schedule);
  }

  function renderCoordinationCenterPanel(center) {
    const playerId = center.playerId;
    const used = getCoordinationCenterUsedBandwidth(center);
    const bandwidth = getCoordinationCenterBandwidth(center);
    const bases = game.buildings.filter(b => b.alive && b.playerId === playerId && isGroundMilitaryFacility(b));
    const airbases = game.buildings.filter(b => b.alive && b.playerId === playerId && b.type === 'airbase');
    let html = `<div class="stat-block"><div class="stat-row"><span>Bandwidth</span><strong>${used} / ${bandwidth}</strong></div><div class="stat-row"><span>Center limit</span><strong>${game.buildings.filter(b=>b.alive&&b.playerId===playerId&&b.type==='advancedCoordinationCenter').length} / ${getAdvancedCoordinationCenterLimit(playerId)}</strong></div><div class="stat-row"><span>Role</span><strong>AUTOMATED WARFARE</strong></div></div>`;
    const routines = (center.automatedWarfare || []).filter(r => !r.cancelled);
    if (routines.length) html += `<div class="section-label">ACTIVE AUTOMATIONS</div>${routines.map(r => `<div class="automation-row"><div><strong>${escapeHtml(r.name)}</strong><span>${r.kind === 'theater' ? 'THEATER' : r.kind === 'areaDenial' ? 'AREA DENIAL' : 'ROUTINE FLIGHT'} · ${r.deploymentsMade || 0} deployments${r.paused ? ' · PAUSED' : ''}</span></div><div><button data-automation-pause="${r.id}">${r.paused ? 'RESUME' : 'PAUSE'}</button><button data-automation-cancel="${r.id}">CANCEL</button></div></div>`).join('')}`;
    if (center.playerId !== PLAYER_ID) return html;
    const automationGroundTypes = getCommandGroundTypes(playerId);
    const groundFields = automationGroundTypes.filter(type => isInfantryLoadoutToken(type) ? !!getAdvancedInfantryDefinitionBaseType(playerId,type) : (type === 'basic' || isDefinitionUnlocked(playerId, 'unit', type))).map(type => `<label><span>${escapeHtml(getGroundDefinitionName(playerId,type).replace(' Soldier',''))}</span><input data-command-field data-aw-ground="${type}" type="number" min="0" max="${getTheaterDeploymentCap(playerId)}" value="0" /></label>`).join('');
    const airFields = COMMAND_AIR_TYPES.filter(type => type === 'bomber' || isDefinitionUnlocked(playerId, 'unit', type)).map(type => `<label><span>${UNITS[type].name}</span><input data-command-field data-aw-air="${type}" type="number" min="0" max="24" value="0" /></label>`).join('');
    const convoyOptions = game.players[playerId].convoys.map((c,i)=>`<option value="${i}">${escapeHtml(c.name)} · ${convoyTotal(c)}</option>`).join('');
    html += `<div class="section-label">NEW THEATER ROUTINE</div><div class="command-editor"><label class="command-toggle"><span>Ground Facility</span><select data-command-field data-aw-ground-base>${bases.map((b,i)=>`<option value="${b.id}">${b.type==='superiorMobilizationComplex'?'MOBILIZATION COMPLEX':'MILITARY BASE'} ${i+1} · ${(b.storedUnits||[]).filter(r=>r.lifecycleState===LIFECYCLE_STATES.STORED).length} stored</option>`).join('')}</select></label><label class="command-toggle"><span>Definition</span><select data-command-field data-aw-template><option value="focused">FOCUSED MISSION</option><option value="convoy">CONVOY</option><option value="scheduled">SCHEDULED DEPLOYMENT</option></select></label><label class="command-toggle"><span>Convoy</span><select data-command-field data-aw-convoy>${convoyOptions}</select></label><div class="command-fields">${groundFields}</div><div class="command-coordinate-group"><div class="command-coordinate"><label>X <input data-command-field data-aw-ground-x type="number" min="0" max="${WORLD.width}" value="${Math.round(center.x)}" /></label><label>Y <input data-command-field data-aw-ground-y type="number" min="0" max="${WORLD.height}" value="${Math.round(center.y)}" /></label></div><button type="button" class="command-map-pick" data-pick-automation-coordinate="ground">PICK ON MAP</button></div><button class="action-button compact" data-create-theater ${used >= bandwidth || !bases.length ? 'disabled' : ''}>INITIATE THEATER ROUTINE</button><div class="research-note">Initiation fee equals one full force set before automation discounts. Stored units are consumed before new training.</div></div>`;
    html += `<div class="section-label">NEW AERIAL AUTOMATION</div><div class="command-editor"><label class="command-toggle"><span>Airbase</span><select data-command-field data-aw-airbase>${airbases.map((b,i)=>`<option value="${b.id}">AIRBASE ${i+1}</option>`).join('')}</select></label><label class="command-toggle"><span>Mode</span><select data-command-field data-aw-air-kind><option value="areaDenial">AREA DENIAL / SUPPRESSION</option><option value="routineFlight">ROUTINE FLIGHTS</option></select></label><div class="command-fields">${airFields}</div><label class="command-toggle"><span>LW escorts / aircraft</span><input data-command-field data-aw-escorts type="number" min="0" max="${getLoyalWingmanSortieCap(playerId)}" value="0" /></label><div class="command-coordinate-group"><div class="command-coordinate"><label>X <input data-command-field data-aw-air-x type="number" min="0" max="${WORLD.width}" value="${Math.round(center.x)}" /></label><label>Y <input data-command-field data-aw-air-y type="number" min="0" max="${WORLD.height}" value="${Math.round(center.y)}" /></label></div><button type="button" class="command-map-pick" data-pick-automation-coordinate="air">PICK ON MAP</button></div><button class="action-button compact" data-create-air-automation ${used >= bandwidth || !airbases.length ? 'disabled' : ''}>INITIATE AERIAL AUTOMATION</button><div class="research-note">Area Denial uses a 500-radius zone. Paratrooper Planes are invalid for Area Denial. Aircraft quota management is automatic.</div></div>`;
    return html;
  }

  function renderMissileLaunchSitePanel(site) {
    ensureMissileLaunchSiteState(site);
    const playerId = site.playerId;
    const unlocked = getUnlockedMissileTypes(playerId);
    const storageCap = getMissileStorageCapacity(playerId);
    const loadedCount = countLoadedMissiles(site);
    const activeSilos = site.missileSilos.filter(silo => silo.active).length;
    const siloProduction = site.missileSilos.filter(silo => silo.stage === 'building').length;
    const siloReloading = site.missileSilos.filter(silo => silo.stage === 'reloading').length;
    const stockProduction = site.missileStockpileJobs.length;
    const queued = site.missileStockpileQueue.length;
    const stockCounts = MISSILE_TYPE_ORDER.filter(type => countStoredMissiles(site, type) > 0).map(type => `${getMissileTypeDefinition(type).shortName}: ${countStoredMissiles(site, type)}`).join(' · ');
    let html = `<div class="mls-dashboard">
      <div class="mls-summary-grid">
        <div><span>STORAGE</span><strong data-mls-storage>${site.missileStockpile.length} / ${storageCap}</strong><small data-mls-storage-detail>${stockCounts || 'EMPTY'}</small></div>
        <div><span>SILOS</span><strong data-mls-silos>${loadedCount} READY / ${activeSilos} ACTIVE</strong><small>${site.missileSilos.length} TOTAL</small></div>
        <div><span>SILO PIPELINES</span><strong data-mls-pipelines>${siloProduction} BUILD · ${siloReloading} LOAD</strong><small>${getMissileSiloBuildTime(playerId)}s BUILD + ${getMissileSiloReloadTime(playerId)}s RELOAD</small></div>
        <div><span>STOCKPILE LINE</span><strong data-mls-stockpile-state>${stockProduction} ACTIVE · ${queued} QUEUED</strong><small>${getStockpileFillTime(playerId)}s · ${getStockpileParallelism(playerId)} SLOT${getStockpileParallelism(playerId) === 1 ? '' : 'S'}</small></div>
      </div>
      <div class="section-label">SILO STATUS</div>
      <div class="mls-silo-list">`;
    for (const silo of site.missileSilos) {
      const stageTime = silo.stage === 'building' ? getMissileSiloBuildTime(playerId) : silo.stage === 'reloading' ? getMissileSiloReloadTime(playerId) : 0;
      const progress = stageTime ? Math.min(100, Math.round((silo.progress / stageTime) * 100)) : (silo.loadedType ? 100 : 0);
      const loadedDef = silo.loadedType ? getMissileTypeDefinition(silo.loadedType) : null;
      const pipelineDef = silo.pipelineType ? getMissileTypeDefinition(silo.pipelineType) : null;
      const status = silo.loadedType ? 'READY TO FIRE' : silo.stage === 'building' ? `BUILDING ${pipelineDef?.shortName || ''}` : silo.stage === 'reloading' ? `LOADING ${pipelineDef?.shortName || ''}` : silo.active ? 'WAITING FOR MISSILE' : 'OFFLINE';
      const opts = unlocked.map(type => `<option value="${type}" ${silo.configuredType===type?'selected':''}>${getMissileTypeDefinition(type).shortName} · ${getMissileTypeDefinition(type).name}</option>`).join('');
      html += `<div class="mls-silo-card ${silo.active?'online':'offline'}" data-mls-silo-card="${silo.index}">
        <div class="mls-silo-head"><strong>SILO ${silo.index+1}</strong><span data-mls-silo-online>${silo.active?'ONLINE':'OFFLINE'}</span></div>
        <div class="mls-silo-loaded"><span>LOADED</span><strong data-mls-silo-loaded>${loadedDef ? loadedDef.shortName : 'EMPTY'}</strong><small data-mls-silo-sub>${loadedDef ? loadedDef.name : status}</small></div>
        <label class="mls-silo-config"><span>NEXT LOAD</span><select data-command-field data-missile-silo-type="${silo.index}">${opts}</select></label>
        <div class="mls-progress"><div class="mls-progress-copy"><span data-mls-silo-status>${status}</span><strong data-mls-silo-progress>${progress}%</strong></div><div class="progress-track"><div class="progress-fill" data-mls-silo-progress-fill style="width:${progress}%"></div></div></div>
        <button class="action-button compact" type="button" data-missile-silo-toggle="${silo.index}">${silo.active?'DEACTIVATE':'ACTIVATE'} SILO</button>
      </div>`;
    }
    html += `</div><div class="section-label">STOCKPILE PRODUCTION</div><div class="mls-stockpile-panel"><div class="mls-active-jobs">`;
    const jobSlots = getStockpileParallelism(playerId);
    for (let idx = 0; idx < jobSlots; idx++) {
      const job = site.missileStockpileJobs[idx] || null;
      const pct = job ? Math.min(100, Math.round(job.progress / getStockpileFillTime(playerId) * 100)) : 0;
      html += `<div class="mls-job ${job ? '' : 'idle'}" data-mls-job-slot="${idx}"><span data-mls-job-label>${job ? `LINE ${idx+1} · ${getMissileTypeDefinition(job.type).shortName}` : `LINE ${idx+1} · IDLE`}</span><strong data-mls-job-status>${job ? (job.complete ? 'WAITING FOR SPACE' : `${pct}%`) : 'READY'}</strong><div class="progress-track"><div class="progress-fill" data-mls-job-fill style="width:${pct}%"></div></div></div>`;
    }
    html += `</div><div class="mls-queue"><span>FIFO QUEUE</span><strong data-mls-queue>${site.missileStockpileQueue.length ? site.missileStockpileQueue.map(q=>getMissileTypeDefinition(q.type).shortName).join(' → ') : 'EMPTY'}</strong></div><div class="mls-build-grid">`;
    for (const type of unlocked) {
      const def = getMissileTypeDefinition(type);
      const st = getStrategicMissileStats(playerId,type);
      html += `<button class="mls-build-button" type="button" data-stockpile-missile="${type}" ${game.players[playerId].money < st.cost ? 'disabled':''}><span><strong>${def.shortName}</strong><b>${moneyText(st.cost)}</b></span><small>DMG ${Math.round(st.damage)} · AOE ${Math.round(st.aoe)}</small><small>RNG ${Math.round(st.range)} · SPD ${Math.round(st.speed)}</small></button>`;
    }
    html += `</div></div>`;
    if (site.playerId === PLAYER_ID) html += `<button class="action-button mls-aim-button" type="button" data-missile-aim><span class="action-line"><span>ENTER MISSILE AIMING MODE</span><span>FIRE CONTROL</span></span><small>HUD clears for dedicated firing view · Esc exits.</small></button>`;
    html += `</div>`;
    return html;
  }

  function refreshMissileLaunchSitePanelState(site) {
    if (!site?.alive || site.type !== 'missileLaunchSite' || game.selected !== site) return;
    ensureMissileLaunchSiteState(site);
    const root = els.selectionContent;
    const playerId = site.playerId;
    const siloCards = root.querySelectorAll('[data-mls-silo-card]');
    const jobSlots = root.querySelectorAll('[data-mls-job-slot]');

    // Research can add silo/production slots while the site remains selected.
    // That is a true structural change, so a one-time rebuild is appropriate.
    if (siloCards.length !== site.missileSilos.length || jobSlots.length !== getStockpileParallelism(playerId)) {
      renderSelectionPanel();
      return;
    }

    const setText = (selector, value) => {
      const node = root.querySelector(selector);
      if (node && node.textContent !== String(value)) node.textContent = String(value);
    };
    const storageCap = getMissileStorageCapacity(playerId);
    const stockCounts = MISSILE_TYPE_ORDER.filter(type => countStoredMissiles(site, type) > 0).map(type => `${getMissileTypeDefinition(type).shortName}: ${countStoredMissiles(site, type)}`).join(' · ');
    const loadedCount = countLoadedMissiles(site);
    const activeSilos = site.missileSilos.filter(silo => silo.active).length;
    const siloProduction = site.missileSilos.filter(silo => silo.stage === 'building').length;
    const siloReloading = site.missileSilos.filter(silo => silo.stage === 'reloading').length;
    setText('[data-mls-storage]', `${site.missileStockpile.length} / ${storageCap}`);
    setText('[data-mls-storage-detail]', stockCounts || 'EMPTY');
    setText('[data-mls-silos]', `${loadedCount} READY / ${activeSilos} ACTIVE`);
    setText('[data-mls-pipelines]', `${siloProduction} BUILD · ${siloReloading} LOAD`);
    setText('[data-mls-stockpile-state]', `${site.missileStockpileJobs.length} ACTIVE · ${site.missileStockpileQueue.length} QUEUED`);

    for (const silo of site.missileSilos) {
      const card = root.querySelector(`[data-mls-silo-card="${silo.index}"]`);
      if (!card) continue;
      card.classList.toggle('online', !!silo.active);
      card.classList.toggle('offline', !silo.active);
      const loadedDef = silo.loadedType ? getMissileTypeDefinition(silo.loadedType) : null;
      const pipelineDef = silo.pipelineType ? getMissileTypeDefinition(silo.pipelineType) : null;
      const status = silo.loadedType ? 'READY TO FIRE' : silo.stage === 'building' ? `BUILDING ${pipelineDef?.shortName || ''}` : silo.stage === 'reloading' ? `LOADING ${pipelineDef?.shortName || ''}` : silo.active ? 'WAITING FOR MISSILE' : 'OFFLINE';
      const stageTime = silo.stage === 'building' ? getMissileSiloBuildTime(playerId) : silo.stage === 'reloading' ? getMissileSiloReloadTime(playerId) : 0;
      const progress = stageTime ? Math.min(100, Math.round((silo.progress / stageTime) * 100)) : (silo.loadedType ? 100 : 0);
      const updateText = (selector, value) => {
        const node = card.querySelector(selector);
        if (node && node.textContent !== String(value)) node.textContent = String(value);
      };
      updateText('[data-mls-silo-online]', silo.active ? 'ONLINE' : 'OFFLINE');
      updateText('[data-mls-silo-loaded]', loadedDef ? loadedDef.shortName : 'EMPTY');
      updateText('[data-mls-silo-sub]', loadedDef ? loadedDef.name : status);
      updateText('[data-mls-silo-status]', status);
      updateText('[data-mls-silo-progress]', `${progress}%`);
      const fill = card.querySelector('[data-mls-silo-progress-fill]');
      if (fill) fill.style.width = `${progress}%`;
      const toggle = card.querySelector('[data-missile-silo-toggle]');
      if (toggle) toggle.textContent = `${silo.active ? 'DEACTIVATE' : 'ACTIVATE'} SILO`;
      const select = card.querySelector('[data-missile-silo-type]');
      if (select && select.value !== silo.configuredType) select.value = silo.configuredType;
    }

    const fillTime = getStockpileFillTime(playerId);
    for (let idx = 0; idx < jobSlots.length; idx++) {
      const slot = jobSlots[idx];
      const job = site.missileStockpileJobs[idx] || null;
      slot.classList.toggle('idle', !job);
      const label = slot.querySelector('[data-mls-job-label]');
      const status = slot.querySelector('[data-mls-job-status]');
      const fill = slot.querySelector('[data-mls-job-fill]');
      const pct = job ? Math.min(100, Math.round(job.progress / fillTime * 100)) : 0;
      if (label) label.textContent = job ? `LINE ${idx+1} · ${getMissileTypeDefinition(job.type).shortName}` : `LINE ${idx+1} · IDLE`;
      if (status) status.textContent = job ? (job.complete ? 'WAITING FOR SPACE' : `${pct}%`) : 'READY';
      if (fill) fill.style.width = `${pct}%`;
    }
    setText('[data-mls-queue]', site.missileStockpileQueue.length ? site.missileStockpileQueue.map(q => getMissileTypeDefinition(q.type).shortName).join(' → ') : 'EMPTY');

    const commitmentCap = getMissileStorageCapacity(playerId) + getMissileSiloCount(playerId);
    const commitmentFull = countMissileCommitments(site) >= commitmentCap;
    root.querySelectorAll('[data-stockpile-missile]').forEach(button => {
      const stats = getStrategicMissileStats(playerId, button.dataset.stockpileMissile);
      button.disabled = !stats || commitmentFull || game.players[playerId].money + 1e-9 < stats.cost;
    });
  }

  function renderDirectedEnergyPanel(building) {
    if (!building?.alive) return '';
    ensureEnergyBuildingState(building);
    const playerId = building.playerId;
    if (building.type === 'energyGenerator') {
      const maxPower = getGeneratorMaxPower(playerId);
      const range = getGeneratorRange(playerId);
      const rate = getGeneratorPowerCostRate(playerId);
      const output = clamp(building.energyOutputSet || 0, 0, maxPower);
      return `<div class="section-label">POWER GENERATION</div><div class="energy-dashboard">
        <div class="energy-summary-grid">
          <div><span>OUTPUT SETTING</span><strong data-energy-output-label>${output.toFixed(0)} / ${maxPower}</strong><small>POWER</small></div>
          <div><span>POWER RANGE</span><strong>${range}</strong><small>WORLD UNITS</small></div>
          <div><span>OPERATING COST</span><strong data-energy-cost-label>${moneyText(output * rate * 60)}/min</strong><small>$${rate.toFixed(3)} / POWER / SEC</small></div>
          <div><span>NETWORK LOAD</span><strong data-energy-network-load>${Math.round(building.energyNetworkUsed || 0)} / ${Math.round(building.energyNetworkSupply || 0)}</strong><small data-energy-network-demand>${Math.round(building.energyNetworkDemand || 0)} requested</small></div>
        </div>
        ${building.playerId === PLAYER_ID ? `<label class="energy-output-control"><span>GENERATOR OUTPUT</span><input data-energy-output-range type="range" min="0" max="${maxPower}" step="1" value="${output}"/><input data-energy-output-number type="number" min="0" max="${maxPower}" step="1" value="${output.toFixed(0)}"/></label>` : ''}
      </div>`;
    }
    if (!ENERGY_CONSUMER_TYPES.includes(building.type)) return '';
    const demand = getEnergyConsumerDemand(building);
    const priority = getEnergyPriority(building);
    let html = `<div class="section-label">ENERGY STATUS</div><div class="energy-dashboard"><div class="energy-summary-grid">
      <div><span>POWER</span><strong data-energy-powered>${building.energyPowered ? 'ONLINE' : 'OFFLINE'}</strong><small>${demand} REQUIRED</small></div>
      <div><span>NETWORK</span><strong data-energy-network-load>${Math.round(building.energyNetworkUsed || 0)} / ${Math.round(building.energyNetworkSupply || 0)}</strong><small data-energy-network-demand>${Math.round(building.energyNetworkDemand || 0)} requested</small></div>
    </div>`;
    if (building.playerId === PLAYER_ID) html += `<label class="energy-priority-control"><span>POWER PRIORITY</span><select data-energy-priority><option value="high" ${priority==='high'?'selected':''}>HIGH</option><option value="normal" ${priority==='normal'?'selected':''}>NORMAL</option><option value="low" ${priority==='low'?'selected':''}>LOW</option></select></label>`;

    if (building.type === 'orbitalBeamSystem') {
      const stats = getOrbitalBeamStats(playerId);
      const pct = clamp((building.energyCharge || 0) / stats.rechargeTime * 100, 0, 100);
      html += `<div class="energy-orbital-status"><div class="stat-row"><span>Recharge</span><strong data-energy-orbital-charge>${pct >= 100 ? 'READY' : `${pct.toFixed(0)}%`}</strong></div><div class="progress-track"><div class="progress-fill" data-energy-orbital-fill style="width:${pct}%"></div></div><div class="stat-row"><span>Immediate strike</span><strong>${Math.round(stats.innerDamage)} · R${stats.innerRadius}</strong></div><div class="stat-row"><span>Outer AOE</span><strong>${Math.round(stats.outerStartDamage)} START · R${stats.outerRadius}</strong></div></div>`;
      if (building.playerId === PLAYER_ID) html += `<button class="action-button" type="button" data-energy-orbital-aim ${building.energyPowered && pct >= 100 ? '' : 'disabled'}><span class="action-line"><span>ENTER ORBITAL AIM MODE</span><span>GLOBAL RANGE</span></span><small>Click to mark · Space or Confirm to strike · Esc aborts.</small></button>`;
    } else if (building.type === 'energyFieldNode') {
      const field = getEnergyFieldSummaryForNode(building);
      const caps = getEnergyFieldCaps(playerId);
      html += `<div class="energy-field-status"><div class="stat-row"><span>Node</span><strong data-energy-node-state>${building.energyNodeOn === false ? 'OFF' : 'ON'}</strong></div><div class="stat-row"><span>Connection radius</span><strong>${DIRECTED_ENERGY_BALANCE.nodeConnectionRadius}</strong></div><div class="stat-row"><span>Effective density</span><strong data-energy-field-density>${field ? `×${field.density.toFixed(2)}` : 'NO CLOSED FIELD'}</strong></div><div class="stat-row"><span>Attack bonus</span><strong data-energy-field-attack>${field ? `+${(field.attackBonus*100).toFixed(1)}%` : '—'}</strong></div><div class="stat-row"><span>Damage reduction</span><strong data-energy-field-reduction>${field ? `${(field.damageReduction*100).toFixed(1)}%` : '—'}</strong></div><div class="stat-row"><span>Current ceilings</span><strong>ATK ${(caps.attack*100).toFixed(0)}% · DR ${(caps.reduction*100).toFixed(0)}% · D ×${caps.density}</strong></div></div>`;
      if (building.playerId === PLAYER_ID) html += `<button class="action-button compact" type="button" data-energy-node-toggle>${building.energyNodeOn === false ? 'SWITCH NODE ON' : 'SWITCH NODE OFF'}</button>`;
    } else if (building.type === 'deathRayTower') {
      const stats = getDeathRayStats(building);
      html += `<div class="energy-deathray-status"><div class="stat-row"><span>Beam damage</span><strong>${stats.dps.toFixed(1)} DPS / TARGET</strong></div><div class="stat-row"><span>Range</span><strong>${Math.round(stats.range)}</strong></div><div class="stat-row"><span>Concurrent targets</span><strong>${stats.targets}</strong></div><div class="stat-row"><span>Active beams</span><strong data-energy-beam-targets>${building.energyBeamTargetIds?.length || 0}</strong></div>${stats.slow ? `<div class="stat-row"><span>Slow Beam</span><strong>${Math.round(stats.slow*100)}%</strong></div>` : ''}</div>`;
    }
    html += `</div>`;
    return html;
  }

  function refreshDirectedEnergyPanelState(building) {
    if (!building?.alive || !els.selectionContent) return;
    ensureEnergyBuildingState(building);
    const root = els.selectionContent;
    const set = (selector, value) => { const el = root.querySelector(selector); if (el) el.textContent = value; };
    set('[data-energy-powered]', building.energyPowered ? 'ONLINE' : 'OFFLINE');
    set('[data-energy-network-load]', `${Math.round(building.energyNetworkUsed || 0)} / ${Math.round(building.energyNetworkSupply || 0)}`);
    set('[data-energy-network-demand]', `${Math.round(building.energyNetworkDemand || 0)} requested`);
    if (building.type === 'energyGenerator') {
      const maxPower = getGeneratorMaxPower(building.playerId), rate = getGeneratorPowerCostRate(building.playerId), output = clamp(building.energyOutputSet || 0,0,maxPower);
      set('[data-energy-output-label]', `${output.toFixed(0)} / ${maxPower}`);
      set('[data-energy-cost-label]', `${moneyText(output * rate * 60)}/min`);
    } else if (building.type === 'orbitalBeamSystem') {
      const stats = getOrbitalBeamStats(building.playerId), pct = clamp((building.energyCharge || 0) / stats.rechargeTime * 100,0,100);
      set('[data-energy-orbital-charge]', pct >= 100 ? 'READY' : `${pct.toFixed(0)}%`);
      const fill = root.querySelector('[data-energy-orbital-fill]'); if (fill) fill.style.width = `${pct}%`;
      const aim = root.querySelector('[data-energy-orbital-aim]'); if (aim) aim.disabled = !building.energyPowered || pct < 100;
    } else if (building.type === 'energyFieldNode') {
      const field = getEnergyFieldSummaryForNode(building);
      set('[data-energy-node-state]', building.energyNodeOn === false ? 'OFF' : 'ON');
      set('[data-energy-field-density]', field ? `×${field.density.toFixed(2)}` : 'NO CLOSED FIELD');
      set('[data-energy-field-attack]', field ? `+${(field.attackBonus*100).toFixed(1)}%` : '—');
      set('[data-energy-field-reduction]', field ? `${(field.damageReduction*100).toFixed(1)}%` : '—');
    } else if (building.type === 'deathRayTower') set('[data-energy-beam-targets]', String(building.energyBeamTargetIds?.length || 0));
  }

  function refreshSelectionPanelLiveState() {
    const e = game.selected;
    if (!e?.alive || !els.selectionContent) return;
    const root = els.selectionContent;

    // Values that change continuously should be updated in-place. Never replace
    // the selected panel merely because money, HP, or progress changed.
    const hpFill = root.querySelector('[data-live-selection-hp-fill]');
    if (hpFill) hpFill.style.width = `${clamp((e.hp / e.maxHp) * 100, 0, 100)}%`;
    const hpText = root.querySelector('[data-live-selection-hp]');
    if (hpText) hpText.textContent = `${Math.ceil(e.hp)} / ${e.maxHp}`;

    if (e.playerId === PLAYER_ID) {
      const player = game.players[PLAYER_ID];
      const upgrade = root.querySelector('[data-action="upgrade"]');
      if (upgrade && (e.type === 'city' || e.type === 'megacity')) {
        const level = e.level || 1;
        upgrade.disabled = level >= 5 || player.money + 1e-9 < getUpgradeCost(e);
      }

      root.querySelectorAll('[data-train]').forEach(button => {
        const type = button.dataset.train;
        if (UNITS[type] && isTrainingFacilityFor(e, type)) button.disabled = getMaxTrainable(e, type) <= 0;
      });
      root.querySelectorAll('[data-train-amount][data-train-type]').forEach(button => {
        const type = button.dataset.trainType;
        if (UNITS[type] && isTrainingFacilityFor(e, type)) button.disabled = getMaxTrainable(e, type) <= 0;
      });
      root.querySelectorAll('[data-drone-batch][data-drone-type]').forEach(button => {
        button.disabled = !canQueueDroneBatch(e, button.dataset.droneType, Number(button.dataset.droneBatch) || 0);
      });

      const onsite = root.querySelector('[data-action="onsite-upgrade"]');
      if (onsite) {
        const check = canApplyBuildingOnsiteUpgrade(e);
        onsite.disabled = !check.ok;
        const small = onsite.querySelector('small');
        if (small) {
          const effectScale = getOnsiteUpgradeEffectScale(e.playerId);
          const primaryEffect = isCombatBuilding(e)
            ? `+${(ADVANCED_ENGINEERING_BALANCE.ouBaseDamageGain * effectScale * 100).toFixed(0)}% BASE DAMAGE / LEVEL`
            : `+${(ADVANCED_ENGINEERING_BALANCE.ouBaseHpGain * effectScale * 100).toFixed(0)}% BASE MAX HP / LEVEL`;
          small.textContent = check.ok ? primaryEffect : check.reason;
        }
      }
    }

    if (e.type === 'missileLaunchSite') refreshMissileLaunchSitePanelState(e);
    if (e.type === 'energyGenerator' || ENERGY_CONSUMER_TYPES.includes(e.type)) refreshDirectedEnergyPanelState(e);
  }

  function renderSelectionPanel() {
    const e = game.selected;
    const rightPanel = els.selectionContent?.closest?.('.right-panel');
    rightPanel?.classList.toggle('missile-site-selected', !!(e?.alive && e.type === 'missileLaunchSite'));
    rightPanel?.classList.toggle('advanced-infantry-selected', !!(e?.alive && e.type === 'superiorMobilizationComplex'));
    rightPanel?.classList.toggle('selection-hidden', !(e?.alive));
    document.getElementById('app')?.classList.toggle('selection-empty', !(e?.alive));
    if (!e || !e.alive) {
      els.selectionSubtitle.textContent = 'Nothing selected';
      els.selectionContent.className = 'selection-content empty-state';
      els.selectionContent.innerHTML = '';
      return;
    }

    const def = BUILDINGS[e.type];
    const player = game.players[e.playerId];
    els.selectionSubtitle.textContent = `${player.name} · ${Math.round(e.x)}, ${Math.round(e.y)}`;
    els.selectionContent.className = 'selection-content';

    const hpPercent = clamp((e.hp / e.maxHp) * 100, 0, 100);
    let html = `
      <div class="stat-block">
        <div class="stat-head"><strong>${def.name}</strong><span>${(e.type === 'city' || e.type === 'megacity') ? `LEVEL ${e.level || 1} / 5` : (e.type === 'fortress' && e.constructionState !== 'operational' ? 'UNDER CONSTRUCTION' : 'OPERATIONAL')}</span></div>
        <div class="health-track"><div class="health-fill" data-live-selection-hp-fill style="width:${hpPercent}%"></div></div>
        <div class="stat-row"><span>Integrity</span><strong data-live-selection-hp>${Math.ceil(e.hp)} / ${e.maxHp}</strong></div>
        <div class="stat-row"><span>Owner</span><strong style="color:${player.color}">${player.name}</strong></div>
      </div>`;

    if (e.type === 'capital') {
      const researchSlots = getResearchSlotCount(e.playerId);
      const activeResearch = player.research?.active?.length || 0;
      const reserveCount = getCapitalReserveCount(e.playerId);
      html += `<div class="stat-block"><div class="stat-row"><span>Construction radius</span><strong>${BUILDINGS.capital.buildRange}</strong></div><div class="stat-row"><span>Strategic status</span><strong>CRITICAL</strong></div><div class="stat-row"><span>Research slots</span><strong>${activeResearch} / ${researchSlots}</strong></div><div class="stat-row"><span>Capital reserve</span><strong>${reserveCount} INACTIVE</strong></div></div>`;
      if (e.playerId === PLAYER_ID) {
        html += `<button class="action-button" data-action="research"><span class="action-line"><span>OPEN RESEARCH</span><span>DR / SR</span></span><small>Manage Doctrine and Specialized Research from the Capital.</small></button>`;
      }
    }

    if (e.type === 'missileLaunchSite') html += renderMissileLaunchSitePanel(e);
    if (e.type === 'energyGenerator' || ENERGY_CONSUMER_TYPES.includes(e.type)) html += renderDirectedEnergyPanel(e);
    if (e.type === 'superiorMobilizationComplex') html += renderSuperiorMobilizationComplexPanel(e);

    if (e.type === 'city' || e.type === 'megacity') {
      const level = e.level || 1;
      const currentIncome = getBuildingIncome(e);
      const upgradeCost = getUpgradeCost(e);
      const nextIncome = level < 5 ? BUILDINGS[e.type].income * Math.pow(1.5, level) : currentIncome;
      html += `
        <div class="stat-block">
          <div class="stat-row"><span>Income</span><strong>${moneyText(currentIncome)}/min</strong></div>
          <div class="stat-row"><span>Upgrade effect</span><strong>+50% income</strong></div>
          ${level < 5 ? `<div class="stat-row"><span>Next level</span><strong>${moneyText(nextIncome)}/min</strong></div>` : '<div class="stat-row"><span>Upgrade status</span><strong>MAX LEVEL</strong></div>'}
        </div>`;
      if (e.playerId === PLAYER_ID) {
        html += `<button class="action-button" data-action="upgrade" ${(level >= 5 || game.players[PLAYER_ID].money < upgradeCost) ? 'disabled' : ''}>
          <span class="action-line"><span>${level >= 5 ? 'MAXIMUM LEVEL' : 'UPGRADE ECONOMY'}</span><span>${level >= 5 ? '—' : moneyText(upgradeCost)}</span></span>
          <small>${level >= 5 ? 'This settlement is fully upgraded.' : 'Increase this settlement\'s income by 50%.'}</small>
        </button>`;
      }
    }

    if (e.type === 'militaryBase') {
      const stored = e.storedUnits?.filter(r => r.lifecycleState === LIFECYCLE_STATES.STORED).length || 0;
      const commandOnline = hasCommandCenter(e.playerId);
      html += `<div class="stat-block"><div class="stat-row"><span>Stored units</span><strong>${stored} / ${MILITARY_BASE_STORAGE_CAPACITY}</strong></div><div class="stat-row"><span>Training queue</span><strong>${e.queue.length} / 60</strong></div><div class="stat-row"><span>Command link</span><strong>${commandOnline ? 'ONLINE · 30% FASTER' : 'OFFLINE'}</strong></div></div>`;
      if (e.playerId === PLAYER_ID) {
        for (const type of GROUND_UNIT_TYPES) {
          const unitDef = UNITS[type];
          const unlocked = isDefinitionUnlocked(PLAYER_ID, 'unit', type);
          const unitCost = getTrainingPackageCost(PLAYER_ID, type, TRANSPORT_UNIT_TYPES.includes(type) ? getVehicleBuildConfiguration(PLAYER_ID, type) : null);
          if (!unlocked) {
            if (type === 'apc' || type === 'ifv') {
              html += `<button class="action-button research-locked" disabled><span class="action-line"><span>${unitDef.name.toUpperCase()}</span><span>RESEARCH LOCKED</span></span><small>${unitDef.description}</small></button>`;
            }
            continue;
          }
          if (commandOnline) {
            html += `<div class="train-row">
              <div class="train-copy"><strong>${unitDef.name}</strong><span>${moneyText(unitCost)} · stored ${e.storage[type]} · ${unitDef.description}</span></div>
              <div class="quick-buttons" data-train-type="${type}">
                <button type="button" data-train-amount="max" data-train-type="${type}">MAX</button>
                <button type="button" data-train-amount="10" data-train-type="${type}">10</button>
                <button type="button" data-train-amount="5" data-train-type="${type}">5</button>
                <button type="button" data-train-amount="1" data-train-type="${type}">1</button>
              </div>
            </div>`;
          } else {
            html += `<button class="action-button" data-train="${type}" ${game.players[PLAYER_ID].money < unitCost ? 'disabled' : ''}>
              <span class="action-line"><span>TRAIN ${unitDef.name.toUpperCase()}</span><span>${moneyText(unitCost)}</span></span>
              <small>Stored: ${e.storage[type]} · ${unitDef.description}</small>
            </button>`;
          }
        }
        if (isResearchComplete(PLAYER_ID, 'aiUnlockComplex') && getPlayerInfantryLoadouts(PLAYER_ID).length) {
          html += `<div class="section-label">EXOSUIT LOADOUT TRAINING</div>${renderInfantryLoadoutTrainingRows(e)}`;
        }
        if (hasResearchCapability(PLAYER_ID, 'vehicleConfiguration')) {
          const grenadeUnlocked = isResearchComplete(PLAYER_ID, 'mwIFVGrenade');
          const turret = player.vehicleConfig?.ifvTurret || 'machineGun';
          const renderPassengerEditor = type => {
            if (!isDefinitionUnlocked(PLAYER_ID, 'unit', type)) return '';
            const composition = getVehiclePassengerComposition(PLAYER_ID, type);
            const capacity = getTransportCapacityForType(PLAYER_ID, type);
            const used = INFANTRY_UNIT_TYPES.reduce((sum, infantryType) => sum + (composition[infantryType] || 0), 0);
            const packageCost = getTrainingPackageCost(PLAYER_ID, type, {
              ...(type === 'ifv' ? { turret } : {}),
              passengerComposition: composition
            });
            return `<div class="vehicle-loadout-card" data-passenger-editor="${type}">
              <div class="vehicle-loadout-head"><div><strong>${UNITS[type].name} PASSENGERS</strong><span>Built with every new ${UNITS[type].name}.</span></div><b>${used} / ${capacity}</b></div>
              <div class="vehicle-passenger-fields">
                ${INFANTRY_UNIT_TYPES.map(infantryType => `<label><span>${UNITS[infantryType].name}</span><input type="number" min="0" max="${capacity}" data-passenger-type="${type}:${infantryType}" value="${composition[infantryType] || 0}" /></label>`).join('')}
              </div>
              <div class="vehicle-loadout-foot"><span>Current package: ${moneyText(packageCost)}</span><button type="button" data-save-passengers="${type}">SAVE COMPOSITION</button></div>
            </div>`;
          };
          html += `<div class="section-label">VEHICLE CONFIGURATION</div><div class="vehicle-config-stack">
            ${renderPassengerEditor('apc')}
            ${renderPassengerEditor('ifv')}
            ${isDefinitionUnlocked(PLAYER_ID, 'unit', 'ifv') ? `<div class="vehicle-config">
              <div class="vehicle-config-copy"><strong>IFV Turret</strong><span>Turret choice and passenger composition are snapshotted when training starts.</span></div>
              <div class="vehicle-config-buttons">
                <button type="button" data-ifv-turret="machineGun" class="${turret === 'machineGun' ? 'active' : ''}">MACHINE GUN</button>
                <button type="button" data-ifv-turret="grenade" class="${turret === 'grenade' ? 'active' : ''}" ${grenadeUnlocked ? '' : 'disabled'}>GRENADE ${grenadeUnlocked ? '' : '· LOCKED'}</button>
              </div>
            </div>` : ''}
          </div>`;
        }
        if (commandOnline) {
          const configured = player.convoys.map((convoy, index) => ({ convoy, index })).filter(item => convoyTotal(item.convoy) > 0);
          if (configured.length) {
            html += `<div class="section-label">PREDEFINED CONVOYS</div><div class="convoy-button-grid">`;
            configured.forEach(({ convoy, index }) => {
              html += `<button type="button" class="convoy-action" data-train-convoy="${index}"><strong>${escapeHtml(convoy.name)}</strong><span>${convoyTotal(convoy)} units · ${moneyText(convoyCost(convoy))}</span></button>`;
            });
            html += `</div>`;
          }
        }
        if (e.queue.length) {
          const queuedType = e.queue[0];
          const trainTime = UNITS[queuedType].trainTime * getTrainingMultiplier(e.playerId, queuedType);
          const progress = clamp((e.queueProgress / trainTime) * 100, 0, 100);
          html += `<div class="queue-line"><span>${UNITS[queuedType].name}</span><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div><span>${Math.round(progress)}%</span></div>`;
        }
      }
    }

    if (e.type === 'airbase') {
      syncAirbaseStoredCount(e);
      const aircraftCap = getAirbaseAircraftCapacity(e.playerId);
      const readyTotal = getAirbaseReadyCount(e);
      const cooling = getAirbaseCoolingCount(e);
      const paraReloadPending = (e.bomberBay || []).filter(record => record.type === 'paratrooperPlane' && record.reloadPending).length;
      const airborne = getAirbaseAssignedActiveCount(e);
      const committed = getAirbaseAircraftCommitment(e);
      const availableSlots = getAirbaseAvailableSlots(e);
      const nextReady = getAirbaseNextReadySeconds(e);
      const commandOnline = hasCommandCenter(e.playerId);
      const readySummary = MANNED_AIRCRAFT_TYPES.filter(type => isDefinitionUnlocked(e.playerId, 'unit', type) || type === 'bomber')
        .map(type => `${UNITS[type].name.replace('Super ', '')}: ${getAirbaseReadyCount(e, type)}`).join(' · ');
      html += `<div class="stat-block"><div class="stat-row"><span>Ready aircraft</span><strong>${readyTotal} / ${aircraftCap}</strong></div><div class="stat-row"><span>Ready by type</span><strong>${readySummary}</strong></div><div class="stat-row"><span>Turnaround / reload</span><strong>${cooling}${paraReloadPending ? ` · ${paraReloadPending} transport reload${paraReloadPending === 1 ? '' : 's'} pending` : ''}${cooling && Number.isFinite(nextReady) ? ` · next ${Math.ceil(nextReady)}s` : ''}</strong></div><div class="stat-row"><span>Airborne / assigned</span><strong>${airborne}</strong></div><div class="stat-row"><span>Airframes maintained</span><strong>${committed} / ${aircraftCap}</strong></div><div class="stat-row"><span>Training queue</span><strong>${e.queue.length}</strong></div><div class="stat-row"><span>Command link</span><strong>${commandOnline ? 'ONLINE · 30% FASTER' : 'OFFLINE'}</strong></div></div>`;
      if (isDefinitionUnlocked(e.playerId, 'unit', 'loyalWingman')) {
        const wingReady = getAirbaseReadyWingmanCount(e);
        const wingCooling = getAirbaseCoolingWingmanCount(e);
        const wingActive = getAirbaseActiveWingmanCount(e);
        const wingCap = getAirbaseWingmanCapacity(e);
        const sortieCap = getLoyalWingmanSortieCap(e.playerId);
        html += `<div class="stat-block"><div class="stat-row"><span>Loyal Wingmen ready</span><strong>${wingReady} / ${wingCap}</strong></div><div class="stat-row"><span>LW turnaround</span><strong>${wingCooling}</strong></div><div class="stat-row"><span>LW airborne / assigned</span><strong>${wingActive}</strong></div><div class="stat-row"><span>Escort cap</span><strong>${sortieCap} PER AIRCRAFT / SORTIE</strong></div></div>`;
      }
      if (e.playerId === PLAYER_ID) {
        for (const type of MANNED_AIRCRAFT_TYPES) {
          if (type !== 'bomber' && !isDefinitionUnlocked(PLAYER_ID, 'unit', type)) continue;
          const unitDef = UNITS[type];
          const buildConfig = (type === 'superFighter' || type === 'paratrooperPlane') ? getAircraftBuildConfiguration(PLAYER_ID, type) : null;
          const unitCost = getTrainingPackageCost(PLAYER_ID, type, buildConfig);
          const ready = getAirbaseReadyCount(e, type);
          if (commandOnline) {
            html += `<div class="train-row"><div class="train-copy"><strong>${unitDef.name}</strong><span>${moneyText(unitCost)} · ready ${ready} · ${availableSlots} shared airframe slot${availableSlots === 1 ? '' : 's'} open · ${unitDef.description}</span></div><div class="quick-buttons"><button type="button" data-train-amount="max" data-train-type="${type}" ${availableSlots <= 0 ? 'disabled' : ''}>MAX</button><button type="button" data-train-amount="10" data-train-type="${type}" ${availableSlots <= 0 ? 'disabled' : ''}>10</button><button type="button" data-train-amount="5" data-train-type="${type}" ${availableSlots <= 0 ? 'disabled' : ''}>5</button><button type="button" data-train-amount="1" data-train-type="${type}" ${availableSlots <= 0 ? 'disabled' : ''}>1</button></div></div>`;
          } else {
            html += `<button class="action-button" data-train="${type}" ${(game.players[PLAYER_ID].money < unitCost || availableSlots <= 0) ? 'disabled' : ''}><span class="action-line"><span>TRAIN ${unitDef.name.toUpperCase()}</span><span>${moneyText(unitCost)}</span></span><small>${availableSlots > 0 ? `${availableSlots} shared airframe slot${availableSlots === 1 ? '' : 's'} open` : `AIRBASE AT ${aircraftCap}-AIRCRAFT LIMIT`} · ${unitDef.description}</small></button>`;
          }
        }

        if (isDefinitionUnlocked(PLAYER_ID, 'unit', 'superFighter')) {
          const fighterCap = getFighterPayloadCapacity(PLAYER_ID);
          const config = normalizeFighterMissileConfiguration(PLAYER_ID);
          html += `<div class="section-label">SUPER FIGHTER LOADOUT</div><div class="vehicle-loadout-card air-loadout-card">
            <div class="vehicle-loadout-head"><div><strong>MISSILE PAYLOAD</strong><span>Configuration is snapshotted when Fighter training begins.</span></div><b>${config.airToAir + config.airToGround} / ${fighterCap}</b></div>
            <div class="vehicle-passenger-fields">
              <label><span>A2A Missiles</span><input type="number" min="0" max="${fighterCap}" data-fighter-missile="airToAir" value="${config.airToAir}" /></label>
              <label><span>A2G Missiles</span><input type="number" min="0" max="${fighterCap}" data-fighter-missile="airToGround" value="${config.airToGround}" /></label>
            </div>
            <div class="vehicle-loadout-foot"><span>Capacity ${fighterCap} · A2A 300 DMG · A2G ${Math.round(getDefinitionPlayerStat(PLAYER_ID, 'unit', 'superFighter', 'airToGroundMissileDamage', AIR_DOMINANCE_BALANCE.fighterA2GDamage))} DMG</span><button type="button" data-save-fighter-loadout>SAVE LOADOUT</button></div>
          </div>`;
        }

        if (isDefinitionUnlocked(PLAYER_ID, 'unit', 'paratrooperPlane')) {
          const paraCap = getParatrooperCapacity(PLAYER_ID);
          const composition = normalizeParatrooperComposition(PLAYER_ID);
          const paraCount = getParatrooperPassengerCount({ passengerComposition: composition });
          const packageCost = getTrainingPackageCost(PLAYER_ID, 'paratrooperPlane', { passengerComposition: composition });
          html += `<div class="section-label">PARATROOPER LOADOUT</div><div class="vehicle-loadout-card air-loadout-card">
            <div class="vehicle-loadout-head"><div><strong>PASSENGER COMPOSITION</strong><span>Passengers are trained with new planes; returning planes automatically repurchase this saved payload when funds allow.</span></div><b>${paraCount} / ${paraCap}</b></div>
            <div class="vehicle-passenger-fields">
              ${INFANTRY_UNIT_TYPES.map(type => `<label><span>${UNITS[type].name}</span><input type="number" min="0" max="${paraCap}" data-paratrooper-passenger="${type}" value="${composition[type] || 0}" /></label>`).join('')}
            </div>
            <div class="vehicle-loadout-foot"><span>Current package: ${moneyText(packageCost)}</span><button type="button" data-save-paratrooper-loadout>SAVE COMPOSITION</button></div>
          </div>`;
        }

        if (e.queue.length) {
          const queuedType = e.queue[0];
          const trainTime = getQueuedTrainingTime(e);
          const progress = clamp((e.queueProgress / trainTime) * 100, 0, 100);
          html += `<div class="queue-line"><span>${UNITS[queuedType]?.name || queuedType}</span><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div><span>${Math.round(progress)}%</span></div>`;
        }
      }
    }

    if (e.type === 'droneHub') {
      syncDroneHubCounts(e);
      redistributeLoyalWingmen(e.playerId);
      const lmStored = getDroneHubStoredCount(e, 'loiteringMunition');
      const lwStored = getDroneHubStoredCount(e, 'loyalWingman');
      const lmCap = getDroneHubCapacity(e, 'loiteringMunition');
      const lwCap = getDroneHubCapacity(e, 'loyalWingman');
      const networkWingRoom = getDroneHubNetworkRoom(e, 'loyalWingman');
      html += `<div class="stat-block"><div class="stat-row"><span>Loitering Munitions</span><strong>${lmStored} / ${lmCap}</strong></div><div class="stat-row"><span>Loyal Wingmen held here</span><strong>${lwStored} / ${lwCap}</strong></div><div class="stat-row"><span>Wingman network room</span><strong>${networkWingRoom}</strong></div><div class="stat-row"><span>Production queue</span><strong>${e.queue.length}</strong></div></div>`;
      if (e.playerId === PLAYER_ID) {
        const batchAmounts = isResearchComplete(PLAYER_ID, 'dwMassProduction') ? DRONE_BATCH_LEVELS.map(level => level.amount) : [1];
        for (const type of DRONE_UNIT_TYPES) {
          const unlocked = isDefinitionUnlocked(PLAYER_ID, 'unit', type);
          if (!unlocked) {
            html += `<div class="train-row research-locked"><div class="train-copy"><strong>${UNITS[type].name}</strong><span>RESEARCH LOCKED · ${UNITS[type].description}</span></div></div>`;
            continue;
          }
          const capText = type === 'loiteringMunition' ? `${lmStored}/${lmCap} stored` : `${lwStored}/${lwCap} held · Airbases receive finished Wingmen automatically`;
          html += `<div class="train-row"><div class="train-copy"><strong>${UNITS[type].name}</strong><span>${moneyText(getUnitCost(PLAYER_ID, type))} base · ${capText} · ${UNITS[type].description}</span></div><div class="drone-batch-grid">${batchAmounts.map(amount => {
            const discount = Math.round(getDroneBatchDiscount(PLAYER_ID, amount) * 100);
            const allowed = canQueueDroneBatch(e, type, amount);
            return `<button type="button" data-drone-batch="${amount}" data-drone-type="${type}" ${allowed ? '' : 'disabled'} title="${moneyText(getDroneBatchCost(PLAYER_ID, type, amount))}${discount ? ` · ${discount}% bulk discount` : ''}">${amount}${discount ? `<small>−${discount}%</small>` : ''}</button>`;
          }).join('')}</div><div class="drone-manual-row"><input data-command-field data-drone-manual="${type}" type="number" min="1" max="${Math.max(1, getDroneHubNetworkRoom(e,type))}" value="1"/><button type="button" data-drone-manual-queue="${type}">QUEUE AMOUNT</button></div></div>`;
        }
        if (e.queue.length) {
          const queuedType = e.queue[0];
          const trainTime = getQueuedTrainingTime(e);
          const progress = clamp((e.queueProgress / trainTime) * 100, 0, 100);
          html += `<div class="queue-line"><span>${UNITS[queuedType].name}</span><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div><span>${Math.round(progress)}%</span></div>`;
        }
      }
    }

    if (e.type === 'fortress') {
      const activeGarrison = (e.garrisonIds || []).map(id => game.entityById.get(id)).filter(u => u?.alive).length;
      if (e.constructionState !== 'operational') {
        const builders = (e.builderIds || []).map(id => game.entityById.get(id)).filter(u => u?.alive);
        const arrived = builders.filter(u => u.fortressBuilderArrived).length;
        const engineers = (e.engineerBuilderIds || []).map(id => game.entityById.get(id)).filter(u => u?.alive && u.type === 'advancedEngineer');
        const workingEngineers = engineers.filter(u => distance(u, e) <= e.radius + u.radius + 12).length;
        const percent = Math.round(clamp((e.constructionProgress || 0) / 20, 0, 1) * 100);
        const conventionalText = e.allowGarrisonConstruction === false ? 'NOT REQUIRED' : `${arrived} / 10`;
        const status = workingEngineers > 0 ? `${workingEngineers} ENGINEER${workingEngineers===1?'':'S'} BUILDING` : (e.allowGarrisonConstruction === false ? 'WAITING FOR ENGINEER' : builders.length < 10 ? 'WAITING FOR INFANTRY' : 'FORTIFYING');
        html += `<div class="stat-block"><div class="stat-row"><span>Construction</span><strong>${percent}%</strong></div><div class="stat-row"><span>Infantry builders</span><strong>${conventionalText}</strong></div><div class="stat-row"><span>Advanced Engineers</span><strong>${workingEngineers} · +${workingEngineers * 2}%/s</strong></div><div class="stat-row"><span>Status</span><strong>${status}</strong></div></div>`;
      } else {
        html += `<div class="stat-block"><div class="stat-row"><span>Garrison</span><strong>${activeGarrison} / 10</strong></div><div class="stat-row"><span>Defense patrol radius</span><strong>${Math.round(getEntityStat(e, 'range', BUILDINGS.fortress.range))}</strong></div><div class="stat-row"><span>Construction radius</span><strong>${BUILDINGS.fortress.buildRange}</strong></div></div>`;
      }
    }

    if (e.type === 'militaryCommand') {
      const commandOnline = e.alive;
      html += `<div class="stat-block"><div class="stat-row"><span>Training acceleration</span><strong>30% FASTER</strong></div><div class="stat-row"><span>Quick controls</span><strong>MAX / 10 / 5 / 1</strong></div><div class="stat-row"><span>Convoy slots</span><strong>3</strong></div></div>`;
      if (e.playerId === PLAYER_ID && commandOnline) {
        html += `<div class="section-label">CONVOY DEFINITIONS</div>`;
        player.convoys.forEach((convoy, index) => {
          html += `<div class="convoy-editor" data-convoy-editor="${index}">
            <input class="convoy-name" data-convoy-name="${index}" maxlength="22" value="${escapeHtml(convoy.name)}" aria-label="Convoy ${index + 1} name" />
            <div class="convoy-fields">
              ${getConvoyGroundTypes(PLAYER_ID, convoy).filter(type => (isInfantryLoadoutToken(type) ? !!getAdvancedInfantryDefinitionBaseType(PLAYER_ID, type) : isDefinitionUnlocked(PLAYER_ID, 'unit', type))).map(type => `<label><span>${escapeHtml(getGroundDefinitionName(PLAYER_ID,type).replace(' Soldier',''))}</span><input type="number" min="0" max="99" data-convoy-unit="${index}:${type}" value="${Math.max(0, Math.floor(Number(convoy[type]) || 0))}" /></label>`).join('')}
            </div>
            <button type="button" class="action-button compact" data-save-convoy="${index}"><span class="action-line"><span>SAVE CONVOY ${index + 1}</span><span>${convoyTotal(convoy)} UNITS</span></span></button>
          </div>`;
        });
        if (hasResearchCapability(PLAYER_ID, 'scheduledDeployment')) html += renderScheduledDeploymentEditor(PLAYER_ID);
      }
    }

    if (e.type === 'advancedCoordinationCenter') {
      html += renderCoordinationCenterPanel(e);
    }

    if (e.type === 'advancedEngineeringComplex') {
      const capacity = getEngineeringComplexCapacity(e);
      const hosted = e.engineerBay?.length || 0;
      const resting = (e.engineerBay || []).filter(record => (record.readyAt || 0) > game.time).length;
      const activeEngineers = getEngineeringComplexActiveCount(e);
      const committed = getEngineeringComplexCommitment(e);
      const engineerCost = getEngineerTrainingCost(e.playerId);
      html += `<div class="stat-block"><div class="stat-row"><span>Engineer commitment</span><strong>${committed} / ${capacity}</strong></div><div class="stat-row"><span>Hosted / resting</span><strong>${hosted} / ${resting}</strong></div><div class="stat-row"><span>Active in field</span><strong>${activeEngineers}</strong></div><div class="stat-row"><span>Training queue</span><strong>${e.queue.length}</strong></div><div class="stat-row"><span>Repair rate</span><strong>${Math.round(getEngineerRepairRate(e.playerId) * 100)}% MAX HP/s</strong></div><div class="stat-row"><span>Endurance</span><strong>${Math.round(getEngineerEndurance(e.playerId))}s</strong></div></div>`;
      if (e.playerId === PLAYER_ID) {
        html += `<button class="action-button" data-train="advancedEngineer" ${getMaxTrainable(e, 'advancedEngineer') <= 0 ? 'disabled' : ''}><span class="action-line"><span>TRAIN ADVANCED ENGINEER</span><span>${moneyText(engineerCost)}</span></span><small>High-durability autonomous repair unit · capacity ${capacity}</small></button>`;
        if (e.queue.length) {
          const trainTime = UNITS.advancedEngineer.trainTime * getTrainingMultiplier(e.playerId, 'advancedEngineer');
          const progress = clamp((e.queueProgress / trainTime) * 100, 0, 100);
          html += `<div class="queue-line"><span>Advanced Engineer</span><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div><span>${Math.round(progress)}%</span></div>`;
        }
        if (hasResearchCapability(PLAYER_ID, 'engineerAutoReplenishment')) {
          html += `<div class="engineer-config"><div class="section-label">AUTO-REPLENISHMENT</div><div class="engineer-config-row"><span>Desired Engineers</span><input type="number" min="0" max="${capacity}" data-engineer-desired value="${Math.min(capacity, e.engineerDesiredCount || 0)}" /></div><div class="engineer-config-actions"><button type="button" data-save-engineer-desired>SAVE DESIRED COUNT</button></div></div>`;
        }
        if (hasResearchCapability(PLAYER_ID, 'engineerAutoOU')) {
          html += `<div class="engineer-config"><div class="section-label">STATE-WIDE AUTO OU</div><div class="engineer-config-actions"><button type="button" data-toggle-engineer-auto-ou class="${e.engineerAutoOUEnabled ? 'active' : ''}">${e.engineerAutoOUEnabled ? 'AUTO OU ENABLED' : 'AUTO OU DISABLED'}</button></div><div class="engineer-config-row"><span>Priority</span><select data-engineer-ou-priority><option value="defense" ${e.engineerOUPriority !== 'functional' ? 'selected' : ''}>DEFENSE FIRST</option><option value="functional" ${e.engineerOUPriority === 'functional' ? 'selected' : ''}>FUNCTIONAL FIRST</option></select></div></div>`;
        }
      }
    }

    if (e.type === 'researchCenter') {
      const providerId = `researchCenter:${e.id}`;
      const provider = getResearchProvider(e.playerId, providerId);
      const activeAtRC = getResearchProviderActiveCount(e.playerId, providerId);
      const speedParts = [];
      if (isResearchComplete(e.playerId, 'aeRCSpeed1')) speedParts.push('Speed I');
      if (isResearchComplete(e.playerId, 'aeRCSpeed2')) speedParts.push('Speed II');
      html += `<div class="stat-block"><div class="stat-row"><span>Shared slots contributed</span><strong>${provider?.slots || 0}</strong></div><div class="stat-row"><span>Slots currently hosted</span><strong>${activeAtRC}</strong></div><div class="stat-row"><span>Global research speed</span><strong>${speedParts.length ? speedParts.join(' + ') : 'BASE'}</strong></div><div class="stat-row"><span>Global research cost</span><strong>${isResearchComplete(e.playerId, 'aeRCCost') ? '−15%' : 'BASE'}</strong></div><div class="stat-row"><span>Research Centers</span><strong>${game.buildings.filter(b=>b.alive&&b.playerId===e.playerId&&b.type==='researchCenter').length} / ${RESEARCH_CENTER_BUILD_CAP}</strong></div></div>`;
      if (e.playerId === PLAYER_ID) html += `<button class="action-button" data-action="research-at-rc"><span class="action-line"><span>OPEN RESEARCH</span><span>SHARED POOL</span></span><small>Research automatically uses any available Capital or Research Center slot.</small></button>`;
    }

    if (e.type === 'hive') {
      const living = e.hiveChildren.map(id => game.entityById.get(id)).filter(u => u?.alive).length;
      const assigned = e.hiveTargetId ? game.entityById.get(e.hiveTargetId) : null;
      const droneMode = e.hiveMode === 'searchDestroy' && hasResearchCapability(e.playerId, 'hiveSearchDestroyMode');
      const cooldown = Math.max(0, (e.hiveDroneWaveCooldownUntil || 0) - game.time);
      html += `<div class="stat-block"><div class="stat-row"><span>Hive mode</span><strong>${droneMode ? 'SEARCH & DESTROY' : 'UGV PATROL'}</strong></div><div class="stat-row"><span>${droneMode ? 'Active strike drones' : 'Active hunters'}</span><strong>${living} / ${droneMode ? DRONE_WARFARE_BALANCE.hiveDroneWaveSize : 3}</strong></div><div class="stat-row"><span>Detection range</span><strong>${Math.round(getEntityStat(e, 'range', BUILDINGS.hive.range))}</strong></div><div class="stat-row"><span>Status</span><strong>${droneMode ? (living ? 'WAVE ACTIVE' : cooldown > 0 ? `REARM ${cooldown.toFixed(1)}s` : 'LAUNCHING') : (assigned?.alive ? 'ENGAGING' : 'PATROLLING')}</strong></div></div>`;
      if (e.playerId === PLAYER_ID && hasResearchCapability(PLAYER_ID, 'hiveSearchDestroyMode')) {
        html += `<div class="section-label">HIVE CONFIGURATION</div><div class="hive-mode-grid"><button type="button" data-hive-mode="ugv" class="${!droneMode ? 'active' : ''}">UGV PATROL</button><button type="button" data-hive-mode="searchDestroy" class="${droneMode ? 'active' : ''}">SEARCH & DESTROY</button></div><div class="research-note">Search & Destroy launches 6 free Loitering Munitions per wave. Each lasts 10s; the next wave begins 2s after all six are gone. Drone SR perks apply.</div>`;
      }
    }

    if (EW_STATION_TYPES.includes(e.type)) {
      const stats = getEWStationStats(e);
      const headingDeg = ((e.ewHeading || 0) * 180 / Math.PI + 360) % 360;
      let effectRows = '';
      if (e.type === 'radarStation') {
        effectRows = `<div class="stat-row"><span>Stealth reveal</span><strong>${Math.round(stats.revealChance * 100)}% / SCAN · ${stats.revealDuration.toFixed(0)}s</strong></div><div class="stat-row"><span>Detected vulnerability</span><strong>+${Math.round(stats.damageVulnerability * 100)}% DAMAGE</strong></div>`;
      } else if (e.type === 'jammingStation') {
        effectRows = `<div class="stat-row"><span>Slowdown</span><strong>${Math.round(stats.slow * 100)}% · ${stats.duration.toFixed(0)}s</strong></div><div class="stat-row"><span>Range reduction</span><strong>${Math.round(stats.rangeReduction * 100)}% · ${stats.duration.toFixed(0)}s</strong></div><div class="stat-row"><span>Drone / guided missile shutdown</span><strong>${Math.round(stats.shutdownChance * 100)}%</strong></div>`;
      } else {
        effectRows = `<div class="stat-row"><span>Spoofing chance</span><strong>${Math.round(stats.spoofChance * 100)}% / SCAN</strong></div><div class="stat-row"><span>Deception duration</span><strong>${stats.duration.toFixed(0)}s</strong></div>`;
      }
      html += `<div class="stat-block"><div class="stat-row"><span>Emission angle</span><strong>${stats.angleDeg.toFixed(0)}°</strong></div><div class="stat-row"><span>Emission range</span><strong>${Math.round(stats.range)}</strong></div><div class="stat-row"><span>Scan interval</span><strong>${stats.interval.toFixed(2)}s</strong></div><div class="stat-row"><span>Antenna heading</span><strong>${headingDeg.toFixed(0)}°</strong></div>${effectRows}</div>`;
      if (e.playerId === PLAYER_ID) html += `<button class="action-button compact" data-ew-aim><span class="action-line"><span>AIM ANTENNA</span><span>DIRECTIONAL</span></span><small>Coverage cone is shown only while aiming.</small></button>`;
    }

    if (def.range && e.type !== 'hive' && e.type !== 'fortress') {
      html += `<div class="stat-block"><div class="stat-row"><span>Weapon range</span><strong>${Math.round(getEntityStat(e, 'range', def.range))}</strong></div><div class="stat-row"><span>Role</span><strong>${def.description}</strong></div></div>`;
    }

    if (e.playerId === PLAYER_ID && e.type !== 'capital') {
      const ouLevel = getOnsiteUpgradeLevel(e);
      const ouCeiling = getOnsiteUpgradeCeiling(e.playerId);
      const ouCost = getOnsiteUpgradeCost(e);
      const ouCheck = canApplyBuildingOnsiteUpgrade(e);
      const effectScale = getOnsiteUpgradeEffectScale(e.playerId);
      const primaryEffect = isCombatBuilding(e)
        ? `+${(ADVANCED_ENGINEERING_BALANCE.ouBaseDamageGain * effectScale * 100).toFixed(0)}% BASE DAMAGE / LEVEL`
        : `+${(ADVANCED_ENGINEERING_BALANCE.ouBaseHpGain * effectScale * 100).toFixed(0)}% BASE MAX HP / LEVEL`;
      html += `<div class="ou-summary"><div class="stat-row"><span>Onsite Upgrade</span><strong>${ouLevel} / ${ouCeiling}</strong></div><div class="stat-row"><span>Per-level effect</span><strong>${primaryEffect}</strong></div><div class="stat-row"><span>Health recovery</span><strong>${(getOnsiteUpgradeRecoveryRate(e.playerId) * 100).toFixed(1).replace('.0','')}% PRE-UPGRADE MAX HP</strong></div></div>`;
      html += `<button class="action-button" data-action="onsite-upgrade" ${ouCheck.ok ? '' : 'disabled'}><span class="action-line"><span>${ouLevel >= ouCeiling ? 'OU MAXIMUM' : 'PERFORM ONSITE UPGRADE'}</span><span>${ouCost ? moneyText(ouCost) : '—'}</span></span><small>${ouCheck.ok ? primaryEffect : ouCheck.reason}</small></button>`;
      const structureRefundRate = getStructureRemovalRefundRate(e.playerId);
      html += `<button class="action-button remove-structure" data-action="remove-structure"><span class="action-line"><span>REMOVE STRUCTURE</span><span>${structureRefundRate > 0 ? `${Math.round(structureRefundRate * 100)}% INVESTMENT REFUND` : 'NO STRUCTURE REFUND'}</span></span><small>Contents evacuate · unfinished training refunded.</small></button>`;
    }

    els.selectionContent.innerHTML = html;
    const upgrade = els.selectionContent.querySelector('[data-action="upgrade"]');
    if (upgrade) upgrade.addEventListener('click', () => upgradeSettlement(e));
    const research = els.selectionContent.querySelector('[data-action="research"]');
    if (research) research.addEventListener('click', openResearchModal);
    const researchAtRC = els.selectionContent.querySelector('[data-action="research-at-rc"]');
    if (researchAtRC) researchAtRC.addEventListener('click', openResearchModal);
    const onsiteUpgradeButton = els.selectionContent.querySelector('[data-action="onsite-upgrade"]');
    if (onsiteUpgradeButton) onsiteUpgradeButton.addEventListener('click', () => { const result = applyBuildingOnsiteUpgrade(e); if (!result.ok) notify(result.reason || 'OU unavailable.', 'warning'); renderSelectionPanel(); refreshBuildButtons(); });
    const removeStructureButton = els.selectionContent.querySelector('[data-action="remove-structure"]');
    if (removeStructureButton) removeStructureButton.addEventListener('click', () => removeBuilding(e));
    const ewAimButton = els.selectionContent.querySelector('[data-ew-aim]');
    if (ewAimButton) ewAimButton.addEventListener('click', () => beginEWAntennaAim(e));
    els.selectionContent.querySelectorAll('[data-missile-silo-toggle]').forEach(button => button.addEventListener('click', () => { toggleMissileSilo(e, Number(button.dataset.missileSiloToggle)); renderSelectionPanel(); }));
    els.selectionContent.querySelectorAll('[data-missile-silo-type]').forEach(select => select.addEventListener('change', () => { configureMissileSilo(e, Number(select.dataset.missileSiloType), select.value); renderSelectionPanel(); }));
    els.selectionContent.querySelectorAll('[data-stockpile-missile]').forEach(button => button.addEventListener('click', () => { const result = queueStockpileMissile(e, button.dataset.stockpileMissile); if (!result.ok) notify(result.reason, 'warning', 2); renderSelectionPanel(); }));
    const missileAim = els.selectionContent.querySelector('[data-missile-aim]');
    if (missileAim) missileAim.addEventListener('click', () => beginMissileAiming(e));
    const missileConfirm = els.selectionContent.querySelector('[data-missile-confirm]');
    if (missileConfirm) missileConfirm.addEventListener('click', () => { const result = confirmMissileAimTarget(); if (!result.ok) notify(result.reason, 'warning', 2); });
    const missileCancel = els.selectionContent.querySelector('[data-missile-cancel]');
    if (missileCancel) missileCancel.addEventListener('click', () => { cancelMissileAiming(); renderSelectionPanel(); });
    const energyRange = els.selectionContent.querySelector('[data-energy-output-range]');
    const energyNumber = els.selectionContent.querySelector('[data-energy-output-number]');
    const applyEnergyOutput = value => { setGeneratorOutput(e, value); if (energyRange) energyRange.value = String(e.energyOutputSet); if (energyNumber) energyNumber.value = String(Math.round(e.energyOutputSet)); refreshDirectedEnergyPanelState(e); };
    if (energyRange) energyRange.addEventListener('input', () => applyEnergyOutput(energyRange.value));
    if (energyNumber) energyNumber.addEventListener('input', () => applyEnergyOutput(energyNumber.value));
    const energyPriority = els.selectionContent.querySelector('[data-energy-priority]');
    if (energyPriority) energyPriority.addEventListener('change', () => setEnergyPriority(e, energyPriority.value));
    const energyNodeToggle = els.selectionContent.querySelector('[data-energy-node-toggle]');
    if (energyNodeToggle) energyNodeToggle.addEventListener('click', () => { toggleEnergyNode(e); renderSelectionPanel(); });
    const energyOrbitalAim = els.selectionContent.querySelector('[data-energy-orbital-aim]');
    if (energyOrbitalAim) energyOrbitalAim.addEventListener('click', () => { const result = beginOrbitalEnergyAiming(e); if (!result.ok) notify(result.reason, 'warning', 2); });
    if (typeof bindAdvancedInfantryPanelEvents === 'function') bindAdvancedInfantryPanelEvents(e);
    els.selectionContent.querySelectorAll('[data-train]').forEach(button => {
      button.addEventListener('click', () => trainUnits(e, button.dataset.train, 1));
    });
    els.selectionContent.querySelectorAll('[data-train-amount]').forEach(button => {
      button.addEventListener('click', () => {
        const type = button.dataset.trainType;
        const amount = button.dataset.trainAmount === 'max' ? getMaxTrainable(e, type) : Number(button.dataset.trainAmount);
        trainUnits(e, type, amount);
      });
    });
    els.selectionContent.querySelectorAll('[data-train-convoy]').forEach(button => {
      button.addEventListener('click', () => trainConvoy(e, Number(button.dataset.trainConvoy)));
    });
    els.selectionContent.querySelectorAll('[data-save-convoy]').forEach(button => {
      button.addEventListener('click', () => saveConvoyFromEditor(Number(button.dataset.saveConvoy)));
    });
    const saveSchedule = els.selectionContent.querySelector('[data-save-schedule]');
    if (saveSchedule) saveSchedule.addEventListener('click', () => {
      const schedule = readScheduledDeploymentFromEditor();
      setScheduledDeployment(PLAYER_ID, schedule);
      notify(`${schedule.name} saved · ${getScheduledDeploymentTotal(schedule)} primary units across 3 nodes.`, 'good', 2.6);
      renderSelectionPanel();
    });
    const trainSchedule = els.selectionContent.querySelector('[data-train-schedule]');
    if (trainSchedule) trainSchedule.addEventListener('click', () => {
      const schedule = readScheduledDeploymentFromEditor();
      setScheduledDeployment(PLAYER_ID, schedule);
      const result = trainScheduledDeployment(PLAYER_ID);
      if (!result.ok && !result.queued) notify(result.reason || 'No Scheduled Deployment units could be queued.', 'warning', 2.8);
      renderSelectionPanel();
    });
    els.selectionContent.querySelectorAll('[data-automation-pause]').forEach(button => button.addEventListener('click', () => {
      const routineId = button.dataset.automationPause;
      const routine = (e.automatedWarfare || []).find(r => r.id === routineId && !r.cancelled);
      if (routine) pauseAutomatedWarfare(e, routineId, !routine.paused);
      renderSelectionPanel();
    }));
    els.selectionContent.querySelectorAll('[data-automation-cancel]').forEach(button => button.addEventListener('click', () => {
      if (cancelAutomatedWarfare(e, button.dataset.automationCancel)) notify('Automated Warfare cancelled. Bandwidth released.', 'warning', 2.5);
      renderSelectionPanel();
    }));
    els.selectionContent.querySelectorAll('[data-pick-automation-coordinate]').forEach(button => {
      button.addEventListener('click', () => beginAutomationCoordinatePicking(e, button.dataset.pickAutomationCoordinate));
    });
    const createTheater = els.selectionContent.querySelector('[data-create-theater]');
    if (createTheater) createTheater.addEventListener('click', () => {
      const templateType = els.selectionContent.querySelector('[data-aw-template]')?.value || 'focused';
      const automationGroundTypes = getCommandGroundTypes(PLAYER_ID);
      let composition = Object.fromEntries(automationGroundTypes.map(type => [type, Math.max(0, Math.floor(Number(els.selectionContent.querySelector(`[data-aw-ground="${type}"]`)?.value) || 0))]));
      let schedule = null;
      let focused = templateType === 'focused';
      if (templateType === 'convoy') {
        const idx = Math.max(0, Math.floor(Number(els.selectionContent.querySelector('[data-aw-convoy]')?.value) || 0));
        const convoy = game.players[PLAYER_ID].convoys[idx] || {};
        composition = normalizeCommandComposition(convoy, getCommandGroundTypes(PLAYER_ID, convoy));
        focused = false;
      } else if (templateType === 'scheduled') {
        schedule = normalizeScheduledDeployment(PLAYER_ID);
        composition = {};
        focused = false;
      }
      const result = createAutomatedWarfare(e, {
        kind: 'theater', name: templateType === 'scheduled' ? `Theater · ${schedule.name}` : templateType === 'convoy' ? 'Theater · Convoy' : 'Theater · Focused',
        facilityId: Number(els.selectionContent.querySelector('[data-aw-ground-base]')?.value), templateType, composition, schedule, focused,
        targetX: Number(els.selectionContent.querySelector('[data-aw-ground-x]')?.value), targetY: Number(els.selectionContent.querySelector('[data-aw-ground-y]')?.value)
      });
      if (!result.ok) notify(result.reason || 'Unable to initiate Theater Routine.', 'warning', 3);
      renderSelectionPanel(); refreshBuildButtons();
    });
    const createAirAutomation = els.selectionContent.querySelector('[data-create-air-automation]');
    if (createAirAutomation) createAirAutomation.addEventListener('click', () => {
      const composition = Object.fromEntries(COMMAND_AIR_TYPES.map(type => [type, Math.max(0, Math.floor(Number(els.selectionContent.querySelector(`[data-aw-air="${type}"]`)?.value) || 0))]));
      const kind = els.selectionContent.querySelector('[data-aw-air-kind]')?.value === 'routineFlight' ? 'routineFlight' : 'areaDenial';
      const result = createAutomatedWarfare(e, {
        kind, name: kind === 'areaDenial' ? 'Area Denial / Suppression' : 'Routine Flights', facilityId: Number(els.selectionContent.querySelector('[data-aw-airbase]')?.value), composition,
        escortsPerAircraft: Math.max(0, Math.floor(Number(els.selectionContent.querySelector('[data-aw-escorts]')?.value) || 0)),
        targetX: Number(els.selectionContent.querySelector('[data-aw-air-x]')?.value), targetY: Number(els.selectionContent.querySelector('[data-aw-air-y]')?.value)
      });
      if (!result.ok) notify(result.reason || 'Unable to initiate Aerial Automated Warfare.', 'warning', 3);
      renderSelectionPanel(); refreshBuildButtons();
    });
    els.selectionContent.querySelectorAll('[data-save-passengers]').forEach(button => {
      button.addEventListener('click', () => {
        const type = button.dataset.savePassengers;
        if (!TRANSPORT_UNIT_TYPES.includes(type) || !isDefinitionUnlocked(PLAYER_ID, 'unit', type)) return;
        const capacity = getTransportCapacityForType(PLAYER_ID, type);
        const composition = {};
        let requested = 0;
        for (const infantryType of INFANTRY_UNIT_TYPES) {
          const input = els.selectionContent.querySelector(`[data-passenger-type="${type}:${infantryType}"]`);
          const amount = Math.max(0, Math.floor(Number(input?.value) || 0));
          composition[infantryType] = amount;
          requested += amount;
        }
        if (requested > capacity) {
          notify(`${UNITS[type].name} passenger composition exceeds its ${capacity}-soldier capacity.`, 'warning', 3);
          return;
        }
        setVehiclePassengerComposition(PLAYER_ID, type, composition);
        const saved = getVehiclePassengerComposition(PLAYER_ID, type);
        const total = INFANTRY_UNIT_TYPES.reduce((sum, infantryType) => sum + (saved[infantryType] || 0), 0);
        notify(`${UNITS[type].name} passenger composition saved: ${total} / ${capacity}.`, 'good', 2.5);
        renderSelectionPanel();
      });
    });
    const saveFighterLoadout = els.selectionContent.querySelector('[data-save-fighter-loadout]');
    if (saveFighterLoadout) saveFighterLoadout.addEventListener('click', () => {
      const capacity = getFighterPayloadCapacity(PLAYER_ID);
      const a2a = Math.max(0, Math.floor(Number(els.selectionContent.querySelector('[data-fighter-missile="airToAir"]')?.value) || 0));
      const a2g = Math.max(0, Math.floor(Number(els.selectionContent.querySelector('[data-fighter-missile="airToGround"]')?.value) || 0));
      if (a2a + a2g > capacity) return notify(`Fighter missile loadout exceeds its ${capacity}-missile capacity.`, 'warning', 3);
      setFighterMissileConfiguration(PLAYER_ID, { airToAir: a2a, airToGround: a2g });
      notify(`Fighter loadout saved: ${a2a} A2A / ${a2g} A2G.`, 'good', 2.3);
      renderSelectionPanel();
    });
    const saveParatrooperLoadout = els.selectionContent.querySelector('[data-save-paratrooper-loadout]');
    if (saveParatrooperLoadout) saveParatrooperLoadout.addEventListener('click', () => {
      const capacity = getParatrooperCapacity(PLAYER_ID);
      const composition = {};
      let total = 0;
      for (const type of INFANTRY_UNIT_TYPES) {
        const amount = Math.max(0, Math.floor(Number(els.selectionContent.querySelector(`[data-paratrooper-passenger="${type}"]`)?.value) || 0));
        composition[type] = amount;
        total += amount;
      }
      if (total > capacity) return notify(`Paratrooper loadout exceeds its ${capacity}-soldier capacity.`, 'warning', 3);
      setParatrooperComposition(PLAYER_ID, composition);
      notify(`Paratrooper composition saved: ${total} / ${capacity}.`, 'good', 2.3);
      renderSelectionPanel();
    });

    els.selectionContent.querySelectorAll('[data-ifv-turret]').forEach(button => {
      button.addEventListener('click', () => {
        const turret = button.dataset.ifvTurret;
        if (turret === 'grenade' && !isResearchComplete(PLAYER_ID, 'mwIFVGrenade')) return;
        player.vehicleConfig ||= { ifvTurret: 'machineGun' };
        player.vehicleConfig.ifvTurret = turret === 'grenade' ? 'grenade' : 'machineGun';
        notify(`IFV default turret set to ${player.vehicleConfig.ifvTurret === 'grenade' ? 'Grenade Launcher' : 'Machine Gun'}.`, 'good', 2.3);
        renderSelectionPanel();
      });
    });
    els.selectionContent.querySelectorAll('[data-drone-batch]').forEach(button => {
      button.addEventListener('click', () => {
        const amount = Number(button.dataset.droneBatch) || 0;
        const type = button.dataset.droneType;
        if (!canQueueDroneBatch(e, type, amount)) return notify('That full drone batch requires more funds or storage capacity.', 'warning', 2.5);
        queueDroneBatch(e, type, amount);
      });
    });
    els.selectionContent.querySelectorAll('[data-drone-manual-queue]').forEach(button => button.addEventListener('click', () => {
      const type = button.dataset.droneManualQueue;
      const input = els.selectionContent.querySelector(`[data-drone-manual="${type}"]`);
      const amount = Math.max(1, Math.floor(Number(input?.value) || 1));
      if (!canQueueDroneBatch(e, type, amount)) return notify('That exact drone amount requires more funds or storage capacity.', 'warning', 2.5);
      queueDroneBatch(e, type, amount);
    }));
    els.selectionContent.querySelectorAll('[data-hive-mode]').forEach(button => button.addEventListener('click', () => setHiveMode(e, button.dataset.hiveMode)));
    const saveEngineerDesired = els.selectionContent.querySelector('[data-save-engineer-desired]');
    if (saveEngineerDesired) saveEngineerDesired.addEventListener('click', () => {
      const input = els.selectionContent.querySelector('[data-engineer-desired]');
      e.engineerDesiredCount = clamp(Math.floor(Number(input?.value) || 0), 0, getEngineeringComplexCapacity(e));
      notify(`Engineer desired count set to ${e.engineerDesiredCount}.`, 'good', 2);
      renderSelectionPanel();
    });
    const toggleAutoOU = els.selectionContent.querySelector('[data-toggle-engineer-auto-ou]');
    if (toggleAutoOU) toggleAutoOU.addEventListener('click', () => { e.engineerAutoOUEnabled = !e.engineerAutoOUEnabled; renderSelectionPanel(); });
    const ouPriority = els.selectionContent.querySelector('[data-engineer-ou-priority]');
    if (ouPriority) ouPriority.addEventListener('change', () => { e.engineerOUPriority = ouPriority.value === 'functional' ? 'functional' : 'defense'; renderSelectionPanel(); });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function getParatrooperReloadCost(playerId, record) {
    if (!record || record.type !== 'paratrooperPlane') return 0;
    const composition = normalizeParatrooperComposition(playerId, record.configuration?.passengerComposition);
    let total = 0;
    for (const infantryType of INFANTRY_UNIT_TYPES) total += (composition[infantryType] || 0) * getUnitCost(playerId, infantryType);
    return Math.max(0, Math.round(total * 100) / 100);
  }

  function tryReloadParatrooperRecord(base, record) {
    if (!base?.alive || base.type !== 'airbase' || !record || record.type !== 'paratrooperPlane' || !record.reloadPending) return false;
    const composition = normalizeParatrooperComposition(base.playerId, record.configuration?.passengerComposition);
    const desired = INFANTRY_UNIT_TYPES.reduce((sum, type) => sum + (composition[type] || 0), 0);
    if (desired <= 0) { record.reloadPending = false; record.cargoRecords = []; return true; }
    const cost = getParatrooperReloadCost(base.playerId, record);
    const player = game.players[base.playerId];
    if (!player || player.money + 1e-9 < cost) return false;
    player.money -= cost;
    record.cargoRecords = createConfiguredPassengerRecords(base.playerId, { passengerComposition: composition });
    record.reloadPending = false;
    return true;
  }

  function serviceParatrooperReloads(base) {
    if (!base?.alive || base.type !== 'airbase') return 0;
    let loaded = 0;
    for (const record of base.bomberBay || []) {
      if (record.type === 'paratrooperPlane' && record.reloadPending && tryReloadParatrooperRecord(base, record)) loaded++;
    }
    if (loaded) syncAirbaseStoredCount(base);
    return loaded;
  }

  function isAircraftRecordReady(record) {
    if (!record) return false;
    if ((record.readyAt || 0) > game.time) return false;
    if (record.type === 'paratrooperPlane' && record.reloadPending) return false;
    return true;
  }

  function getAirbaseReadyCount(base, type = null) {
    if (!base?.alive || base.type !== 'airbase') return 0;
    return (base.bomberBay || []).reduce((sum, aircraft) => sum + ((!type || aircraft.type === type) && isAircraftRecordReady(aircraft) ? 1 : 0), 0);
  }

  function getAirbaseCoolingCount(base, type = null) {
    if (!base?.alive || base.type !== 'airbase') return 0;
    return (base.bomberBay || []).reduce((sum, aircraft) => sum + ((!type || aircraft.type === type) && !isAircraftRecordReady(aircraft) ? 1 : 0), 0);
  }

  function getAirbaseNextReadySeconds(base, type = null) {
    if (!base?.alive || base.type !== 'airbase') return Infinity;
    let next = Infinity;
    for (const aircraft of base.bomberBay || []) {
      if (type && aircraft.type !== type) continue;
      if (aircraft.type === 'paratrooperPlane' && aircraft.reloadPending) continue;
      const remain = (aircraft.readyAt || 0) - game.time;
      if (remain > 0 && remain < next) next = remain;
    }
    return next;
  }

  function getAirbaseAssignedActiveCount(base, type = null) {
    if (!base?.alive || base.type !== 'airbase') return 0;
    let count = 0;
    for (const unit of game.units) {
      if (unit.alive && MANNED_AIRCRAFT_TYPES.includes(unit.type) && (!type || unit.type === type) && unit.homeAirbaseId === base.id) count++;
    }
    return count;
  }

  function getAirbaseQueuedAircraftCount(base, type = null) {
    if (!base?.alive || base.type !== 'airbase') return 0;
    let count = 0;
    for (const queuedType of base.queue || []) if (MANNED_AIRCRAFT_TYPES.includes(queuedType) && (!type || queuedType === type)) count++;
    return count;
  }

  function getAirbaseAircraftCommitment(base) {
    if (!base?.alive || base.type !== 'airbase') return 0;
    return (base.bomberBay?.length || 0) + getAirbaseQueuedAircraftCount(base) + getAirbaseAssignedActiveCount(base);
  }

  // Backwards-compatible name retained for the existing AI/test surface.
  function getAirbaseBomberCommitment(base) { return getAirbaseAircraftCommitment(base); }

  function getAirbaseAvailableSlots(base) {
    return Math.max(0, getAirbaseAircraftCapacity(base?.playerId) - getAirbaseAircraftCommitment(base));
  }

  function syncAirbaseStoredCount(base) {
    if (!base || base.type !== 'airbase') return;
    for (const type of MANNED_AIRCRAFT_TYPES) base.storage[type] = 0;
    for (const aircraft of base.bomberBay || []) {
      const ready = isAircraftRecordReady(aircraft);
      aircraft.lifecycleState = ready ? LIFECYCLE_STATES.STORED : LIFECYCLE_STATES.TURNAROUND;
      if (ready && MANNED_AIRCRAFT_TYPES.includes(aircraft.type)) base.storage[aircraft.type] = (base.storage[aircraft.type] || 0) + 1;
    }
  }

  function takeReadyAircraft(base, type) {
    if (!base?.alive || base.type !== 'airbase' || !MANNED_AIRCRAFT_TYPES.includes(type)) return null;
    base.bomberBay ||= [];
    const index = base.bomberBay.findIndex(aircraft => aircraft.type === type && isAircraftRecordReady(aircraft));
    if (index < 0) return null;
    const aircraft = base.bomberBay[index];
    base.bomberBay.splice(index, 1);
    syncAirbaseStoredCount(base);
    return aircraft;
  }

  function takeReadyBomber(base) { return takeReadyAircraft(base, 'bomber'); }

  function storeLandedAircraft(base, unit, deployedSoldiers = 0) {
    if (!base?.alive || base.type !== 'airbase' || !unit?.alive || !MANNED_AIRCRAFT_TYPES.includes(unit.type)) return false;
    base.bomberBay ||= [];
    const record = recordFromUnit(unit, LIFECYCLE_STATES.TURNAROUND, {
      readyAt: game.time + getAircraftTurnaroundSeconds(unit.playerId, unit.type, deployedSoldiers) * consumeAutomationTurnaroundMultiplier(unit),
      reloadPending: unit.type === 'paratrooperPlane' && !(unit.cargoRecords?.length),
      originFacilityType: 'airbase'
    });
    if (!record) return false;
    base.bomberBay.push(record);
    markEntityDead(unit, false, LIFECYCLE_STATES.TURNAROUND);
    syncAirbaseStoredCount(base);
    return true;
  }

  function storeLandedBomber(base, unit) { return storeLandedAircraft(base, unit, 0); }

  function findClosestFriendlyWingmanAirbase(unit) {
    let best = null;
    let bestD2 = Infinity;
    for (const base of game.buildings) {
      if (!base.alive || base.playerId !== unit.playerId || base.type !== 'airbase') continue;
      const reservedHere = unit.homeAirbaseId === base.id;
      if (!reservedHere && getAirbaseAvailableWingmanSlots(base) <= 0) continue;
      const d2 = distSq(unit, base);
      if (d2 < bestD2) { bestD2 = d2; best = base; }
    }
    return best;
  }

  function storeLandedWingman(base, unit) {
    if (!base?.alive || base.type !== 'airbase' || !unit?.alive || unit.type !== 'loyalWingman') return false;
    base.loyalWingmanBay ||= [];
    const record = recordFromUnit(unit, LIFECYCLE_STATES.TURNAROUND, {
      readyAt: game.time + getAircraftTurnaroundSeconds(unit.playerId, 'loyalWingman', 0) * consumeAutomationTurnaroundMultiplier(unit),
      originFacilityType: 'airbase'
    });
    if (!record) return false;
    base.loyalWingmanBay.push(record);
    markEntityDead(unit, false, LIFECYCLE_STATES.TURNAROUND);
    syncAirbaseWingmen(base);
    return true;
  }

  function storeLandedWingmanAtHub(hub, unit) {
    if (!hub?.alive || hub.type !== 'droneHub' || !unit?.alive || unit.type !== 'loyalWingman') return false;
    const record = recordFromUnit(unit, LIFECYCLE_STATES.TURNAROUND, {
      readyAt: game.time + getAircraftTurnaroundSeconds(unit.playerId, 'loyalWingman', 0),
      originFacilityType: 'droneHub'
    });
    if (!record || !storeDroneAtHub(hub, record, record.readyAt)) return false;
    markEntityDead(unit, false, LIFECYCLE_STATES.TURNAROUND);
    return true;
  }

  function launchLoyalWingmanEscort(base, record, master, escortIndex, escortCount) {
    if (!base?.alive || base.type !== 'airbase' || !record || !master?.alive) return null;
    const a = (escortIndex / Math.max(1, escortCount)) * Math.PI * 2;
    const wingman = createUnit('loyalWingman', master.playerId, base.x + Math.cos(a) * 48, base.y + Math.sin(a) * 48, {
      instanceId: record.instanceId,
      hp: clamp(Number.isFinite(record.hp) ? record.hp : UNITS.loyalWingman.hp, 1, Number.isFinite(record.maxHp) ? record.maxHp : UNITS.loyalWingman.hp),
      maxHp: Number.isFinite(record.maxHp) ? record.maxHp : UNITS.loyalWingman.hp,
      onsiteUpgrades: new Set(record.onsiteUpgrades || []),
      configuration: clonePlain(record.configuration ?? null),
      variantId: record.variantId ?? null,
      homeAirbaseId: base.id,
      masterAircraftId: master.id,
      escortIndex,
      escortCount,
      airMissionState: 'escort',
      bombTargetX: master.bombTargetX,
      bombTargetY: master.bombTargetY,
      payloadRemaining: Math.max(0, Math.floor(getDefinitionPlayerStat(master.playerId, 'unit', 'loyalWingman', 'payload', DRONE_WARFARE_BALANCE.loyalWingmanPayload))),
      enduranceRemaining: getDefinitionPlayerStat(master.playerId, 'unit', 'loyalWingman', 'endurance', DRONE_WARFARE_BALANCE.loyalWingmanEndurance),
      missileCooldown: 0
    });
    if (wingman) restorePersistentUnitModifiers(wingman, record);
    return wingman;
  }

  function isTrainingFacilityFor(base, type) {
    if (!base?.alive || !UNITS[type]) return false;
    if (base.type === 'militaryBase' && GROUND_UNIT_TYPES.includes(type)) return true;
    if (base.type === 'airbase' && MANNED_AIRCRAFT_TYPES.includes(type)) return true;
    if (base.type === 'advancedEngineeringComplex' && type === 'advancedEngineer') return true;
    if (base.type === 'droneHub' && DRONE_UNIT_TYPES.includes(type)) return true;
    return false;
  }

  function getEngineerRestDuration(playerId) {
    const multiplier = getDefinitionPlayerStat(playerId, 'unit', 'advancedEngineer', 'engineerRestMultiplier', 1);
    return Math.max(0, ADVANCED_ENGINEERING_BALANCE.engineerBaseRest * multiplier);
  }

  function getEngineerEndurance(playerId) {
    return Math.max(1, getDefinitionPlayerStat(playerId, 'unit', 'advancedEngineer', 'endurance', ADVANCED_ENGINEERING_BALANCE.engineerBaseEndurance));
  }

  function getEngineerRepairRate(playerId) {
    return Math.max(0, getDefinitionPlayerStat(playerId, 'unit', 'advancedEngineer', 'repairRate', ADVANCED_ENGINEERING_BALANCE.engineerBaseRepairRate));
  }

  function getEngineerTrainingCost(playerId) {
    return getUnitCost(playerId, 'advancedEngineer');
  }

  function queueEngineerTraining(complex, amount = 1, options = {}) {
    if (!complex?.alive || complex.type !== 'advancedEngineeringComplex' || !isDefinitionUnlocked(complex.playerId, 'unit', 'advancedEngineer')) return 0;
    const player = game.players[complex.playerId];
    if (!player?.alive) return 0;
    const capacity = getEngineeringComplexCapacity(complex);
    const room = Math.max(0, capacity - getEngineeringComplexCommitment(complex));
    const cost = getEngineerTrainingCost(complex.playerId);
    amount = Math.max(0, Math.min(room, Math.floor(Number(amount) || 0), cost > 0 ? Math.floor(player.money / cost) : room));
    if (!amount) return 0;
    player.money -= amount * cost;
    complex.queuePaidCosts ||= [];
    complex.queueBuildConfigs ||= [];
    complex.queueMeta ||= [];
    for (let i = 0; i < amount; i++) {
      complex.queue.push('advancedEngineer');
      complex.queuePaidCosts.push(cost);
      complex.queueBuildConfigs.push(null);
      complex.queueMeta.push(null);
    }
    if (!options.silent && complex.playerId === PLAYER_ID) notify(`${amount} × Advanced Engineer added to the training queue.`, 'good', 2);
    if (!options.silent && game.selected === complex) renderSelectionPanel();
    return amount;
  }

  function getFacilityAvailable(base, type) {
    if (base?.type === 'airbase' && MANNED_AIRCRAFT_TYPES.includes(type)) return getAirbaseReadyCount(base, type);
    if (base?.type === 'droneHub' && type === 'loiteringMunition') return getDroneHubStoredCount(base, type);
    if (typeof isInfantryLoadoutToken === 'function' && isInfantryLoadoutToken(type)) return getGroundDefinitionAvailable(base, type);
    return base?.storage?.[type] || 0;
  }

  function getMaxTrainable(base, type) {
    if (!base?.alive || !UNITS[type] || !isTrainingFacilityFor(base, type)) return 0;
    const player = game.players[base.playerId];
    if (base.type === 'advancedEngineeringComplex') {
      const room = Math.max(0, getEngineeringComplexCapacity(base) - getEngineeringComplexCommitment(base));
      const cost = getEngineerTrainingCost(base.playerId);
      return Math.min(room, cost > 0 ? Math.floor(player.money / cost) : room);
    }
    if (base.type === 'droneHub') {
      const room = getDroneHubNetworkRoom(base, type);
      const cost = getUnitCost(base.playerId, type);
      return Math.min(room, cost > 0 ? Math.floor(player.money / cost) : room);
    }
    const limit = base.type === 'airbase' ? getAirbaseAircraftCapacity(base.playerId) : 60;
    const queueSpace = Math.max(0, limit - base.queue.length);
    const groundStorageRoom = ['militaryBase','superiorMobilizationComplex'].includes(base.type)
      ? Math.max(0, getGroundFacilityStorageCapacity(base) - getGroundFacilityStoredCount(base) - base.queue.length)
      : queueSpace;
    const facilitySpace = base.type === 'airbase' ? getAirbaseAvailableSlots(base) : Math.min(queueSpace, groundStorageRoom);
    const buildConfiguration = TRANSPORT_UNIT_TYPES.includes(type) ? getVehicleBuildConfiguration(base.playerId, type)
      : (type === 'superFighter' || type === 'paratrooperPlane') ? getAircraftBuildConfiguration(base.playerId, type) : null;
    const unitCost = getTrainingPackageCost(base.playerId, type, buildConfiguration);
    if (!Number.isFinite(unitCost) || unitCost <= 0) return Math.min(queueSpace, facilitySpace);
    return Math.min(queueSpace, facilitySpace, Math.floor(player.money / unitCost));
  }

  function queueDroneBatch(hub, type, amount = 1, options = {}) {
    if (!hub?.alive || hub.type !== 'droneHub' || !DRONE_UNIT_TYPES.includes(type)) return 0;
    amount = Math.max(0, Math.floor(Number(amount) || 0));
    if (!amount || !canQueueDroneBatch(hub, type, amount)) return 0;
    const player = game.players[hub.playerId];
    const totalCost = getDroneBatchCost(hub.playerId, type, amount);
    const perItemPaid = amount ? totalCost / amount : 0;
    player.money -= totalCost;
    hub.queuePaidCosts ||= [];
    hub.queueBuildConfigs ||= [];
    hub.queueMeta ||= [];
    for (let i = 0; i < amount; i++) {
      hub.queue.push(type);
      hub.queuePaidCosts.push(perItemPaid);
      hub.queueBuildConfigs.push({ droneBatchAmount: amount, droneBatchDiscount: getDroneBatchDiscount(hub.playerId, amount) });
      hub.queueMeta.push(null);
    }
    if (!options.silent && hub.playerId === PLAYER_ID) {
      const discount = Math.round(getDroneBatchDiscount(hub.playerId, amount) * 100);
      notify(`${amount} × ${UNITS[type].name} queued${discount ? ` with ${discount}% batch discount` : ''}.`, 'good', 2.4);
      if (game.selected === hub) renderSelectionPanel();
      refreshBuildButtons();
    }
    return amount;
  }

  function trainUnits(base, type, amount = 1) {
    if (!base?.alive || base.playerId !== PLAYER_ID || !UNITS[type]) return;
    if (!isDefinitionUnlocked(PLAYER_ID, 'unit', type)) return notify(`${UNITS[type].name} is locked by research.`, 'warning');
    if (!isTrainingFacilityFor(base, type)) return;
    if (base.type === 'droneHub') {
      const queued = queueDroneBatch(base, type, amount);
      if (!queued) notify('Insufficient funds or drone storage capacity for that complete batch.', 'warning');
      return;
    }
    if (base.type === 'advancedEngineeringComplex' && type === 'advancedEngineer') {
      const queued = queueEngineerTraining(base, amount);
      if (!queued) notify(getEngineeringComplexCommitment(base) >= getEngineeringComplexCapacity(base) ? 'Engineering Complex is at its Engineer capacity.' : 'Insufficient funds for Engineer training.', 'warning');
      return;
    }
    const player = game.players[PLAYER_ID];
    const def = UNITS[type];
    const buildConfiguration = TRANSPORT_UNIT_TYPES.includes(type) ? getVehicleBuildConfiguration(PLAYER_ID, type)
      : (type === 'superFighter' || type === 'paratrooperPlane') ? getAircraftBuildConfiguration(PLAYER_ID, type) : null;
    const unitCost = getTrainingPackageCost(PLAYER_ID, type, buildConfiguration);
    amount = Math.max(0, Math.floor(Number(amount) || 0));
    amount = Math.min(amount, getMaxTrainable(base, type));
    if (amount <= 0) {
      if (base.type === 'airbase' && getAirbaseAvailableSlots(base) <= 0) notify(`This Airbase already maintains its maximum of ${getAirbaseAircraftCapacity(base.playerId)} manned aircraft.`, 'warning');
      else notify(base.queue.length >= (base.type === 'airbase' ? getAirbaseAircraftCapacity(base.playerId) : 60) ? 'Training queue is full.' : 'Insufficient funds for training.', 'warning');
      return;
    }
    player.money -= unitCost * amount;
    base.queuePaidCosts ||= [];
    base.queueBuildConfigs ||= [];
    base.queueMeta ||= [];
    for (let i = 0; i < amount; i++) {
      base.queue.push(type);
      base.queuePaidCosts.push(unitCost);
      base.queueBuildConfigs.push(clonePlain(buildConfiguration));
      base.queueMeta.push(null);
    }
    renderSelectionPanel();
    refreshBuildButtons();
    notify(`${amount} × ${def.name} added to the training queue.`, 'good', 2);
  }

  function trainConvoy(base, convoyIndex) {
    const player = game.players[PLAYER_ID];
    const convoy = player.convoys[convoyIndex];
    if (!base?.alive || base.playerId !== PLAYER_ID || !hasCommandCenter(PLAYER_ID) || !convoy) return;
    const total = convoyTotal(convoy);
    const cost = convoyCost(convoy);
    if (!total) return notify('Configure this convoy at the Military Command Center first.', 'warning');
    if (base.queue.length + total > 60) return notify('Not enough room in this base training queue for the convoy.', 'warning');
    if (['militaryBase','superiorMobilizationComplex'].includes(base.type) && getGroundFacilityStoredCount(base) + base.queue.length + total > getGroundFacilityStorageCapacity(base)) return notify('Not enough storage capacity at this facility for the convoy.', 'warning');
    if (player.money < cost) return notify('Insufficient funds to train this convoy.', 'warning');
    player.money -= cost;
    base.queuePaidCosts ||= [];
    base.queueBuildConfigs ||= [];
    base.queueMeta ||= [];
    for (const type of getConvoyGroundTypes(PLAYER_ID, convoy)) {
      const amount = Math.max(0, Math.floor(Number(convoy[type]) || 0));
      if (!amount) continue;
      let queueType = type;
      let buildConfiguration = TRANSPORT_UNIT_TYPES.includes(type) ? getVehicleBuildConfiguration(PLAYER_ID, type) : null;
      let queueMeta = null;
      if (isInfantryLoadoutToken(type)) {
        const parsed = parseInfantryLoadoutToken(type);
        const loadout = parsed && getInfantryLoadoutById(PLAYER_ID, parsed.loadoutId);
        if (!loadout || !hasOperationalSuperiorMobilizationComplex(PLAYER_ID)) continue;
        queueType = loadout.soldierType;
        buildConfiguration = getInfantryLoadoutConfigurationSnapshot(PLAYER_ID, loadout);
        queueMeta = { advancedInfantry:true, loadoutId:loadout.id, source:'convoy' };
      }
      const unitCost = getGroundDefinitionCost(PLAYER_ID, type);
      for (let i = 0; i < amount; i++) {
        base.queue.push(queueType);
        base.queuePaidCosts.push(unitCost);
        base.queueBuildConfigs.push(clonePlain(buildConfiguration));
        base.queueMeta.push(queueMeta ? clonePlain(queueMeta) : null);
      }
    }
    notify(`${convoy.name} added to the training queue.`, 'good', 2.4);
    renderSelectionPanel();
    refreshBuildButtons();
  }

  function saveConvoyFromEditor(index) {
    const player = game.players[PLAYER_ID];
    if (!hasCommandCenter(PLAYER_ID) || !player.convoys[index]) return;
    const nameInput = els.selectionContent.querySelector(`[data-convoy-name="${index}"]`);
    const convoy = player.convoys[index];
    convoy.name = (nameInput?.value || `Convoy ${index + 1}`).trim().slice(0, 22) || `Convoy ${index + 1}`;
    for (const type of getConvoyGroundTypes(PLAYER_ID, convoy)) {
      const input = els.selectionContent.querySelector(`[data-convoy-unit="${index}:${type}"]`);
      convoy[type] = clamp(Math.floor(Number(input?.value) || 0), 0, 99);
    }
    notify(`${convoy.name} saved.`, 'good', 2);
    renderSelectionPanel();
  }

  function getBuildingIncome(building) {
    const def = BUILDINGS[building.type];
    return (def.income || 0) * Math.pow(1.5, Math.max(0, (building.level || 1) - 1));
  }

  function getUpgradeCost(building) {
    return Math.round((BUILDINGS[building.type]?.cost || 0) * 0.5);
  }

  function upgradeSettlement(building) {
    if (!building.alive || building.playerId !== PLAYER_ID || (building.type !== 'city' && building.type !== 'megacity')) return;
    const level = building.level || 1;
    if (level >= 5) return notify('This settlement is already level 5.', 'warning');
    const player = game.players[PLAYER_ID];
    const cost = getUpgradeCost(building);
    if (player.money < cost) {
      notify('Insufficient funds for this upgrade.', 'warning');
      return;
    }
    player.money -= cost;
    building.totalInvestedCost = (building.totalInvestedCost || BUILDINGS[building.type].cost || 0) + cost;
    building.level = Math.min(5, level + 1);
    notify(`${BUILDINGS[building.type].name} upgraded to level ${building.level}. Income increased by 50%.`, 'good');
    renderSelectionPanel();
    refreshBuildButtons();
  }

