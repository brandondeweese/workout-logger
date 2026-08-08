import { loadActiveProgram, loadExercisesById, loadLogs, migrateLegacyLocalLogsIfAny } from './db.js';

// Shared reactive app state. Import `appState` (the container) and mutate its
// properties - never destructure this export, or reactivity breaks (same
// footgun as destructured props in Svelte 5).
export const appState = $state({
  activeProgram: null,   // full row from `programs`, or null if none active
  exercisesById: {},     // id -> display_name
  workoutLogs: [],        // all workout_logs rows, refreshed on program load / after save/delete
});

export async function refreshWorkoutLogs(){
  appState.workoutLogs = await loadLogs();
}

export async function refreshActiveProgramState(){
  appState.exercisesById = await loadExercisesById();
  appState.activeProgram = await loadActiveProgram();
  if(appState.activeProgram){
    await refreshWorkoutLogs();
  }
}

export async function startApp(){
  await refreshActiveProgramState();
  if(appState.activeProgram){
    await migrateLegacyLocalLogsIfAny(appState.activeProgram, appState.exercisesById);
    await refreshWorkoutLogs();
  }
}
