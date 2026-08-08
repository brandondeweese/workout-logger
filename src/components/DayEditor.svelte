<script>
  import { resolveOrCreateExercise } from '../lib/db.js';
  import ExercisePicker from './ExercisePicker.svelte';

  let { day, movements, equipment, movementEquipment } = $props();

  async function handleAdd(movementId, equipmentId, sets, target){
    const { exerciseId, displayName } = await resolveOrCreateExercise(movementId, equipmentId, movements, equipment);
    day.exercises.push({ exerciseId, displayName, sets: parseInt(sets, 10), target });
  }
  function removeExercise(idx){
    day.exercises.splice(idx, 1);
  }
</script>

<div class="builder-day">
  <div class="form-label">Day Name</div>
  <input type="text" class="text-input" placeholder="e.g. Day 1: Upper Push" bind:value={day.name}>
  <div class="builder-exercises">
    {#each day.exercises as ex, idx (idx)}
      <div class="builder-ex-row saved">
        <span class="ex-summary">{ex.displayName} — {ex.sets} sets · {ex.target || 'no target set'}</span>
        <button type="button" class="link-btn danger" onclick={() => removeExercise(idx)}>Remove</button>
      </div>
    {/each}
  </div>
  <ExercisePicker {movements} {equipment} {movementEquipment} onAdd={handleAdd} />
</div>
