<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { fade } from 'svelte/transition';
  import { displaySpeed, droneControl, droneEvents, adjustDroneSpeed, updateProgress } from '../../stores/droneControl.svelte.js';
  import { playRevolutionComplete, playCountdownBeep } from '$lib/scores/ambient';
  import { completedStations, totalStations, setCompletedStations, setTotalStations, stationName } from '$lib/stores/stationProgress';
  import { isTouchDevice, setTouchStabilize, triggerTouchBurst, triggerTouchFire } from '../../input/touchControls';

  interface Props {
    missionFailed?: () => void;
    missionSuccess?: () => void;
    totalUnits?: number;
    markerUnit?: number;
  }
  const { missionFailed = () => {}, missionSuccess = () => {}, totalUnits = 888, markerUnit = 300 }: Props = $props();

  // 1. New visibility flag controlled by our startup timer
  let showUI = $state(false);
  let showTouchControls = $state(false);

  let isColliding = $state(false);
  let isGameOver = $state(false);
  let isWin = $state(false);
  let alertTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentReduction = $state(0);
  let collisionMessage = $state('');
  let collisionDetail = $state('');
  let collisionCount = $state(0);
  let collisionTextClass = $state('text-slate-100');
  let goalWindowActive = $state(true);
  let goalWindowTimer: ReturnType<typeof setTimeout> | null = null;
  let lives = $derived(Math.max(0, 5 - collisionCount));

  $effect(() => {
    if (lives <= 0 && !isGameOver && !isWin) {
      handleGameOver();
    }
  });
  
  let countdown = $state(69);
  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let apiValue = $state(0);
  const letterOptions = '0123456789%$#@!&*+-=~<>[]{}()';
  let matrixStream = $state(Array.from({ length: 100 }, (_, i) => ({
    id: `${Date.now()}-${i}`,
    char: letterOptions[Math.floor(Math.random() * letterOptions.length)],
  })));
  let matrixInterval: ReturnType<typeof setInterval> | null = null;
  const gridCells = Array.from({ length: 20 }, (_, i) => i + 1);
  const hiddenCells = new Set([7, 8, 9, 12]);
  const smallScreenHiddenCells = new Set([1, 6, 11, 16]);
  const visibleClass = 'bg-transparent';
  const hiddenClass = 'bg-transparent border-transparent opacity-0 pointer-events-none';

  const apiRevUrl = 'https://kolown.net/api/chrono-escapes/1/revolution';
  const apiIncUrl = 'https://kolown.net/api/chrono-escapes/1/increment-revolution';
  const apiDecUrl = 'https://kolown.net/api/chrono-escapes/1/decrement-revolution';
  const isProd = import.meta.env.PROD;

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

  async function postRevolutionApi(url: string, payload: any) {
    if (!isProd) return;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        console.warn('Revolution API request failed:', url, response.status);
      }
    } catch (error) {
      console.warn('Revolution API request error:', url, error);
    }
  }

  function incrementRevolution() {
    return postRevolutionApi(apiIncUrl, { loopCount: 1 });
  }

  function decrementRevolution() {
    return postRevolutionApi(apiDecUrl, {});
  }

  function clampProgressPercent(value: number) {
    return Math.max(0, Math.min(100, Math.floor(value * 100)));
  }

  function clampGaugeDegrees(value: number) {
    return Math.max(-100, Math.min(100, value));
  }

  function adjustCompletedStations(delta: number) {
    const current = get(completedStations);
    const next = Math.max(0, current + delta);
    setCompletedStations(next);
    apiValue = next;
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
      showTouchControls = isTouchDevice();
      goalWindowActive = true;
      if (goalWindowTimer) clearTimeout(goalWindowTimer);
      goalWindowTimer = setTimeout(() => {
        goalWindowActive = false;
      }, 5000);
      startCountdown();
    }, 2000);

    const unsubscribe = droneEvents.subscribe(event => {
      if (event?.type === 'collision') {
        collisionCount++;
        if (alertTimeout) clearTimeout(alertTimeout);
        const reduction = Math.floor((event.data?.reduction ?? 0) * 100);
        const speedAfter = event.data?.speedAfter ?? 0;
        currentReduction = reduction;
        collisionTextClass = 'text-red-700';
        if (speedAfter === 0) {
          collisionMessage = 'COLLISION!';
          collisionDetail = 'HEALTH DEDUCTED';
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
      if (goalWindowTimer) clearTimeout(goalWindowTimer);
      if (matrixInterval) clearInterval(matrixInterval);
    };
  });

  function handleGameOver() {
    isGameOver = true;
    adjustDroneSpeed(-100); // Stop the drone
    if (countdownInterval) clearInterval(countdownInterval);
    missionFailed?.();
    adjustCompletedStations(-1);
    decrementRevolution();
  }

  function handleWin() {
    isWin = true;
    adjustDroneSpeed(-100); // Stop the drone
    updateProgress(1.0);    // Snap visual to 100%
    try { playRevolutionComplete(); } catch (e) { console.warn('playRevolutionComplete failed', e); }
    if (countdownInterval) clearInterval(countdownInterval);
    missionSuccess?.();
    adjustCompletedStations(1);
    incrementRevolution();
  }
</script>

{#if showUI}
  <div class="absolute inset-0 pointer-events-none font-mono z-10" transition:fade={{ duration: 1000 }}>
    {#if showTouchControls}
      <div class="pointer-events-auto absolute bottom-[25%] left-1/2 z-20 flex w-[86%] max-w-[420px] -translate-x-1/2 items-end justify-between gap-2 px-1 sm:hidden">
        <button
          type="button"
          class="h-16 w-16 rounded-full border border-white/20 bg-slate-900/70 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-100 shadow-[0_0_20px_rgba(0,0,0,0.35)] backdrop-blur-sm"
          onclick={triggerTouchBurst}
        >
          Burst
        </button>

        <button
          type="button"
          class="h-14 w-14 rounded-full border border-white/20 bg-slate-900/70 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-100 shadow-[0_0_20px_rgba(0,0,0,0.35)] backdrop-blur-sm"
          onclick={() => setTouchStabilize(true)}
          onpointerdown={() => setTouchStabilize(true)}
          onpointerup={() => setTouchStabilize(false)}
          onpointerleave={() => setTouchStabilize(false)}
          onpointercancel={() => setTouchStabilize(false)}
        >
          Stabilize
        </button>

        <button
          type="button"
          class="h-16 w-16 rounded-full border border-white/20 bg-slate-900/70 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-100 shadow-[0_0_20px_rgba(0,0,0,0.35)] backdrop-blur-sm"
          onclick={triggerTouchFire}
        >
          Fire
        </button>
      </div>
    {/if}

    <div class="grid grid-cols-[0_1fr_1fr_1fr_0] sm:grid-cols-5 h-full gap-1 px-0.5 py-0.5 sm:gap-2 sm:px-1 sm:py-1" style="grid-template-rows:repeat(4,minmax(0,1fr));">
      {#each gridCells as cell}
        <div class={"relative rounded-2xl border border-transparent p-1.5 overflow-hidden flex flex-col sm:rounded-2xl sm:p-2 " + (hiddenCells.has(cell) ? hiddenClass : visibleClass) + (smallScreenHiddenCells.has(cell) ? ' invisible sm:visible' : '')}>
          {#if !hiddenCells.has(cell)}
            <div class="absolute top-3 left-3 text-[8px] uppercase tracking-[0.4em] text-transparent opacity-0">{cell}</div>
          {/if}

          {#if cell === 1}
            <div class="pointer-events-auto flex h-full items-center justify-center">
              <img src="/parallelspace.png" alt="Parallel Space" class="max-h-[50%] max-w-[50%] object-contain" class:filter-red={isColliding} />
            </div>
          {:else if cell === 2}
            <div class="pointer-events-auto flex h-full flex-col items-center justify-center text-center {collisionTextClass}">
              <div class="mb-1 text-[8px] uppercase tracking-[0.2em] text-slate-300/80 sm:mb-2 sm:text-[10px] sm:tracking-[0.3em]">Completed stations</div>
              <div class="text-[10px] font-bold sm:text-[10px]">{apiValue} / {totalUnits}</div>
            </div>
          {:else if cell === 3}
            <div class="pointer-events-auto flex h-full flex-col items-center justify-center text-center {collisionTextClass}">
              <div class="text-[10px] uppercase tracking-[0.3em] text-slate-300/80 mb-2">Countdown</div>
              <div class="text-[30px] text-[#ff3e00] font-bold [text-shadow:0_0_10px_rgba(255,62,0,0.5)]">{countdown}</div>
            </div>
          {:else if cell === 4}
            <div class="pointer-events-auto flex h-full flex-col items-center justify-center text-center {collisionTextClass}">
              <div class="mb-2 text-[8px] uppercase tracking-[0.2em] text-slate-300/80 sm:mb-3 sm:text-[10px] sm:tracking-[0.3em]">To {$stationName} Station</div>
              <div class="flex w-full max-w-35 items-center gap-2 sm:gap-3">
                <div class={"relative h-2 flex-1 overflow-hidden rounded-full " + (isColliding ? 'bg-red-500/30' : 'bg-slate-300/30')}>
                  <div
                    class={"absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-out " + (isColliding ? 'bg-red-500' : 'bg-white')}
                    style="width: {clampProgressPercent($droneControl.progress)}%"
                  ></div>
                </div>
                <div class={"text-[10px] font-medium " + (isColliding ? 'text-red-500' : 'text-slate-100')}>
                  {clampProgressPercent($droneControl.progress)}%
                </div>
              </div>
            </div>
          {:else if cell === 5}
            <div class="pointer-events-auto flex h-full items-center justify-center">
              <img src="/parallelspace.png" alt="Parallel Space" class="max-h-[50%] max-w-[50%] object-contain" class:filter-red={isColliding} />
            </div>
        {:else if cell === 6}
            <div class="pointer-events-auto flex h-full items-center justify-center">
              <img src="/init.svg" alt="Init" class="max-h-[40%] max-w-[40%] object-contain" class:filter-red={isColliding} />
            </div>
          {:else if cell === 10}
            <div class="pointer-events-auto flex h-full items-center justify-center">
              <img src="/unos.svg" alt="Unos" class="max-h-[40%] max-w-[40%] object-contain" class:filter-red={isColliding} />
            </div>
          {:else if cell === 11}
            <div class="pointer-events-auto flex h-full items-center justify-center">
              <img src="/bagyo.svg" alt="Bagyo" class="max-h-[40%] max-w-[40%]  object-contain" class:filter-red={isColliding} />
            </div>
          {:else if cell === 15}
            <div class="pointer-events-auto flex h-full items-center justify-center">
              <img src="/init.svg" alt="Init" class="max-h-[40%] max-w-[40%] object-contain" class:filter-red={isColliding} />
            </div>
          {:else if cell === 16}
            <div class="pointer-events-auto flex h-full items-center justify-center">
              <img src="/unos.svg" alt="Unos" class="max-h-[40%] max-w-[40%] object-contain" class:filter-red={isColliding} />
            </div>
          {:else if cell === 20}
            <div class="pointer-events-auto flex h-full items-center justify-center">
              <img src="/bagyo.svg" alt="Bagyo" class="max-h-[40%] max-w-[40%] object-contain" class:filter-red={isColliding} />
            </div>
          {:else if cell === 13}
            <div class="pointer-events-auto flex h-full flex-col justify-center text-center {collisionTextClass}">
              {#if isGameOver}
                <div class="text-[16px] font-bold text-[#ff3e00]">MISSION FAILED</div>
                <div class="mt-2 text-[#ff3e00]/80">REGRESS STATION</div>
              {:else if isColliding}
                <div class="text-[16px] font-bold text-red-600">{collisionMessage}</div>
                <div class="mt-2 text-red-400">{collisionDetail}</div>
              {:else if goalWindowActive}
                <div class="text-[14px] font-bold uppercase tracking-[0.25em] text-slate-200/70">Your Goal</div>
                <div class="mt-2 text-[16px] font-bold text-slate-100">Reach <br/> Station {$stationName}</div>
              {/if}
            </div>
          {:else if cell === 14}
            <div class="pointer-events-auto flex h-full items-center justify-center"></div>
          {:else if cell === 17}
            <div class="pointer-events-auto flex h-full flex-col items-center justify-center text-center px-3 {collisionTextClass}">
              <div class="mb-1 text-[8px] uppercase tracking-[0.2em] text-slate-300/80 sm:mb-2 sm:text-[10px] sm:tracking-[0.3em]">Health</div>
              <div class="flex w-full max-w-22 items-center justify-between gap-1 sm:max-w-27 sm:gap-1.5">
                {#each Array(5) as _, i}
                  <div 
                    class={"w-2.5 h-2.5 rounded-full sm:w-3 sm:h-3 " + (isColliding ? 'filter-red ' : '') + "transition-all duration-300 " +
                      (i < lives 
                        ? 'bg-white shadow-[0_0_8px_rgba(239,68,68,0.8) ]' 
                        : 'border border-slate-500/40 opacity-20')}
                  ></div>
                {/each}
              </div>
            </div>
          {:else if cell === 18}
            <div class="pointer-events-auto flex h-full flex-col items-center justify-center {collisionTextClass}">
              <div class="mb-1 text-[8px] uppercase tracking-[0.2em] text-slate-300/80 sm:mb-2 sm:text-[10px] sm:tracking-[0.3em]">Speed</div>
              <div class="w-16 h-16 border-[3px] border-dashed border-slate-300/60 rounded-full relative flex items-center justify-center sm:w-20 sm:h-20">
                <div class="absolute inset-2 rounded-full border border-slate-300/30"></div>
                <div
                  class="w-1 h-7 bg-slate-100 absolute bottom-1/2 left-[calc(50%-2px)] origin-bottom transition-transform duration-100 ease-out rounded-full"
                  style="transform: rotate({clampGaugeDegrees(-100 + ($displaySpeed * 10))}deg)"
                ></div>
              </div>
              <div class="mt-2 text-[10px] sm:mt-3 sm:text-sm {collisionTextClass}">{$displaySpeed} units</div>
            </div>
          {:else if cell === 19}
            <div class="pointer-events-auto flex h-full items-center justify-center text-center px-3 {collisionTextClass}">
              <div>
                <div class="mb-1 text-[8px] uppercase tracking-[0.2em] text-slate-300/80 sm:mb-2 sm:text-[10px] sm:tracking-[0.3em]">SMS</div>
                <div class="text-[11px] font-semibold sm:text-[14px]">
                  {#if lives <= 2 && lives > 0}
                    Be careful, your life is {lives}
                  {:else if !goalWindowActive}
                    Destination <br> {$stationName}
                  {:else}
                    The USB is inside the wormhole
                  {/if}
                </div>
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



