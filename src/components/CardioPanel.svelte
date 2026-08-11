<script>
  import { appState } from '../lib/state.svelte.js';
  import ProgressionChart from './ProgressionChart.svelte';

  let { activityType } = $props();

  const METERS_PER_MILE = 1609.344;

  // Deliberately NOT scoped to the active program, unlike the strength panels.
  // A run is a run regardless of which lifting program happened to be active,
  // and program-scoping would blank this chart the day a new program starts -
  // the same failure mode phase-scoping had on ProgressionPanel.
  const sessions = $derived(
    appState.workoutLogs
      .filter(l => l.metricsSource && l.activityType === activityType)
      .sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO))
      .map(l => {
        const d = new Date(l.dateISO);
        const miles = l.distanceM != null ? l.distanceM / METERS_PER_MILE : null;
        return {
          id: l.id,
          dateStr: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          miles,
          durationMin: l.durationMin,
          // Pace only means something with real distance behind it - a treadmill
          // session logged without distance would otherwise divide into nonsense.
          paceMinPerMi: (miles != null && miles >= 0.05 && l.durationMin) ? l.durationMin / miles : null,
          hrAvg: l.hrAvgBpm != null ? Number(l.hrAvgBpm) : null,
          kcal: l.activeEnergyKcal != null ? Number(l.activeEnergyKcal) : null,
        };
      })
  );

  function pointsFor(key){
    return sessions
      .filter(s => s[key] != null)
      .map(s => ({ label: s.dateStr, value: s[key] }));
  }

  const distancePoints = $derived(pointsFor('miles'));
  const pacePoints = $derived(pointsFor('paceMinPerMi'));
  const hrPoints = $derived(pointsFor('hrAvg'));

  function fmtPace(v){
    const mins = Math.floor(v);
    const secs = Math.round((v - mins) * 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }
  const fmtMiles = (v) => v.toFixed(2);
</script>

{#if !sessions.length}
  <div class="prog-empty">No {activityType.toLowerCase()} sessions logged yet.</div>
{:else}
  {#if distancePoints.length}
    <div class="cardio-chart-label">Distance (mi)</div>
    <ProgressionChart points={distancePoints} format={fmtMiles} />
  {/if}

  {#if pacePoints.length}
    <div class="cardio-chart-label">Avg pace (min/mi) &middot; higher is faster</div>
    <ProgressionChart points={pacePoints} format={fmtPace} invert={true} />
  {/if}

  {#if hrPoints.length}
    <div class="cardio-chart-label">Avg heart rate (bpm)</div>
    <ProgressionChart points={hrPoints} />
  {/if}

  {#each sessions.slice().reverse() as s (s.id)}
    <div class="prog-row">
      <span class="prog-date">{s.dateStr}</span>
      <span class="prog-sets">
        {#if s.miles != null}{fmtMiles(s.miles)} mi{/if}{#if s.durationMin} &middot; {s.durationMin} min{/if}{#if s.paceMinPerMi != null} &middot; {fmtPace(s.paceMinPerMi)}/mi{/if}{#if s.hrAvg != null} &middot; {Math.round(s.hrAvg)} bpm{/if}
      </span>
    </div>
  {/each}
{/if}
