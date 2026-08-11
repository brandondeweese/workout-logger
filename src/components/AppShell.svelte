<script>
  import { sb } from '../lib/supabaseClient.js';
  import LogWorkout from './LogWorkout.svelte';
  import Progress from './Progress.svelte';
  import History from './History.svelte';
  import Programs from './Programs.svelte';
  import Library from './Library.svelte';
  import Health from './Health.svelte';

  let activeTab = $state('health'); // 'health' | 'log' | 'progress' | 'more'
  let moreTab = $state('history'); // which secondary-nav item shows under 'more': 'history' | 'library' | 'programs'

  const historyActive = $derived(activeTab === 'more' && moreTab === 'history');
  const libraryActive = $derived(activeTab === 'more' && moreTab === 'library');
  const programsActive = $derived(activeTab === 'more' && moreTab === 'programs');

  async function signOut(){
    await sb.auth.signOut();
  }
</script>

<div class="wrap">
  <header>
    <div>
      <h1>Iron Log</h1>
      <div class="tag">12-week progressive overload</div>
    </div>
    <button type="button" class="signout-btn" onclick={signOut}>Sign out</button>
  </header>

  <div class="tabs">
    <div class="tab" class:active={activeTab === 'health'} onclick={() => activeTab = 'health'}>Health</div>
    <div class="tab" class:active={activeTab === 'log'} onclick={() => activeTab = 'log'}>Workout</div>
    <div class="tab" class:active={activeTab === 'progress'} onclick={() => activeTab = 'progress'}>Progress</div>
    <div class="tab" class:active={activeTab === 'more'} onclick={() => activeTab = 'more'}>More</div>
  </div>

  {#if activeTab === 'more'}
    <div class="subtabs-row">
      <div class="subtab-item" class:active={moreTab === 'history'} onclick={() => moreTab = 'history'}>History</div>
      <div class="subtab-item" class:active={moreTab === 'library'} onclick={() => moreTab = 'library'}>Library</div>
      <div class="subtab-item" class:active={moreTab === 'programs'} onclick={() => moreTab = 'programs'}>Programs</div>
    </div>
  {/if}

  <!--
    All tab-root components stay permanently mounted; only visibility toggles.
    Never switch this to {#if}-based conditional mounting - it would destroy
    and recreate LogWorkout on every tab switch, silently wiping in-progress
    reps/weights and killing the running workout clock. See CONTEXT.md. This
    applies just as much to History/Library/Programs now that they sit behind
    the "More" secondary nav below - they're still always mounted, just gated
    by two visibility conditions (activeTab === 'more' AND moreTab === 'x')
    instead of one.
  -->
  <div style:display={activeTab === 'health' ? 'block' : 'none'}>
    <Health active={activeTab === 'health'} />
  </div>
  <div style:display={activeTab === 'log' ? 'block' : 'none'}>
    <LogWorkout />
  </div>
  <div style:display={activeTab === 'progress' ? 'block' : 'none'}>
    <Progress active={activeTab === 'progress'} />
  </div>
  <div id="historyView" style:display={historyActive ? 'block' : 'none'}>
    <History active={historyActive} />
  </div>
  <div style:display={libraryActive ? 'block' : 'none'}>
    <Library active={libraryActive} />
  </div>
  <div style:display={programsActive ? 'block' : 'none'}>
    <Programs active={programsActive} />
  </div>
</div>
