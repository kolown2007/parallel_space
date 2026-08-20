<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { displaySpeed, droneControl, droneEvents, adjustDroneSpeed, updateProgress } from '../../stores/droneControl.svelte.js';
  import { playRevolutionComplete, playCountdownBeep } from '$lib/scores/ambient';
  import { completedStations, totalStations, setCompletedStations, setTotalStations } from '$lib/stores/stationProgress';

  interface Props {
    missionFailed?: () => void;
    missionSuccess?: () => void;
    totalUnits?: number;
    markerUnit?: number;
  }
  const { missionFailed = () => {}, missionSuccess = () => {}, totalUnits = 888, markerUnit = 300 }: Props = $props();

  // 1. New visibility flag controlled by our startup timer
  let showUI = $state(false);

  let isColliding = $state(false);
  let isGameOver = $state(false);
  let isWin = $state(false);
  let alertTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentReduction = $state(0);
  let collisionMessage = $state('');
  let collisionDetail = $state('');
  let collisionTextClass = $state('text-slate-100');
  
  let countdown = $state(99);
  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let apiValue = $state(0);
  const letterOptions = '0123456789%$#@!&*+-=~<>[]{}()';
  let matrixStream = $state(Array.from({ length: 100 }, (_, i) => ({
    id: `${Date.now()}-${i}`,
    char: letterOptions[Math.floor(Math.random() * letterOptions.length)],
  })));
  let matrixInterval: ReturnType<typeof setInterval> | null = null;
  const gridCells = Array.from({ length: 20 }, (_, i) => i + 1);
  const hiddenCells = new Set([7, 8, 9, 12, 13, 14]);
  const smallScreenHiddenCells = new Set([1, 6, 11, 16]);
  const visibleClass = 'bg-transparent';
  const hiddenClass = 'bg-transparent border-transparent opacity-0 pointer-events-none';

  const apiRevUrl = 'https://kolown.net/api/chrono-escapes/1/revolution';

  async function fetchRevolutionData() {
    try {
      const response = await fetch(apiRevUrl);
      if (response.ok) {
        const data = await response.json();
        apiValue = data.revolution ?? 0;
        setCompletedStations(apiValue);
      }
    } catch (e) {
      console.warn('Failed to fetch revolution data:', e);
    }
  }

  function clampProgressPercent(value: number) {
    return Math.max(0, Math.min(100, Math.floor(value * 100)));
  }

  $effect(() => {
    // Check if progress is effectively finished (near 100%)
    if ($droneControl.progress >= 0.995 && !isWin && !isGameOver) {
      handleWin();
    }
  });

  function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      if (countdown > 0 && !isGameOver && !isWin) {
        countdown--;
        if (countdown <= 10 && countdown > 0) {
          try { playCountdownBeep(); } catch (e) { console.warn('playCountdownBeep failed', e); }
        }
        if (countdown === 0) {
          handleGameOver();
        }
      }
    }, 1000);
  }

  onMount(() => {
    setTotalStations(totalUnits);

    let apiInterval: ReturnType<typeof setInterval> | null = null;
    let mountDelayTimeout: ReturnType<typeof setTimeout> | null = null;

    fetchRevolutionData();
    apiInterval = setInterval(fetchRevolutionData, 5000);

    mountDelayTimeout = setTimeout(() => {
      showUI = true;
      startCountdown();
    }, 8000);

    const unsubscribe = droneEvents.subscribe(event => {
      if (event?.type === 'collision') {
        if (alertTimeout) clearTimeout(alertTimeout);
        const reduction = Math.floor((event.data?.reduction ?? 0) * 100);
        const speedAfter = event.data?.speedAfter ?? 0;
        currentReduction = reduction;
        collisionTextClass = 'text-red-700';
        if (speedAfter === 0) {
          collisionMessage = 'CUBE HIT!';
          collisionDetail = 'SPEED ZERO';
        } else {
          collisionMessage = 'COLLISION!';
          collisionDetail = `-${currentReduction}% SPEED`;
        }
        isColliding = true;
        alertTimeout = setTimeout(() => {
          isColliding = false;
          collisionMessage = '';
          collisionDetail = '';
          collisionTextClass = 'text-slate-100';
        }, 1500);
      }
    });

    matrixInterval = setInterval(() => {
      matrixStream = matrixStream.map(item => ({
        ...item,
        char: Math.random() < 0.25
          ? letterOptions[Math.floor(Math.random() * letterOptions.length)]
          : item.char,
      }));
    }, 200);

    return () => {
      unsubscribe();
      if (mountDelayTimeout) clearTimeout(mountDelayTimeout);
      if (apiInterval) clearInterval(apiInterval);
      if (countdownInterval) clearInterval(countdownInterval);
      if (alertTimeout) clearTimeout(alertTimeout);
      if (matrixInterval) clearInterval(matrixInterval);
    };
  });

  function handleGameOver() {
    isGameOver = true;
    adjustDroneSpeed(-100); // Stop the drone
    if (countdownInterval) clearInterval(countdownInterval);
    missionFailed?.();
  }

  function handleWin() {
    isWin = true;
    adjustDroneSpeed(-100); // Stop the drone
    updateProgress(1.0);    // Snap visual to 100%
    try { playRevolutionComplete(); } catch (e) { console.warn('playRevolutionComplete failed', e); }
    if (countdownInterval) clearInterval(countdownInterval);
    missionSuccess?.();
  }
</script>

{#if showUI}
  <div class="absolute top-0 left-0 w-full h-full pointer-events-none font-mono z-10" transition:fade={{ duration: 1000 }}>
    <div class="grid grid-cols-[0_1fr_1fr_1fr_0] sm:grid-cols-5 h-full gap-4 px-2 py-2" style="grid-template-rows:repeat(4,minmax(0,1fr));">
      {#each gridCells as cell}
        <div class={"relative rounded-3xl border border-transparent p-4 overflow-hidden flex flex-col " + (hiddenCells.has(cell) ? hiddenClass : visibleClass) + (smallScreenHiddenCells.has(cell) ? ' invisible sm:visible' : '')}>
          {#if !hiddenCells.has(cell)}
            <div class="absolute top-3 left-3 text-[8px] uppercase tracking-[0.4em] text-slate-300/40 opacity-30">{cell}</div>
          {/if}

          {#if cell === 1}
            <div class="pointer-events-auto flex h-full flex-col justify-between gap-4">
              <div class="text-[12px] uppercase tracking-[0.3em] text-slate-300/80"></div>
              <div class="matrix-stream grid grid-cols-8 gap-1 w-full flex-1 text-center opacity-90 overflow-hidden {collisionTextClass}">
                {#each matrixStream as item}
                  <span class="text-[10px] leading-none">{item.char}</span>
                {/each}
              </div>
            </div>
          {:else if cell === 2}
            <div class="pointer-events-auto flex h-full flex-col items-center justify-center text-center {collisionTextClass}">
              <div class="text-[10px] uppercase tracking-[0.3em] text-slate-300/80 mb-2">Completed stations</div>
              <div class="text-[20px] font-bold">{apiValue} / {totalUnits}</div>
            </div>
          {:else if cell === 3}
            <div class="pointer-events-auto flex h-full flex-col items-center justify-center text-center {collisionTextClass}">
              <div class="text-[10px] uppercase tracking-[0.3em] text-slate-300/80 mb-2">Countdown</div>
              <div class="text-[30px] text-[#ff3e00] font-bold [text-shadow:0_0_10px_rgba(255,62,0,0.5)]">{countdown}</div>
            </div>
          {:else if cell === 4}
            <div class="pointer-events-auto flex h-full flex-col items-center justify-center text-center {collisionTextClass}">
              <div class="text-[10px] uppercase tracking-[0.3em] text-slate-300/80 mb-2">Station progress</div>
              <div class="relative h-28 w-6">
                <div class="absolute left-0 w-full h-0.5 bg-slate-300/60 top-0"></div>
                <div class="absolute left-0 w-full h-0.5 bg-slate-300/60 bottom-0"></div>
                <div class="absolute left-1/2 -translate-x-1/2 flex flex-col items-center" style="bottom: calc({clampProgressPercent($droneControl.progress)}% - 12px)">
                  <div
                    class="w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-b-12 border-b-slate-300 transition-[bottom] duration-100 ease-out"
                  ></div>
                  <div class="mt-2 text-[10px] text-center {collisionTextClass}">{clampProgressPercent($droneControl.progress)}%</div>
                </div>
              </div>
            </div>
          {:else if cell === 5}
            <div class="pointer-events-auto flex h-full items-center justify-center">
              <img src="/parallelspace.png" alt="Parallel Space" class="max-h-full max-w-full object-contain" class:filter-red={isColliding} />
            </div>
          {:else if cell === 6}
            <div class="pointer-events-auto flex h-full items-center justify-center text-center px-3 {collisionTextClass}">
              <div>
                <div class="text-[10px] uppercase tracking-[0.3em] text-slate-300/80 mb-2">Info</div>
                <div class="text-[14px] font-semibold">we are kolown</div>
              </div>
            </div>
          {:else if cell === 10}
            <div class="pointer-events-auto flex h-full items-center justify-center">
              <img src="/unos.svg" alt="Unos" class="max-h-full max-w-full object-contain" class:filter-red={isColliding} />
            </div>
          {:else if cell === 11}
            <div class="pointer-events-auto flex h-full items-center justify-center">
              <img src="/bagyo.svg" alt="Bagyo" class="max-h-full max-w-full object-contain" class:filter-red={isColliding} />
            </div>
          {:else if cell === 15}
            <div class="pointer-events-auto flex h-full items-center justify-center">
              <img src="/init.svg" alt="Init" class="max-h-full max-w-full object-contain" class:filter-red={isColliding} />
            </div>
          {:else if cell === 16}
            <div class="pointer-events-auto flex h-full items-center justify-center">
              <img src="/unos.svg" alt="Unos" class="max-h-full max-w-full object-contain" class:filter-red={isColliding} />
            </div>
          {:else if cell === 20}
            <div class="pointer-events-auto flex h-full items-center justify-center">
              <img src="/bagyo.svg" alt="Bagyo" class="max-h-full max-w-full object-contain" class:filter-red={isColliding} />
            </div>
          {:else if cell === 17}
            <div class="pointer-events-auto flex h-full flex-col items-center justify-center {collisionTextClass}">
              <div class="text-[10px] uppercase tracking-[0.3em] text-slate-300/80 mb-2">Speed gauge</div>
              <div class="w-20 h-20 border-[3px] border-dashed border-slate-300/60 rounded-full relative flex items-center justify-center">
                <div
                  class="w-0.75 h-11.25 bg-slate-100 absolute bottom-1/2 left-[calc(50%-1.5px)] origin-bottom transition-transform duration-100 ease-out"
                  style="transform: rotate({-100 + ($displaySpeed * 10)}deg)"
                ></div>
              </div>
              <div class="mt-3 text-sm {collisionTextClass}">{$displaySpeed} units</div>
            </div>
          {:else if cell === 18}
            <div class="pointer-events-auto flex h-full flex-col justify-center text-center {collisionTextClass}">
              {#if isGameOver}
                <div class="text-[16px] font-bold text-[#ff3e00]">MISSION FAILED</div>
                <div class="mt-2 text-[#ff3e00]/80">REGRESS STATION</div>
              {:else if isColliding}
                <div class="text-[16px] font-bold text-red-600">{collisionMessage}</div>
                <div class="mt-2 text-red-400">{collisionDetail}</div>
              {:else}
                <div class="uppercase tracking-widest text-slate-300/80">GOAL</div>
                <div class="mt-2 text-slate-300/80">REACH NEXT STATION</div>
              {/if}
            </div>
          {:else if cell === 19}
            <div class="pointer-events-auto flex h-full items-center justify-center text-center px-3 {collisionTextClass}">
              <div>
                <div class="text-[10px] uppercase tracking-[0.3em] text-slate-300/80 mb-2">Message</div>
                <div class="text-[14px] font-semibold">The USB is inside the wormhole</div>
              </div>
            </div>
          {:else if hiddenCells.has(cell)}
            <div class="flex-1"></div>
          {:else}
            <div class="mt-6 text-slate-300/70 text-sm">Blank debug cell</div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<svg aria-hidden="true" style="position:absolute;width:0;height:0;visibility:hidden;">
  <filter id="solidRed" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
  </filter>
</svg>

<style>
  .filter-red {
    filter: url('#solidRed');
    transition: filter 150ms ease;
  }
</style>



