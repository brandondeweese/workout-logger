<script>
  // Bottom-nav glyphs. Drawn in currentColor so they pick up the active/muted
  // tab colour without needing their own state.
  let { name, size = 24 } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="none"
     stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
     stroke-linejoin="round" aria-hidden="true">
  {#if name === 'health'}
    <path d="M12 20.5C12 20.5 3.5 15.5 3.5 9.5a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2c0 6-8.5 11-8.5 11z" />
  {:else if name === 'workout'}
    <!-- dumbbell: bar with a plate at each end -->
    <path d="M8 12h8" />
    <path d="M5.5 8.5v7" /><path d="M18.5 8.5v7" />
    <path d="M2.5 10.5v3" /><path d="M21.5 10.5v3" />
  {:else if name === 'progress'}
    <!-- rising trend line with axes -->
    <path d="M4 3v16a2 2 0 0 0 2 2h15" />
    <path d="M7 15l4-5 3 3 5-7" />
  {:else if name === 'more'}
    <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
  {/if}
</svg>
