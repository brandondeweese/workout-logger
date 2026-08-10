<script>
  // points: [{ label, value }], chronological. Hand-rolled SVG line chart -
  // no charting dependency, matches how RingStat/VitalCard gauges are done
  // elsewhere in this app.
  let { points = [] } = $props();

  const W = 320, H = 120, padL = 34, padR = 12, padT = 14, padB = 22;
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
    return padT + chartH - ((v - yMin) / (yMax - yMin)) * chartH;
  }

  const pathD = $derived(points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' '));
  const latest = $derived(points.length ? points[points.length - 1] : null);
</script>

{#if points.length < 2}
  <div class="chart-empty">Not enough sessions yet to chart a trend.</div>
{:else}
  <svg viewBox="0 0 {W} {H}" class="prog-chart">
    <text x={padL} y={padT - 2} class="chart-axis-label">{Math.round(maxV)}</text>
    <text x={padL} y={H - padB + 12} class="chart-axis-label">{Math.round(minV)}</text>
    <path d={pathD} fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    {#each points as p, i}
      <circle cx={xAt(i)} cy={yAt(p.value)} r={i === points.length - 1 ? 4 : 2.5}
        fill={i === points.length - 1 ? 'var(--accent)' : 'var(--bg)'}
        stroke="var(--accent)" stroke-width="1.5" />
    {/each}
    <text x={padL} y={H - 4} class="chart-axis-label">{points[0].label}</text>
    <text x={W - padR} y={H - 4} class="chart-axis-label" text-anchor="end">{points[points.length - 1].label}</text>
  </svg>
  {#if latest}
    <div class="chart-latest">Latest: <strong>{latest.value}</strong></div>
  {/if}
{/if}
