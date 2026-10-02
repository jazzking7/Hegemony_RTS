'use strict';

  // ---------------------------------------------------------------------------
  // Research UI
  // ---------------------------------------------------------------------------
  function formatResearchTime(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.ceil(seconds % 60);
    return `${minutes}m${remainder ? ` ${remainder}s` : ''}`;
  }

  function researchProgressForRecord(record) {
    return clamp(record?.progress / Math.max(FIXED_DT, record?.duration || FIXED_DT), 0, 1);
  }

  function renderResearchProgressMarkup(record, compact = false) {
    if (!record) return '';
    const progress = researchProgressForRecord(record);
    return `<div class="research-live-progress ${compact ? 'compact' : ''}" data-research-progress-id="${record.id}">
      <div class="research-progress-copy"><span data-progress-percent>${Math.round(progress * 100)}%</span><span data-progress-remaining>${formatResearchTime(Math.max(0, record.duration - record.progress))} remaining</span></div>
      <div class="progress-track"><div class="progress-fill" data-progress-fill style="width:${progress * 100}%"></div></div>
    </div>`;
  }

  function updateResearchProgressUI() {
    if (!els.researchModal || els.researchModal.classList.contains('hidden')) return;
    const player = game.players[PLAYER_ID];
    if (!player) return;
    const activeById = new Map((player.research.active || []).map(record => [record.id, record]));
    els.researchModal.querySelectorAll('[data-research-progress-id]').forEach(container => {
      const record = activeById.get(container.dataset.researchProgressId);
      if (!record) return;
      const progress = researchProgressForRecord(record);
      const fill = container.querySelector('[data-progress-fill]');
      const percent = container.querySelector('[data-progress-percent]');
      const remaining = container.querySelector('[data-progress-remaining]');
      if (fill) fill.style.width = `${progress * 100}%`;
      if (percent) percent.textContent = `${Math.round(progress * 100)}%`;
      if (remaining) remaining.textContent = `${formatResearchTime(Math.max(0, record.duration - record.progress))} remaining`;
    });
  }

  function getSelectedResearchProviderId() {
    // Research slots are pooled globally. Provider assignment is internal and
    // automatic; the player never has to choose a Capital/RC before researching.
    return null;
  }


  function captureResearchViewportState() {
    if (!els.researchModal || els.researchModal.classList.contains('hidden')) return;
    const main = els.researchModal.querySelector('.research-workspace-main');
    const visibleSection = els.researchModal.querySelector('[data-doctrine-tree]:not(.hidden)');
    if (!main || !visibleSection) return;
    const doctrineId = visibleSection.dataset.doctrineTree;
    if (!doctrineId) return;
    if (!game.researchViewportState) game.researchViewportState = {};
    game.researchViewportState[doctrineId] = {
      scrollTop: main.scrollTop,
      laneScrollLeft: [...visibleSection.querySelectorAll('.tech-tree-scroll')].map(node => node.scrollLeft)
    };
  }

  function restoreResearchViewportState(doctrineId) {
    if (!doctrineId || !els.researchModal) return;
    const state = game.researchViewportState?.[doctrineId];
    if (!state) return;
    const main = els.researchModal.querySelector('.research-workspace-main');
    const section = els.researchModal.querySelector(`[data-doctrine-tree="${doctrineId}"]`);
    if (!main || !section || section.classList.contains('hidden')) return;
    const apply = () => {
      if (!main.isConnected || !section.isConnected) return;
      main.scrollTop = state.scrollTop || 0;
      [...section.querySelectorAll('.tech-tree-scroll')].forEach((node, index) => {
        node.scrollLeft = state.laneScrollLeft?.[index] || 0;
      });
    };
    apply();
    requestAnimationFrame(apply);
  }

  function installTechTreeEdgeScrolling(root = els.researchModal) {
    if (!root) return;
    root.querySelectorAll('.tech-tree-scroll').forEach(scroller => {
      if (scroller.parentElement?.classList.contains('tech-scroll-shell')) return;
      const shell = document.createElement('div');
      shell.className = 'tech-scroll-shell';
      scroller.parentNode.insertBefore(shell, scroller);
      shell.appendChild(scroller);
      let direction = 0, frame = 0, last = 0;
      const stop = () => {
        direction = 0; last = 0;
        shell.classList.remove('scroll-left-active', 'scroll-right-active');
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      };
      const tick = now => {
        if (!direction || !scroller.isConnected) { stop(); return; }
        const dt = last ? Math.min(0.04, (now - last) / 1000) : 0;
        last = now;
        scroller.scrollLeft += direction * 520 * dt;
        frame = requestAnimationFrame(tick);
      };
      const start = dir => {
        if (direction === dir && frame) return;
        direction = dir;
        last = 0;
        shell.classList.toggle('scroll-left-active', dir < 0);
        shell.classList.toggle('scroll-right-active', dir > 0);
        if (!frame) frame = requestAnimationFrame(tick);
      };
      shell.addEventListener('pointermove', event => {
        const rect = shell.getBoundingClientRect();
        const edge = Math.min(58, Math.max(38, rect.width * 0.075));
        const x = event.clientX - rect.left;
        if (x <= edge && scroller.scrollLeft > 0) start(-1);
        else if (x >= rect.width - edge && scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth - 1) start(1);
        else stop();
      });
      shell.addEventListener('pointerleave', stop);
      shell.addEventListener('pointercancel', stop);
    });
  }

  function renderResearchModal() {
    if (!els.researchModal || els.researchModal.classList.contains('hidden')) return;
    const player = game.players[PLAYER_ID];
    if (!player) return;

    captureResearchViewportState();

    const providers = getResearchProviders(PLAYER_ID);
    const selectedProviderId = null;
    game.researchProviderSelectionId = null;

    const slots = getResearchSlotCount(PLAYER_ID);
    const active = player.research.active || [];
    els.researchSlotSummary.textContent = `${active.length} / ${slots} slots active`;

    if (active.length) {
      els.researchActiveList.innerHTML = active.map(record => {
        const def = getResearchDefinition(record.id);
        const provider = providers.find(item => item.id === record.providerId);
        return `<div class="research-active-item"><div><strong>${escapeHtml(def?.name || record.id)}</strong><span>${def?.kind === 'DR' ? 'DOCTRINAL' : 'SPECIALIZED'}<b class="provider-note ${provider ? '' : 'paused'}">${provider ? 'SHARED SLOT' : 'WAITING FOR FREE SLOT'}</b></span></div>${renderResearchProgressMarkup(record)}</div>`;
      }).join('');
    } else {
      els.researchActiveList.innerHTML = '<div class="research-empty">No active research.</div>';
    }

    const doctrines = Object.values(DOCTRINE_RESEARCH).sort((a, b) => a.order - b.order);
    const doctrineLogo = id => ({
      mechanizedWarfare: 'MW', droneWarfare: 'DW', advancedEngineering: 'AE', missileBattery: 'MB',
      electronicWarfare: 'EW', directedEnergy: 'DE', commandAutomation: 'CA', airDominance: 'AD', advancedInfantry: 'AI'
    }[id] || 'DR');
    const doctrineIds = new Set(doctrines.map(def => def.id));
    if (!doctrineIds.has(game.researchSelectedDoctrine)) {
      const runningDoctrine = active.find(record => DOCTRINE_RESEARCH[record.id])?.id;
      const firstUnlocked = doctrines.find(def => isDoctrineUnlocked(PLAYER_ID, def.id))?.id;
      game.researchSelectedDoctrine = runningDoctrine || firstUnlocked || doctrines[0]?.id || null;
    }
    const selectedDoctrine = doctrines.find(def => def.id === game.researchSelectedDoctrine) || doctrines[0];

    els.doctrineResearchList.innerHTML = doctrines.map(def => {
      const complete = isResearchComplete(PLAYER_ID, def.id);
      const runningRecord = active.find(record => record.id === def.id) || null;
      const running = !!runningRecord;
      const check = canStartResearch(PLAYER_ID, def.id, selectedProviderId);
      const selected = selectedDoctrine?.id === def.id;
      const state = complete ? 'RESEARCHED' : running ? 'RESEARCHING' : def.contentReady === false ? 'PENDING' : check.ok ? 'AVAILABLE' : 'LOCKED';
      return `<button type="button" class="doctrine-nav-item ${selected ? 'selected' : ''} ${complete ? 'complete' : ''} ${running ? 'researching' : ''} ${def.contentReady === false ? 'pending' : ''}" data-doctrine-select="${def.id}">
        <span class="doctrine-logo">${doctrineLogo(def.id)}</span>
        <span class="doctrine-nav-copy"><strong>${escapeHtml(def.name)}</strong><small>${state}</small></span>
        ${runningRecord ? `<span class="doctrine-nav-progress">${Math.round(researchProgressForRecord(runningRecord) * 100)}%</span>` : ''}
      </button>`;
    }).join('');

    els.doctrineResearchList.querySelectorAll('[data-doctrine-select]').forEach(button => {
      button.addEventListener('click', () => {
        game.researchSelectedDoctrine = button.dataset.doctrineSelect;
        renderResearchModal();
      });
    });

    if (els.researchDoctrineDetail && selectedDoctrine) {
      const complete = isResearchComplete(PLAYER_ID, selectedDoctrine.id);
      const runningRecord = active.find(record => record.id === selectedDoctrine.id) || null;
      const running = !!runningRecord;
      const check = canStartResearch(PLAYER_ID, selectedDoctrine.id, selectedProviderId);
      const cost = getResearchCost(PLAYER_ID, selectedDoctrine.id, selectedProviderId);
      const duration = getResearchDuration(PLAYER_ID, selectedDoctrine.id, selectedProviderId);
      const state = complete ? 'RESEARCHED' : running ? 'RESEARCHING' : selectedDoctrine.contentReady === false ? 'CONTENT PENDING' : check.ok ? 'AVAILABLE' : (check.reason || 'LOCKED').toUpperCase();
      const effects = selectedDoctrine.immediateEffects?.length ? `<div class="research-effects">${selectedDoctrine.immediateEffects.map(effect => `<span>${escapeHtml(effect)}</span>`).join('')}</div>` : '';
      els.researchDoctrineDetail.innerHTML = `<div class="doctrine-detail-logo">${doctrineLogo(selectedDoctrine.id)}</div><div class="doctrine-detail-copy"><div class="doctrine-head"><strong>${escapeHtml(selectedDoctrine.name)}</strong><span>${state}</span></div><p>${escapeHtml(selectedDoctrine.summary)}</p>${effects}<div class="research-meta"><span>DR Cost ${cost === null ? '—' : moneyText(cost)}</span><span>Time ${duration === null ? '—' : formatResearchTime(duration)}</span></div>${renderResearchProgressMarkup(runningRecord, true)}</div><button type="button" class="research-start doctrine-detail-action" data-research-id="${selectedDoctrine.id}" ${check.ok ? '' : 'disabled'}>${complete ? 'RESEARCHED' : running ? 'ACTIVE' : 'RESEARCH DOCTRINE'}</button>`;
      els.researchDoctrineDetail.querySelector('[data-research-id]')?.addEventListener('click', event => startResearch(PLAYER_ID, event.currentTarget.dataset.researchId, getSelectedResearchProviderId()));
    }

    els.researchModal.querySelectorAll('[data-doctrine-tree]').forEach(section => {
      const selected = section.dataset.doctrineTree === selectedDoctrine?.id;
      section.classList.toggle('hidden', !selected || !isDoctrineUnlocked(PLAYER_ID, section.dataset.doctrineTree));
    });

    const renderNode = id => {
      const def = SPECIALIZED_RESEARCH[id];
      const complete = isResearchComplete(PLAYER_ID, id);
      const runningRecord = active.find(record => record.id === id) || null;
      const running = !!runningRecord;
      const check = canStartResearch(PLAYER_ID, id, selectedProviderId);
      const requirementsMet = meetsResearchRequirements(PLAYER_ID, def);
      const state = complete ? 'COMPLETED' : running ? 'RESEARCHING' : !requirementsMet ? 'LOCKED' : check.ok ? 'AVAILABLE' : (check.reason || 'LOCKED').toUpperCase();
      const cost = getResearchCost(PLAYER_ID, id, selectedProviderId);
      const duration = getResearchDuration(PLAYER_ID, id, selectedProviderId);
      return `<article class="tech-node ${complete ? 'complete' : ''} ${running ? 'researching' : ''}">
        <div class="tech-node-head"><strong>${escapeHtml(def.name)}</strong><span>${state}</span></div>
        ${def.description ? `<p>${escapeHtml(def.description)}</p>` : ''}
        <div class="tech-node-meta"><span>${moneyText(cost)}</span><span>${formatResearchTime(duration)}</span></div>
        ${renderResearchProgressMarkup(runningRecord, true)}
        <button type="button" data-research-id="${def.id}" ${check.ok ? '' : 'disabled'}>${complete ? 'DONE' : running ? 'ACTIVE' : 'RESEARCH'}</button>
      </article>`;
    };
    const line = '<span class="tech-line" aria-hidden="true"></span>';

    if (els.mechanizedResearchTree) {
      if (!isDoctrineUnlocked(PLAYER_ID, 'mechanizedWarfare')) {
        els.mechanizedResearchTree.innerHTML = '';
      } else {
        els.mechanizedResearchTree.innerHTML = `
          <div class="tech-lane">
            <div class="tech-lane-title">APC / IFV DEVELOPMENT · PROGRESS LEFT → RIGHT</div>
            <div class="tech-tree-scroll"><div class="tech-track tech-track-branched">
              ${renderNode('mwUnlockAPC')}${line}${renderNode('mwAPCSurvivability')}${line}${renderNode('mwAPCMobility')}${line}
              <div class="tech-fork"><span class="tech-fork-stem" aria-hidden="true"></span>
                <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('mwUnlockIFV')}${line}${renderNode('mwIFVDamage')}${line}${renderNode('mwIFVSurvivability')}${line}${renderNode('mwIFVGrenade')}</div>
                <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('mwAPCExtraPassenger')}${line}${renderNode('mwAPCMobileFortress')}</div>
              </div>
            </div></div>
          </div>
          <div class="tech-lane"><div class="tech-lane-title">ARMOURED VEHICLE DEVELOPMENT · PROGRESS LEFT → RIGHT</div><div class="tech-tree-scroll"><div class="tech-track">${renderNode('mwBetterArmour')}${line}${renderNode('mwStrongerEngine')}${line}${renderNode('mwTorrentOfSteel')}</div></div></div>`;
        els.mechanizedResearchTree.querySelectorAll('[data-research-id]').forEach(button => button.addEventListener('click', () => startResearch(PLAYER_ID, button.dataset.researchId, getSelectedResearchProviderId())));
      }
    }

    if (els.droneWarfareResearchTree) {
      if (!isDoctrineUnlocked(PLAYER_ID, 'droneWarfare')) {
        els.droneWarfareResearchTree.innerHTML = '';
      } else {
        els.droneWarfareResearchTree.innerHTML = `
          <div class="tech-lane">
            <div class="tech-lane-title">DRONE WARFARE DEVELOPMENT · PROGRESS LEFT → RIGHT</div>
            <div class="tech-tree-scroll"><div class="tech-track tech-track-branched drone-tech-track">
              ${renderNode('dwUnlockDroneHub')}${line}
              <div class="tech-fork drone-root-fork"><span class="tech-fork-stem" aria-hidden="true"></span>
                <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('dwUnlockLoiteringMunition')}${line}${renderNode('dwLMSpeed')}${line}${renderNode('dwLMDamage')}${line}
                  <div class="tech-fork drone-subfork"><span class="tech-fork-stem" aria-hidden="true"></span>
                    <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('dwLMCost1')}${line}${renderNode('dwLMBuildSpeed1')}${line}${renderNode('dwLMCost2')}${line}${renderNode('dwLMBuildSpeed2')}</div>
                    <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('dwLMAOE')}${line}${renderNode('dwLMAOERadius1')}${line}${renderNode('dwLMLastDitch')}${line}${renderNode('dwLMAOERadius2')}</div>
                    <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('dwLMHealth')}${line}${renderNode('dwLMDisperse')}${line}${renderNode('dwLMEvasive')}${line}${renderNode('dwLMStealth')}</div>
                  </div>
                </div>
                <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('dwUnlockLoyalWingman')}${line}${renderNode('dwLWEndurance')}${line}${renderNode('dwLWDiscount')}${line}${renderNode('dwLWPayload1')}${line}${renderNode('dwLWDivert2')}${line}${renderNode('dwLWPayload2')}${line}${renderNode('dwLWDivert3')}</div>
                <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('dwStorage')}${line}${renderNode('dwMassProduction')}${line}${renderNode('dwDroneBuildSpeed')}</div>
              </div>
            </div></div>
          </div>`;
        els.droneWarfareResearchTree.querySelectorAll('[data-research-id]').forEach(button => button.addEventListener('click', () => startResearch(PLAYER_ID, button.dataset.researchId, getSelectedResearchProviderId())));
      }
    }

    if (els.advancedEngineeringResearchTree) {
      if (!isDoctrineUnlocked(PLAYER_ID, 'advancedEngineering')) {
        els.advancedEngineeringResearchTree.innerHTML = '';
      } else {
        els.advancedEngineeringResearchTree.innerHTML = `
          <div class="tech-lane">
            <div class="tech-lane-title">ADVANCED ENGINEER PROGRAM · PROGRESS LEFT → RIGHT</div>
            <div class="tech-tree-scroll"><div class="tech-track tech-track-branched">
              ${renderNode('aeUnlockComplex')}${line}
              <div class="tech-fork"><span class="tech-fork-stem" aria-hidden="true"></span>
                <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('aeEngineerRest')}${line}${renderNode('aeEngineerCost')}${line}${renderNode('aeCapacity1')}${line}${renderNode('aeAutoReplenishment')}${line}${renderNode('aeCapacity2')}</div>
                <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('aeSpeedyDispatch')}${line}${renderNode('aeHighlyReliable')}${line}${renderNode('aeSuperTechnician')}${line}${renderNode('aeHighEndurance')}${line}${renderNode('aeStatewideUpgrade')}</div>
              </div>
            </div></div>
          </div>
          <div class="tech-lane"><div class="tech-lane-title">RESEARCH CENTER DEVELOPMENT · PROGRESS LEFT → RIGHT</div><div class="tech-tree-scroll"><div class="tech-track">${renderNode('aeUnlockResearchCenter')}${line}${renderNode('aeRCSpeed1')}${line}${renderNode('aeRCCost')}${line}${renderNode('aeRCSlot')}${line}${renderNode('aeRCSpeed2')}</div></div></div>
          <div class="tech-lane"><div class="tech-lane-title">ONSITE UPGRADE DEVELOPMENT · PROGRESS LEFT → RIGHT</div><div class="tech-tree-scroll"><div class="tech-track">${renderNode('aeOURecovery')}${line}${renderNode('aeOUBetter1')}${line}${renderNode('aeOUCheaper')}${line}${renderNode('aeOUBetter2')}${line}${renderNode('aeOUCeiling')}</div></div></div>`;
        els.advancedEngineeringResearchTree.querySelectorAll('[data-research-id]').forEach(button => button.addEventListener('click', () => startResearch(PLAYER_ID, button.dataset.researchId, getSelectedResearchProviderId())));
      }
    }


    if (els.airDominanceResearchTree) {
      if (!isDoctrineUnlocked(PLAYER_ID, 'airDominance')) {
        els.airDominanceResearchTree.innerHTML = '';
      } else {
        els.airDominanceResearchTree.innerHTML = `
          <div class="tech-lane">
            <div class="tech-lane-title">SUPER FIGHTER DEVELOPMENT · PROGRESS LEFT → RIGHT</div>
            <div class="tech-tree-scroll"><div class="tech-track tech-track-branched">
              ${renderNode('adUnlockFighter')}${line}
              <div class="tech-fork"><span class="tech-fork-stem" aria-hidden="true"></span>
                <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('adFighterCost')}${line}${renderNode('adFighterTrain')}</div>
                <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('adA2GDamage')}${line}${renderNode('adFighterEndurance')}${line}${renderNode('adFighterPayload')}</div>
                <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('adFighterSpeed')}${line}${renderNode('adFlares1')}${line}${renderNode('adDetection')}${line}${renderNode('adFlares2')}${line}${renderNode('adDetectionStrike')}${line}${renderNode('adStealthFighter')}</div>
              </div>
            </div></div>
          </div>
          <div class="tech-lane"><div class="tech-lane-title">PARATROOPER AIRLIFT · PROGRESS LEFT → RIGHT</div><div class="tech-tree-scroll"><div class="tech-track">${renderNode('adUnlockParatrooper')}${line}${renderNode('adParaSpeed')}${line}${renderNode('adParaTurnaround')}${line}${renderNode('adParaCapacity')}${line}${renderNode('adParaFlares')}</div></div></div>
          <div class="tech-lane"><div class="tech-lane-title">AIRBASE FLEET DEVELOPMENT · PROGRESS LEFT → RIGHT</div><div class="tech-tree-scroll"><div class="tech-track">${renderNode('adAirbaseCapacity')}${line}${renderNode('adAircraftCost')}${line}${renderNode('adAircraftBuildSpeed')}</div></div></div>`;
        els.airDominanceResearchTree.querySelectorAll('[data-research-id]').forEach(button => button.addEventListener('click', () => startResearch(PLAYER_ID, button.dataset.researchId, getSelectedResearchProviderId())));
      }
    }

    if (els.commandAutomationResearchTree) {
      if (!isDoctrineUnlocked(PLAYER_ID, 'commandAutomation')) {
        els.commandAutomationResearchTree.innerHTML = '';
      } else {
        els.commandAutomationResearchTree.innerHTML = `
          <div class="tech-lane"><div class="tech-lane-title">FOCUSED MISSION · PROGRESS LEFT → RIGHT</div><div class="tech-tree-scroll"><div class="tech-track">${renderNode('caFocusedDamage1')}${line}${renderNode('caFocusedSpeed1')}${line}${renderNode('caFocusedDamage2')}${line}${renderNode('caFocusedSpeed2')}</div></div></div>
          <div class="tech-lane"><div class="tech-lane-title">SCHEDULED DEPLOYMENT · PROGRESS LEFT → RIGHT</div><div class="tech-tree-scroll"><div class="tech-track">${renderNode('caScheduledDiscount')}${line}${renderNode('caScheduledSpeed')}${line}${renderNode('caMultiDomain')}</div></div></div>
          <div class="tech-lane">
            <div class="tech-lane-title">AUTOMATED WARFARE / ADVANCED COORDINATION CENTER · PROGRESS LEFT → RIGHT</div>
            <div class="tech-tree-scroll"><div class="tech-track tech-track-branched">
              ${renderNode('caUnlockCoordinationCenter')}${line}
              <div class="tech-fork"><span class="tech-fork-stem" aria-hidden="true"></span>
                <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('caTheaterSpeed1')}${line}${renderNode('caTheaterCost1')}${line}${renderNode('caTheaterCap')}${line}${renderNode('caTheaterSpeed2')}${line}${renderNode('caTheaterCost2')}${line}${renderNode('caTheaterMature')}</div>
                <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('caAirSpeed1')}${line}${renderNode('caAirCost1')}${line}${renderNode('caAirTurnaround')}${line}${renderNode('caAirSpeed2')}${line}${renderNode('caAirMature')}</div>
                <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${renderNode('caInitiationDiscount1')}${line}${renderNode('caBandwidth1')}${line}${renderNode('caInitiationDiscount2')}${line}${renderNode('caBandwidth2')}${line}${renderNode('caACC2')}</div>
              </div>
            </div></div>
          </div>`;
        els.commandAutomationResearchTree.querySelectorAll('[data-research-id]').forEach(button => button.addEventListener('click', () => startResearch(PLAYER_ID, button.dataset.researchId, getSelectedResearchProviderId())));
      }
    }
    if (els.electronicWarfareResearchTree) {
      if (!isDoctrineUnlocked(PLAYER_ID, 'electronicWarfare')) {
        els.electronicWarfareResearchTree.innerHTML = '';
      } else {
        const ewLane = (title, rootId, coverageIds, effectIds) => `
          <div class="tech-lane">
            <div class="tech-lane-title">${title} · PROGRESS LEFT → RIGHT</div>
            <div class="tech-tree-scroll"><div class="tech-track tech-track-branched">
              ${renderNode(rootId)}${line}
              <div class="tech-fork"><span class="tech-fork-stem" aria-hidden="true"></span>
                <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${coverageIds.map((id, i) => `${renderNode(id)}${i < coverageIds.length - 1 ? line : ''}`).join('')}</div>
                <div class="tech-fork-row"><span class="tech-fork-lead" aria-hidden="true"></span>${effectIds.map((id, i) => `${renderNode(id)}${i < effectIds.length - 1 ? line : ''}`).join('')}</div>
              </div>
            </div></div>
          </div>`;
        els.electronicWarfareResearchTree.innerHTML =
          ewLane('RADAR STATION', 'ewUnlockRadar',
            ['ewRadarAngle1','ewRadarRange1','ewRadarAngle2','ewRadarRange2','ewRadarAngle3','ewRadarRange3','ewRadarAngle4','ewRadarRange4'],
            ['ewRadarFreq1','ewRadarVuln1','ewRadarFreq2','ewRadarVuln2','ewRadarFreq3','ewRadarVuln3','ewRadarFreq4','ewRadarVuln4']) +
          ewLane('JAMMING STATION', 'ewUnlockJamming',
            ['ewJammingAngle1','ewJammingRange1','ewJammingAngle2','ewJammingRange2','ewJammingAngle3','ewJammingRange3','ewJammingAngle4','ewJammingRange4'],
            ['ewJammingFreq1','ewJammingSlow','ewJammingFreq2','ewJammingRangeReduction','ewJammingFreq3','ewJammingShutdown','ewJammingFreq4']) +
          ewLane('SPOOFING STATION', 'ewUnlockSpoofing',
            ['ewSpoofAngle1','ewSpoofRange1','ewSpoofAngle2','ewSpoofRange2','ewSpoofAngle3','ewSpoofRange3','ewSpoofAngle4','ewSpoofRange4'],
            ['ewSpoofFreq1','ewSpoofChance1','ewSpoofFreq2','ewSpoofChance2','ewSpoofFreq3','ewSpoofChance3','ewSpoofFreq4']);
        els.electronicWarfareResearchTree.querySelectorAll('[data-research-id]').forEach(button => button.addEventListener('click', () => startResearch(PLAYER_ID, button.dataset.researchId, getSelectedResearchProviderId())));
      }
    }

    if (els.missileBatteryResearchTree) {
      if (!isDoctrineUnlocked(PLAYER_ID, 'missileBattery')) {
        els.missileBatteryResearchTree.innerHTML = '';
      } else {
        const missileBranch = ids => `<div class="tech-fork-row missile-tech-branch"><span class="tech-fork-lead" aria-hidden="true"></span>${ids.map((id, i) => `${renderNode(id)}${i < ids.length - 1 ? line : ''}`).join('')}</div>`;
        els.missileBatteryResearchTree.innerHTML = `
          <div class="tech-lane missile-tech-lane">
            <div class="tech-lane-title">MISSILE LAUNCH SITE DEVELOPMENT · PROGRESS LEFT → RIGHT</div>
            <div class="tech-tree-scroll missile-tech-scroll"><div class="tech-track tech-track-branched missile-tech-track">
              ${renderNode('mbUnlockMLS')}${line}
              <div class="tech-fork missile-tech-fork"><span class="tech-fork-stem" aria-hidden="true"></span>
                ${missileBranch(['mbUnlockHypersonic','mbHypDamage1','mbHypSpeed1','mbHypRange1','mbHypDamage2','mbHypSpeed2','mbHypRange2'])}
                ${missileBranch(['mbUnlockHE','mbHEDamage1','mbHEAoe1','mbHEFragmentRadius1','mbHEFragmentSlow1','mbHEDamage2','mbHEAoe2','mbHEFragmentRadius2','mbHEFragmentSlow2','mbHERange'])}
                ${missileBranch(['mbUnlockIncendiary','mbBurnDuration1','mbBurnRadius1','mbBurnDamage1','mbBurnVulnerability1','mbBurnDuration2','mbBurnRadius2','mbBurnDamage2','mbBurnVulnerability2'])}
                ${missileBranch(['mbCostDiscount1','mbSiloBuild1','mbCostDiscount2','mbSiloBuild2','mbCostDiscount3'])}
                ${missileBranch(['mbStockpileTime1','mbStorage1','mbStockpileTime2','mbStorage2','mbStockpileParallel'])}
                ${missileBranch(['mbReload1','mbReload2','mbMaxSilo1','mbReload3','mbMaxSilo2','mbSecondMLS'])}
                ${missileBranch(['mbGlobalRange1','mbGlobalSpeed1','mbGlobalRange2','mbGlobalSpeed2','mbGlobalRange3'])}
              </div>
            </div></div>
          </div>`;
        els.missileBatteryResearchTree.querySelectorAll('[data-research-id]').forEach(button => button.addEventListener('click', () => startResearch(PLAYER_ID, button.dataset.researchId, getSelectedResearchProviderId())));
      }
    }

    if (els.directedEnergyResearchTree) {
      if (!isDoctrineUnlocked(PLAYER_ID, 'directedEnergy')) {
        els.directedEnergyResearchTree.innerHTML = '';
      } else {
        const deLane = (title, ids) => `<div class="tech-lane"><div class="tech-lane-title">${title} · PROGRESS LEFT → RIGHT</div><div class="tech-tree-scroll"><div class="tech-track">${ids.map((id, index) => `${renderNode(id)}${index < ids.length - 1 ? line : ''}`).join('')}</div></div></div>`;
        els.directedEnergyResearchTree.innerHTML =
          deLane('ENERGY GENERATION', ['dePowerCost1','dePower120','deRange750','dePowerCost2','dePower150','deRange850','dePowerCost3']) +
          deLane('ORBITAL DIRECT-ENERGY SYSTEM', ['deUnlockOrbital','deOrbitalRecharge1','deOrbitalDamage1','deOrbitalAoe1','deOrbitalRecharge2','deOrbitalDamage2','deOrbitalAoe2','deOrbitalCap3']) +
          deLane('ENERGY-FIELD NETWORK', ['deUnlockNodes','deFieldAttack75','deFieldDR55','deFieldDensity10','deNodePower20','deFieldAttack100','deFieldDR70','deFieldDensity12','deNodePower15']) +
          deLane('ENERGY DEATH RAY', ['deUnlockDeathRay','deDeathDamage1','deDeathRange1','deDeathTarget1','deDeathDamage2','deDeathRange2','deDeathSlow','deDeathTarget2']);
        els.directedEnergyResearchTree.querySelectorAll('[data-research-id]').forEach(button => button.addEventListener('click', () => startResearch(PLAYER_ID, button.dataset.researchId, getSelectedResearchProviderId())));
      }
    }

    if (els.advancedInfantryResearchTree) {
      if (!isDoctrineUnlocked(PLAYER_ID, 'advancedInfantry')) {
        els.advancedInfantryResearchTree.innerHTML = '';
      } else {
        const pool = (title, ids) => `<div class="advanced-infantry-pool"><div class="tech-lane-title">${title}</div><div class="advanced-infantry-pool-grid">${ids.map(renderNode).join('')}</div></div>`;
        els.advancedInfantryResearchTree.innerHTML = `
          <div class="advanced-infantry-root">${renderNode('aiUnlockComplex')}</div>
          <div class="advanced-infantry-pools">
            ${pool('HELMET · BASIC $100 / ELITE $250', ['aiHelmetSniperOptics','aiHelmetAdvancedProtection','aiHelmetTargeting','aiHelmetHawkeye','aiHelmetComprehensive','aiHelmetEnemyAnalysis'])}
            ${pool('BODY ARMOUR · BASIC $100 / ELITE $250', ['aiBodySurvivability','aiBodyComposite','aiBodyNullificator','aiBodyExtreme','aiBodyMultilayer','aiBodyNullificatorElite'])}
            ${pool('WEAPONS · $100 EACH', ['aiWeaponMachineGun','aiWeaponGrenade','aiWeaponShotgun','aiWeaponRailgun'])}
            ${pool('BOOTS · BASIC $100 / ELITE $250', ['aiBootSwift','aiBootAntiMine','aiBootStabilizer','aiBootEndurance','aiBootProtection','aiBootSuperfast','aiBootCornerstone','aiBootSurvivability','aiBootGreatProtection'])}
            ${pool('MODULES · BASIC $100 / ELITE $250', ['aiModuleDodging','aiModuleDistributed','aiModuleHealing','aiModuleConceal','aiModuleCounterEW','aiModuleRevanchism','aiModuleLuckyStar','aiModuleMadhit','aiModuleImmortal','aiModuleStealth','aiModuleEWResistant','aiModuleAvenger','aiModuleGoldeye','aiModuleWeakpoint','aiModuleRampage'])}
          </div>`;
        els.advancedInfantryResearchTree.querySelectorAll('[data-research-id]').forEach(button => button.addEventListener('click', () => startResearch(PLAYER_ID, button.dataset.researchId, getSelectedResearchProviderId())));
      }
    }

    installTechTreeEdgeScrolling();
    restoreResearchViewportState(selectedDoctrine?.id);
    updateResearchProgressUI();
  }

  function openResearchModal() {
    if (!els.researchModal || !game.players[PLAYER_ID]?.capital?.alive) return;
    cancelEWAntennaAim();
    if (typeof cancelMissileAiming === 'function') cancelMissileAiming();
    if (typeof cancelOrbitalEnergyAiming === 'function') cancelOrbitalEnergyAiming();
    closeAttackModal();
    els.researchModal.classList.remove('hidden');
    renderResearchModal();
  }

  function closeResearchModal() {
    els.researchModal?.classList.add('hidden');
  }

