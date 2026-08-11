<script>
  import { appState, refreshWorkoutLogs } from '../lib/state.svelte.js';
  import ProgressionPanel from './ProgressionPanel.svelte';

  let { active } = $props();

  // Progress stays mounted (never unmounted) so it can't rely on onMount alone -
  // refetch whenever this tab becomes visible, matching History/Programs.
  $effect(() => {
    if(active) refreshWorkoutLogs();
  });

  let bodyPart = $state('all');
  let openId = $state(null); // exerciseId of the one expanded card, or null - all start collapsed

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

  // Options for the filter dropdown - only body parts actually present among
  // logged exercises, so the filter never offers a choice that returns nothing.
  const bodyPartOptions = $derived.by(() => {
    const set = new Set();
    loggedExercises.forEach(ex => ex.bodyParts.forEach(bp => set.add(bp)));
    return Array.from(set).sort();
  });

  const visibleExercises = $derived(
    bodyPart === 'all' ? loggedExercises : loggedExercises.filter(ex => ex.bodyParts.includes(bodyPart))
  );

  function toggleOpen(id){
    openId = (openId === id) ? null : id;
  }
</script>

{#if !appState.activeProgram}
  <div class="empty">No active program. Set one active in the Programs tab.</div>
{:else if !loggedExercises.length}
  <div class="empty">No workouts logged yet for this program.</div>
{:else}
  {#if bodyPartOptions.length}
    <div class="select-group">
      <div class="select-label">Filter by Body Part</div>
      <select class="text-select" bind:value={bodyPart}>
        <option value="all">All body parts</option>
        {#each bodyPartOptions as bp}<option value={bp}>{bp}</option>{/each}
      </select>
    </div>
  {/if}

  {#if !visibleExercises.length}
    <div class="empty">No logged exercises for this body part.</div>
  {:else}
    {#each visibleExercises as ex (ex.exerciseId)}
      <div class="exercise" class:collapsed={openId !== ex.exerciseId}>
        <div class="ex-head" onclick={() => toggleOpen(ex.exerciseId)}>
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
