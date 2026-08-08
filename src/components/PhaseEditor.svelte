<script>
  import DayEditor from './DayEditor.svelte';

  let { phase, movements, equipment, movementEquipment } = $props();

  function addDay(){
    phase.days.push({ name: '', exercises: [] });
  }
</script>

<div class="builder-block builder-phase">
  <div class="form-label" style="margin-top:0;">Phase Name</div>
  <input type="text" class="text-input" placeholder="e.g. Phase 1 — Accumulation" bind:value={phase.name}>
  <div class="builder-days">
    {#each phase.days as day, idx (idx)}
      <DayEditor {day} {movements} {equipment} {movementEquipment} />
    {/each}
  </div>
  <button type="button" class="link-btn" style="margin-top:12px;" onclick={addDay}>+ Add Day</button>
</div>
