<script>
  import { resolveOrCreateExercise } from '../lib/db.js';
  import ExercisePicker from './ExercisePicker.svelte';
  import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUpIcon';
  import ArrowDownIcon from 'phosphor-svelte/lib/ArrowDownIcon';

  let { day, movements, equipment, movementEquipment } = $props();

  async function handleAdd(movementId, equipmentId, sets, target, restSec){
    const { exerciseId, displayName } = await resolveOrCreateExercise(movementId, equipmentId, movements, equipment);
    day.exercises.push({ exerciseId, displayName, sets: parseInt(sets, 10), target, restSec: restSec || null });
  }
  function removeExercise(idx){
    day.exercises.splice(idx, 1);
  }
  // Reorder the SAVED program order, unlike LogWorkout's session-only move.
  // The {#each} here is keyed by index, so Svelte rebuilds these rows on
  // reorder - fine, they're static summaries with no input state to lose.
  function moveExercise(idx, delta){
    const to = idx + delta;
    if(to < 0 || to >= day.exercises.length) return;
    const [moved] = day.exercises.splice(idx, 1);
    day.exercises.splice(to, 0, moved);
  }
</script>

<div class="builder-day">
  <div class="form-label">Day Name</div>
  <input type="text" class="text-input" placeholder="e.g. Day 1: Upper Push" bind:value={day.name}>
  <div class="builder-exercises">
    {#each day.exercises as ex, idx (idx)}
      <div class="builder-ex-row saved">
        <span class="ex-summary">{ex.displayName} — {ex.sets} sets · {ex.target || 'no target set'} · rest {ex.restSec ? `${ex.restSec}s` : 'default'}</span>
        <button type="button" class="icon-btn" onclick={() => moveExercise(idx, -1)}
                disabled={idx === 0} aria-label="Move up" title="Move up"><ArrowUpIcon size={16} /></button>
        <button type="button" class="icon-btn" onclick={() => moveExercise(idx, 1)}
                disabled={idx === day.exercises.length - 1} aria-label="Move down" title="Move down"><ArrowDownIcon size={16} /></button>
        <button type="button" class="link-btn danger" onclick={() => removeExercise(idx)}>Remove</button>
      </div>
    {/each}
  </div>
  <ExercisePicker {movements} {equipment} {movementEquipment} onAdd={handleAdd} />
</div>
