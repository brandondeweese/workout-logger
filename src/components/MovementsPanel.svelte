<script>
  import { loadMovementsWithMappings, addMovement } from '../lib/db.js';

  let { active } = $props();

  let movements = $state([]);
  let bodyParts = $state([]);
  let equipmentList = $state([]);
  let bpByMovement = $state({});
  let eqByMovement = $state({});
  let newName = $state('');
  let selectedBodyParts = $state([]);
  let selectedEquipment = $state([]);
  let statusMsg = $state('');

  $effect(() => {
    if(active) refresh();
  });

  async function refresh(){
    const res = await loadMovementsWithMappings();
    movements = res.movements;
    bodyParts = res.bodyParts;
    equipmentList = res.equipment;

    const bpMap = {};
    res.movementBodyParts.forEach(r => { (bpMap[r.movement_id] ||= []).push(r.body_part_id); });
    bpByMovement = bpMap;

    const eqMap = {};
    res.movementEquipment.forEach(r => { (eqMap[r.movement_id] ||= []).push(r.equipment_id); });
    eqByMovement = eqMap;

    // default: all equipment allowed for a new movement, matching the original's checked-by-default
    selectedEquipment = equipmentList.map(e => e.id);
    selectedBodyParts = [];
  }

  function bpNames(movementId){
    return (bpByMovement[movementId] || []).map(id => (bodyParts.find(b => b.id === id) || {}).name).filter(Boolean).join(', ');
  }
  function eqNames(movementId){
    return (eqByMovement[movementId] || []).map(id => (equipmentList.find(e => e.id === id) || {}).name).filter(Boolean).join(', ');
  }

  function toggleBodyPart(id){
    selectedBodyParts = selectedBodyParts.includes(id) ? selectedBodyParts.filter(x => x !== id) : [...selectedBodyParts, id];
  }
  function toggleEquipment(id){
    selectedEquipment = selectedEquipment.includes(id) ? selectedEquipment.filter(x => x !== id) : [...selectedEquipment, id];
  }

  async function handleAdd(){
    const name = newName.trim();
    if(!name){ statusMsg = 'Name required.'; return; }
    statusMsg = 'Saving…';
    const { error } = await addMovement(name, selectedBodyParts, selectedEquipment);
    if(error){ statusMsg = 'Could not add (maybe already exists).'; return; }
    newName = '';
    statusMsg = '';
    await refresh();
  }
</script>

{#if !movements.length}
  <div class="empty">No movements yet.</div>
{:else}
  {#each movements as m (m.id)}
    <div class="list-row">
      <div class="list-row-name">{m.name}</div>
      <div class="list-row-meta">{bpNames(m.id) || 'no body parts set'}</div>
      <div class="list-row-meta">{eqNames(m.id) || 'no equipment set'}</div>
    </div>
  {/each}
{/if}
<div class="builder-block">
  <div class="form-label" style="margin-top:0;">New Movement</div>
  <input type="text" class="text-input" placeholder="e.g. Cable Row" bind:value={newName}>
  <div class="form-label">Body Parts</div>
  <div class="check-grid">
    {#each bodyParts as b (b.id)}
      <label class="check-row"><input type="checkbox" checked={selectedBodyParts.includes(b.id)} onchange={() => toggleBodyPart(b.id)}> {b.name}</label>
    {/each}
  </div>
  <div class="form-label">Allowed Equipment</div>
  <div class="check-grid">
    {#each equipmentList as e (e.id)}
      <label class="check-row"><input type="checkbox" checked={selectedEquipment.includes(e.id)} onchange={() => toggleEquipment(e.id)}> {e.name}</label>
    {/each}
  </div>
  <button type="button" class="link-btn" style="margin-top:14px;" onclick={handleAdd}>+ Add Movement</button>
  <div class="status">{statusMsg}</div>
</div>
