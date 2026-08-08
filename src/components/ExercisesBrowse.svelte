<script>
  import { loadExercisesBrowse } from '../lib/db.js';

  let { active } = $props();

  let items = $state([]);

  $effect(() => {
    if(active) refresh();
  });

  async function refresh(){
    items = await loadExercisesBrowse();
  }
</script>

{#if !items.length}
  <div class="empty">No exercises created yet — they're created automatically as you build programs.</div>
{:else}
  {#each items as item (item.id)}
    <div class="list-row"><div class="list-row-name">{item.display_name}</div></div>
  {/each}
{/if}
