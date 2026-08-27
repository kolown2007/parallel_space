<script lang="ts">
  export let backgroundUrl = '';
  export let onInitializeAudio: () => void = () => {};
</script>

<div class="absolute inset-0 z-20 overflow-hidden">
  {#if backgroundUrl}
    <div class="absolute inset-0 bg-cover bg-center" style="background-image: url('{backgroundUrl}')"></div>
  {/if}

  <div class="relative flex min-h-full flex-col items-center justify-center px-4 py-8 sm:px-6">
    <div class="flex h-full w-full flex-1 items-center justify-center text-center text-slate-100 sm:px-8">
      <div class="mx-auto max-w-[88vw] whitespace-pre-wrap text-sm leading-relaxed tracking-wide text-cyan-100 sm:text-base md:text-lg" style="font-family: 'Comic Sans MS', 'Comic Sans', cursive;">
        <img
          src="/parallelspace.png"
          alt="Parallel Space"
          class="mx-auto h-auto max-h-[40vh] w-auto max-w-[80vw] object-contain drop-shadow-[0_0_24px_rgba(34,211,238,0.5)]"
        />
      </div>
    </div>

    <div class="w-full px-4 pb-8 sm:px-8">
      <button
        class="mx-auto block rounded-full border border-white/70 bg-transparent px-6 py-2.5 text-sm font-bold uppercase tracking-[0.08em] text-white transition hover:bg-red-600 sm:px-8 sm:py-3 sm:text-base"
        type="button"
        on:click={onInitializeAudio}
      >
        INITIALIZE 
      </button>
    </div>
  </div>
</div>
