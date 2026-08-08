// In-progress workout draft: local-only crash recovery. This exists because of
// a real prior data-loss incident (a workout was in progress, the tab was lost,
// and nothing was persisted until the final "Save Workout" tap). Do not remove
// or weaken - see CONTEXT.md.

const DRAFT_KEY = 'workout-draft';

export function loadDraft(){
  try{
    const v = localStorage.getItem(DRAFT_KEY);
    return v ? JSON.parse(v) : null;
  }catch(e){ return null; }
}

export function saveDraft(draft){
  try{ localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }catch(e){ /* ignore */ }
}

export function clearDraft(){
  try{ localStorage.removeItem(DRAFT_KEY); }catch(e){ /* ignore */ }
}

let draftSaveTimer = null;
// collectFn returns the current draft snapshot (or null if nothing to save).
// Debounced ~400ms to match the original behavior exactly.
export function queueDraftSave(collectFn){
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(()=>{
    const state = collectFn();
    if(state) saveDraft(state);
  }, 400);
}
