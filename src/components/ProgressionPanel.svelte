<script>
  import { appState } from '../lib/state.svelte.js';

  let { exerciseId, phase } = $props();

  const tagAbbr = { warmup: 'wu', dropset: 'ds', failure: 'f' };

  const matches = $derived(
    appState.workoutLogs
      .filter(l => l.program_id === appState.activeProgram?.id
        && l.phase === phase
        && l.exercises.some(e => e.exerciseId === exerciseId))
      .sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO))
      .map(entry => {
        const ex = entry.exercises.find(e => e.exerciseId === exerciseId);
        const d = new Date(entry.dateISO);
        return {
          dateStr: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          sets: ex.sets,
        };
      })
  );
</script>

{#if !matches.length}
  <div class="prog-empty">No logs yet this phase.</div>
{:else}
  {#each matches as entry}
    <div class="prog-row">
      <span class="prog-date">{entry.dateStr}</span>
      <span class="prog-sets">
        {#each entry.sets as s, i}{#if i > 0}, {/if}{s.weight || '-'}&times;{s.reps || '-'}{#if tagAbbr[s.tag]}<span class="prog-tag {s.tag}">{tagAbbr[s.tag]}</span>{/if}{/each}
      </span>
    </div>
  {/each}
{/if}
