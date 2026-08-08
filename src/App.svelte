<script>
  import { onMount } from 'svelte';
  import { sb } from './lib/supabaseClient.js';
  import { startApp } from './lib/state.svelte.js';
  import AuthGate from './components/AuthGate.svelte';
  import AppShell from './components/AppShell.svelte';

  let session = $state(null);
  let checked = $state(false);

  onMount(() => {
    const { data: sub } = sb.auth.onAuthStateChange((event, newSession) => {
      const isNewSignIn = !!newSession && !session;
      session = newSession;
      checked = true;
      if(isNewSignIn) startApp();
    });
    return () => sub.subscription.unsubscribe();
  });
</script>

{#if checked}
  {#if session}
    <AppShell />
  {:else}
    <AuthGate />
  {/if}
{/if}
