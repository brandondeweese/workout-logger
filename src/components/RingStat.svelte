<script>
  // pct is the raw value on whatever scale maxScale describes (0-100 by
  // default for recovery/sleep/strain) - the ring fill is always normalized
  // to that scale, but the displayed number/unit stay in the raw scale.
  let { pct, label, mode = 'accent', size = 132, maxScale = 100, unit = '%', decimals = 0 } = $props();

  const r = 52;
  const circumference = 2 * Math.PI * r;
  const fillPct = $derived(pct == null ? 0 : Math.max(0, Math.min(100, (pct / maxScale) * 100)));
  const offset = $derived(circumference * (1 - fillPct / 100));

  // WHOOP-style traffic light thresholds for recovery; sleep/strain/other
  // rings just use a single accent tone since they aren't a "readiness"
  // signal the same way recovery is.
  const color = $derived.by(() => {
    if(mode !== 'recovery' || pct == null) return 'var(--accent)';
    if(pct >= 67) return '#6FA87D';
    if(pct >= 34) return '#C9A24B';
    return 'var(--danger)';
  });
</script>

<div class="ring-stat" style:width="{size}px">
  <svg viewBox="0 0 120 120" width={size} height={size}>
    <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" stroke-width="10" />
    {#if pct != null}
      <circle
        cx="60" cy="60" r={r} fill="none"
        stroke={color} stroke-width="10" stroke-linecap="round"
        stroke-dasharray={circumference}
        stroke-dashoffset={offset}
        transform="rotate(-90 60 60)"
      />
    {/if}
  </svg>
  <div class="ring-stat-center" style:height="{size}px">
    <div class="ring-stat-value">{pct != null ? pct.toFixed(decimals) : '—'}{pct != null ? unit : ''}</div>
  </div>
  <div class="ring-stat-label">{label}</div>
</div>
