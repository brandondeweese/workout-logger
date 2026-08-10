<script>
  import { appState } from '../lib/state.svelte.js';
  import ProgressionChart from './ProgressionChart.svelte';

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

  // Top weight per session (warmup/dropset excluded - not the true working
  // effort) is the chart line: the plainest "am I lifting more over time"
  // read, no normalization tricks that need explaining.
  const chartPoints = $derived(
    matches
      .map(m => {
        const weights = m.sets
          .filter(s => s.tag !== 'warmup' && s.tag !== 'dropset')
          .map(s => parseFloat(s.weight))
          .filter(w => !isNaN(w));
        return weights.length ? { label: m.dateStr, value: Math.max(...weights) } : null;
      })
      .filter(Boolean)
  );
</script>

{#if !matches.length}
  <div class="prog-empty">No logs yet this phase.</div>
{:else}
  <ProgressionChart points={chartPoints} />
  {#each matches as entry}
    <div class="prog-row">
      <span class="prog-date">{entry.dateStr}</span>
      <span class="prog-sets">
        {#each entry.sets as s, i}{#if i > 0}, {/if}{s.weight || '-'}&times;{s.reps || '-'}{#if tagAbbr[s.tag]}<span class="prog-tag {s.tag}">{tagAbbr[s.tag]}</span>{/if}{/each}
      </span>
    </div>
  {/each}
{/if}
