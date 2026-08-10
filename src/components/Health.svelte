<script>
  import { loadHealthMetrics } from '../lib/db.js';
  import VitalCard from './VitalCard.svelte';
  import RingStat from './RingStat.svelte';

  let { active } = $props();
  let rows = $state([]);

  // Health stays mounted (never unmounted) so it can't rely on onMount alone -
  // refetch whenever this tab becomes visible, matching History's pattern.
  $effect(() => {
    if(active) loadHealthMetrics().then(r => rows = r);
  });

  function todayDateString(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  const today = $derived(rows.find(r => r.date === todayDateString()));
  const pastRows = $derived(rows.filter(r => r.date !== todayDateString()));

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
  function cToF(c){
    return c == null ? null : c * 9 / 5 + 32;
  }
  function fmtTempF(celsius){
    return celsius == null ? '—' : `${round1(cToF(celsius))}°F`;
  }

  const GREEN = '#6FA87D', AMBER = '#C9A24B';

  // Position a value within [min, max] as a 0-100 gauge percent, and classify
  // it green/amber/red for the "Normal" style status. These are general
  // reference ranges (typical resting adult / sleep values), not ranges
  // personalized to this user - a reasonable default until real baselines
  // exist, same caveat as the recovery/sleep score formulas.
  function rangeGauge(val, min, max, normalMin, normalMax){
    if(val == null) return null;
    const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
    const inRange = val >= normalMin && val <= normalMax;
    return { pct, color: inRange ? GREEN : AMBER, status: inRange ? 'Normal' : (val < normalMin ? 'Low' : 'High') };
  }
</script>

<div class="today-hero">
  <div class="today-hero-label">Today</div>
  <div class="today-hero-date">{fmtDate(todayDateString())}</div>

  {#if today}
    {@const rr = rangeGauge(today.respiratory_rate_avg, 6, 26, 10, 20)}
    {@const rhr = rangeGauge(today.overnight_hr_avg_bpm ?? today.resting_hr_bpm, 35, 105, 40, 100)}
    {@const hrv = rangeGauge(today.overnight_hrv_ms ?? today.hrv_ms, 10, 130, 20, 120)}
    {@const temp = rangeGauge(cToF(today.wrist_temp_c), 90, 102, 93, 99.5)}
    {@const sleepDur = rangeGauge(today.sleep_total_min, 240, 600, 360, 540)}
    {@const spo2 = rangeGauge(today.overnight_spo2_avg_pct, 88, 100, 95, 100)}

    <div class="today-rings">
      <RingStat pct={today.recovery_pct} label="Recovery" mode="recovery" />
      <RingStat pct={today.sleep_score} label="Sleep" mode="accent" />
    </div>

    <div class="vital-section-title">Health Monitor</div>
    <div class="vital-grid">
      <VitalCard icon="≈" label="RR" value={today.respiratory_rate_avg != null ? round1(today.respiratory_rate_avg) : '—'} unit="rpm"
        gaugePct={rr?.pct} gaugeColor={rr?.color} status={rr?.status} statusColor={rr?.color} />
      <VitalCard icon="♥" label="RHR" value={(today.overnight_hr_avg_bpm ?? today.resting_hr_bpm) != null ? round1(today.overnight_hr_avg_bpm ?? today.resting_hr_bpm) : '—'} unit="bpm"
        gaugePct={rhr?.pct} gaugeColor={rhr?.color} status={rhr?.status} statusColor={rhr?.color} />
      <VitalCard icon="∿" label="HRV" value={(today.overnight_hrv_ms ?? today.hrv_ms) != null ? round1(today.overnight_hrv_ms ?? today.hrv_ms) : '—'} unit="ms"
        gaugePct={hrv?.pct} gaugeColor={hrv?.color} status={hrv?.status} statusColor={hrv?.color} />
      <VitalCard icon="◉" label="SpO2" value={today.overnight_spo2_avg_pct != null ? round1(today.overnight_spo2_avg_pct) : '—'} unit={today.overnight_spo2_avg_pct != null ? '%' : ''}
        gaugePct={spo2?.pct} gaugeColor={spo2?.color} status={spo2?.status} statusColor={spo2?.color} />
      <VitalCard icon="◐" label="Temp" value={fmtTempF(today.wrist_temp_c) !== '—' ? round1(cToF(today.wrist_temp_c)) : '—'} unit="°F"
        gaugePct={temp?.pct} gaugeColor={temp?.color} status={temp?.status} statusColor={temp?.color} />
      <VitalCard icon="⏾" label="Sleep" value={fmtHM(today.sleep_total_min)} unit=""
        gaugePct={sleepDur?.pct} gaugeColor={sleepDur?.color} status={sleepDur?.status} statusColor={sleepDur?.color} />
    </div>
    <div class="today-stats" style="margin-top:16px;">
      <div class="today-stat">
        <div class="today-stat-label">Sleep efficiency</div>
        <div class="today-stat-value">{today.sleep_efficiency_pct != null ? `${round1(today.sleep_efficiency_pct)}%` : '—'}</div>
      </div>
      <div class="today-stat">
        <div class="today-stat-label">Steps</div>
        <div class="today-stat-value">{today.step_count != null ? today.step_count.toLocaleString() : '—'}</div>
      </div>
    </div>
  {:else}
    <div class="today-empty">No data for today yet.</div>
  {/if}
</div>

{#if !pastRows.length}
  <div class="empty">No earlier health data yet.</div>
{:else}
  {#each pastRows as r (r.date)}
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
          <div class="prog-sets">{fmtTempF(r.wrist_temp_c)}</div>
        </div>
      {/if}
      {#if r.overnight_spo2_avg_pct != null}
        <div class="prog-row">
          <div class="prog-date">SpO2</div>
          <div class="prog-sets">{round1(r.overnight_spo2_avg_pct)}%</div>
        </div>
      {/if}
    </div>
  {/each}
{/if}
