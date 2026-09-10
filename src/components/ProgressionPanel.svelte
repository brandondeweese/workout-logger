<script>
  import { appState } from '../lib/state.svelte.js';
  import ProgressionChart from './ProgressionChart.svelte';

  // `phase` is optional - the Progress tab shows the whole program at once
  // with no "current phase" to compare against, so it omits it.
  let { exerciseId, phase = null } = $props();

  const tagAbbr = { warmup: 'wu', dropset: 'ds', failure: 'f' };

  // At least six months, and in practice everything on record.
  //
  // This used to be scoped to the active program, which quietly made the panel
  // useless exactly when it mattered: a new block starts, and a lift with two
  // years of history renders one point. An exercise is the same exercise
  // whichever block it sits in - the same reason lastLoggedSetsFor stopped
  // scoping to the program - so the whole history is in scope and the program
  // is shown as context rather than used as a filter.
  const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;
  const floorMs = Date.now() - SIX_MONTHS_MS;

  const matches = $derived(
    appState.workoutLogs
      .filter(l => l.exercises.some(e => e.exerciseId === exerciseId))
      .sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO))
      .map(entry => {
        const ex = entry.exercises.find(e => e.exerciseId === exerciseId);
        const d = new Date(entry.dateISO);
        return {
          ms: d.getTime(),
          dateStr: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          yearStr: String(d.getFullYear()),
          sets: ex.sets,
          programId: entry.program_id,
          programName: entry.program_name || 'Unprogrammed',
          entryPhase: entry.phase,
          isCurrentProgram: entry.program_id === appState.activeProgram?.id,
          otherPhase: phase != null && entry.program_id === appState.activeProgram?.id
                       && entry.phase !== phase,
        };
      })
  );

  const oldestMs = $derived(matches.length ? matches[0].ms : null);
  // Only worth saying when the record is shorter than the window we promise.
  const shortHistory = $derived(oldestMs != null && oldestMs > floorMs);

  // Consecutive runs of the same program, in order, so the list can carry a
  // header per block instead of repeating the name on every row.
  const groups = $derived.by(() => {
    const out = [];
    for(const m of matches){
      const last = out[out.length - 1];
      if(last && last.programId === m.programId) last.entries.push(m);
      else out.push({
        programId: m.programId,
        programName: m.programName,
        isCurrent: m.isCurrentProgram,
        entries: [m],
      });
    }
    return out;
  });

  const loadMetric = $derived(appState.exerciseLoadMetric?.[exerciseId] || 'weight');

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
  //  - Height-measured (box jump)   -> best height. Nothing else applies; the
  //    number in the load field is inches, not pounds.
  //  - Loaded and mostly <=10 reps  -> estimated 1RM. Every 1RM formula is
  //    fitted to 1-10 reps and inflates non-uniformly above that, so it's only
  //    offered where the rep range supports it.
  //  - Loaded, higher reps          -> volume load. Calves, abs, lateral
  //    raises and cable work live at 12-22 reps, where an e1RM would be
  //    fiction. Volume is a direct measurement with no model behind it.
  //  - Unloaded (bodyweight/TRX)    -> total reps, since every weight is 0 and
  //    volume load would be a flat line at zero.
  const metric = $derived.by(() => {
    if(!allSets.length) return null;
    if(loadMetric === 'height_in') return 'height';
    if(allSets.every(s => s.w === 0)) return 'reps';
    const lowRepShare = allSets.filter(s => s.r <= 10).length / allSets.length;
    return lowRepShare >= 0.7 ? 'e1rm' : 'volume';
  });

  const metricLabel = $derived(
    metric === 'e1rm' ? 'Est. 1RM (lbs)'
    : metric === 'volume' ? 'Volume load (lbs)'
    : metric === 'reps' ? 'Total reps'
    : metric === 'height' ? 'Best box height (in)'
    : ''
  );

  const metricNote = $derived(
    metric === 'e1rm' ? 'weight and reps combined - trained heavy enough for this to hold'
    : metric === 'volume' ? 'weight × reps - trained too high-rep for a 1RM estimate to mean anything'
    : metric === 'reps' ? 'bodyweight movement, so reps are the load'
    : metric === 'height' ? 'tallest box cleared - height is the progression, not load'
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
        } else if(metric === 'height'){
          value = Math.max(...sets.map(s => s.w));
        } else {
          value = sets.reduce((sum, s) => sum + s.r, 0);
        }
        return { label: m.dateStr, value, current: m.isCurrentProgram };
      })
      .filter(Boolean)
  );

  // Where the current block starts, so the chart can rule a line there and the
  // trend inside it is legible against what came before.
  const dividerIndex = $derived.by(() => {
    const i = chartPoints.findIndex(p => p.current);
    // No line when every point is current - there is nothing to divide from.
    return i > 0 ? i : null;
  });

  const currentCount = $derived(matches.filter(m => m.isCurrentProgram).length);
</script>

{#if !matches.length}
  <div class="prog-empty">No logs yet for this exercise.</div>
{:else}
  {#if metricLabel}
    <div class="cardio-chart-label">{metricLabel}</div>
  {/if}
  <ProgressionChart points={chartPoints} {dividerIndex} />
  {#if metricNote}
    <div class="metric-note">{metricNote}</div>
  {/if}

  <div class="prog-scope">
    {matches.length} session{matches.length === 1 ? '' : 's'} on record&nbsp;&middot;&nbsp;{currentCount} in this program{#if shortHistory}&nbsp;&middot;&nbsp;all of it newer than 6 months{/if}
  </div>

  {#each groups as g}
    <div class="prog-group-head" class:current={g.isCurrent}>
      <span class="prog-group-name">{g.programName}</span>
      {#if g.isCurrent}<span class="prog-current-badge">current</span>{/if}
      <span class="prog-group-count">{g.entries.length}</span>
    </div>
    {#each g.entries as entry}
      <div class="prog-row" class:dim={!g.isCurrent}>
        <span class="prog-date">{entry.dateStr}{#if entry.otherPhase}<span class="prog-phase-tag"> other phase</span>{/if}</span>
        <span class="prog-sets">
          {#each entry.sets as s, i}{#if i > 0}, {/if}{s.weight || '-'}&times;{s.reps || '-'}{#if tagAbbr[s.tag]}<span class="prog-tag {s.tag}">{tagAbbr[s.tag]}</span>{/if}{/each}
        </span>
      </div>
    {/each}
  {/each}
{/if}
