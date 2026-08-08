<script>
  import { appState, refreshWorkoutLogs } from '../lib/state.svelte.js';
  import { deleteLog } from '../lib/db.js';

  let { active } = $props();

  let openId = $state(null);

  // History stays mounted (never unmounted) so it can't rely on onMount alone -
  // refetch whenever this tab becomes visible, matching the original's
  // "refetch on every tab switch" behavior.
  $effect(() => {
    if(active) refreshWorkoutLogs();
  });

  const logs = $derived(appState.workoutLogs.slice().reverse());

  function fmtDate(iso){
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function toggleOpen(id){
    openId = (openId === id) ? null : id;
  }

  async function handleDelete(e, id){
    e.stopPropagation();
    await deleteLog(id);
    await refreshWorkoutLogs();
  }
</script>

{#if !logs.length}
  <div class="empty">No workouts logged yet.</div>
{:else}
  {#each logs as entry (entry.id)}
    <div class="hist-entry">
      <div class="hist-top" onclick={() => toggleOpen(entry.id)}>
        <div>
          <div class="hist-date">{fmtDate(entry.dateISO)}</div>
          <div class="hist-meta">{entry.program_name} &middot; {entry.phase} &middot; {entry.day}{entry.durationMin ? ` · ${entry.durationMin} min` : ''}</div>
        </div>
        <div class="hist-meta">{entry.exercises.length} exercises</div>
      </div>
      <div class="hist-detail" class:open={openId === entry.id}>
        {#each entry.exercises as ex}
          <div class="hist-ex"><b>{ex.name}:</b> <span>{ex.sets.map(s => `${s.weight || '-'}×${s.reps || '-'}`).join(', ')}</span></div>
        {/each}
        <button class="del" onclick={(e) => handleDelete(e, entry.id)}>Delete entry</button>
      </div>
    </div>
  {/each}
{/if}
