<script>
  // Bottom-nav glyphs from phosphor-svelte (MIT). Kept behind this thin mapper
  // so AppShell keeps passing a tab key rather than importing four icons and
  // repeating the weight/size on each.
  //
  // `color` defaults to currentColor, so the active/muted tab colour drives
  // the icon with no extra state.
  import HeartIcon from 'phosphor-svelte/lib/HeartIcon';
  import BarbellIcon from 'phosphor-svelte/lib/BarbellIcon';
  import ChartLineUpIcon from 'phosphor-svelte/lib/ChartLineUpIcon';
  import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';

  let { name, size = 26, weight = 'regular' } = $props();
</script>

{#if name === 'health'}
  <HeartIcon {size} {weight} />
{:else if name === 'workout'}
  <BarbellIcon {size} {weight} />
{:else if name === 'progress'}
  <ChartLineUpIcon {size} {weight} />
{:else if name === 'more'}
  <DotsThreeIcon {size} {weight} />
{/if}
