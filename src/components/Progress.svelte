<script>
  import { appState, refreshWorkoutLogs } from '../lib/state.svelte.js';
  import ProgressionPanel from './ProgressionPanel.svelte';
  import CardioPanel from './CardioPanel.svelte';

  let { active } = $props();

  // Progress stays mounted (never unmounted) so it can't rely on onMount alone -
  // refetch whenever this tab becomes visible, matching History/Programs.
  $effect(() => {
    if(active) refreshWorkoutLogs();
  });

  // 'all' | 'bp:<body part>' | 'cardio:<activity type>'
  let filter = $state('all');
  let openId = $state(null); // key of the one expanded card, or null - all start collapsed

  // Every exercise that appears anywhere in the active program's structure -
  // any phase, any day - deduped by exerciseId. This is deliberately NOT
  // scoped to whichever phase/day happens to be selected on Log Workout;
  // that's the whole point of this tab.
  const programExercises = $derived.by(() => {
    if(!appState.activeProgram) return [];
    const seen = new Map();
    for(const ph of appState.activeProgram.structure){
      for(const day of ph.days){
        for(const ex of day.exercises){
          if(!seen.has(ex.exerciseId)){
            seen.set(ex.exerciseId, appState.exercisesById[ex.exerciseId] || '(unknown exercise)');
          }
        }
      }
    }
    return Array.from(seen, ([exerciseId, name]) => ({
      exerciseId,
      name,
      bodyParts: appState.exerciseBodyParts[exerciseId] || [],
    }));
  });

  // Only exercises with at least one logged session - an empty chart for
  // every never-yet-done exercise in the split would bury the ones that
  // actually have a trend to show.
  const loggedExercises = $derived(
    programExercises
      .filter(ex => appState.workoutLogs.some(l =>
        l.program_id === appState.activeProgram?.id
        && l.exercises.some(e => e.exerciseId === ex.exerciseId)))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  // Cardio activity types are read off the logs themselves, not the program -
  // imported HealthKit sessions aren't part of any program structure.
  const cardioTypes = $derived.by(() => {
    const set = new Set();
    appState.workoutLogs.forEach(l => {
      if(l.metricsSource && l.activityType) set.add(l.activityType);
    });
    return Array.from(set).sort();
  });

  // Options for the filter dropdown - only body parts actually present among
  // logged exercises, so the filter never offers a choice that returns nothing.
  const bodyPartOptions = $derived.by(() => {
    const set = new Set();
    loggedExercises.forEach(ex => ex.bodyParts.forEach(bp => set.add(bp)));
    return Array.from(set).sort();
  });

  const selectedBodyPart = $derived(filter.startsWith('bp:') ? filter.slice(3) : null);
  const selectedCardio = $derived(filter.startsWith('cardio:') ? filter.slice(7) : null);

  const visibleExercises = $derived.by(() => {
    if(selectedCardio) return [];
    if(!selectedBodyPart) return loggedExercises;
    return loggedExercises.filter(ex => ex.bodyParts.includes(selectedBodyPart));
  });

  const visibleCardio = $derived.by(() => {
    if(selectedCardio) return cardioTypes.filter(t => t === selectedCardio);
    if(selectedBodyPart) return [];
    return cardioTypes;
  });

  const nothingVisible = $derived(!visibleExercises.length && !visibleCardio.length);

  function toggleOpen(key){
    openId = (openId === key) ? null : key;
  }
</script>

{#if !appState.activeProgram}
  <div class="empty">No active program. Set one active in the Programs tab.</div>
{:else if !loggedExercises.length && !cardioTypes.length}
  <div class="empty">No workouts logged yet for this program.</div>
{:else}
  {#if bodyPartOptions.length || cardioTypes.length}
    <div class="select-group">
      <div class="select-label">Filter</div>
      <select class="text-select" bind:value={filter}>
        <option value="all">Everything</option>
        {#if bodyPartOptions.length}
          <optgroup label="Body Part">
            {#each bodyPartOptions as bp}<option value="bp:{bp}">{bp}</option>{/each}
          </optgroup>
        {/if}
        {#if cardioTypes.length}
          <optgroup label="Cardio">
            {#each cardioTypes as t}<option value="cardio:{t}">{t}</option>{/each}
          </optgroup>
        {/if}
      </select>
    </div>
  {/if}

  {#if nothingVisible}
    <div class="empty">Nothing logged for this filter.</div>
  {:else}
    {#each visibleCardio as t (t)}
      <div class="exercise" class:collapsed={openId !== `cardio:${t}`}>
        <div class="ex-head" onclick={() => toggleOpen(`cardio:${t}`)}>
          <div class="ex-name">{t}</div>
          <span class="chevron">&#9662;</span>
        </div>
        <div class="ex-rows">
          <CardioPanel activityType={t} />
        </div>
      </div>
    {/each}

    {#each visibleExercises as ex (ex.exerciseId)}
      <div class="exercise" class:collapsed={openId !== `ex:${ex.exerciseId}`}>
        <div class="ex-head" onclick={() => toggleOpen(`ex:${ex.exerciseId}`)}>
          <div class="ex-name">{ex.name}</div>
          <span class="chevron">&#9662;</span>
        </div>
        <div class="ex-rows">
          <ProgressionPanel exerciseId={ex.exerciseId} />
        </div>
      </div>
    {/each}
  {/if}
{/if}
