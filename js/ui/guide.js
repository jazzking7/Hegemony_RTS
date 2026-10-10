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

function renderDoctrineGuide() {
  const container = document.getElementById('doctrineGuide');
  container.innerHTML = Object.values(DOCTRINE_RESEARCH).sort((a,b) => a.order - b.order).map(def => {
    const guide = DOCTRINE_GUIDE[def.id];
    const research = Object.values(SPECIALIZED_RESEARCH).filter(item => item.doctrine === def.id).sort((a,b) => String(a.lane || '').localeCompare(String(b.lane || '')) || a.order - b.order);
    const effects = [...(def.immediateEffects || [])].map(effect => effect
      .replace('+30% mechanized training speed', '30% shorter mechanized training time')
      .replace('+30% global research speed', '30% shorter global research time')
      .replace('+30% aircraft turnaround speed', '30% shorter aircraft turnaround'));
    return `<article class="doctrine-card" id="doctrine-${def.id}"><span class="tag">DOCTRINE ${String(def.order).padStart(2,'0')}</span><h3>${guideEscape(def.name)}</h3><p>${guideEscape(guide.use)}</p><h4>On completion</h4>${effects.length ? `<ul>${effects.map(effect => `<li>${guideEscape(effect)}</li>`).join('')}</ul>` : '<p>Opens the specialized research tree. Stations require their own unlock research.</p>'}<h4>Later research unlocks & improves</h4><p>${guideEscape(guide.later)}</p><h4>Try it</h4><p>${guideEscape(guide.tip)}</p><details><summary>All ${research.length} specialized research entries</summary>${research.map(item => {
      const requirements = (item.requirements?.research || []).map(id => SPECIALIZED_RESEARCH[id]?.name || DOCTRINE_RESEARCH[id]?.name || id);
      return `<div class="research-entry"><strong>${guideEscape(item.name)}</strong><p>${guideEscape(item.description)}</p><small>Requires: ${guideEscape([def.name, ...requirements].join(' → '))}</small><small>Base: $${item.cost ?? SPECIALIZED_RESEARCH_COST} · ${item.duration ?? SPECIALIZED_RESEARCH_DURATION}s${item.configured === false ? ' · Not available yet' : ''}</small></div>`;
    }).join('')}</details></article>`;
  }).join('');
  const cards = Array.from(container.querySelectorAll('.doctrine-card'));
  const search = document.getElementById('guideSearch');
  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    for (const card of cards) {
      card.hidden = !card.textContent.toLowerCase().includes(query);
      if (!card.hidden) visible++;
      if (query && !card.hidden) card.querySelector('details').open = true;
      else if (!query) card.querySelector('details').open = false;
    }
    document.getElementById('guideResults').textContent = `${visible} of ${cards.length} doctrines shown`;
  });
}
renderDoctrineGuide();
