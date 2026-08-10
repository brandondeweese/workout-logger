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

  // Mirrors exactly what the compute_health_scores DB trigger actually uses/
  // skips, so these notes never drift from the real formula - if the trigger
  // changes, update these checks too.
  function priorDateString(dateStr){
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d - 1);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  }
  function hasDip(row){
    // dip compares this row's overnight low against the PRIOR calendar
    // day's daytime resting HR - the sleep on this row is dated by wake
    // date (last night's sleep), which followed the day before this one,
    // not this date's own (possibly-incomplete/future) daytime data.
    const prior = rows.find(r => r.date === priorDateString(row.date));
    return prior?.resting_hr_bpm != null && (row.overnight_hr_min_bpm != null || row.overnight_hr_avg_bpm != null);
  }
  // Other rows within the same rolling 30-day window the trigger uses,
  // excluding this row itself.
  function windowRows(row){
    const [y, m, d] = row.date.split('-').map(Number);
    const windowStart = new Date(y, m - 1, d - 30);
    return rows.filter(r => {
      if(r.date === row.date) return false;
      const [ry, rm, rd] = r.date.split('-').map(Number);
      return new Date(ry, rm - 1, rd) >= windowStart;
    });
  }
  function effSourceField(row, dayField, overnightField){
    if(row[dayField] != null) return dayField;
    if(row[overnightField] != null) return overnightField;
    return null;
  }
  // Personalized z-score status against the SAME same-source/leave-one-out/
  // 30-day-window baseline the Recovery score itself uses - a fixed
  // population reference range (e.g. "20-120ms is normal HRV for an adult")
  // can show "Normal" on the exact day Recovery craters from that value,
  // because it has no idea what's normal for THIS person. This keeps the
  // vital card's badge from contradicting what Recovery is responding to.
  function personalZGauge(row, sourceKey, higherIsBetter){
    const val = row[sourceKey];
    if(val == null) return null;
    const others = windowRows(row).map(r => r[sourceKey]).filter(v => v != null);
    if(others.length < 2) return { pct: 50, color: AMBER, status: 'Not enough history yet' };
    const mean = others.reduce((a, b) => a + b, 0) / others.length;
    const variance = others.reduce((a, b) => a + (b - mean) ** 2, 0) / (others.length - 1);
    const sd = Math.sqrt(variance);
    if(!(sd > 0)) return { pct: 50, color: AMBER, status: 'Not enough history yet' };
    const z = (val - mean) / sd;
    const pct = Math.max(0, Math.min(100, 50 + z * 20));
    if(Math.abs(z) <= 1) return { pct, color: GREEN, status: 'Normal' };
    if(z > 1) return { pct, color: higherIsBetter ? GREEN : AMBER, status: 'High for you' };
    return { pct, color: higherIsBetter ? AMBER : GREEN, status: 'Low for you' };
  }
  function recoveryMissingFactors(row){
    const missing = [];
    // HRV/RHR each prefer the day-level column, falling back to the
    // overnight-only one - but the baseline they're compared against must
    // come from the SAME source (mixing day-level and overnight-only values
    // in one baseline produced badly wrong z-scores, since they're
    // different metrics with different natural ranges - fixed in the
    // fix_baseline_metric_type_mismatch migration).
    const hrvFromDay = row.hrv_ms != null;
    const effHrv = row.hrv_ms ?? row.overnight_hrv_ms;
    const rhrFromDay = row.resting_hr_bpm != null;
    const effRhr = row.resting_hr_bpm ?? row.overnight_hr_avg_bpm;

    if(effHrv == null || effRhr == null){
      missing.push('HRV/RHR (not enough data to score at all)');
    } else {
      const others = windowRows(row);
      const hrvBaselineCount = others.filter(r => (hrvFromDay ? r.hrv_ms : r.overnight_hrv_ms) != null).length;
      const rhrBaselineCount = others.filter(r => (rhrFromDay ? r.resting_hr_bpm : r.overnight_hr_avg_bpm) != null).length;
      if(hrvBaselineCount < 2 || rhrBaselineCount < 2){
        missing.push(`enough history of the same type to build a baseline (today is ${hrvFromDay ? 'day-level' : 'overnight-only'} HRV / ${rhrFromDay ? 'day-level' : 'overnight-only'} RHR - needs 2+ other days of that same kind)`);
      }
    }
    if(row.respiratory_rate_avg == null) missing.push('respiratory rate');
    if(!hasDip(row)) missing.push("HR dip (needs yesterday's resting HR + an overnight reading)");
    return missing;
  }
  function sleepMissingFactors(row){
    const missing = [];
    const hasStages = row.sleep_total_min != null && row.sleep_deep_min != null && row.sleep_rem_min != null;
    if(!hasStages) missing.push('sleep stages (not enough data to score at all)');
    if(row.respiratory_rate_avg == null) missing.push('respiratory rate');
    if(!hasDip(row)) missing.push('HR dip');
    return missing;
  }
</script>

<div class="today-hero">
  <div class="today-hero-label">Today</div>
  <div class="today-hero-date">{fmtDate(todayDateString())}</div>

  {#if today}
    {@const rr = today.respiratory_rate_avg != null ? personalZGauge(today, 'respiratory_rate_avg', false) : null}
    {@const rhrField = effSourceField(today, 'resting_hr_bpm', 'overnight_hr_avg_bpm')}
    {@const rhr = rhrField ? personalZGauge(today, rhrField, false) : null}
    {@const hrvField = effSourceField(today, 'hrv_ms', 'overnight_hrv_ms')}
    {@const hrv = hrvField ? personalZGauge(today, hrvField, true) : null}
    {@const temp = rangeGauge(cToF(today.wrist_temp_c), 90, 102, 93, 99.5)}
    {@const sleepDur = rangeGauge(today.sleep_total_min, 240, 600, 360, 540)}
    {@const spo2 = rangeGauge(today.overnight_spo2_avg_pct, 88, 100, 95, 100)}

    {@const recMissing = recoveryMissingFactors(today)}
    {@const sleepMissing = sleepMissingFactors(today)}
    <div class="today-rings">
      <div class="ring-col">
        <RingStat pct={today.recovery_pct} label="Recovery" mode="recovery" />
        {#if recMissing.length}
          <div class="missing-note">Missing: {recMissing.join(', ')}</div>
        {/if}
      </div>
      <div class="ring-col">
        <RingStat pct={today.sleep_score} label="Sleep" mode="accent" />
        {#if sleepMissing.length}
          <div class="missing-note">Missing: {sleepMissing.join(', ')}</div>
        {/if}
      </div>
      <div class="ring-col">
        <RingStat pct={today.strain_score} label="Strain" mode="accent" maxScale={21} unit="" decimals={1} />
        {#if today.strain_score == null}
          <div class="missing-note">Missing: continuous heart rate for today (needs daily_hr_hourly)</div>
        {/if}
      </div>
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
    {@const recMissing = recoveryMissingFactors(r)}
    {@const sleepMissing = sleepMissingFactors(r)}
    <div class="hist-entry">
      <div class="hist-date">{fmtDate(r.date)}</div>
      <div class="prog-row">
        <div class="prog-date">Recovery</div>
        <div class="prog-sets">{r.recovery_pct != null ? `${round1(r.recovery_pct)}%` : '—'}</div>
      </div>
      {#if r.recovery_pct != null && recMissing.length}
        <div class="missing-note">Missing: {recMissing.join(', ')}</div>
      {/if}
      <div class="prog-row">
        <div class="prog-date">Sleep score</div>
        <div class="prog-sets">{r.sleep_score != null ? `${round1(r.sleep_score)}%` : '—'}</div>
      </div>
      {#if r.sleep_score != null && sleepMissing.length}
        <div class="missing-note">Missing: {sleepMissing.join(', ')}</div>
      {/if}
      {#if r.strain_score != null}
        <div class="prog-row">
          <div class="prog-date">Strain</div>
          <div class="prog-sets">{round1(r.strain_score)}</div>
        </div>
      {/if}
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
