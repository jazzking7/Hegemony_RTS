'use strict';

// UI drafts stay outside the deterministic game state. Rebuilding a panel for
// research, an order acknowledgement, or another player's action must not erase
// a half-written convoy, loadout, or automation definition.
const selectionEditorDrafts = new Map();
let renderedEditorEntityId = null;

function selectionFieldKey(field) {
  return Object.entries(field.dataset || {}).filter(([key]) => !['replaceOnType', 'selectOnPointerUp'].includes(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}:${value}`).join('|');
}

function rememberSelectionEditorDraft() {
  if (renderedEditorEntityId === null) return;
  const fields = new Map();
  els.selectionContent.querySelectorAll('input, select, textarea').forEach(field => {
    const key = selectionFieldKey(field);
    if (key) fields.set(key, { value:field.value, checked:field.checked });
  });
  selectionEditorDrafts.set(renderedEditorEntityId, { fields, scrollTop:els.selectionContent.scrollTop });
}

function restoreSelectionEditorDraft(entity) {
  renderedEditorEntityId = entity?.id ?? null;
  const draft = selectionEditorDrafts.get(renderedEditorEntityId);
  if (!draft) return;
  els.selectionContent.querySelectorAll('input, select, textarea').forEach(field => {
    const value = draft.fields.get(selectionFieldKey(field));
    if (!value) return;
    // Research may remove an option; do not turn a valid select into an empty one.
    if (field.tagName !== 'SELECT' || Array.from(field.options || []).some(o => o.value === value.value)) field.value = value.value;
    if (field.type === 'checkbox') field.checked = value.checked;
  });
  els.selectionContent.scrollTop = draft.scrollTop;
}

function clearSelectionEditorDraft(entityId) {
  selectionEditorDrafts.delete(entityId);
  if (renderedEditorEntityId === entityId) renderedEditorEntityId = null;
}

function commitSelectionEditor(action, onSuccess, button = document.activeElement) {
  const finish = result => {
    if (button) button.disabled = false;
    if (result === false || result?.ok === false) {
      notify(result?.reason || 'Unable to save this definition. Your entries have been kept.', 'warning', 4);
      return;
    }
    onSuccess?.(result);
  };
  const result = action();
  if (result?.queued && result.requestId) {
    if (button) button.disabled = true;
    notify('Save pending server confirmation. Your entries are kept.', 'good', 3);
    window.__FULL_NETWORK_BRIDGE__.onCommandResult(result.requestId, finish);
  } else finish(result);
}
