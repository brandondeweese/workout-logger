<script>
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  // pct is the raw value on whatever scale maxScale describes (0-100 by
  // default for recovery/sleep/strain) - the ring fill is always normalized
  // to that scale, but the displayed number/unit stay in the raw scale.
  let { pct, label, mode = 'accent', size = 132, maxScale = 100, unit = '%', decimals = 0 } = $props();

  const r = 52;
  const circumference = 2 * Math.PI * r;

  // Honour the OS "reduce motion" setting - a sweeping ring is exactly the
  // kind of thing that setting exists for. Read once; it doesn't change
  // mid-session in practice.
  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // One tween drives both the arc and the number, so they stay in lockstep
  // rather than drifting apart with separate timings.
  const shown = new Tween(0, {
    duration: reduceMotion ? 0 : 900,
    easing: cubicOut,
  });

  $effect(() => {
    shown.set(pct ?? 0);
  });

  const fillPct = $derived(Math.max(0, Math.min(100, (shown.current / maxScale) * 100)));
  const offset = $derived(circumference * (1 - fillPct / 100));

  // WHOOP-style traffic light thresholds for recovery; sleep/strain/other
  // rings just use a single accent tone since they aren't a "readiness"
  // signal the same way recovery is.
  //
  // Keyed off the FINAL pct, not the animating value - otherwise a recovery
  // ring sweeping up to 75 would flash red then amber then green on its way
  // there, reading as a state change rather than a fill.
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
    <div class="ring-stat-value">{pct != null ? shown.current.toFixed(decimals) : '—'}{pct != null ? unit : ''}</div>
  </div>
  <div class="ring-stat-label">{label}</div>
</div>
