<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { completedStations, totalStations } from '$lib/stores/stationProgress';
  import { getTextureUrl } from '$lib/assetsConfig';

  export let initialCountdown = 60;
  export let onStart: () => void;

  let backgroundUrl = '';
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

  onMount(async () => {
    try {
      backgroundUrl = await getTextureUrl('loading1');
    } catch (e) {
      console.warn('Failed to resolve intro background texture:', e);
    }
    startCountdown();
  });

  onDestroy(() => {
    clearCountdown();
  });
</script>

<div class="absolute inset-0 z-20 overflow-hidden">
  {#if backgroundUrl}
    <div class="absolute inset-0 bg-cover bg-center" style="background-image: url('{backgroundUrl}')" />
  {/if}
  <div class="absolute inset-0 bg-black/60" />
  <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_rgba(15,23,42,0.94))]" />
  <div class="relative flex min-h-full items-center justify-center px-4">
    <div class="max-w-105 w-[min(90vw,420px)] p-8 rounded-[22px] bg-slate-950/95 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.35)] text-center backdrop-blur-sm">
      <h1 class="mb-4 text-3xl font-semibold tracking-[0.03em]">Your Mission</h1>
      <p class="mb-6 text-sm leading-relaxed text-slate-300">Within 60 seconds, reach the USB to the next station.<br/> Tap the screen to add speed.</p>
      <div class="mb-4 rounded-3xl border border-slate-700 bg-slate-900/80 p-3 text-slate-200">
        <div class="text-[10px] uppercase tracking-[0.3em] text-slate-400">Completed stations</div>
        <div class="mt-2 text-2xl font-semibold">{$completedStations} / {$totalStations}</div>
      </div>
      <span class="mb-6 block text-sm font-semibold text-indigo-200">Starting in {countdown}...</span>
      <button class="mx-auto rounded-full bg-green-600 px-8 py-3 font-bold text-white transition hover:bg-blue-500" type="button" on:click={handleStart}>OK</button>
    </div>
  </div>
</div>
