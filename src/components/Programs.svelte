<script>
  import { refreshActiveProgramState } from '../lib/state.svelte.js';
  import { loadAllPrograms, setActiveProgramInDb } from '../lib/db.js';
  import ProgramBuilder from './ProgramBuilder.svelte';

  let { active } = $props();

  let programs = $state([]);
  let builderMode = $state(null); // null | 'new' | <program row being edited>

  $effect(() => {
    if(active && !builderMode) refreshList();
  });

  async function refreshList(){
    programs = await loadAllPrograms();
  }

  async function handleSetActive(id){
    await setActiveProgramInDb(id);
    await refreshActiveProgramState();
    await refreshList();
  }

  function startNew(){ builderMode = 'new'; }
  function startEdit(p){ builderMode = p; }
  async function onBuilderDone(){
    builderMode = null;
    await refreshList();
  }
</script>

{#if builderMode}
  <ProgramBuilder existingProgram={builderMode === 'new' ? null : builderMode} onDone={onBuilderDone} />
{:else}
  {#if !programs.length}
    <div class="empty">No programs yet.</div>
  {:else}
    {#each programs as p (p.id)}
      {@const dayCount = p.structure.reduce((n, ph) => n + ph.days.length, 0)}
      <div class="list-row">
        <div class="list-row-top">
          <div>
            <div class="list-row-name">{p.name}</div>
            <div class="list-row-meta">{p.structure.length} phase{p.structure.length === 1 ? '' : 's'} &middot; {dayCount} day{dayCount === 1 ? '' : 's'}</div>
          </div>
          <div style="display:flex;align-items:center;gap:16px;">
            {#if p.is_active}
              <span class="badge-active">Active</span>
            {:else}
              <button type="button" class="link-btn" onclick={() => handleSetActive(p.id)}>Set Active</button>
            {/if}
            <button type="button" class="link-btn muted" onclick={() => startEdit(p)}>Edit</button>
          </div>
        </div>
      </div>
    {/each}
  {/if}
  <button type="button" class="dashed-btn" onclick={startNew}>+ New Program</button>
{/if}
