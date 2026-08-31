<script>
  import { onMount } from 'svelte';
  import { appState, refreshWorkoutLogs } from '../lib/state.svelte.js';
  import { insertLog, loadCatalogForBuilder, resolveOrCreateExercise } from '../lib/db.js';
  import { loadDraft, saveDraft, clearDraft, queueDraftSave } from '../lib/draft.js';
  import ExerciseCard from './ExerciseCard.svelte';
  import ExercisePicker from './ExercisePicker.svelte';
  import RestBar from './RestBar.svelte';

  let phase = $state('');
  let day = $state('');
  let exercises = $state([]);
  // catalog for the session-only "swap exercise" / "add exercise" flows below -
  // these edit `exercises` directly and never touch the saved program
  // structure, so swapping/adding here only affects this one workout.
  let catalog = $state({ movements: [], equipment: [], movementEquipment: {} });
  onMount(async () => {
    catalog = await loadCatalogForBuilder();
  });
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

  function todayDateString(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  let backdateMode = $state(false);
  let backdateDate = $state(todayDateString());
  let backdateDurationMin = $state('');

  // A phase is "completed" once the most recent logged workout for this
  // program has moved on to a later phase - phases are calendar/week-based
  // blocks, not something you clear by doing every day once, so "index before
  // wherever the last real log landed" is the right definition.
  function findCurrentPhaseIndex(structure, workoutLogs, programId){
    const relevant = workoutLogs.filter(l => l.program_id === programId);
    if(!relevant.length) return 0;
    const lastLog = relevant[relevant.length - 1]; // workoutLogs is sorted ascending by date
    const idx = structure.findIndex(p => p.name === lastLog.phase);
    return idx === -1 ? 0 : idx;
  }

  // Defaults Log Workout to wherever the user actually left off: the phase of
  // their most recent log, and the day after that in the split rotation
  // (cycling within that phase's own day order, wrapping past the last day).
  function computeDefaultPhaseDay(structure, workoutLogs, programId){
    const fallback = { phase: structure[0]?.name || '', day: structure[0]?.days[0]?.name || '' };
    const phaseIdx = findCurrentPhaseIndex(structure, workoutLogs, programId);
    const phaseObj = structure[phaseIdx];
    if(!phaseObj) return fallback;
    const relevant = workoutLogs.filter(l => l.program_id === programId);
    const lastLog = relevant.length ? relevant[relevant.length - 1] : null;
    const days = phaseObj.days;
    const dayIdx = lastLog ? days.findIndex(d => d.name === lastLog.day) : -1;
    const nextDay = dayIdx === -1 ? days[0] : days[(dayIdx + 1) % days.length];
    return { phase: phaseObj.name, day: nextDay?.name || fallback.day };
  }

  const currentPhaseIndex = $derived(
    appState.activeProgram
      ? findCurrentPhaseIndex(appState.activeProgram.structure, appState.workoutLogs, appState.activeProgram.id)
      : 0
  );
  const phaseNames = $derived(appState.activeProgram ? appState.activeProgram.structure.map(p => p.name) : []);
  const dayNames = $derived(
    appState.activeProgram
      ? (appState.activeProgram.structure.find(p => p.name === phase)?.days.map(d => d.name) || [])
      : []
  );
  const isLegDay = $derived(/leg/i.test(day));
  const increment = $derived(isLegDay ? 5 : 2.5);
  const locked = $derived(backdateMode ? false : !(workoutStartMs && !workoutEndMs));

  /** Leading integer of a target string like "6-8 reps" -> 6. @param {string} str */
  function leadingNumber(str){
    const m = (str || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  // Sets from the most recent session that contains this exercise, anywhere in
  // the active program. This is what prefills a new workout - set_presets is a
  // snapshot frozen when the program was built and nothing writes back to it,
  // so using it meant the form still offered 490x5 long after you'd worked up
  // to 500x6.
  function lastLoggedSetsFor(exerciseId){
    const logs = appState.workoutLogs;
    for(let i = logs.length - 1; i >= 0; i--){
      if(logs[i].program_id !== appState.activeProgram?.id) continue;
      const match = logs[i].exercises.find(e => e.exerciseId === exerciseId);
      if(match && match.sets.length) return match.sets;
    }
    return null;
  }

  function buildExercisesForDay(phaseName, dayName){
    const phaseObj = appState.activeProgram?.structure.find(p => p.name === phaseName);
    const dayObj = phaseObj?.days.find(d => d.name === dayName);
    if(!dayObj) return [];
    const presetKey = `${phaseName}::${dayName}`;
    const presets = appState.activeProgram.set_presets?.[presetKey] || {};
    // Increment is derived from the day being BUILT, not the reactive `day` -
    // this runs for phase/day switches too, where they differ.
    const dayIncrement = /leg/i.test(dayName) ? 5 : 2.5;
    return dayObj.exercises.map(ex => {
      const name = appState.exercisesById[ex.exerciseId] || '(unknown exercise)';
      // History first, program presets only as a fallback for an exercise
      // that has never been logged.
      const logged = lastLoggedSetsFor(ex.exerciseId);
      const sourceSets = logged || presets[name] || null;
      // Follow the set count actually performed last time, since sets get
      // added and dropped mid-workout; fall back to the prescribed count when
      // there's no history to go on.
      const setCount = sourceSets ? sourceSets.length : ex.sets;
      const goalReps = leadingNumber(ex.target);
      const sets = [];
      for(let i = 0; i < setCount; i++){
        const src = sourceSets && sourceSets[i];
        const srcTag = src ? src.tag : '';
        const isWarmup = srcTag === 'warmup' || srcTag === 'dropset';
        const w = src && src.weight != null ? parseFloat(src.weight) : NaN;
        const r = src && src.reps != null ? parseInt(src.reps, 10) : NaN;
        // Prefill the SUGGESTION, not last week's number: a working set that
        // hit the target rep count comes back one increment heavier. Warmups
        // and dropsets carry over untouched, and presets (no history) are
        // taken as prescribed.
        const progress = logged && !isWarmup && !isNaN(w) && !isNaN(r) && goalReps && r >= goalReps;
        const weight = progress ? String(w + dayIncrement)
          : (src && src.weight != null ? String(src.weight) : '');
        sets.push({
          weight,
          reps: src && src.reps != null ? String(src.reps) : '',
          tag: srcTag === 'working' ? '' : (srcTag || ''),
          checked: false,
        });
      }
      return { exerciseId: ex.exerciseId, name, target: ex.target, restSec: ex.restSec || null, sets, collapsed: true, activeTab: 'log' };
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
  // Session-only: adds/swaps an exercise in the in-memory `exercises` list for
  // THIS workout. Never writes to the program's structure - a substitution
  // (machine's taken, want a variant today) shouldn't permanently edit the
  // template. resolveOrCreateExercise reuses an existing movement+equipment
  // row if one exists, or creates it, same as the Program Builder.
  async function handleAddExercise(movementId, equipmentId, setsCount, target){
    const { exerciseId, displayName } = await resolveOrCreateExercise(movementId, equipmentId, catalog.movements, catalog.equipment);
    // exercises are keyed by exerciseId in the {#each} below - a duplicate
    // would break that keying, so just point them at the existing card.
    if(exercises.some(ex => ex.exerciseId === exerciseId)){
      status = `${displayName} is already in this workout.`;
      return;
    }
    const n = parseInt(setsCount, 10) || 1;
    const newSets = Array.from({ length: n }, () => ({ weight: '', reps: '', tag: '', checked: false }));
    exercises.push({ exerciseId, name: displayName, target: target || '', sets: newSets, collapsed: false, activeTab: 'log' });
  }
  async function handleSwapExercise(exIdx, movementId, equipmentId){
    const { exerciseId, displayName } = await resolveOrCreateExercise(movementId, equipmentId, catalog.movements, catalog.equipment);
    if(exercises.some((ex, i) => ex.exerciseId === exerciseId && i !== exIdx)){
      status = `${displayName} is already in this workout.`;
      openMenuKey = null;
      return;
    }
    const setCount = exercises[exIdx].sets.length || 1;
    exercises[exIdx] = {
      ...exercises[exIdx],
      exerciseId,
      name: displayName,
      sets: Array.from({ length: setCount }, () => ({ weight: '', reps: '', tag: '', checked: false })),
      collapsed: false,
    };
    openMenuKey = null;
  }
  function handleRemoveExercise(exIdx){
    exercises.splice(exIdx, 1);
    openMenuKey = null;
  }
  // Session-only reorder - moves the exercise within THIS workout, leaving the
  // saved program untouched (same scope as the swap/add flows above). The
  // {#each} is keyed by exerciseId, so Svelte moves the existing DOM nodes
  // rather than rebuilding them, and typed-but-unchecked set values survive.
  // Order is part of `exercises`, so the draft autosave picks it up for free.
  function handleMoveExercise(exIdx, delta){
    const to = exIdx + delta;
    if(to < 0 || to >= exercises.length) return;
    const [moved] = exercises.splice(exIdx, 1);
    exercises.splice(to, 0, moved);
    openMenuKey = null;
  }
  function handleCheckSet(exIdx, setIdx){
    if(!backdateMode && !(workoutStartMs && !workoutEndMs)){
      status = 'Start the workout to log sets.';
      return;
    }
    const set = exercises[exIdx].sets[setIdx];
    set.checked = !set.checked;
    if(set.checked && !backdateMode) restBarRef?.start(exercises[exIdx].restSec);
  }
  function toggleBackdateMode(){
    backdateMode = !backdateMode;
    if(backdateMode) status = '';
  }
  function handleToggleMenu(key){
    openMenuKey = (openMenuKey === key) ? null : key;
  }
  function handleAutoStartRest(restSec){
    restBarRef?.start(restSec);
  }

  function collectDraftState(){
    // nothing worth recovering until a workout is actually running (or a
    // backdated entry has been switched into) - matches restoreDraftIfAny's
    // own guard, and avoids re-writing a stale empty draft right after a
    // successful save resets the clock.
    if(!phase || !day || !(workoutStartMs || backdateMode)) return null;
    return {
      phase, day,
      exercises: exercises.map(ex => ({
        name: ex.name,
        exerciseId: ex.exerciseId,
        sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps, tag: s.tag, checked: s.checked })),
      })),
      workoutStartMs, workoutEndMs, savedAt: Date.now(),
      backdateMode, backdateDate, backdateDurationMin,
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
    void backdateMode; void backdateDate; void backdateDurationMin;
    JSON.stringify(exercises);
    queueDraftSave(collectDraftState);
  });

  async function restoreDraftIfAny(){
    const draft = loadDraft();
    if(!draft || !draft.exercises || !draft.exercises.length) return;
    if(!draft.workoutStartMs && !draft.backdateMode) return;
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
      let target = exercises.find(ex => ex.exerciseId === draftEx.exerciseId);
      if(!target){
        // exerciseId isn't in this day's template - the draft came from a
        // session-only add/swap (see handleAddExercise/handleSwapExercise),
        // not the program structure. Append it rather than dropping it.
        target = { exerciseId: draftEx.exerciseId, name: draftEx.name, target: '', sets: [], collapsed: true, activeTab: 'log' };
        exercises.push(target);
      }
      target.sets = draftEx.sets.map(s => ({
        weight: s.weight || '',
        reps: s.reps || '',
        tag: s.tag === 'working' ? '' : (s.tag || ''),
        checked: !!s.checked,
      }));
    });

    backdateMode = !!draft.backdateMode;
    backdateDate = draft.backdateDate || todayDateString();
    backdateDurationMin = draft.backdateDurationMin || '';

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
    status = backdateMode ? 'Restored your unsaved past workout entry.' : 'Restored your in-progress workout.';
  }

  // Whenever the active program changes (initial login, or switching programs
  // via the Programs tab) reset to wherever the user actually left off - the
  // phase/day just after their most recent log for this program, or the
  // program's first phase/day if it has none yet. Draft restore only ever
  // runs once, on the very first load.
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
      const { phase: newPhase, day: newDay } = computeDefaultPhaseDay(
        appState.activeProgram.structure, appState.workoutLogs, appState.activeProgram.id
      );
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
      // Live workouts: only sets actually checked off count as done - a set
      // with prefilled preset weight/reps that was never checked wasn't
      // completed, and shouldn't be saved as if it were. Backdated entries
      // don't have that "did I get to it" question - typing the data in IS
      // the record, so those still save on weight/reps being filled in
      // (requiring a checkbox tap per set there just risks silently losing
      // typed data if one gets missed).
      const setData = ex.sets
        .filter(s => backdateMode ? (s.weight || s.reps) : s.checked)
        .map((s, i) => ({ set: String(i + 1), weight: String(s.weight).trim(), reps: String(s.reps).trim(), tag: s.tag || 'working' }));
      if(setData.length) list.push({ exerciseId: ex.exerciseId, name: ex.name, sets: setData });
    });

    if(!list.length){
      status = 'Nothing logged — fill in at least one set.';
      return;
    }
    if(backdateMode && !backdateDate){
      status = 'Pick a date for this workout.';
      return;
    }

    status = 'Saving...';
    const durationMin = backdateMode
      ? (backdateDurationMin ? Number(backdateDurationMin) : null)
      : getWorkoutDurationMin();
    // Record the clock's real start/end. These are what lets a HealthKit
    // workout be matched to this session instead of landing as a second row
    // for the same training - without them there's nothing to match on, since
    // date_iso used to be the moment Save was tapped, not when you trained.
    const startedAt = (!backdateMode && workoutStartMs) ? new Date(workoutStartMs).toISOString() : null;
    const endedAt = (!backdateMode && workoutEndMs) ? new Date(workoutEndMs).toISOString() : null;
    const dateISO = backdateMode
      ? new Date(`${backdateDate}T12:00:00`).toISOString()
      : (startedAt ?? new Date().toISOString());
    const entry = {
      dateISO, startedAt, endedAt,
      phase, day, exercises: list, durationMin,
      program_id: appState.activeProgram.id,
      program_name: appState.activeProgram.name,
    };
    const savedId = await insertLog(entry);
    const ok = !!savedId;
    status = ok ? 'Workout saved.' : 'Save failed — try again.';
    if(ok){
      clearDraft();
      // Refresh BEFORE rebuilding: the form now prefills from the last logged
      // session, so rebuilding first would fill it from the previous workout
      // and drop the one just saved.
      await refreshWorkoutLogs();
      exercises = buildExercisesForDay(phase, day);
      workoutStartMs = null;
      workoutEndMs = null;
      clearInterval(clockInterval);
      clockTimeText = '00:00';
      clockLabel = 'Workout Timer';
      clockBtnLabel = 'Start Workout';
      clockEnded = false;
      backdateMode = false;
      backdateDate = todayDateString();
      backdateDurationMin = '';
      restBarRef?.hide();
    }
  }
</script>

<svelte:window onclick={() => openMenuKey = null} />

{#if backdateMode}
  <div class="backdate-bar">
    <div class="select-group">
      <div class="select-label">Date</div>
      <input type="date" class="text-input" bind:value={backdateDate} max={todayDateString()} />
    </div>
    <div class="select-group">
      <div class="select-label">Duration (min)</div>
      <input type="number" class="text-input" bind:value={backdateDurationMin} placeholder="e.g. 60" min="0" />
    </div>
    <button class="link-btn muted" onclick={toggleBackdateMode}>Cancel — log a live workout instead</button>
  </div>
{:else}
  <div class="clockbar">
    <div>
      <div class="clock-label">{clockLabel}</div>
      <div class="clock-time">{clockTimeText}</div>
    </div>
    <button class:ended={clockEnded} onclick={onClockBtnClick}>{clockBtnLabel}</button>
  </div>
  <button class="link-btn muted backdate-toggle" onclick={toggleBackdateMode}>Log a past workout instead</button>
{/if}

<div class="select-group">
  <div class="select-label">Phase</div>
  <select id="phaseSelect" class="text-select" bind:value={phase} onchange={onPhaseChange}>
    {#each phaseNames as p, i}
      <option value={p}>{p}{i < currentPhaseIndex ? ' ✓ completed' : (i === currentPhaseIndex ? ' (current)' : '')}</option>
    {/each}
  </select>
</div>
<div class="select-group">
  <div class="select-label">Day</div>
  <select id="daySelect" class="text-select" bind:value={day} onchange={onDayChange}>
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
        {catalog}
        onToggleMenu={handleToggleMenu}
        onCheckSet={(setIdx) => handleCheckSet(exIdx, setIdx)}
        onAutoStartRest={handleAutoStartRest}
        onSetField={(setIdx, field, value) => handleSetField(exIdx, setIdx, field, value)}
        onAddSet={() => handleAddSet(exIdx)}
        onRemoveSet={(setIdx) => handleRemoveSet(exIdx, setIdx)}
        onSwapExercise={(movementId, equipmentId) => handleSwapExercise(exIdx, movementId, equipmentId)}
        onRemoveExercise={() => handleRemoveExercise(exIdx)}
        onMove={(delta) => handleMoveExercise(exIdx, delta)}
        isFirst={exIdx === 0}
        isLast={exIdx === exercises.length - 1}
      />
    {/each}
  </div>
  <div class="add-exercise-section">
    <div class="form-label">Add an exercise to this workout</div>
    <ExercisePicker movements={catalog.movements} equipment={catalog.equipment} movementEquipment={catalog.movementEquipment} onAdd={handleAddExercise} />
  </div>
{/if}

<button class="btn btn-primary" onclick={handleSave}>Save Workout</button>
<div class="status">{status}</div>

<RestBar bind:this={restBarRef} {phase} />
