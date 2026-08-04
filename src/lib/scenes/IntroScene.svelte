<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { completedStations, totalStations } from '$lib/stores/stationProgress';
  import { getTextureUrl } from '$lib/assetsConfig';
  import { loadBitmapFont, renderBitmapTextToCanvas } from '$lib/bitmapFont';

  export let initialCountdown = 60;
  export let onStart: () => void;

  let backgroundUrl = '';
  let bitmapTextUrl = '';
  let buttonTextUrl = '';
  let countdown = initialCountdown;
  let countdownInterval: number | null = null;
  let bitmapFont: any = null;
  let bitmapFontImage: HTMLImageElement | null = null;

  const fontXmlUrl = '/td.xml';
  const fontImageUrl = '/td6.png';

  const buildBitmapText = (): string => {
    return [
      'Your Mission',
      'Within 60 seconds, reach the USB to the next station.',
      'Tap the screen to add speed.',
      '',
      'Completed stations',
      `${$completedStations} / ${$totalStations}`,
      '',
      `Starting in ${countdown}...`
    ].join('\n');
  };

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

  const updateBitmapText = () => {
    if (!bitmapFont || !bitmapFontImage) return;
    try {
      const text = buildBitmapText();
      const canvas = renderBitmapTextToCanvas(bitmapFont, bitmapFontImage, text, {
        scale: 1.0,
        letterSpacing: 3,
        lineSpacing: 10
      });
      bitmapTextUrl = canvas.toDataURL('image/png');

      const buttonCanvas = renderBitmapTextToCanvas(bitmapFont, bitmapFontImage, 'OK', {
        scale: 1.0,
        letterSpacing: 3,
        lineSpacing: 0
      });
      buttonTextUrl = buttonCanvas.toDataURL('image/png');
    } catch (e) {
      console.warn('Failed to render bitmap text:', e);
    }
  };

  $: if (bitmapFont && bitmapFontImage) {
    countdown;
    $completedStations;
    $totalStations;
    updateBitmapText();
  }

  onMount(async () => {
    try {
      backgroundUrl = await getTextureUrl('loading1');
    } catch (e) {
      console.warn('Failed to resolve intro background texture:', e);
    }

    try {
      const { font, image } = await loadBitmapFont(fontXmlUrl, fontImageUrl);
      bitmapFont = font;
      bitmapFontImage = image;
      updateBitmapText();
    } catch (e) {
      console.warn('Failed to create bitmap font texture:', e);
    }

    startCountdown();
  });

  onDestroy(() => {
    clearCountdown();
  });
</script>

<div class="absolute inset-0 z-20 overflow-hidden">
  {#if backgroundUrl}
    <div class="absolute inset-0 bg-cover bg-center" style="background-image: url('{backgroundUrl}')"></div>
  {/if}
  <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),rgba(15,23,42,0.94))]"></div>
  <div class="relative flex min-h-full items-center justify-center px-4">
    <div class="w-full max-w-[80vw] p-8 rounded-[22px] bg-slate-950/40 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.25)] text-center backdrop-blur-sm">
      {#if bitmapTextUrl}
        <img src={bitmapTextUrl} alt="Mission text" class="mx-auto mb-6 max-w-full" />
      {:else}
        <h1 class="mb-4 text-3xl font-semibold tracking-[0.03em]">Your Mission</h1>
        <p class="mb-6 text-sm leading-relaxed text-slate-300">Within 60 seconds, reach the USB to the next station.<br/> Tap the screen to add speed.</p>
      {/if}
      <button class="mx-auto mb-6 block rounded-full stroke-1 stroke-amber-50 px-8 py-3 font-bold text-white transition hover:bg-blue-500" type="button" on:click={handleStart}>
        {#if buttonTextUrl}
          <img src={buttonTextUrl} alt="OK" class="mx-auto h-6" />
        {:else}
          OK
        {/if}
      </button>
    </div>
  </div>
</div>
