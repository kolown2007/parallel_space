<script lang="ts">
  interface Props {
    result?: 'success' | 'failure';
    onNewMission?: () => void;
  }

  const { result = 'failure', onNewMission = () => {} }: Props = $props();
</script>

<div class="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
  <div class="pointer-events-auto max-w-md rounded-[28px] border border-slate-700 bg-slate-950/30 p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
    <div class="mb-4 text-3xl font-bold {result === 'success' ? 'text-emerald-300' : 'text-orange-300'}">{result === 'success' ? 'Mission Complete' : 'Mission Failed'}</div>
    <p class="mb-6 text-sm leading-relaxed text-slate-300">
      {#if result === 'success'}
        Great job! Progress secured. Ready for a new mission?
      {:else}
        Progress deducted 1. Ready for a new mission?
      {/if}
    </p>
    <button class="rounded-full px-8 py-3 text-sm font-semibold text-white transition {result === 'success' ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-orange-500 hover:bg-orange-400'}" type="button" onclick={onNewMission}>
      {result === 'success' ? 'Next Mission' : 'New Mission'}
    </button>
  </div>
</div>
