<script>
  // points: [{ label, value }], chronological. Hand-rolled SVG line chart -
  // no charting dependency, matches how RingStat/VitalCard gauges are done
  // elsewhere in this app.
  //
  // `format` optionally overrides how a value is printed on the axis/readout -
  // pace needs "9:52", not a rounded 10. Omitted, values print as before.
  // `invert` flips the y-axis for metrics where lower is better (pace), so an
  // improving trend still reads as a line going up.
  let { points = [], format = null, invert = false } = $props();

  const fmt = $derived(format ?? (v => Math.round(v)));

  const W = 320, H = 136, padL = 34, padR = 12, padT = 14, padB = 34;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  const values = $derived(points.map(p => p.value));
  const minV = $derived(values.length ? Math.min(...values) : 0);
  const maxV = $derived(values.length ? Math.max(...values) : 0);
  // Pad the range so a flat/near-flat trend doesn't hug the top/bottom edge.
  const span = $derived(maxV - minV || 1);
  const yMin = $derived(minV - span * 0.15);
  const yMax = $derived(maxV + span * 0.15);

  function xAt(i){
    return points.length <= 1 ? padL + chartW / 2 : padL + (i / (points.length - 1)) * chartW;
  }
  function yAt(v){
    const frac = (v - yMin) / (yMax - yMin);
    return padT + chartH - (invert ? 1 - frac : frac) * chartH;
  }

  const pathD = $derived(points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' '));
  const latest = $derived(points.length ? points[points.length - 1] : null);
</script>

{#if points.length < 2}
  <div class="chart-empty">Not enough sessions yet to chart a trend.</div>
{:else}
  <svg viewBox="0 0 {W} {H}" class="prog-chart">
    <text x={padL} y={padT - 2} class="chart-axis-label">{fmt(invert ? minV : maxV)}</text>
    <text x={padL} y={padT + chartH + 11} class="chart-axis-label">{fmt(invert ? maxV : minV)}</text>
    <path d={pathD} fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    {#each points as p, i}
      <circle cx={xAt(i)} cy={yAt(p.value)} r={i === points.length - 1 ? 4 : 2.5}
        fill={i === points.length - 1 ? 'var(--accent)' : 'var(--bg)'}
        stroke="var(--accent)" stroke-width="1.5" />
    {/each}
    <text x={padL} y={H - 6} class="chart-axis-label">{points[0].label}</text>
    <text x={W - padR} y={H - 6} class="chart-axis-label" text-anchor="end">{points[points.length - 1].label}</text>
  </svg>
  {#if latest}
    <div class="chart-latest">Latest: <strong>{format ? fmt(latest.value) : latest.value}</strong></div>
  {/if}
{/if}
