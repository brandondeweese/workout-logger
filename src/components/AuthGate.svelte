<script>
  import { sb } from '../lib/supabaseClient.js';

  let email = $state('');
  let password = $state('');
  let status = $state('');

  async function attemptSignIn(){
    if(!email.trim() || !password){ status = 'Enter your email and password.'; return; }
    status = 'Signing in…';
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if(error){ status = error.message; return; }
    status = '';
  }

  function onPasswordKeydown(e){
    if(e.key === 'Enter') attemptSignIn();
  }
</script>

<div class="wrap">
  <header>
    <div>
      <h1>Iron Log</h1>
      <div class="tag">Sign in to continue</div>
    </div>
  </header>
  <div class="form-label" style="margin-top:0;">Email</div>
  <input type="email" class="text-input" autocomplete="username" bind:value={email}>
  <div class="form-label">Password</div>
  <input type="password" class="text-input" autocomplete="current-password" bind:value={password} onkeydown={onPasswordKeydown}>
  <button type="button" class="btn btn-primary" onclick={attemptSignIn}>Sign In</button>
  <div class="status">{status}</div>
</div>
