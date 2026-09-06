<script>
  /*
    A blocking confirm for actions that can't be walked back by tapping again.
    Deliberately not window.confirm(): that renders in the system font, can't
    say which workout it's about, and on iOS Safari is easy to dismiss by
    accident with the same tap that opened it.
  */
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  let {
    title,
    body = '',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    onConfirm,
    onCancel,
  } = $props();

  const reduceMotion = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sheetIn = reduceMotion ? { duration: 0 } : { y: 16, opacity: 0, duration: 180, easing: cubicOut };

  /** @param {KeyboardEvent} e */
  function onKeydown(e){
    if(e.key === 'Escape') onCancel?.();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!--
  The scrim swallows taps so a mis-aimed tap lands on nothing rather than on
  the button behind it. It does NOT dismiss on tap: this dialog exists because
  a stray tap caused the problem in the first place.
-->
<div class="confirm-scrim" transition:fade={{ duration: reduceMotion ? 0 : 140 }}></div>
<div class="confirm-wrap" role="dialog" aria-modal="true" transition:fly={sheetIn}>
  <div class="confirm-box">
    <div class="confirm-title">{title}</div>
    {#if body}<div class="confirm-body">{body}</div>{/if}
    <div class="confirm-actions">
      <button type="button" class="btn btn-ghost" onclick={() => onCancel?.()}>{cancelLabel}</button>
      <button type="button" class="btn" class:btn-danger={danger} class:btn-primary={!danger}
              onclick={() => onConfirm?.()}>{confirmLabel}</button>
    </div>
  </div>
</div>
