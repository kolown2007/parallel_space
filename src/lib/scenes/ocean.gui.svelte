<script lang="ts">
  import { completedStations, totalStations } from '$lib/stores/stationProgress';

  interface Props {
    result?: 'success' | 'failure';
    onNewMission?: () => void;
  }

  const { result = 'failure', onNewMission = () => {} }: Props = $props();

  const getTitleText = () => result === 'success' ? 'Mission Complete' : 'Mission Failed';
  const getBodyText = () => result === 'success'
    ? 'Great job! Progress + 1. '
    : 'Stations progress - 1.';
  const getButtonLabel = () => result === 'success' ? 'Next Mission' : 'New Mission';
  const getStatsLabel = () => 'Completed stations';
</script>

<div class="absolute inset-0 z-20 pointer-events-none">
  <div class="absolute top-6 left-1/2 -translate-x-1/2 w-full max-w-md px-8 text-center pointer-events-auto">
    <div
      class="mb-4 text-3xl font-semibold"
      style="font-family: 'Comic Sans MS', 'Comic Sans', cursive;"
      class:text-emerald-300={result === 'success'}
      class:text-orange-300={result !== 'success'}
    >
      {getTitleText()}
    </div>
    <div class="mb-6 text-sm leading-relaxed text-slate-300" style="font-family: 'Comic Sans MS', 'Comic Sans', cursive;">
      {getBodyText()}
    </div>
  </div>

  <div class="absolute bottom-2 left-1/2 -translate-x-1/2 w-full max-w-md px-8 text-center pointer-events-auto">
    <div class="mb-4 rounded-3xl p-4 text-slate-200">
      <div class="text-[10px] uppercase tracking-[0.3em] text-slate-400 mb-2" style="font-family: 'Comic Sans MS', 'Comic Sans', cursive;">
        {getStatsLabel()}
      </div>
      <div class="text-3xl font-bold" style="font-family: 'Comic Sans MS', 'Comic Sans', cursive;">
        {$completedStations} / {$totalStations}
      </div>
    </div>
    <button
      class="mx-auto rounded-full px-8 py-3 text-sm font-semibold text-white transition {result === 'success' ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-orange-500 hover:bg-orange-400'}"
      type="button"
      onclick={onNewMission}
      style="font-family: 'Comic Sans MS', 'Comic Sans', cursive; transform: translateY(-5px);"
    >
      {getButtonLabel()}
    </button>
  </div>
</div>
