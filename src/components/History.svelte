<script>
  import { appState, refreshWorkoutLogs } from '../lib/state.svelte.js';
  import { deleteLog } from '../lib/db.js';
  import HrChart from './HrChart.svelte';

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

  // A HealthKit-imported cardio session: no set list, but distance/energy/HR
  // instead. Hand-logged strength workouts leave metricsSource null.
  function isCardio(entry){
    return !entry.exercises.length && !!entry.metricsSource;
  }

  function fmtMiles(m){
    return m == null ? null : `${(m / 1609.344).toFixed(2)} mi`;
  }
  function fmtPace(m, durationMin){
    if(m == null || !durationMin) return null;
    const miles = m / 1609.344;
    if(miles < 0.05) return null;
    const paceMin = durationMin / miles;
    const mins = Math.floor(paceMin);
    const secs = Math.round((paceMin - mins) * 60);
    return `${mins}:${String(secs).padStart(2, '0')} /mi`;
  }
  function round0(n){
    return n == null ? null : Math.round(n);
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
    {@const cardio = isCardio(entry)}
    <div class="hist-entry">
      <div class="hist-top" onclick={() => toggleOpen(entry.id)}>
        <div>
          <div class="hist-date">{fmtDate(entry.dateISO)}</div>
          <div class="hist-meta">{entry.program_name} &middot; {entry.phase} &middot; {entry.day}{entry.durationMin ? ` · ${entry.durationMin} min` : ''}</div>
        </div>
        <div class="hist-meta">
          {#if cardio}
            {fmtMiles(entry.distanceM) ?? entry.activityType}
          {:else}
            {entry.exercises.length} exercises
          {/if}
        </div>
      </div>
      <div class="hist-detail" class:open={openId === entry.id}>
        {#if cardio}
          <div class="cardio-stats">
            {#if entry.distanceM != null}
              <div class="cardio-stat">
                <div class="cardio-stat-label">Distance</div>
                <div class="cardio-stat-value">{fmtMiles(entry.distanceM)}</div>
              </div>
            {/if}
            {#if fmtPace(entry.distanceM, entry.durationMin)}
              <div class="cardio-stat">
                <div class="cardio-stat-label">Avg pace</div>
                <div class="cardio-stat-value">{fmtPace(entry.distanceM, entry.durationMin)}</div>
              </div>
            {/if}
            {#if entry.activeEnergyKcal != null}
              <div class="cardio-stat">
                <div class="cardio-stat-label">Active energy</div>
                <div class="cardio-stat-value">{round0(entry.activeEnergyKcal)} kcal</div>
              </div>
            {/if}
            {#if entry.hrAvgBpm != null}
              <div class="cardio-stat">
                <div class="cardio-stat-label">Avg HR</div>
                <div class="cardio-stat-value">{round0(entry.hrAvgBpm)} bpm</div>
              </div>
            {/if}
            {#if entry.hrMaxBpm != null}
              <div class="cardio-stat">
                <div class="cardio-stat-label">Max HR</div>
                <div class="cardio-stat-value">{round0(entry.hrMaxBpm)} bpm</div>
              </div>
            {/if}
            {#if entry.hrMinBpm != null}
              <div class="cardio-stat">
                <div class="cardio-stat-label">Min HR</div>
                <div class="cardio-stat-value">{round0(entry.hrMinBpm)} bpm</div>
              </div>
            {/if}
          </div>
          {#if entry.hrSamples?.length}
            <div class="cardio-chart-label">Heart rate</div>
            <HrChart samples={entry.hrSamples} />
          {/if}
        {:else}
          {#each entry.exercises as ex}
            <div class="hist-ex"><b>{ex.name}:</b> <span>{ex.sets.map(s => `${s.weight || '-'}×${s.reps || '-'}`).join(', ')}</span></div>
          {/each}
        {/if}
        <button class="del" onclick={(e) => handleDelete(e, entry.id)}>Delete entry</button>
      </div>
    </div>
  {/each}
{/if}
