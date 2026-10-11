'use strict';
let quickReadReturnFocus = null;
function isQuickReadOpen() { return !document.getElementById('quickReadModal').classList.contains('hidden'); }
function renderQuickRead(group = 'basics') {
  document.getElementById('quickReadContent').innerHTML = `<div class="quick-tabs" role="group" aria-label="Quick read topic">${['basics','controls','territory','advanced'].map(id=>`<button type="button" data-quick-topic="${id}" aria-pressed="${id===group}">${id.toUpperCase()}</button>`).join('')}</div>${group === 'basics' ? fieldObjectiveMarkup() : ''}${group === 'controls' ? fieldControlsMarkup() : ''}${group === 'territory' ? captureDiagramMarkup() : ''}<div class="field-lessons">${FIELD_LESSONS.filter(l=>l.group===group).map(fieldLessonMarkup).join('')}</div><p class="quick-keys">Press <kbd>H</kbd> or <kbd>Esc</kbd> to close. Open the Controls tab for mouse and keyboard instructions.</p>`;
  document.querySelectorAll('[data-quick-topic]').forEach(button => button.addEventListener('click', () => { renderQuickRead(button.dataset.quickTopic); document.querySelector(`[data-quick-topic="${button.dataset.quickTopic}"]`)?.focus(); }));
}
function toggleQuickRead() {
  if (isQuickReadOpen()) { closeQuickRead(); return; }
  if (!game.started || game.over) return;
  quickReadReturnFocus = document.activeElement;
  closeResearchModal(); closeAttackModal();
  game.keys.clear(); game.drag.active = false;
  renderQuickRead();
  document.getElementById('quickReadModal').classList.remove('hidden');
  document.getElementById('quickReadButton').setAttribute('aria-expanded','true');
  document.getElementById('closeQuickRead').focus();
}
function closeQuickRead(restoreFocus = true) {
  document.getElementById('quickReadModal')?.classList.add('hidden');
  document.getElementById('quickReadButton')?.setAttribute('aria-expanded','false');
  if (restoreFocus && quickReadReturnFocus?.isConnected) quickReadReturnFocus.focus();
  quickReadReturnFocus = null;
}
function trapQuickReadFocus(event) {
  const buttons = [...document.getElementById('quickReadModal').querySelectorAll('button')];
  const first = buttons[0], last = buttons[buttons.length-1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
document.getElementById('quickReadButton').addEventListener('click', toggleQuickRead);
document.getElementById('closeQuickRead').addEventListener('click', () => closeQuickRead());
document.getElementById('quickReadModal').addEventListener('click', event => { if (event.target === event.currentTarget) closeQuickRead(); });
document.getElementById('captureDetailsButton').addEventListener('click', event => {
  game.captureDetails = !game.captureDetails;
  event.currentTarget.setAttribute('aria-pressed',String(game.captureDetails));
});
