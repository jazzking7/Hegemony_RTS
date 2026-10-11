'use strict';

// Shared visual vocabulary: these are the same symbols as the build menu.
function fieldSymbol(type, label = '') {
  const def = BUILDINGS[type];
  return `<span class="field-symbol" aria-hidden="true">${def?.icon || type}</span>${label ? `<span>${label}</span>` : ''}`;
}
const FIELD_LESSONS = [
  { group:'basics', icon:'city', title:'1. Grow your income', steps:['Hover BUILD','Choose City','Click a valid location'], note:'Cities earn money automatically. Click a City, then Upgrade Economy to increase its income by 50% per level. Build within a Capital or Fortress construction range.' },
  { group:'basics', icon:'militaryBase', title:'2. Send troops to fight', steps:['Click a Military Base','Train troops','Point at a target and press A'], note:'Wait for training to finish. In the deployment window, choose a base, enter how many troops to send, and confirm. They travel to that target and fight automatically.' },
  { group:'basics', icon:'researchCenter', title:'3. Unlock new options', steps:['Press R','Choose a doctrine','Research its upgrades'], note:'A doctrine opens a technology tree. Complete the earlier research shown by its arrows to unlock later upgrades. Unlocking a building lets you place it from BUILD.' },
  { group:'territory', icon:'◎', title:'Take an unowned zone', steps:['Send ground troops into the circle','Stay for 20 seconds','Earn $200 per minute'], note:'The ring fills as you capture. An enemy in the circle pauses capture. If all your troops leave or die, your progress resets. Buildings also count; aircraft do not.' },
  { group:'territory', icon:'⚑', title:'Keep a zone you own', steps:['An enemy enters','Remove them within 10 seconds','Keep ownership'], note:'While an enemy is inside, the zone is contested and earns no money. If the enemy stays for 10 seconds, you lose ownership. Whoever remains alone must capture it again for 20 seconds.' },
  { group:'territory', icon:'⬡', title:'Earn a region bonus', steps:['Find zones with the same letter','Own every one','Earn an extra $100 per zone per minute'], note:'For example, a three-zone region earns $600 from its zones plus a $300 bonus. One contested zone stops the bonus. An owned zone left empty becomes neutral after 60 seconds.' },
  { group:'advanced', icon:'militaryCommand', title:'Save a troop group', steps:['Select a Military Command','Enter troop counts','Save Convoy'], note:'A convoy saves a group you can reuse. You must still train and deploy those troops. Research the Command doctrine to schedule several deployments in order.' },
  { group:'advanced', icon:'advancedCoordinationCenter', title:'Repeat attacks automatically', steps:['Unlock Automated Warfare','Build a Coordination Center','Choose a force and target'], note:'Set up the routine at a production facility, then click Initiate. Each routine costs money and uses part of the center’s capacity (bandwidth). Pause or cancel it at the center.' },
  { group:'advanced', icon:'superiorMobilizationComplex', title:'Customize Exosuit troops', steps:['Unlock and build a Mobilization Complex','Choose equipment and save a name','Train that saved loadout'], note:'A loadout is a saved equipment setup. Clear starts a new setup; Edit changes one you saved. Troops already trained keep their original equipment.' }
];
function fieldObjectiveMarkup() {
  return `<div class="field-objective"><h2>How do I win?</h2><p><strong>Destroy every enemy Capital while keeping yours alive.</strong> The Capital is the building marked with a star.</p><p>You lose if your Capital is destroyed. Build Cities to earn money, train troops, and send them to attack. Capture zones provide extra income; owning territory alone does not win the game.</p></div>`;
}
function fieldControlsMarkup() {
  const controls=[
    ['Drag / WASD / arrow keys','Move your view around the map.'],
    ['Mouse wheel','Zoom in or out.'],
    ['Left click','Select one of your buildings or a capture zone. Its controls appear on the right.'],
    ['Hover BUILD','Open the left build menu. Choose a structure, then click a valid place on the map.'],
    ['A','Point at a destination on the map, then press A to choose troops to send there.'],
    ['R','Open research to unlock units, buildings and upgrades.'],
    ['Esc','Close the current window or cancel the current action.'],
    ['Space','Pause or resume the game. In multiplayer, this pauses for everyone.'],
    ['H','Open or close Quick Read.'],
    ['T','Open missile aiming when you have a ready Missile Launch Site.']
  ];
  return `<section class="field-controls"><h2>Basic controls</h2><dl>${controls.map(([key,description])=>`<div><dt><kbd>${key}</kbd></dt><dd>${description}</dd></div>`).join('')}</dl></section>`;
}
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
    <circle cx="345" cy="100" r="37" fill="none" stroke="#67f0cc" stroke-width="4" stroke-dasharray="140 233" transform="rotate(-90 345 100)"/>
  </svg>`;
}
