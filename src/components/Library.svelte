<script>
  import CatalogList from './CatalogList.svelte';
  import MovementsPanel from './MovementsPanel.svelte';
  import ExercisesBrowse from './ExercisesBrowse.svelte';

  let { active } = $props();

  let subTab = $state('bodyparts');
</script>

<div class="subtabs-row">
  <div class="subtab-item" class:active={subTab === 'bodyparts'} onclick={() => subTab = 'bodyparts'}>Body Parts</div>
  <div class="subtab-item" class:active={subTab === 'equipment'} onclick={() => subTab = 'equipment'}>Equipment</div>
  <div class="subtab-item" class:active={subTab === 'movements'} onclick={() => subTab = 'movements'}>Movements</div>
  <div class="subtab-item" class:active={subTab === 'exercises'} onclick={() => subTab = 'exercises'}>Exercises</div>
</div>

<div class="lib-panel" class:active={subTab === 'bodyparts'}>
  <CatalogList table="body_parts" label="Body Part" active={active && subTab === 'bodyparts'} />
</div>
<div class="lib-panel" class:active={subTab === 'equipment'}>
  <CatalogList table="equipment" label="Equipment" active={active && subTab === 'equipment'} />
</div>
<div class="lib-panel" class:active={subTab === 'movements'}>
  <MovementsPanel active={active && subTab === 'movements'} />
</div>
<div class="lib-panel" class:active={subTab === 'exercises'}>
  <ExercisesBrowse active={active && subTab === 'exercises'} />
</div>
