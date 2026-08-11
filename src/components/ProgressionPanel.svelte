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

  // Working sets only. Warmups and dropsets aren't the real effort, and every
  // logged set carries a tag, so nothing untagged leaks through.
  function workingSets(sets){
    return sets
      .filter(s => s.tag !== 'warmup' && s.tag !== 'dropset')
      .map(s => ({ w: parseFloat(s.weight), r: parseInt(s.reps, 10) }))
      .filter(s => !isNaN(s.w) && !isNaN(s.r) && s.r > 0);
  }

  const allSets = $derived(matches.flatMap(m => workingSets(m.sets)));

  // Pick the metric from how the exercise is actually trained, rather than
  // forcing one on everything:
  //
  //  - Loaded and mostly <=10 reps  -> estimated 1RM. Every 1RM formula is
  //    fitted to 1-10 reps and inflates non-uniformly above that, so it's only
  //    offered where the rep range supports it. This is where the compounds
  //    land (bench/squat/press all sit at 5-8).
  //  - Loaded, higher reps          -> volume load. Calves, abs, lateral
  //    raises and cable work live at 12-22 reps, where an e1RM would be
  //    fiction. Volume is a direct measurement with no model behind it.
  //  - Unloaded (bodyweight/TRX)    -> total reps, since every weight is 0 and
  //    volume load would be a flat line at zero.
  const metric = $derived.by(() => {
    if(!allSets.length) return null;
    if(allSets.every(s => s.w === 0)) return 'reps';
    const lowRepShare = allSets.filter(s => s.r <= 10).length / allSets.length;
    return lowRepShare >= 0.7 ? 'e1rm' : 'volume';
  });

  const metricLabel = $derived(
    metric === 'e1rm' ? 'Est. 1RM (lbs)'
    : metric === 'volume' ? 'Volume load (lbs)'
    : metric === 'reps' ? 'Total reps'
    : ''
  );

  const metricNote = $derived(
    metric === 'e1rm' ? 'weight and reps combined - trained heavy enough for this to hold'
    : metric === 'volume' ? 'weight × reps - trained too high-rep for a 1RM estimate to mean anything'
    : metric === 'reps' ? 'bodyweight movement, so reps are the load'
    : ''
  );

  // Epley. Restricted to <=10-rep sets in e1rm mode - a stray high-rep set
  // would otherwise spike the estimate and read as a PR.
  function e1rm(s){ return s.w * (1 + s.r / 30); }

  const chartPoints = $derived(
    matches
      .map(m => {
        const sets = workingSets(m.sets);
        if(!sets.length) return null;
        let value;
        if(metric === 'e1rm'){
          const valid = sets.filter(s => s.r <= 10);
          if(!valid.length) return null;
          value = Math.round(Math.max(...valid.map(e1rm)) * 10) / 10;
        } else if(metric === 'volume'){
          value = sets.reduce((sum, s) => sum + s.w * s.r, 0);
        } else {
          value = sets.reduce((sum, s) => sum + s.r, 0);
        }
        return { label: m.dateStr, value };
      })
      .filter(Boolean)
  );
</script>

{#if !matches.length}
  <div class="prog-empty">No logs yet for this exercise.</div>
{:else}
  {#if metricLabel}
    <div class="cardio-chart-label">{metricLabel}</div>
  {/if}
  <ProgressionChart points={chartPoints} />
  {#if metricNote}
    <div class="metric-note">{metricNote}</div>
  {/if}
  {#each matches as entry}
    <div class="prog-row">
      <span class="prog-date">{entry.dateStr}{#if entry.otherPhase}<span class="prog-phase-tag"> other phase</span>{/if}</span>
      <span class="prog-sets">
        {#each entry.sets as s, i}{#if i > 0}, {/if}{s.weight || '-'}&times;{s.reps || '-'}{#if tagAbbr[s.tag]}<span class="prog-tag {s.tag}">{tagAbbr[s.tag]}</span>{/if}{/each}
      </span>
    </div>
  {/each}
{/if}
