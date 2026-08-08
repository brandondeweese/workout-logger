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
    onToggleMenu,
    onCheckSet,
    onAutoStartRest,
    onSetField,     // (setIdx, field, value) => void
    onAddSet,       // () => void
    onRemoveSet,    // (setIdx) => void
  } = $props();

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
    const targetReps = parseLeadingNumber(exercise.target);
    const verdict = (!isNaN(lastR) && targetReps && lastR >= targetReps)
      ? `try ${lastW + increment}`
      : `hold at ${lastW}`;
    return `Last: ${lastSet.weight}×${lastSet.reps || '-'} → ${verdict}`;
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
    <div>
      <div class="ex-name">{exercise.name}</div>
      <div class="ex-target">{totalCount} sets &middot; {exercise.target}</div>
      {#if suggestion}<div class="suggestion">{suggestion}</div>{/if}
    </div>
    <div class="ex-right">
      <div class="tally">{doneCount}/{totalCount} sets</div>
      <span class="chevron">&#9662;</span>
    </div>
  </div>

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
            {onAutoStartRest}
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
