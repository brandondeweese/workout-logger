<script>
  import { sb } from '../lib/supabaseClient.js';
  import LogWorkout from './LogWorkout.svelte';
  import History from './History.svelte';
  import Programs from './Programs.svelte';
  import Library from './Library.svelte';

  let activeTab = $state('log');

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
    <div class="tab" class:active={activeTab === 'log'} onclick={() => activeTab = 'log'}>Log Workout</div>
    <div class="tab" class:active={activeTab === 'history'} onclick={() => activeTab = 'history'}>History</div>
    <div class="tab" class:active={activeTab === 'programs'} onclick={() => activeTab = 'programs'}>Programs</div>
    <div class="tab" class:active={activeTab === 'library'} onclick={() => activeTab = 'library'}>Library</div>
  </div>

  <!--
    All four tabs stay permanently mounted; only visibility toggles. Never
    switch this to {#if}-based conditional mounting - it would destroy and
    recreate LogWorkout on every tab switch, silently wiping in-progress
    reps/weights and killing the running workout clock. See CONTEXT.md.
  -->
  <div style:display={activeTab === 'log' ? 'block' : 'none'}>
    <LogWorkout />
  </div>
  <div id="historyView" style:display={activeTab === 'history' ? 'block' : 'none'}>
    <History active={activeTab === 'history'} />
  </div>
  <div style:display={activeTab === 'programs' ? 'block' : 'none'}>
    <Programs active={activeTab === 'programs'} />
  </div>
  <div style:display={activeTab === 'library' ? 'block' : 'none'}>
    <Library active={activeTab === 'library'} />
  </div>
</div>
