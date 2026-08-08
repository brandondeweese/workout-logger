<script>
  import { appState, refreshWorkoutLogs } from '../lib/state.svelte.js';
  import { insertLog } from '../lib/db.js';
  import { loadDraft, saveDraft, clearDraft, queueDraftSave } from '../lib/draft.js';
  import ExerciseCard from './ExerciseCard.svelte';
  import RestBar from './RestBar.svelte';

  let phase = $state('');
  let day = $state('');
  let exercises = $state([]);
  let workoutStartMs = $state(null);
  let workoutEndMs = $state(null);
  let clockTimeText = $state('00:00');
  let clockLabel = $state('Workout Timer');
  let clockBtnLabel = $state('Start Workout');
  let clockEnded = $state(false);
  let status = $state('');
  let openMenuKey = $state(null);
  let clockInterval = null;
  let restBarRef;
  let draftRestoreDone = false;

  const phaseNames = $derived(appState.activeProgram ? appState.activeProgram.structure.map(p => p.name) : []);
  const dayNames = $derived(
    appState.activeProgram
      ? (appState.activeProgram.structure.find(p => p.name === phase)?.days.map(d => d.name) || [])
      : []
  );
  const isLegDay = $derived(/leg/i.test(day));
  const increment = $derived(isLegDay ? 5 : 2.5);
  const locked = $derived(!(workoutStartMs && !workoutEndMs));

  function buildExercisesForDay(phaseName, dayName){
    const phaseObj = appState.activeProgram?.structure.find(p => p.name === phaseName);
    const dayObj = phaseObj?.days.find(d => d.name === dayName);
    if(!dayObj) return [];
    const presetKey = `${phaseName}::${dayName}`;
    const presets = appState.activeProgram.set_presets?.[presetKey] || {};
    return dayObj.exercises.map(ex => {
      const name = appState.exercisesById[ex.exerciseId] || '(unknown exercise)';
      const presetSets = presets[name] || null;
      const sets = [];
      for(let i = 0; i < ex.sets; i++){
        const preset = presetSets && presetSets[i];
        const presetTag = preset ? preset.tag : '';
        sets.push({
          weight: preset && preset.weight != null ? String(preset.weight) : '',
          reps: preset && preset.reps != null ? String(preset.reps) : '',
          tag: presetTag === 'working' ? '' : (presetTag || ''),
          checked: false,
        });
      }
      return { exerciseId: ex.exerciseId, name, target: ex.target, sets, collapsed: true, activeTab: 'log' };
    });
  }

  function fmtHMS(totalSec){
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function startClockInterval(){
    clearInterval(clockInterval);
    clockInterval = setInterval(() => {
      clockTimeText = fmtHMS(Math.floor((Date.now() - workoutStartMs) / 1000));
    }, 1000);
  }

  function onClockBtnClick(){
    if(!workoutStartMs || workoutEndMs){
      workoutStartMs = Date.now();
      workoutEndMs = null;
      clockLabel = 'Workout Timer (running)';
      clockBtnLabel = 'End Workout';
      clockEnded = false;
      startClockInterval();
    } else {
      workoutEndMs = Date.now();
      clearInterval(clockInterval);
      clockTimeText = fmtHMS(Math.floor((workoutEndMs - workoutStartMs) / 1000));
      clockLabel = 'Workout Timer (ended)';
      clockBtnLabel = 'Start New';
      clockEnded = true;
    }
  }

  function getWorkoutDurationMin(){
    if(workoutStartMs && workoutEndMs) return Math.round((workoutEndMs - workoutStartMs) / 60000);
    if(workoutStartMs && !workoutEndMs) return Math.round((Date.now() - workoutStartMs) / 60000);
    return null;
  }

  function onPhaseChange(){
    const days = appState.activeProgram.structure.find(p => p.name === phase)?.days || [];
    day = days[0]?.name || '';
    exercises = buildExercisesForDay(phase, day);
  }
  function onDayChange(){
    exercises = buildExercisesForDay(phase, day);
  }

  // LogWorkout is the sole owner of `exercises` - all mutations happen here,
  // children receive plain values + callbacks. (An earlier version tried
  // chaining $bindable() props through ExerciseCard -> SetRow with bind:value
  // on a nested property two levels down; that combination triggered a real
  // Svelte reactivity infinite loop. Single-owner + callbacks avoids it.)
  function handleSetField(exIdx, setIdx, field, value){
    exercises[exIdx].sets[setIdx][field] = value;
  }
  function handleAddSet(exIdx){
    exercises[exIdx].sets.push({ weight: '', reps: '', tag: '', checked: false });
  }
  function handleRemoveSet(exIdx, setIdx){
    exercises[exIdx].sets.splice(setIdx, 1);
  }
  function handleCheckSet(exIdx, setIdx){
    if(!(workoutStartMs && !workoutEndMs)){
      status = 'Start the workout to log sets.';
      return;
    }
    const set = exercises[exIdx].sets[setIdx];
    set.checked = !set.checked;
    if(set.checked) restBarRef?.start();
  }
  function handleToggleMenu(key){
    openMenuKey = (openMenuKey === key) ? null : key;
  }
  function handleAutoStartRest(){
    restBarRef?.start();
  }

  function collectDraftState(){
    // nothing worth recovering until a workout is actually running - matches
    // restoreDraftIfAny's own guard, and avoids re-writing a stale empty
    // draft right after a successful save resets the clock.
    if(!phase || !day || !workoutStartMs) return null;
    return {
      phase, day,
      exercises: exercises.map(ex => ({
        name: ex.name,
        exerciseId: ex.exerciseId,
        sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps, tag: s.tag, checked: s.checked })),
      })),
      workoutStartMs, workoutEndMs, savedAt: Date.now(),
      programId: appState.activeProgram?.id,
      programName: appState.activeProgram?.name,
    };
  }

  // Deep-reads the whole reactive workout tree so this effect re-runs on ANY
  // nested edit (weight/reps/tag/checked, add/remove set, clock start/end) -
  // must stay $state (not $state.raw) all the way down or autosave silently
  // stops firing. See CONTEXT.md re: the prior data-loss incident this exists for.
  $effect(() => {
    void phase; void day; void workoutStartMs; void workoutEndMs;
    JSON.stringify(exercises);
    queueDraftSave(collectDraftState);
  });

  async function restoreDraftIfAny(){
    const draft = loadDraft();
    if(!draft || !draft.exercises || !draft.exercises.length) return;
    if(!draft.workoutStartMs) return;
    const minutesAgo = Math.round((Date.now() - (draft.savedAt || Date.now())) / 60000);
    const label = minutesAgo <= 1 ? 'a moment ago' : `${minutesAgo} min ago`;
    const ok = confirm(`Resume unsaved workout (${draft.phase} — ${draft.day}) from ${label}?`);
    if(!ok){
      clearDraft();
      return;
    }
    phase = draft.phase;
    day = draft.day;
    exercises = buildExercisesForDay(phase, day);

    // match by exerciseId, not array position - the active program's exercise
    // order could have changed between saving the draft and reloading
    draft.exercises.forEach(draftEx => {
      const target = exercises.find(ex => ex.exerciseId === draftEx.exerciseId);
      if(!target) return;
      target.sets = draftEx.sets.map(s => ({
        weight: s.weight || '',
        reps: s.reps || '',
        tag: s.tag === 'working' ? '' : (s.tag || ''),
        checked: !!s.checked,
      }));
    });

    workoutStartMs = draft.workoutStartMs;
    workoutEndMs = draft.workoutEndMs;
    if(workoutStartMs && !workoutEndMs){
      clockLabel = 'Workout Timer (running)';
      clockBtnLabel = 'End Workout';
      clockEnded = false;
      startClockInterval();
    } else if(workoutStartMs && workoutEndMs){
      clockTimeText = fmtHMS(Math.floor((workoutEndMs - workoutStartMs) / 1000));
      clockLabel = 'Workout Timer (ended)';
      clockBtnLabel = 'Start New';
      clockEnded = true;
    }
    status = 'Restored your in-progress workout.';
  }

  // Whenever the active program changes (initial login, or switching programs
  // via the Programs tab) reset to its first phase/day. Draft restore only
  // ever runs once, on the very first load.
  //
  // This effect reads several appState properties (activeProgram, its nested
  // structure/set_presets, exercisesById), and in practice fires more than
  // once for what is logically a single "program became active" event -
  // observed 4 firings for one login in testing, likely from how the several
  // async assignments in refreshActiveProgramState land as separate reactive
  // writes. Whatever the exact cause, resetting `exercises` unconditionally
  // on every firing wiped out restoreDraftIfAny's work the instant it
  // finished. refreshActiveProgramState only ever assigns appState.activeProgram
  // ONCE per call (always a fresh object, even when editing the program that's
  // already active), so comparing object identity - not just id - collapses
  // the redundant re-fires to exactly one while still catching every genuine
  // refresh (Set Active, or editing the currently-active program).
  let lastProcessedProgramRef = null;
  $effect(() => {
    if(appState.activeProgram && appState.activeProgram !== lastProcessedProgramRef){
      lastProcessedProgramRef = appState.activeProgram;
      // use local temps, not the reactive phase/day vars, so this effect only
      // WRITES phase/day and never reads them back - reading a $state var it
      // also writes in the same run makes the effect depend on its own write,
      // which self-triggers forever (this caused a real stack overflow).
      const newPhase = appState.activeProgram.structure[0]?.name || '';
      const newDay = appState.activeProgram.structure[0]?.days[0]?.name || '';
      const newExercises = buildExercisesForDay(newPhase, newDay);
      phase = newPhase;
      day = newDay;
      exercises = newExercises;
      if(!draftRestoreDone){
        draftRestoreDone = true;
        restoreDraftIfAny();
      }
    }
  });

  async function handleSave(){
    const list = [];
    exercises.forEach(ex => {
      const setData = ex.sets
        .map((s, i) => ({ set: String(i + 1), weight: String(s.weight).trim(), reps: String(s.reps).trim(), tag: s.tag || 'working' }))
        .filter(s => s.weight || s.reps);
      if(setData.length) list.push({ exerciseId: ex.exerciseId, name: ex.name, sets: setData });
    });

    if(!list.length){
      status = 'Nothing logged — fill in at least one set.';
      return;
    }

    status = 'Saving...';
    const durationMin = getWorkoutDurationMin();
    const entry = {
      dateISO: new Date().toISOString(),
      phase, day, exercises: list, durationMin,
      program_id: appState.activeProgram.id,
      program_name: appState.activeProgram.name,
    };
    const savedId = await insertLog(entry);
    const ok = !!savedId;
    status = ok ? 'Workout saved.' : 'Save failed — try again.';
    if(ok){
      clearDraft();
      exercises = buildExercisesForDay(phase, day);
      workoutStartMs = null;
      workoutEndMs = null;
      clearInterval(clockInterval);
      clockTimeText = '00:00';
      clockLabel = 'Workout Timer';
      clockBtnLabel = 'Start Workout';
      clockEnded = false;
      restBarRef?.hide();
      await refreshWorkoutLogs();
    }
  }
</script>

<svelte:window onclick={() => openMenuKey = null} />

<div class="clockbar">
  <div>
    <div class="clock-label">{clockLabel}</div>
    <div class="clock-time">{clockTimeText}</div>
  </div>
  <button class:ended={clockEnded} onclick={onClockBtnClick}>{clockBtnLabel}</button>
</div>

<div class="select-group">
  <div class="select-label">Phase</div>
  <select id="phaseSelect" bind:value={phase} onchange={onPhaseChange}>
    {#each phaseNames as p}<option value={p}>{p}</option>{/each}
  </select>
</div>
<div class="select-group">
  <div class="select-label">Day</div>
  <select id="daySelect" bind:value={day} onchange={onDayChange}>
    {#each dayNames as d}<option value={d}>{d}</option>{/each}
  </select>
</div>

{#if !appState.activeProgram}
  <div class="prog-empty">No active program found. Create one in the Programs tab.</div>
{:else}
  <div id="exercises" class:locked={locked}>
    {#each exercises as exercise, exIdx (exercise.exerciseId)}
      <ExerciseCard
        {exercise}
        {exIdx}
        {phase}
        {increment}
        {locked}
        {openMenuKey}
        onToggleMenu={handleToggleMenu}
        onCheckSet={(setIdx) => handleCheckSet(exIdx, setIdx)}
        onAutoStartRest={handleAutoStartRest}
        onSetField={(setIdx, field, value) => handleSetField(exIdx, setIdx, field, value)}
        onAddSet={() => handleAddSet(exIdx)}
        onRemoveSet={(setIdx) => handleRemoveSet(exIdx, setIdx)}
      />
    {/each}
  </div>
{/if}

<button class="btn btn-primary" onclick={handleSave}>Save Workout</button>
<div class="status">{status}</div>

<RestBar bind:this={restBarRef} {phase} />
