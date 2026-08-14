<script>
  import { appState } from '../lib/state.svelte.js';
  import SetRow from './SetRow.svelte';
  import ProgressionPanel from './ProgressionPanel.svelte';

  let {
    exercise,      // plain read-only { exerciseId, name, target, sets: [...] } - LogWorkout owns the data
    exIdx,
    phase,
    increment,
    locked,
    openMenuKey,
    catalog,        // { movements, equipment, movementEquipment } - for the swap picker
    onToggleMenu,
    onCheckSet,
    onAutoStartRest,
    onSetField,     // (setIdx, field, value) => void
    onAddSet,       // () => void
    onRemoveSet,    // (setIdx) => void
    onSwapExercise, // (movementId, equipmentId) => void
    onRemoveExercise, // () => void
  } = $props();

  function removeExercise(e){
    e.stopPropagation();
    onRemoveExercise();
  }

  let swapMovementId = $state('');
  let swapEquipmentId = $state('');
  const swapMenuKey = $derived(`swap-${exIdx}`);
  const swapEquipmentOptions = $derived(swapMovementId ? (catalog.movementEquipment[swapMovementId] || []) : []);
  function onSwapMovementChange(){ swapEquipmentId = ''; }
  function openSwapPanel(e){
    e.stopPropagation();
    swapMovementId = ''; swapEquipmentId = '';
    onToggleMenu(swapMenuKey);
  }
  function confirmSwap(e){
    e.stopPropagation();
    if(!swapMovementId || !swapEquipmentId) return;
    onSwapExercise(parseInt(swapMovementId, 10), parseInt(swapEquipmentId, 10));
  }

  // Purely presentational UI state - not workout data, so not part of the
  // draft-saved tree (matches the original, which also always started every
  // exercise collapsed/on-the-Log-subtab on every fresh render).
  let collapsed = $state(true);
  let activeTab = $state('log');

  /** @param {string} str */
  function parseLeadingNumber(str){
    const m = (str || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  function findLastSet(exerciseId, logs){
    for(let i = logs.length - 1; i >= 0; i--){
      const match = logs[i].exercises.find(e => e.exerciseId === exerciseId);
      if(match && match.sets.length){
        const working = match.sets.filter(s => !s.tag || s.tag === 'working' || s.tag === 'dropset' || s.tag === 'failure');
        if(working.length) return working[working.length - 1];
        return match.sets[match.sets.length - 1];
      }
    }
    return null;
  }

  const lastSet = $derived(findLastSet(exercise.exerciseId, appState.workoutLogs));

  const suggestion = $derived.by(() => {
    if(!lastSet || !lastSet.weight) return '';
    const lastW = parseFloat(lastSet.weight);
    const lastR = parseInt(lastSet.reps, 10);
    if(isNaN(lastW)) return '';
    // Just the verdict. The last session's sets are a tap away on the
    // Progression subtab, so restating them here only crowded the line.
    const targetReps = parseLeadingNumber(exercise.target);
    return (!isNaN(lastR) && targetReps && lastR >= targetReps)
      ? `try ${lastW + increment}`
      : `hold at ${lastW}`;
  });

  // Display names are built as "Movement (Equipment)" by resolveOrCreateExercise,
  // so split them to give the movement the headline and drop the equipment to a
  // quieter line beneath. Anything without that shape (older hand-entered names)
  // just renders whole, with no second line.
  const nameParts = $derived.by(() => {
    const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(exercise.name || '');
    return m ? { movement: m[1], equipment: m[2] } : { movement: exercise.name, equipment: null };
  });

  const doneCount = $derived(exercise.sets.filter(s => s.checked).length);
  const totalCount = $derived(exercise.sets.length);
  const complete = $derived(doneCount === totalCount && totalCount > 0);

  function toggleCollapsed(){ collapsed = !collapsed; }
  /** @param {MouseEvent} e @param {string} tab */
  function setTab(e, tab){ e.stopPropagation(); activeTab = tab; }
</script>

<div class="exercise" class:collapsed={collapsed} class:complete={complete}>
  <div class="ex-head" onclick={toggleCollapsed}>
    <!--
      Only the name and controls share a row. The meta and suggestion lines sit
      below as full-width siblings - inside the flex row they were squeezed into
      whatever the controls left over.
    -->
    <div class="ex-head-top">
      <div class="ex-name">{nameParts.movement}</div>
      <div class="ex-right">
        <button type="button" class="icon-btn" onclick={openSwapPanel} aria-label="Swap exercise" title="Swap exercise">&#8646;</button>
        <button type="button" class="icon-btn danger" onclick={removeExercise} aria-label="Remove exercise" title="Remove exercise">&times;</button>
      </div>
    </div>
    <div class="ex-meta">
      <span class="tally">{doneCount}/{totalCount} sets</span>
      {#if nameParts.equipment}<span class="ex-equipment">{nameParts.equipment}</span>{/if}
    </div>
    <div class="ex-meta">
      <span class="ex-target">{totalCount} sets &middot; {exercise.target}</span>
      {#if suggestion}<span class="suggestion">{suggestion}</span>{/if}
    </div>
  </div>
  {#if openMenuKey === swapMenuKey}
    <div class="swap-panel" onclick={(e) => e.stopPropagation()}>
      <select class="text-select" bind:value={swapMovementId} onchange={onSwapMovementChange}>
        <option value="">Swap to movement…</option>
        {#each catalog.movements as m}<option value={m.id}>{m.name}</option>{/each}
      </select>
      <select class="text-select" bind:value={swapEquipmentId} disabled={!swapEquipmentOptions.length}>
        <option value="">Equipment…</option>
        {#each swapEquipmentOptions as e}<option value={e.id}>{e.name}</option>{/each}
      </select>
      <div class="swap-panel-actions">
        <button type="button" class="link-btn" disabled={!swapMovementId || !swapEquipmentId} onclick={confirmSwap}>Confirm Swap</button>
        <button type="button" class="link-btn muted" onclick={(e) => { e.stopPropagation(); onToggleMenu(null); }}>Cancel</button>
      </div>
    </div>
  {/if}

  <div class="ex-rows">
    <div class="ex-subtabs">
      <div class="ex-subtab" class:active={activeTab === 'log'} onclick={(e) => setTab(e, 'log')}>Log</div>
      <div class="ex-subtab" class:active={activeTab === 'progression'} onclick={(e) => setTab(e, 'progression')}>Progression</div>
    </div>

    <div class="ex-panel" class:active={activeTab === 'log'}>
      <div class="set-headers">
        <div class="sh sh-set">Set</div>
        <div class="sh sh-field">Lbs</div>
        <div class="sh sh-field">Reps</div>
        <div class="sh sh-check"></div>
        <div class="sh sh-rm"></div>
      </div>
      <div class="sets-list">
        {#each exercise.sets as set, setIdx (setIdx)}
          <SetRow
            bind:weight={exercise.sets[setIdx].weight}
            bind:reps={exercise.sets[setIdx].reps}
            tag={set.tag}
            checked={set.checked}
            setNum={setIdx + 1}
            {locked}
            menuOpen={openMenuKey === `${exIdx}-${setIdx}`}
            onToggleMenu={() => onToggleMenu(`${exIdx}-${setIdx}`)}
            onTagSelect={(tag) => { onSetField(setIdx, 'tag', tag); onToggleMenu(null); }}
            onCheck={() => onCheckSet(setIdx)}
            onRemove={() => onRemoveSet(setIdx)}
            onAutoStartRest={() => onAutoStartRest(exercise.restSec)}
          />
        {/each}
      </div>
      <button type="button" class="add-set-btn" onclick={onAddSet}>+ Add Set</button>
    </div>

    <div class="ex-panel" class:active={activeTab === 'progression'}>
      <ProgressionPanel exerciseId={exercise.exerciseId} {phase} />
    </div>
  </div>
</div>
