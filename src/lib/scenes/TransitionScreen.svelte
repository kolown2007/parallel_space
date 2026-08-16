<script lang="ts">
  import { onMount } from 'svelte';
  import { getLoadingBgTextureUrl, getTextureUrl } from '$lib/assets/assetsConfig';

  // Provide a resolved URL directly, or a textureId to look up from assets.json.
  // Falls back to loading.bgtexture when neither is given.
  export let backgroundUrl = '';
  export let textureId = '';
  export let label = 'Loading...';

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
  <p class="relative text-sm tracking-[0.2em] text-white uppercase">{label}</p>
</div>
