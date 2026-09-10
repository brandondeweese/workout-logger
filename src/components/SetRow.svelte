<script>
  import { onDestroy } from 'svelte';
  import MinusIcon from 'phosphor-svelte/lib/MinusIcon';
  import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
  import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
  import StopIcon from 'phosphor-svelte/lib/StopIcon';
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
    // Unit for the load field. Box jumps progress by box height, not pounds,
    // and the placeholder is the only thing on screen that says which.
    loadUnit = 'lbs',
    // What the second field counts. 'seconds' is a held set - a carry, a
    // plank, a dead hang - which you time rather than count, so the field
    // gets a stopwatch instead of a number you'd have to remember.
    repUnit = 'reps',
  } = $props();

  const timed = $derived(repUnit === 'seconds');

  let running = $state(false);
  let startedMs = 0;
  let ticker = null;

  function stopTicker(){
    clearInterval(ticker);
    ticker = null;
  }

  function toggleTimer(){
    if(locked) return;
    if(running){
      stopTicker();
      running = false;
      // Whatever is in the field at the moment of stopping is the value; the
      // tick below has been writing it all along, so there is nothing to
      // reconcile. handleChange fires the same rest-timer start a typed
      // value would.
      handleChange();
      return;
    }
    startedMs = Date.now();
    reps = '0';
    running = true;
    // Sub-second so the display doesn't visibly lag the thumb, but the value
    // written is always whole seconds.
    ticker = setInterval(() => {
      reps = String(Math.round((Date.now() - startedMs) / 1000));
    }, 200);
  }

  // A set row is destroyed on save, on a phase/day switch, or when the exercise
  // is swapped out. None of those should leave an interval running.
  onDestroy(stopTicker);

  /** @param {string} t */
  function tagDisplay(t){
    if(t === 'warmup') return '▲';
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

<div class="setrow" class:checked={checked}>
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
    <input type="text" inputmode="decimal" placeholder={loadUnit} bind:value={weight} onchange={handleChange}>
  </div>
  <div class="field-wrap reps-wrap" class:timing={running}>
    <input type="text" inputmode="numeric" placeholder={timed ? 'sec' : 'reps'} bind:value={reps} onchange={handleChange}>
    {#if timed}
      <button type="button" class="timer-btn" class:running={running} onclick={toggleTimer}
              disabled={locked} aria-label={running ? 'Stop timing' : 'Start timing'}>
        {#if running}<StopIcon size={13} weight="fill" />{:else}<PlayIcon size={13} weight="fill" />{/if}
      </button>
    {:else}
      <span class="unit">reps</span>
    {/if}
  </div>
  <button type="button" class="check-btn" class:checked={checked} onclick={onCheck} aria-label="Complete set"><CheckIcon size={17} weight="bold" /></button>
  <button type="button" class="remove-set-btn" onclick={onRemove} aria-label="Remove set"><MinusIcon size={14} /></button>
</div>
