import { sb } from './supabaseClient.js';

export async function loadExercisesById(){
  const { data, error } = await sb.from('exercises').select('id, display_name');
  const map = {};
  if(!error){ (data||[]).forEach(r=>{ map[r.id] = r.display_name; }); }
  return map;
}

export async function loadActiveProgram(){
  const { data, error } = await sb.from('programs').select('*').eq('is_active', true).single();
  if(error || !data) return null;
  return data;
}

export async function loadAllPrograms(){
  const { data, error } = await sb.from('programs').select('id,name,structure,is_active').order('created_at', {ascending:true});
  if(error) return [];
  return data || [];
}

export async function setActiveProgramInDb(id){
  await sb.from('programs').update({is_active:false}).eq('is_active', true);
  await sb.from('programs').update({is_active:true}).eq('id', id);
}

export async function saveProgram({ id, name, structure }){
  if(id){
    return await sb.from('programs').update({ name, structure }).eq('id', id);
  }
  return await sb.from('programs').insert({ name, structure, set_presets: {}, is_active: false });
}

export async function loadLogs(){
  try{
    const { data, error } = await sb.from('workout_logs').select('*').order('date_iso', {ascending:true});
    if(error) throw error;
    return (data||[]).map(row=>({
      id: row.id,
      dateISO: row.date_iso,
      phase: row.phase,
      day: row.day,
      durationMin: row.duration_min,
      exercises: row.exercises,
      program_id: row.program_id,
      program_name: row.program_name,
    }));
  }catch(e){ return []; }
}

export async function insertLog(entry){
  try{
    const { data, error } = await sb.from('workout_logs').insert({
      program_id: entry.program_id,
      program_name: entry.program_name,
      date_iso: entry.dateISO,
      phase: entry.phase,
      day: entry.day,
      duration_min: entry.durationMin,
      exercises: entry.exercises,
    }).select().single();
    if(error) throw error;
    return data.id;
  }catch(e){ return null; }
}

export async function loadHealthMetrics(){
  try{
    const { data, error } = await sb.from('health_metrics').select('*').order('date', {ascending:false});
    if(error) throw error;
    return data || [];
  }catch(e){ return []; }
}

export async function deleteLog(id){
  try{
    const { error } = await sb.from('workout_logs').delete().eq('id', id);
    return !error;
  }catch(e){ return false; }
}

export async function loadCatalogForBuilder(){
  const [mv, eq, me] = await Promise.all([
    sb.from('movements').select('id,name').order('name'),
    sb.from('equipment').select('id,name').order('name'),
    sb.from('movement_equipment').select('movement_id,equipment_id'),
  ]);
  const movements = mv.data || [];
  const equipment = eq.data || [];
  const eqById = {}; equipment.forEach(e=>{ eqById[e.id]=e; });
  const movementEquipment = {};
  (me.data||[]).forEach(row=>{
    if(!movementEquipment[row.movement_id]) movementEquipment[row.movement_id] = [];
    if(eqById[row.equipment_id]) movementEquipment[row.movement_id].push(eqById[row.equipment_id]);
  });
  return { movements, equipment, movementEquipment };
}

const exerciseResolveCache = {};
export async function resolveOrCreateExercise(movementId, equipmentId, movements, equipment){
  const key = `${movementId}::${equipmentId}`;
  if(exerciseResolveCache[key]) return exerciseResolveCache[key];
  const { data: existing } = await sb.from('exercises').select('id,display_name')
    .eq('movement_id', movementId).eq('equipment_id', equipmentId).maybeSingle();
  if(existing){
    exerciseResolveCache[key] = { exerciseId: existing.id, displayName: existing.display_name };
    return exerciseResolveCache[key];
  }
  const movementName = (movements.find(m=>m.id===movementId)||{}).name || '';
  const equipmentName = (equipment.find(e=>e.id===equipmentId)||{}).name || '';
  const displayName = `${movementName} (${equipmentName})`;
  const { data: created, error } = await sb.from('exercises')
    .insert({movement_id: movementId, equipment_id: equipmentId, display_name: displayName})
    .select().single();
  if(error) throw error;
  exerciseResolveCache[key] = { exerciseId: created.id, displayName: created.display_name };
  return exerciseResolveCache[key];
}

// ---- Library (catalog) CRUD ----

export async function loadSimpleCatalog(table){
  const { data } = await sb.from(table).select('id,name').order('name');
  return data || [];
}

export async function addSimpleCatalogItem(table, name){
  const { error } = await sb.from(table).insert({ name });
  return !error;
}

export async function loadMovementsWithMappings(){
  const [mvRes, bpRes, eqRes, mbpRes, meRes] = await Promise.all([
    sb.from('movements').select('id,name').order('name'),
    sb.from('body_parts').select('id,name').order('name'),
    sb.from('equipment').select('id,name').order('name'),
    sb.from('movement_body_parts').select('movement_id,body_part_id'),
    sb.from('movement_equipment').select('movement_id,equipment_id'),
  ]);
  return {
    movements: mvRes.data || [],
    bodyParts: bpRes.data || [],
    equipment: eqRes.data || [],
    movementBodyParts: mbpRes.data || [],
    movementEquipment: meRes.data || [],
  };
}

export async function addMovement(name, bodyPartIds, equipmentIds){
  const { data: created, error } = await sb.from('movements').insert({name}).select().single();
  if(error) return { error };
  if(bodyPartIds.length) await sb.from('movement_body_parts').insert(bodyPartIds.map(id=>({movement_id: created.id, body_part_id: id})));
  if(equipmentIds.length) await sb.from('movement_equipment').insert(equipmentIds.map(id=>({movement_id: created.id, equipment_id: id})));
  return { data: created };
}

export async function loadExercisesBrowse(){
  const { data } = await sb.from('exercises').select('id,display_name').order('display_name');
  return data || [];
}

// ---- One-time migration of pre-Supabase localStorage logs into workout_logs ----
export async function migrateLegacyLocalLogsIfAny(activeProgram, exercisesById){
  const MIGRATION_FLAG = 'workout-logs-migrated-v1';
  try{
    if(localStorage.getItem(MIGRATION_FLAG)) return;
    const raw = localStorage.getItem('workout-logs');
    if(!raw){ localStorage.setItem(MIGRATION_FLAG, '1'); return; }
    const legacyLogs = JSON.parse(raw);
    if(!Array.isArray(legacyLogs) || !legacyLogs.length){ localStorage.setItem(MIGRATION_FLAG, '1'); return; }

    const nameToId = {};
    (activeProgram.structure || []).forEach(phase=>{
      (phase.days || []).forEach(day=>{
        (day.exercises || []).forEach(ex=>{
          const displayName = exercisesById[ex.exerciseId];
          if(displayName) nameToId[displayName] = ex.exerciseId;
        });
      });
    });

    let allOk = true;
    for(const entry of legacyLogs){
      const exercises = (entry.exercises||[]).map(ex=>({
        exerciseId: nameToId[ex.name] || null,
        name: ex.name,
        sets: ex.sets,
      }));
      const id = await insertLog({
        dateISO: entry.dateISO,
        phase: entry.phase,
        day: entry.day,
        durationMin: entry.durationMin,
        exercises,
        program_id: activeProgram.id,
        program_name: activeProgram.name,
      });
      if(!id){ allOk = false; }
    }

    if(allOk){
      localStorage.setItem('workout-logs-legacy-backup', raw);
      localStorage.removeItem('workout-logs');
      localStorage.setItem(MIGRATION_FLAG, '1');
    }
  }catch(e){ /* leave legacy data untouched; will retry next load */ }
}
