<script>
  import { loadHealthMetrics } from '../lib/db.js';
  import VitalCard from './VitalCard.svelte';
  import RingStat from './RingStat.svelte';

  let { active } = $props();
  let rows = $state([]);
  let selectedDate = $state(null);
  let openMissing = $state(null); // 'recovery' | 'sleep' | 'strain' | null - which ring's missing-factors tooltip is open

  // Health stays mounted (never unmounted) so it can't rely on onMount alone -
  // refetch whenever this tab becomes visible, matching History's pattern.
  $effect(() => {
    if(active) loadHealthMetrics().then(r => rows = r);
  });

  function toggleMissing(key){
    openMissing = (openMissing === key) ? null : key;
  }

  function todayDateString(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  const sortedRows = $derived([...rows].sort((a, b) => a.date.localeCompare(b.date)));

  // Default to today if it has a row, else the most recent day we have -
  // only runs once rows are loaded and only if nothing's been picked yet, so
  // it doesn't yank the user back to "today" every time rows refetch after
  // they've navigated elsewhere.
  $effect(() => {
    if(selectedDate == null && sortedRows.length){
      const t = todayDateString();
      selectedDate = sortedRows.some(r => r.date === t) ? t : sortedRows[sortedRows.length - 1].date;
    }
  });

  const currentIndex = $derived(selectedDate == null ? -1 : sortedRows.findIndex(r => r.date === selectedDate));
  const current = $derived(currentIndex >= 0 ? sortedRows[currentIndex] : null);
  const hasPrev = $derived(currentIndex > 0);
  const hasNext = $derived(currentIndex >= 0 && currentIndex < sortedRows.length - 1);
  function goPrev(){ if(hasPrev){ selectedDate = sortedRows[currentIndex - 1].date; openMissing = null; } }
  function goNext(){ if(hasNext){ selectedDate = sortedRows[currentIndex + 1].date; openMissing = null; } }

  const GREEN = '#6FA87D', AMBER = '#C9A24B';

  const heroLabel = $derived.by(() => {
    if(selectedDate == null) return '';
    if(selectedDate === todayDateString()) return 'Today';
    const [y, m, d] = selectedDate.split('-').map(Number);
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const ys = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
    return selectedDate === ys ? 'Yesterday' : '';
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
  function cToF(c){
    return c == null ? null : c * 9 / 5 + 32;
  }
  function fmtTempF(celsius){
    return celsius == null ? '—' : `${round1(cToF(celsius))}°F`;
  }

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
        missing.push(`enough history of the same type to build a baseline (this day is ${hrvFromDay ? 'day-level' : 'overnight-only'} HRV / ${rhrFromDay ? 'day-level' : 'overnight-only'} RHR - needs 2+ other days of that same kind)`);
      }
    }
    if(row.respiratory_rate_avg == null) missing.push('respiratory rate');
    if(!hasDip(row)) missing.push("HR dip (needs the prior day's resting HR + an overnight reading)");
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
  <div class="day-nav">
    <button type="button" class="day-nav-btn" onclick={goPrev} disabled={!hasPrev}>&#8249;</button>
    <div class="day-nav-label">
      {#if heroLabel}<div class="today-hero-label">{heroLabel}</div>{/if}
      <div class="today-hero-date">{selectedDate ? fmtDate(selectedDate) : ''}</div>
    </div>
    <button type="button" class="day-nav-btn" onclick={goNext} disabled={!hasNext}>&#8250;</button>
  </div>

  {#if current}
    {@const rr = current.respiratory_rate_avg != null ? personalZGauge(current, 'respiratory_rate_avg', false) : null}
    {@const rhrField = effSourceField(current, 'resting_hr_bpm', 'overnight_hr_avg_bpm')}
    {@const rhr = rhrField ? personalZGauge(current, rhrField, false) : null}
    {@const hrvField = effSourceField(current, 'hrv_ms', 'overnight_hrv_ms')}
    {@const hrv = hrvField ? personalZGauge(current, hrvField, true) : null}
    {@const temp = rangeGauge(cToF(current.wrist_temp_c), 90, 102, 93, 99.5)}
    {@const sleepDur = rangeGauge(current.sleep_total_min, 240, 600, 360, 540)}
    {@const spo2 = rangeGauge(current.overnight_spo2_avg_pct, 88, 100, 95, 100)}

    {@const recMissing = recoveryMissingFactors(current)}
    {@const sleepMissing = sleepMissingFactors(current)}
    <div class="today-rings">
      <div class="ring-col">
        <RingStat pct={current.recovery_pct} label="Recovery" mode="recovery" size={100} />
        {#if recMissing.length}
          <button type="button" class="info-btn" onclick={() => toggleMissing('recovery')}>i</button>
          <div class="info-tooltip" class:open={openMissing === 'recovery'}>Missing: {recMissing.join(', ')}</div>
        {/if}
      </div>
      <div class="ring-col">
        <RingStat pct={current.sleep_score} label="Sleep" mode="accent" size={100} />
        {#if sleepMissing.length}
          <button type="button" class="info-btn" onclick={() => toggleMissing('sleep')}>i</button>
          <div class="info-tooltip" class:open={openMissing === 'sleep'}>Missing: {sleepMissing.join(', ')}</div>
        {/if}
      </div>
      <div class="ring-col">
        <RingStat pct={current.strain_score} label="Strain" mode="accent" size={100} />
        {#if current.strain_score == null}
          <button type="button" class="info-btn" onclick={() => toggleMissing('strain')}>i</button>
          <div class="info-tooltip" class:open={openMissing === 'strain'}>Missing: continuous heart rate for this day (needs daily_hr_hourly)</div>
        {/if}
      </div>
    </div>

    <div class="vital-section-title">Health Monitor</div>
    <div class="vital-grid">
      <VitalCard icon="≈" label="RR" value={current.respiratory_rate_avg != null ? round1(current.respiratory_rate_avg) : '—'} unit="rpm"
        gaugePct={rr?.pct} gaugeColor={rr?.color} status={rr?.status} statusColor={rr?.color} />
      <VitalCard icon="♥" label="RHR" value={(current.overnight_hr_avg_bpm ?? current.resting_hr_bpm) != null ? round1(current.overnight_hr_avg_bpm ?? current.resting_hr_bpm) : '—'} unit="bpm"
        gaugePct={rhr?.pct} gaugeColor={rhr?.color} status={rhr?.status} statusColor={rhr?.color} />
      <VitalCard icon="∿" label="HRV" value={(current.overnight_hrv_ms ?? current.hrv_ms) != null ? round1(current.overnight_hrv_ms ?? current.hrv_ms) : '—'} unit="ms"
        gaugePct={hrv?.pct} gaugeColor={hrv?.color} status={hrv?.status} statusColor={hrv?.color} />
      <VitalCard icon="◉" label="SpO2" value={current.overnight_spo2_avg_pct != null ? round1(current.overnight_spo2_avg_pct) : '—'} unit={current.overnight_spo2_avg_pct != null ? '%' : ''}
        gaugePct={spo2?.pct} gaugeColor={spo2?.color} status={spo2?.status} statusColor={spo2?.color} />
      <VitalCard icon="◐" label="Temp" value={fmtTempF(current.wrist_temp_c) !== '—' ? round1(cToF(current.wrist_temp_c)) : '—'} unit="°F"
        gaugePct={temp?.pct} gaugeColor={temp?.color} status={temp?.status} statusColor={temp?.color} />
      <VitalCard icon="⏾" label="Sleep" value={fmtHM(current.sleep_total_min)} unit=""
        gaugePct={sleepDur?.pct} gaugeColor={sleepDur?.color} status={sleepDur?.status} statusColor={sleepDur?.color} />
    </div>
    <div class="today-stats" style="margin-top:16px;">
      <div class="today-stat">
        <div class="today-stat-label">Sleep efficiency</div>
        <div class="today-stat-value">{current.sleep_efficiency_pct != null ? `${round1(current.sleep_efficiency_pct)}%` : '—'}</div>
      </div>
      <div class="today-stat">
        <div class="today-stat-label">Steps</div>
        <div class="today-stat-value">{current.step_count != null ? current.step_count.toLocaleString() : '—'}</div>
      </div>
    </div>
  {:else if selectedDate}
    <div class="today-empty">No data for this day.</div>
  {:else}
    <div class="today-empty">No health data yet.</div>
  {/if}
</div>
