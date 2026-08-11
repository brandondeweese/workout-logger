<script>
  import { appState } from '../lib/state.svelte.js';
  import ProgressionChart from './ProgressionChart.svelte';

  // `phase` is optional - the Progress tab shows the whole program at once
  // with no "current phase" to compare against, so it omits it and every
  // entry renders plain (no "other phase" tag).
  let { exerciseId, phase = null } = $props();

  const tagAbbr = { warmup: 'wu', dropset: 'ds', failure: 'f' };

  // Spans the whole program's history for this exact exercise, not just the
  // current phase - phase-scoping meant the panel went blank every time a
  // new phase started (nothing logged yet this phase), hiding real recent
  // history right when a trend would matter most. `phase` is still passed
  // in per-entry so it can be flagged next to sessions from a different
  // phase than the one currently being viewed.
  const matches = $derived(
    appState.workoutLogs
      .filter(l => l.program_id === appState.activeProgram?.id
        && l.exercises.some(e => e.exerciseId === exerciseId))
      .sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO))
      .map(entry => {
        const ex = entry.exercises.find(e => e.exerciseId === exerciseId);
        const d = new Date(entry.dateISO);
        return {
          dateStr: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          sets: ex.sets,
          otherPhase: phase != null && entry.phase !== phase,
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
  <div class="prog-empty">No logs yet for this exercise.</div>
{:else}
  <ProgressionChart points={chartPoints} />
  {#each matches as entry}
    <div class="prog-row">
      <span class="prog-date">{entry.dateStr}{#if entry.otherPhase}<span class="prog-phase-tag"> other phase</span>{/if}</span>
      <span class="prog-sets">
        {#each entry.sets as s, i}{#if i > 0}, {/if}{s.weight || '-'}&times;{s.reps || '-'}{#if tagAbbr[s.tag]}<span class="prog-tag {s.tag}">{tagAbbr[s.tag]}</span>{/if}{/each}
      </span>
    </div>
  {/each}
{/if}
