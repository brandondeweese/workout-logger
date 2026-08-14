<script>
  // Line-art glyph per equipment type, drawn in currentColor so it inherits
  // whatever the tag around it is coloured. Anything unrecognised falls back
  // to the equipment's initial rather than rendering nothing.
  let { name = '', size = 15 } = $props();

  const key = $derived((name || '').trim().toLowerCase());
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round"
     stroke-linejoin="round" aria-hidden="true">
  {#if key === 'barbell'}
    <!-- long bar, inner + outer plates -->
    <path d="M2 12h20" /><path d="M6 8v8" /><path d="M18 8v8" />
    <path d="M3 10v4" /><path d="M21 10v4" />
  {:else if key === 'dumbbell'}
    <!-- short bar, one plate each end -->
    <path d="M8 12h8" /><path d="M6 8v8" /><path d="M18 8v8" />
  {:else if key === 'ez bar'}
    <!-- cambered bar -->
    <path d="M3 12c3 0 3-4 6-4s3 4 6 4 3-4 6-4" /><path d="M3 16v-8" />
  {:else if key === 'kettlebell'}
    <!-- handle over a round bell -->
    <path d="M9 8a3 3 0 0 1 6 0" /><circle cx="12" cy="15" r="6" />
  {:else if key === 'cable'}
    <!-- pulley, cable, stack -->
    <circle cx="12" cy="5" r="3" /><path d="M12 8v8" />
    <rect x="8" y="16" width="8" height="5" rx="1" />
  {:else if key === 'machine'}
    <!-- frame with a seat -->
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 15h8" />
  {:else if key === 'plate-loaded machine'}
    <!-- frame plus a loaded plate -->
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="12" r="4" />
  {:else if key === 'smith machine'}
    <!-- bar running between two rails -->
    <path d="M5 3v18" /><path d="M19 3v18" /><path d="M5 12h14" />
  {:else if key === 'bodyweight'}
    <!-- figure -->
    <circle cx="12" cy="5" r="2.5" /><path d="M12 8v6" />
    <path d="M8 10h8" /><path d="M9 20l3-6 3 6" />
  {:else if key === 'trx'}
    <!-- anchor with two straps -->
    <path d="M12 3v4" /><path d="M12 7L6 20" /><path d="M12 7l6 13" />
  {:else if key === 'ab wheel'}
    <!-- wheel with an axle handle -->
    <circle cx="12" cy="12" r="6" /><path d="M2 12h4" /><path d="M18 12h4" />
  {:else}
    <text x="12" y="17" text-anchor="middle" font-size="15"
          fill="currentColor" stroke="none">{(name || '?').charAt(0).toUpperCase()}</text>
  {/if}
</svg>
