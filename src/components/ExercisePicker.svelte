<script>
  let { movements, equipment, movementEquipment, onAdd } = $props();

  let movementId = $state('');
  let equipmentId = $state('');
  let sets = $state('');
  let target = $state('');
  let restSec = $state('');
  let adding = $state(false);

  const equipmentOptions = $derived(movementId ? (movementEquipment[movementId] || []) : []);

  function onMovementChange(){
    equipmentId = '';
  }

  async function handleAdd(){
    if(!movementId || !equipmentId || !sets){
      alert('Pick a movement, equipment, and number of sets.');
      return;
    }
    adding = true;
    await onAdd(parseInt(movementId, 10), parseInt(equipmentId, 10), sets, target, restSec ? parseInt(restSec, 10) : null);
    adding = false;
    movementId = ''; equipmentId = ''; sets = ''; target = ''; restSec = '';
  }
</script>

<div class="builder-ex-row add-ex-row">
  <select class="text-select" bind:value={movementId} onchange={onMovementChange}>
    <option value="">Movement…</option>
    {#each movements as m}<option value={m.id}>{m.name}</option>{/each}
  </select>
  <select class="text-select" bind:value={equipmentId} disabled={!equipmentOptions.length}>
    <option value="">Equipment…</option>
    {#each equipmentOptions as e}<option value={e.id}>{e.name}</option>{/each}
  </select>
  <input type="text" class="text-input" placeholder="Sets" inputmode="numeric" style="max-width:70px;" bind:value={sets}>
  <input type="text" class="text-input" placeholder="Target (e.g. 8-10 reps)" bind:value={target}>
  <input type="text" class="text-input" placeholder="Rest (sec)" inputmode="numeric" style="max-width:90px;" bind:value={restSec}>
  <button type="button" class="link-btn" disabled={adding} onclick={handleAdd}>{adding ? '…' : '+ Add'}</button>
</div>
