<script>
  let {
    weight = $bindable(), reps = $bindable(),   // bound directly to the source array element
    tag, checked,
    setNum,
    locked,           // true when workout isn't active - blocks checking
    menuOpen,
    onToggleMenu,
    onTagSelect,
    onCheck,
    onRemove,
    onAutoStartRest,
  } = $props();

  /** @param {string} t */
  function tagDisplay(t){
    if(t === 'warmup') return '\u{1F525}';
    if(t === 'dropset') return 'D';
    if(t === 'failure') return 'F';
    return setNum;
  }

  function handleChange(){
    if(locked) return;
    if(String(weight).trim() && String(reps).trim()) onAutoStartRest();
  }

  /** @param {MouseEvent} e */
  function toggleMenu(e){
    e.stopPropagation();
    onToggleMenu();
  }
  /** @param {MouseEvent} e @param {string} t */
  function selectTag(e, t){
    e.stopPropagation();
    onTagSelect(t);
  }
</script>

<div class="setrow">
  <div class="tag-wrap">
    <button type="button" class="set-tag-btn" data-tag={tag} onclick={toggleMenu}>{tagDisplay(tag)}</button>
    <div class="tag-menu" class:open={menuOpen}>
      <div onclick={(e) => selectTag(e, '')}>Set</div>
      <div onclick={(e) => selectTag(e, 'warmup')}>Warmup</div>
      <div onclick={(e) => selectTag(e, 'dropset')}>Drop</div>
      <div onclick={(e) => selectTag(e, 'failure')}>Failure</div>
    </div>
  </div>
  <div class="field-wrap">
    <input type="text" inputmode="decimal" placeholder="lbs" bind:value={weight} onchange={handleChange}>
  </div>
  <div class="field-wrap reps-wrap">
    <input type="text" inputmode="numeric" placeholder="reps" bind:value={reps} onchange={handleChange}>
    <span class="unit">reps</span>
  </div>
  <button type="button" class="check-btn" class:checked={checked} onclick={onCheck}>&#10003;</button>
  <button type="button" class="remove-set-btn" onclick={onRemove}>&minus;</button>
</div>
