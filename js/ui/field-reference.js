'use strict';

// Shared visual vocabulary: these are the same symbols as the build menu.
function fieldSymbol(type, label = '') {
  const def = BUILDINGS[type];
  return `<span class="field-symbol" aria-hidden="true">${def?.icon || type}</span>${label ? `<span>${label}</span>` : ''}`;
}
const FIELD_LESSONS = [
  { group:'basics', icon:'city', title:'Grow', steps:['Build City','Upgrade Economy','+50% / level'], note:'Build inside Capital or Fortress ranges. Territory does not extend them.' },
  { group:'basics', icon:'militaryBase', title:'Train → deploy', steps:['Select base','Train & wait','A → counts → deploy'], note:'Completed troops stay stored until deployed. Airbases work the same way.' },
  { group:'basics', icon:'researchCenter', title:'Research', steps:['R → doctrine','Follow arrows','Unlock & build'], note:'Capital: 2 slots. Doctrine base: $500 × 2 per start / 100s. Most upgrades: $100 / 60s.' },
  { group:'territory', icon:'◎', title:'Capture', steps:['Ground unit / building','Hold 20s','+$200/min'], note:'Rivals pause capture. Losing all your presence resets progress. Air units do not count.' },
  { group:'territory', icon:'⚑', title:'Defend', steps:['Rival enters','10s to clear','Otherwise → neutral'], note:'Contested = no zone income or region bonus. After revocation, capture again for 20s.' },
  { group:'territory', icon:'⬡', title:'Control', steps:['Empty: 60s grace','Own whole region','Extra N × $100/min'], note:'Territorial Control = owned polygon area / map area. Ownership lasts until revoked.' },
  { group:'advanced', icon:'militaryCommand', title:'Convoys & schedules', steps:['Command → counts','Save definition','Train → deploy'], note:'Saving alone does not launch troops. Multiplayer saves wait for confirmation. Schedules: Command doctrine.' },
  { group:'advanced', icon:'advancedCoordinationCenter', title:'Automated Warfare', steps:['Research & build center','Facility → force + target','Initiate routine'], note:'Needs fee + bandwidth. Uses stored troops first. Pause / cancel at the center.' },
  { group:'advanced', icon:'superiorMobilizationComplex', title:'Exosuit loadouts', steps:['Infantry → Complex','Configure & save','Train by name'], note:'Clear creates a new definition; Edit updates one. Existing troops keep their loadout.' }
];
function fieldLessonMarkup(lesson) {
  return `<article class="field-lesson"><h3>${fieldSymbol(lesson.icon)}${lesson.title}</h3><div class="field-flow">${lesson.steps.map((step,i)=>`${i ? '<span class="flow-arrow" aria-hidden="true">→</span>' : ''}<span class="flow-step">${step}</span>`).join('')}</div><p>${lesson.note}</p></article>`;
}
function captureDiagramMarkup() {
  return `<svg class="capture-diagram" viewBox="0 0 720 220" role="img" aria-label="A ground unit enters neutral zone A1, holds for 20 seconds, then owns its polygon territory and earns 200 dollars per minute.">
    <defs><pattern id="fieldGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#244047" stroke-width=".5"/></pattern></defs>
    <rect width="720" height="220" fill="url(#fieldGrid)"/>
    <g fill="#15282d" stroke="#668189"><path d="M20 32L122 18L208 63L191 180L58 195L20 130Z"/><path d="M265 32L367 18L453 63L436 180L303 195L265 130Z"/></g>
    <path d="M510 32L612 18L698 63L681 180L548 195L510 130Z" fill="#67f0cc22" stroke="#67f0cc" stroke-width="2"/>
    <g fill="#0d1c21" stroke="#88a4b0" stroke-width="2"><circle cx="100" cy="100" r="37"/><circle cx="345" cy="100" r="37"/><circle cx="590" cy="100" r="37" stroke="#67f0cc"/></g>
    <g fill="#67f0cc" stroke="#67f0cc"><path d="M32 98L43 107L32 116Z"/><path d="M327 99L338 108L327 117Z"/><path d="M572 99L583 108L572 117Z"/><path d="M63 110H84M223 106H246M468 106H492" fill="none" stroke-width="2"/></g>
    <g fill="#d4e8e4" font-family="system-ui" text-anchor="middle" font-size="13"><text x="100" y="94">A1</text><text x="345" y="94">A1</text><text x="590" y="94">A1</text><text x="113" y="165">ENTER</text><text x="358" y="165">HOLD 20s</text><text x="603" y="165">+$200 / MIN</text></g>
    <path d="M322 125H368" stroke="#29454c" stroke-width="5"/><path d="M322 125H350" stroke="#67f0cc" stroke-width="5"/>
  </svg>`;
}
