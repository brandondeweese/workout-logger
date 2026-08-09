<script>
  import { onMount } from 'svelte';
  import { appState, refreshActiveProgramState } from '../lib/state.svelte.js';
  import { loadCatalogForBuilder, loadExercisesById, saveProgram } from '../lib/db.js';
  import PhaseEditor from './PhaseEditor.svelte';

  let { existingProgram, onDone } = $props();

  function buildInitialPhases(){
    if(existingProgram && existingProgram.structure.length){
      return existingProgram.structure.map(p => ({
        name: p.name,
        days: p.days.map(d => ({
          name: d.name,
          exercises: d.exercises.map(ex => ({
            exerciseId: ex.exerciseId,
            displayName: appState.exercisesById[ex.exerciseId] || '(unknown exercise)',
            sets: ex.sets,
            target: ex.target,
            restSec: ex.restSec || null,
          })),
        })),
      }));
    }
    return [{ name: '', days: [{ name: '', exercises: [] }] }];
  }

  let name = $state(existingProgram ? existingProgram.name : '');
  let phases = $state(buildInitialPhases());
  let movements = $state([]);
  let equipment = $state([]);
  let movementEquipment = $state({});
  let statusMsg = $state('');

  onMount(async () => {
    appState.exercisesById = await loadExercisesById();
    const cat = await loadCatalogForBuilder();
    movements = cat.movements;
    equipment = cat.equipment;
    movementEquipment = cat.movementEquipment;
  });

  function addPhase(){
    phases.push({ name: '', days: [{ name: '', exercises: [] }] });
  }

  async function handleSave(){
    if(!name.trim()){ statusMsg = 'Program needs a name.'; return; }

    const seenPhaseNames = new Set();
    const structure = [];
    for(const phase of phases){
      const phaseName = phase.name.trim();
      if(!phaseName){ statusMsg = 'Every phase needs a name.'; return; }
      if(seenPhaseNames.has(phaseName)){ statusMsg = `Duplicate phase name: "${phaseName}".`; return; }
      seenPhaseNames.add(phaseName);

      const seenDayNames = new Set();
      const days = [];
      for(const day of phase.days){
        const dayName = day.name.trim();
        if(!dayName){ statusMsg = 'Every day needs a name.'; return; }
        if(seenDayNames.has(dayName)){ statusMsg = `Duplicate day name "${dayName}" in phase "${phaseName}".`; return; }
        seenDayNames.add(dayName);

        if(!day.exercises.length){ statusMsg = `Day "${dayName}" needs at least one exercise.`; return; }
        days.push({
          name: dayName,
          exercises: day.exercises.map(ex => ({ exerciseId: ex.exerciseId, sets: ex.sets, target: ex.target, restSec: ex.restSec || null })),
        });
      }
      if(!days.length){ statusMsg = `Phase "${phaseName}" needs at least one day.`; return; }
      structure.push({ name: phaseName, days });
    }
    if(!structure.length){ statusMsg = 'Add at least one phase.'; return; }

    statusMsg = 'Saving…';
    const { error } = await saveProgram({ id: existingProgram?.id, name: name.trim(), structure });
    if(error){ statusMsg = 'Save failed — try again.'; return; }

    if(existingProgram && appState.activeProgram && existingProgram.id === appState.activeProgram.id){
      await refreshActiveProgramState();
    }

    statusMsg = existingProgram ? 'Changes saved.' : 'Program saved.';
    onDone();
  }
</script>

<div class="builder-block">
  <div class="form-label" style="margin-top:0;">Program Name</div>
  <input type="text" class="text-input" placeholder="e.g. Program 2" bind:value={name}>
  {#each phases as phase, idx (idx)}
    <PhaseEditor {phase} {movements} {equipment} {movementEquipment} />
  {/each}
  <button type="button" class="dashed-btn" onclick={addPhase}>+ Add Phase</button>
  <button type="button" class="btn btn-primary" onclick={handleSave}>{existingProgram ? 'Save Changes' : 'Save Program'}</button>
  <div class="status">{statusMsg}</div>
</div>
