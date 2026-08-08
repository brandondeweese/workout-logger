<script>
  import { loadSimpleCatalog, addSimpleCatalogItem } from '../lib/db.js';

  let { table, label, active } = $props();

  let items = $state([]);
  let newName = $state('');
  let statusMsg = $state('');

  $effect(() => {
    if(active) refresh();
  });

  async function refresh(){
    items = await loadSimpleCatalog(table);
  }

  async function handleAdd(){
    const name = newName.trim();
    if(!name) return;
    const ok = await addSimpleCatalogItem(table, name);
    if(!ok){ statusMsg = 'Could not add (maybe already exists).'; return; }
    newName = '';
    statusMsg = '';
    await refresh();
  }
</script>

{#if !items.length}
  <div class="empty">No {label.toLowerCase()}s yet.</div>
{:else}
  {#each items as item (item.id)}
    <div class="list-row"><div class="list-row-name">{item.name}</div></div>
  {/each}
{/if}
<div class="builder-ex-row" style="margin-top:16px;">
  <input type="text" class="text-input" placeholder="New {label.toLowerCase()} name" bind:value={newName}>
  <button type="button" class="link-btn" onclick={handleAdd}>+ Add</button>
</div>
<div class="status">{statusMsg}</div>
