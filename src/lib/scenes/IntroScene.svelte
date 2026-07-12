<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  export let initialCountdown = 60;
  export let onStart: () => void;

  let countdown = initialCountdown;
  let countdownInterval: number | null = null;

  const startCountdown = () => {
    countdownInterval = window.setInterval(() => {
      if (countdown <= 1) {
        clearCountdown();
        onStart();
      } else {
        countdown -= 1;
      }
    }, 1000);
  };

  const clearCountdown = () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  };

  const handleStart = () => {
    clearCountdown();
    onStart();
  };

  onMount(() => {
    startCountdown();
  });

  onDestroy(() => {
    clearCountdown();
  });
</script>

<div class="absolute inset-0 flex items-center justify-center bg-black/70 z-20">
  <div class="max-w-105 w-[min(90vw,420px)] p-8 rounded-[22px] bg-slate-950/95 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.35)] text-center">
    <h1 class="mb-4 text-3xl font-semibold tracking-[0.03em]">Your Mission</h1>
    <p class="mb-6 text-sm leading-relaxed text-slate-300">Within 60 seconds, reach the USB to the next station.<br/> Tap the screen to add speed.</p>
    <span class="mb-6 block text-sm font-semibold text-indigo-200">Starting in {countdown}...</span>
    <button class="mx-auto rounded-full bg-green-600 px-8 py-3 font-bold text-white transition hover:bg-blue-500" type="button" on:click={handleStart}>OK</button>
  </div>
</div>
