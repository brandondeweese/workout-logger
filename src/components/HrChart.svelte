<script>
  // samples: [{ t: ISO string, bpm: number }] straight from workout_logs.hr_samples.
  // Hand-rolled SVG area+line, matching how ProgressionChart/RingStat are done
  // elsewhere in this app - no charting dependency.
  let { samples = [] } = $props();

  const W = 320, H = 130, padL = 30, padR = 10, padT = 12, padB = 20;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  // HealthKit hands these back newest-first; plotting them unsorted draws the
  // run backwards. Sort ascending and drop anything unparseable.
  const points = $derived.by(() => {
    const parsed = (samples || [])
      .map(s => ({ ms: new Date(s.t).getTime(), bpm: Number(s.bpm) }))
      .filter(s => !isNaN(s.ms) && !isNaN(s.bpm))
      .sort((a, b) => a.ms - b.ms);
    if(parsed.length < 2) return [];
    const t0 = parsed[0].ms;
    const span = parsed[parsed.length - 1].ms - t0 || 1;
    return parsed.map(s => ({ ...s, frac: (s.ms - t0) / span }));
  });

  const bpms = $derived(points.map(p => p.bpm));
  const minV = $derived(bpms.length ? Math.min(...bpms) : 0);
  const maxV = $derived(bpms.length ? Math.max(...bpms) : 0);
  // Pad the range so the trace doesn't hug the top/bottom edge.
  const span = $derived(maxV - minV || 1);
  const yMin = $derived(minV - span * 0.1);
  const yMax = $derived(maxV + span * 0.1);

  function xAt(frac){ return padL + frac * chartW; }
  function yAt(v){ return padT + chartH - ((v - yMin) / (yMax - yMin)) * chartH; }

  const pathD = $derived(
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(p.frac).toFixed(1)},${yAt(p.bpm).toFixed(1)}`).join(' ')
  );
  // Close the line back down along the baseline for a soft fill under it.
  const areaD = $derived(
    points.length
      ? `${pathD} L${xAt(1).toFixed(1)},${(padT + chartH).toFixed(1)} L${xAt(0).toFixed(1)},${(padT + chartH).toFixed(1)} Z`
      : ''
  );

  const durationMin = $derived(
    points.length ? Math.round((points[points.length - 1].ms - points[0].ms) / 60000) : 0
  );
</script>

{#if points.length < 2}
  <div class="chart-empty">No heart rate samples for this workout.</div>
{:else}
  <svg viewBox="0 0 {W} {H}" class="prog-chart">
    <text x={padL} y={padT - 2} class="chart-axis-label">{Math.round(maxV)}</text>
    <text x={padL} y={padT + chartH + 11} class="chart-axis-label">{Math.round(minV)}</text>
    <path d={areaD} fill="var(--accent)" opacity="0.13" />
    <path d={pathD} fill="none" stroke="var(--accent)" stroke-width="1.5"
      stroke-linecap="round" stroke-linejoin="round" />
    <text x={padL} y={H - 4} class="chart-axis-label">0:00</text>
    <text x={W - padR} y={H - 4} class="chart-axis-label" text-anchor="end">{durationMin} min</text>
  </svg>
{/if}
