<script>
  import { loadHealthMetrics } from '../lib/db.js';

  let { active } = $props();
  let rows = $state([]);

  // Health stays mounted (never unmounted) so it can't rely on onMount alone -
  // refetch whenever this tab becomes visible, matching History's pattern.
  $effect(() => {
    if(active) loadHealthMetrics().then(r => rows = r);
  });

  function fmtDate(dateStr){
    // dateStr is a plain 'YYYY-MM-DD' - parse as local, not UTC, or it can
    // display a day early/late depending on timezone.
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function fmtHM(totalMin){
    if(totalMin == null) return '—';
    const h = Math.floor(totalMin / 60), m = Math.round(totalMin % 60);
    return `${h}h ${m}m`;
  }
  function round1(n){
    return n == null ? '—' : Math.round(n * 10) / 10;
  }
</script>

{#if !rows.length}
  <div class="empty">No health data yet.</div>
{:else}
  {#each rows as r (r.date)}
    <div class="hist-entry">
      <div class="hist-date">{fmtDate(r.date)}</div>
      <div class="prog-row">
        <div class="prog-date">Recovery</div>
        <div class="prog-sets">{r.recovery_pct != null ? `${round1(r.recovery_pct)}%` : '—'}</div>
      </div>
      <div class="prog-row">
        <div class="prog-date">Sleep score</div>
        <div class="prog-sets">{r.sleep_score != null ? `${round1(r.sleep_score)}%` : '—'}</div>
      </div>
      <div class="prog-row">
        <div class="prog-date">Sleep duration</div>
        <div class="prog-sets">{fmtHM(r.sleep_total_min)}{r.sleep_efficiency_pct != null ? ` · ${round1(r.sleep_efficiency_pct)}% efficiency` : ''}</div>
      </div>
      <div class="prog-row">
        <div class="prog-date">HRV (day avg)</div>
        <div class="prog-sets">{r.hrv_ms != null ? `${round1(r.hrv_ms)} ms` : '—'}{r.overnight_hrv_ms != null ? ` · ${round1(r.overnight_hrv_ms)} ms overnight` : ''}</div>
      </div>
      <div class="prog-row">
        <div class="prog-date">Resting HR</div>
        <div class="prog-sets">{r.resting_hr_bpm != null ? `${round1(r.resting_hr_bpm)} bpm` : '—'}{r.overnight_hr_min_bpm != null ? ` · ${round1(r.overnight_hr_min_bpm)} bpm min overnight` : ''}</div>
      </div>
      {#if r.step_count != null}
        <div class="prog-row">
          <div class="prog-date">Steps</div>
          <div class="prog-sets">{r.step_count.toLocaleString()}</div>
        </div>
      {/if}
      {#if r.respiratory_rate_avg != null}
        <div class="prog-row">
          <div class="prog-date">Respiratory rate</div>
          <div class="prog-sets">{round1(r.respiratory_rate_avg)} br/min</div>
        </div>
      {/if}
      {#if r.wrist_temp_c != null}
        <div class="prog-row">
          <div class="prog-date">Wrist temp</div>
          <div class="prog-sets">{round1(r.wrist_temp_c)}°C</div>
        </div>
      {/if}
    </div>
  {/each}
{/if}
