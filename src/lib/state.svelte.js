import { loadActiveProgram, loadExercisesById, loadExerciseBodyParts, loadLogs, migrateLegacyLocalLogsIfAny } from './db.js';

// Shared reactive app state. Import `appState` (the container) and mutate its
// properties - never destructure this export, or reactivity breaks (same
// footgun as destructured props in Svelte 5).
export const appState = $state({
  activeProgram: null,   // full row from `programs`, or null if none active
  exercisesById: {},     // id -> display_name
  exerciseBodyParts: {}, // id -> body part name[], via the exercise's movement
  workoutLogs: [],        // all workout_logs rows, refreshed on program load / after save/delete
});

export async function refreshWorkoutLogs(){
  appState.workoutLogs = await loadLogs();
}

export async function refreshActiveProgramState(){
  appState.exercisesById = await loadExercisesById();
  appState.exerciseBodyParts = await loadExerciseBodyParts();
  const program = await loadActiveProgram();
  // load workoutLogs BEFORE assigning activeProgram - LogWorkout's phase/day
  // defaulting effect only reacts to activeProgram's identity changing, so it
  // must already see fresh logs the moment that happens, not a later refetch.
  if(program){
    appState.workoutLogs = await loadLogs();
  }
  appState.activeProgram = program;
}

export async function startApp(){
  await refreshActiveProgramState();
  if(appState.activeProgram){
    await migrateLegacyLocalLogsIfAny(appState.activeProgram, appState.exercisesById);
    await refreshWorkoutLogs();
  }
}
