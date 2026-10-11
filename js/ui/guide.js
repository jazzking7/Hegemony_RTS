'use strict';

const DOCTRINE_GUIDE = Object.freeze({
  mechanizedWarfare: { use:'Break defended lines with armored vehicles and troop transports.', later:'APCs and IFVs, passenger capacity, turret choices, vehicle armor and armor-piercing upgrades. Mobile Fortress is an APC durability upgrade.', tip:'Start with Unlock APC. Configure passengers at a Military Base; the whole package is paid for and trained together.' },
  droneWarfare: { use:'Produce expendable strikes and support manned aircraft with unmanned escorts.', later:'Drone Hubs, Loitering Munitions, Loyal Wingmen, bulk production and drone upgrades.', tip:'Research the Drone Hub and the drone you want. Deploy munitions from the hub; Wingmen move through the network to eligible Airbases.' },
  advancedEngineering: { use:'Improve long-term research, repairs, and building upgrades.', later:'Engineering Complexes and Engineers, Research Centers with shared slots, stronger onsite upgrades, replenishment and automatic upgrade work.', tip:'For more research capacity, follow the Research Center branch. For repairs, unlock a Complex and train Engineers.' },
  missileBattery: { use:'Strike important targets from range and strengthen missile-based air defense.', later:'Missile Launch Sites, conventional and specialized warheads, silo/storage upgrades, and missile improvements.', tip:'Unlock and build a Missile Launch Site. Configure each silo and produce its missiles before aiming. Each silo reloads independently.' },
  electronicWarfare: { use:'Detect hidden threats and disrupt enemy effectiveness rather than relying only on damage.', later:'Directional Radar, Jamming and Spoofing stations; detection and disruption upgrades.', tip:'Research the station you need, place it near the engagement, and aim its antenna cone toward approaching enemies. Check its coverage on the map.' },
  directedEnergy: { use:'Build a powered defense network with orbital strikes, protective fields, and sustained beams.', later:'Orbital Beam Systems, Energy Field Nodes, Death Ray Towers, generator efficiency and consumer upgrades.', tip:'The doctrine unlocks a Generator immediately. Research a consumer, supply it from the local grid, then check power, charge, priority, and upkeep.' },
  commandAutomation: { use:'Coordinate timed attacks and repeat missions without issuing every deployment by hand.', later:'Advanced Coordination Centers and Automated Warfare, larger bandwidth, cheaper routines, mission and schedule improvements.', tip:'Try a three-node schedule at the Military Command first. For repeated attacks, unlock a Coordination Center and bind a routine to a production facility.' },
  airDominance: { use:'Maintain a larger air force and add specialized strike, patrol, and troop-drop aircraft.', later:'Super Fighter Jets, Paratrooper Planes, aircraft capacity, payload, flares, endurance and turnaround improvements.', tip:'Unlock the aircraft you want, train it at an Airbase, and save its payload before production. Returning aircraft need turnaround before redeployment.' },
  advancedInfantry: { use:'Strengthen infantry immediately, then build specialized persistent Exosuit loadouts.', later:'Superior Mobilization Complexes, equipment, weapons, armor, modules and advanced infantry effects.', tip:'Unlock and build the Complex. Save a named loadout, train it, and deploy it by name. Keep the Complex operational for specialized production.' }
});

function guideEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function guideTreeMarkup(def, research) {
  const byId = new Map(research.map(item=>[item.id,item]));
  const depths = new Map();
  const depth = item => {
    if (!depths.has(item.id)) depths.set(item.id, 1 + Math.max(0,...(item.requirements?.research || []).filter(id=>byId.has(id)).map(id=>depth(byId.get(id)))));
    return depths.get(item.id);
  };
  const columns = [];
  for (const item of research) { const d=depth(item); (columns[d] ||= []).push(item); }
  return `<div class="tree-scroll" tabindex="0" aria-label="${guideEscape(def.name)} complete research tree"><div class="guide-tree"><svg class="tree-edges" aria-hidden="true"></svg><div class="tree-column"><small>START HERE</small><div class="tree-root" data-tree-node="${def.id}"><strong>${guideEscape(def.name)}</strong><p>Complete this doctrine first.</p><small>$500 × 2 per doctrine started · 100s base</small></div></div>${columns.map((items,i)=>items ? `<div class="tree-column"><small>PREREQUISITE DEPTH ${i}</small>${items.map(item=>{
    const requirements = item.requirements?.research || [];
    const names = requirements.map(id=>SPECIALIZED_RESEARCH[id]?.name || DOCTRINE_RESEARCH[id]?.name || id);
    return `<div class="research-entry" data-tree-node="${item.id}" data-tree-requires="${guideEscape((requirements.length ? requirements : [def.id]).join(' '))}"><strong>${guideEscape(item.name)}</strong><p>${guideEscape(item.description)}</p><small>Requires: ${guideEscape(names.length ? names.join(' + ') : def.name)}</small><small>Base: $${item.cost ?? SPECIALIZED_RESEARCH_COST} · ${item.duration ?? SPECIALIZED_RESEARCH_DURATION}s${item.configured === false ? ' · Not available yet' : ''}</small></div>`;
  }).join('')}</div>` : '').join('')}</div></div>`;
}

// Measure only expanded trees. Variable-height cards retain every effect;
// connectors use their actual bounds instead of assuming fixed text heights.
function drawGuideTree(tree) {
  if (!tree || !tree.closest('details')?.open) return;
  const rect = tree.getBoundingClientRect(), svg=tree.querySelector('.tree-edges');
  const nodes = new Map([...tree.querySelectorAll('[data-tree-node]')].map(node=>[node.dataset.treeNode,node]));
  const paths=[];
  for (const node of nodes.values()) for (const parentId of (node.dataset.treeRequires || '').split(' ').filter(Boolean)) {
    const parent=nodes.get(parentId); if (!parent) continue;
    const from=parent.getBoundingClientRect(), to=node.getBoundingClientRect();
    const x1=from.right-rect.left, y1=from.top+from.height/2-rect.top, x2=to.left-rect.left, y2=to.top+to.height/2-rect.top;
    const mid=(x1+x2)/2;
    paths.push(`<path d="M${x1} ${y1} C${mid} ${y1},${mid} ${y2},${x2-6} ${y2}"/><path d="M${x2-10} ${y2-4}L${x2-3} ${y2}L${x2-10} ${y2+4}"/>`);
  }
  svg.setAttribute('width',String(tree.scrollWidth)); svg.setAttribute('height',String(tree.scrollHeight));
  svg.innerHTML=`<g fill="none" stroke="#69b9ac" stroke-width="1.5">${paths.join('')}</g>`;
}

function renderDoctrineGuide() {
  const icons=['militaryBase','droneHub','advancedEngineeringComplex','missileLaunchSite','radarStation','energyGenerator','militaryCommand','airbase','superiorMobilizationComplex'];
  const container=document.getElementById('doctrineGuide');
  container.innerHTML=Object.values(DOCTRINE_RESEARCH).sort((a,b)=>a.order-b.order).map((def,index)=>{
    const guide=DOCTRINE_GUIDE[def.id];
    const research=Object.values(SPECIALIZED_RESEARCH).filter(item=>item.doctrine===def.id).sort((a,b)=>String(a.lane||'').localeCompare(String(b.lane||'')) || a.order-b.order);
    const effects=[...(def.immediateEffects || [])].map(effect=>effect.replace('+30% mechanized training speed','30% shorter mechanized training time').replace('+30% global research speed','30% shorter global research time').replace('+30% aircraft turnaround speed','30% shorter aircraft turnaround'));
    return `<article class="doctrine-card" id="doctrine-${def.id}"><div class="doctrine-heading">${fieldSymbol(icons[index])}<div><span class="tag">DOCTRINE ${String(def.order).padStart(2,'0')}</span><h3>${guideEscape(def.name)}</h3></div></div><p>${guideEscape(guide.use)}</p><div class="doctrine-brief"><div><h4>Immediate</h4>${effects.length ? `<ul class="effect-chips">${effects.map(effect=>`<li>${guideEscape(effect)}</li>`).join('')}</ul>` : '<p>Opens its research tree. Research stations separately.</p>'}</div><div><h4>Research next</h4><p>${guideEscape(guide.later)}</p></div></div><details><summary>Complete tech tree · ${research.length} research nodes</summary><p class="tree-hint">${guideEscape(guide.tip)} Scroll across and down. Arrows show prerequisites; multiple requirements must all be completed. Costs and times are before modifiers.</p>${guideTreeMarkup(def,research)}</details></article>`;
  }).join('');
  const cards=[...container.querySelectorAll('.doctrine-card')];
  const observer=typeof ResizeObserver === 'function' ? new ResizeObserver(entries=>entries.forEach(entry=>drawGuideTree(entry.target))) : null;
  for (const card of cards) {
    const details=card.querySelector('details'), tree=card.querySelector('.guide-tree');
    details.addEventListener('toggle',()=>{ if (details.open) { drawGuideTree(tree); observer?.observe(tree); } else observer?.unobserve(tree); });
  }
  const search=document.getElementById('guideSearch');
  search.addEventListener('input',()=>{
    const query=search.value.trim().toLowerCase(); let visible=0;
    for (const card of cards) { card.hidden=!card.textContent.toLowerCase().includes(query); if (!card.hidden) visible++; card.querySelector('details').open=!!query && !card.hidden; }
    document.getElementById('guideResults').textContent=`${visible} of ${cards.length} doctrines shown`;
  });
}
for (const [id,group] of [['guideBasics','basics'],['guideTerritory','territory'],['guideAdvanced','advanced']]) {
  document.getElementById(id).innerHTML=FIELD_LESSONS.filter(lesson=>lesson.group===group).map(fieldLessonMarkup).join('');
}
document.getElementById('guideCaptureDiagram').innerHTML=captureDiagramMarkup();
document.getElementById('guideObjective').innerHTML=fieldObjectiveMarkup();
document.getElementById('guideControls').innerHTML=fieldControlsMarkup();
renderDoctrineGuide();
