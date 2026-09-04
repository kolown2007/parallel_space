<script lang="ts">
  import { onMount } from 'svelte';
  import { getLoadingBgTextureUrl, getTextureUrl } from '$lib/assets/assetsConfig';

  // Provide a resolved URL directly, or a textureId to look up from assets.json.
  // Falls back to loading.bgtexture when neither is given.
  export let backgroundUrl = '';
  export let textureId = '';
  export let label = 'Loading...';
  export let loading = true;

  let resolvedUrl = backgroundUrl;

  onMount(async () => {
    if (resolvedUrl) return;
    try {
      resolvedUrl = textureId ? await getTextureUrl(textureId) : await getLoadingBgTextureUrl();
    } catch (e) {
      console.warn('Failed to resolve transition background texture:', e);
    }
  });

  $: if (backgroundUrl) resolvedUrl = backgroundUrl;
</script>

<div class="absolute inset-0 z-30 flex items-center justify-center overflow-hidden bg-black">
  {#if resolvedUrl}
    <div class="absolute inset-0 bg-cover bg-center" style="background-image: url('{resolvedUrl}')"></div>
  {/if}

  <div class="relative flex flex-col items-center gap-4">
    {#if loading}
      <div class="loading-track" aria-label="Loading">
        <div class="loading-bar"></div>
      </div>
    {/if}
    <p class="text-sm tracking-[0.2em] text-white uppercase">{label}</p>
  </div>
</div>

<style>
  .loading-track {
    position: relative;
    width: 180px;
    height: 4px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 9999px;
  }

  .loading-bar {
    position: absolute;
    inset: 0 auto 0 0;
    width: 42%;
    background: #ffffff;
    border-radius: inherit;
    animation: loadingPulse 1.6s ease-in-out infinite;
  }

  @keyframes loadingPulse {
    0% {
      transform: translateX(-10%);
      opacity: 0.5;
    }
    50% {
      transform: translateX(120%);
      opacity: 1;
    }
    100% {
      transform: translateX(240%);
      opacity: 0.5;
    }
  }
</style>
