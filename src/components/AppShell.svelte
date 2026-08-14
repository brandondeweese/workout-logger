<script>
  import { sb } from '../lib/supabaseClient.js';
  import { appState } from '../lib/state.svelte.js';
  import LogWorkout from './LogWorkout.svelte';
  import Progress from './Progress.svelte';
  import History from './History.svelte';
  import Programs from './Programs.svelte';
  import Library from './Library.svelte';
  import Health from './Health.svelte';
  import TabIcon from './TabIcon.svelte';

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
  <header class="gutter">
    <div>
      <h1>Iron Log</h1>
      <div class="tag">{appState.activeProgram?.name ?? 'No active program'}</div>
    </div>
    <button type="button" class="signout-btn" onclick={signOut}>Sign out</button>
  </header>

  <div class="tabs">
    <div class="tab" class:active={activeTab === 'health'} onclick={() => activeTab = 'health'}
         role="tab" aria-label="Health" title="Health" aria-selected={activeTab === 'health'}>
      <TabIcon name="health" active={activeTab === 'health'} />
    </div>
    <div class="tab" class:active={activeTab === 'log'} onclick={() => activeTab = 'log'}
         role="tab" aria-label="Workout" title="Workout" aria-selected={activeTab === 'log'}>
      <TabIcon name="workout" active={activeTab === 'log'} />
    </div>
    <div class="tab" class:active={activeTab === 'progress'} onclick={() => activeTab = 'progress'}
         role="tab" aria-label="Progress" title="Progress" aria-selected={activeTab === 'progress'}>
      <TabIcon name="progress" active={activeTab === 'progress'} />
    </div>
    <div class="tab" class:active={activeTab === 'more'} onclick={() => activeTab = 'more'}
         role="tab" aria-label="More" title="More" aria-selected={activeTab === 'more'}>
      <TabIcon name="more" active={activeTab === 'more'} />
    </div>
  </div>

  {#if activeTab === 'more'}
    <div class="subtabs-row gutter">
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
  <div class="tab-panel" style:display={activeTab === 'health' ? 'block' : 'none'}>
    <Health active={activeTab === 'health'} />
  </div>
  <div class="tab-panel" style:display={activeTab === 'log' ? 'block' : 'none'}>
    <LogWorkout />
  </div>
  <div class="tab-panel" style:display={activeTab === 'progress' ? 'block' : 'none'}>
    <Progress active={activeTab === 'progress'} />
  </div>
  <div id="historyView" class="tab-panel" style:display={historyActive ? 'block' : 'none'}>
    <History active={historyActive} />
  </div>
  <div class="tab-panel" style:display={libraryActive ? 'block' : 'none'}>
    <Library active={libraryActive} />
  </div>
  <div class="tab-panel" style:display={programsActive ? 'block' : 'none'}>
    <Programs active={programsActive} />
  </div>
</div>
