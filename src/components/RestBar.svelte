<script>
  let { phase } = $props();

  let visible = $state(false);
  let flash = $state(false);
  let remaining = $state(75);
  let running = $state(false);
  let toggleLabel = $state('Pause');
  let interval = null;

  const timeText = $derived.by(() => {
    const m = Math.floor(remaining / 60), s = remaining % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });

  function restDefaultForPhase(){
    const p = phase || '';
    if(/Phase 1/.test(p)) return 75;
    if(/Phase 2/.test(p)) return 150;
    if(/Phase 3/.test(p)) return 210;
    return 60;
  }

  function beep(){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }catch(e){ /* ignore */ }
  }

  function tick(){
    remaining--;
    if(remaining <= 0){
      remaining = 0;
      clearInterval(interval);
      running = false;
      toggleLabel = 'Restart';
      flash = true;
      if(navigator.vibrate) navigator.vibrate([200, 100, 200]);
      beep();
    }
  }

  export function start(){
    remaining = restDefaultForPhase();
    flash = false;
    visible = true;
    clearInterval(interval);
    interval = setInterval(tick, 1000);
    running = true;
    toggleLabel = 'Pause';
  }

  function adjust(delta){
    remaining = Math.max(0, remaining + delta);
    if(delta > 0) flash = false;
  }

  function onToggle(){
    if(toggleLabel === 'Restart'){ start(); return; }
    if(running){
      clearInterval(interval);
      running = false;
      toggleLabel = 'Resume';
    } else {
      interval = setInterval(tick, 1000);
      running = true;
      toggleLabel = 'Pause';
    }
  }

  export function hide(){
    clearInterval(interval);
    running = false;
    visible = false;
    flash = false;
  }
</script>

<div class="restbar" class:visible={visible} class:flash={flash}>
  <div class="rest-time">{timeText}</div>
  <div class="rest-controls">
    <button onclick={() => adjust(-15)}>-15</button>
    <button onclick={() => adjust(15)}>+15</button>
    <button class="primary" onclick={onToggle}>{toggleLabel}</button>
    <button onclick={hide}>Dismiss</button>
  </div>
</div>
