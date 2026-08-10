<script>
  let { pct, label, mode = 'accent', size = 132 } = $props();

  const r = 52;
  const circumference = 2 * Math.PI * r;
  const clamped = $derived(pct == null ? 0 : Math.max(0, Math.min(100, pct)));
  const offset = $derived(circumference * (1 - clamped / 100));

  // WHOOP-style traffic light thresholds for recovery; sleep/other rings
  // just use a single accent tone since they aren't a "readiness" signal
  // the same way recovery is.
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
  <div class="ring-stat-center">
    <div class="ring-stat-value">{pct != null ? Math.round(pct) : '—'}{pct != null ? '%' : ''}</div>
  </div>
  <div class="ring-stat-label">{label}</div>
</div>
