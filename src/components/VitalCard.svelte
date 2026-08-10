<script>
  let { icon, label, value, unit, gaugePct, gaugeColor, status, statusColor } = $props();
</script>

<div class="vital-card">
  <div class="vital-card-body">
    <div class="vital-card-head">
      <span class="vital-icon">{icon}</span>
      <span class="vital-label">{label}</span>
    </div>
    <div class="vital-value-row">
      <span class="vital-value">{value}</span>
      {#if unit}<span class="vital-unit">{unit}</span>{/if}
    </div>
    {#if status}
      <div class="vital-status" style:color={statusColor}>
        <span class="vital-status-dot" style:background={statusColor}></span>{status}
      </div>
    {/if}
  </div>
  {#if gaugePct != null}
    <div class="vital-gauge">
      <div class="vital-gauge-track">
        <div class="vital-gauge-fill" style:height="{gaugePct}%" style:background={gaugeColor}></div>
        <div class="vital-gauge-dot" style:bottom="{gaugePct}%" style:border-color={gaugeColor}></div>
      </div>
    </div>
  {/if}
</div>
