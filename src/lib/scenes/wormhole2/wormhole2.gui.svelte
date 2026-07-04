<script lang="ts">
  import { onMount } from 'svelte';
  import { displaySpeed, droneControl, droneEvents, adjustDroneSpeed, updateProgress } from '../../stores/droneControl.svelte.js';
  import { fade } from 'svelte/transition';

  // 1. New visibility flag controlled by our startup timer
  let showUI = $state(false);

  let isColliding = $state(false);
  let isGameOver = $state(false);
  let isWin = $state(false);
  let alertTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentReduction = $state(0);
  
  let countdown = $state(60);
  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let apiValue = $state(0);
  
  let { totalUnits = 888, markerUnit = 300 }: { totalUnits?: number; markerUnit?: number } = $props();
  	const apiRevUrl = 'https://kolown.net/api/chrono-escapes/1/revolution';

 

  async function fetchRevolutionData() {
    try {
      const response = await fetch(apiRevUrl);
      if (response.ok) {
        const data = await response.json();
        apiValue = data.revolution ?? 0;
      }
    } catch (e) {
      console.warn('Failed to fetch revolution data:', e);
    }
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
        if (countdown === 0) {
          handleGameOver();
        }
      }
    }, 1000);
  }

  onMount(() => {
    fetchRevolutionData();
    const apiInterval = setInterval(fetchRevolutionData, 5000);

    const mountDelayTimeout = setTimeout(() => {
      showUI = true;
      startCountdown();
    }, 8000);

    const unsubscribe = droneEvents.subscribe(event => {
      if (event?.type === 'collision') {
        if (alertTimeout) clearTimeout(alertTimeout);
        currentReduction = Math.floor(event.data.reduction * 100);
        isColliding = true;
        alertTimeout = setTimeout(() => {
          isColliding = false;
        }, 1500);
      }
    });

    // 3. Clean up ALL active timers when switching away from scene2
    return () => {
      unsubscribe();
      clearTimeout(mountDelayTimeout);
      clearInterval(apiInterval);
      if (countdownInterval) clearInterval(countdownInterval);
      if (alertTimeout) clearTimeout(alertTimeout);
    };
  });

  function restart() {
    // Soft reset of local state
    isGameOver = false;
    isWin = false;
    countdown = 60;
    
    // Reset the store values
    updateProgress(0);
    adjustDroneSpeed(0); // Assuming 0 or a positive value resets the drone's velocity
    
    startCountdown();
  }

  function handleGameOver() {
    isGameOver = true;
    adjustDroneSpeed(-100); // Stop the drone
    if (countdownInterval) clearInterval(countdownInterval);
  }

  function handleWin() {
    isWin = true;
    adjustDroneSpeed(-100); // Stop the drone
    updateProgress(1.0);    // Snap visual to 100%
    if (countdownInterval) clearInterval(countdownInterval);
  }
</script>

{#if showUI}
  <div class="absolute top-0 left-0 w-full h-full pointer-events-none font-mono z-10" transition:fade={{ duration: 1000 }}>
    <div class="grid gap-4 grid-cols-1 sm:grid-cols-[auto_2fr_auto] px-2 py-2 h-full ">
    
      <!-- main div 1: left tracker column -->
      <div class="hidden sm:flex relative flex-col items-center justify-center gap-6  border border-green-900 border-dashed rounded-3xl p-4">
        <div class="relative h-75 w-6">
          <!-- <div class="absolute left-0 w-full h-0.5 bg-[#90ee90]/60 top-0"></div>
          <div class="absolute left-0 w-full h-0.5 bg-[#90ee90]/60 bottom-0"></div> -->
        </div>

        <div class="pointer-events-auto  max-w-xs h-36 min-h-36 text-center text-[#90ee90]  rounded-3xl p-0.5">
          <div>Speed: <br/> {$displaySpeed} units</div>
          <div class="w-25 h-25 border-[3px] border-dashed border-[#90ee90]/60 rounded-full relative mx-auto my-1.25">
            <div
              class="w-0.75 h-11.25 bg-[#90ee90] absolute bottom-1/2 left-[calc(50%-1.5px)] origin-bottom transition-transform duration-100 ease-out"
              style="transform: rotate({-100 + ($displaySpeed * 10)}deg)"
            ></div>
          </div>
        </div>
      </div>

      <!-- main div 2: middle control panel column -->
      <div class="relative flex flex-col items-center justify-between h-full  gap-6 border border-green-900 border-dashed rounded-3xl p-4 pb-8">
        <div class="pointer-events-auto  max-w-xs h-28 min-h-28 text-center text-[#90ee90]  rounded-3xl p-1">
          <div class="uppercase tracking-widest">timer</div>
          <div class="text-[18px] mt-2.5 text-[#ff3e00] [text-shadow:0_0_10px_rgba(255,62,0,0.5)] font-bold">{countdown}s</div>
        </div>

        <!-- div 2: middle status block -->
        <div class="pointer-events-auto w-72 min-w-0  text-center text-[#90ee90] rounded-3xl p-1 overflow-hidden">
          <div class="h-full w-full overflow-auto  whitespace-normal wrap-break-words text-sm">
            {#if isWin}
              <div class="text-[20px] font-bold text-white">CONGRATULATIONS!</div>
              <div class="mt-2 text-[#90ee90]">MISSION COMPLETE</div>
              <button class="mt-4 inline-flex w-full justify-center bg-none border-2 border-current px-7.5 py-2.5 font-bold cursor-pointer hover:bg-white/10 transition-colors" onclick={restart}>CONTINUE</button>
            {:else if isGameOver}
              <div class="text-[20px] font-bold text-[#ff3e00]">MISSION FAILED</div>
              <div class="mt-2 text-[#ff3e00]/80">REGRESS STATION</div>
              <button class="mt-4 inline-flex w-full justify-center bg-none border-2 border-current px-7.5 py-2.5 font-bold cursor-pointer hover:bg-white/10 transition-colors" onclick={restart}>TRY AGAIN</button>
            {:else if isColliding}
              <div class="text-[20px] font-bold text-red-600">COLLISION!</div>
              <div class="mt-2 text-red-400">-{currentReduction}% SPEED</div>
            {:else}
              <div class="uppercase tracking-widest">GOAL</div>
              <div class="mt-2 text-[#90ee90]/80">REACH NEXT STATION</div>
            {/if}
          </div>
        </div>
      </div>

      <!-- main div 3: right tracker column -->
      <div class="hidden sm:flex relative items-stretch rounded-3xl p-4 border border-green-900 border-dashed">
        <div class="flex flex-col h-full ">

          <div class="flex-none h-1/5  text-center text-[#90ee90]">
            <div class="text-sm uppercase tracking-[0.3em]">Stations<br/> Completed</div>
            <div class="text-[14px] font-bold mt-1">{apiValue} / {totalUnits}<br/>↓<br/>↓</div>

          </div>

          <div class="flex-1 flex items-center justify-center">
            <div class="relative h-75 w-6">
              <div class="absolute left-0 w-full h-0.5 bg-[#90ee90]/60 top-0"></div>
              <div class="absolute left-0 w-full h-0.5 bg-[#90ee90]/60 bottom-0"></div>
              <div class="absolute -top-20 left-1/2 -translate-x-1/2 text-[12px] text-green-700 text-center">Next<br/>Station</div>
              <div class="absolute -top-6.25 left-1/2 -translate-x-1/2 text-[#90ee90] whitespace-nowrap">{Math.floor($droneControl.progress * 100)}%</div>
              <div
                class="absolute w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-b-12 border-b-[#90ee90] left-1/2 -translate-x-1/2 translate-y-1/2 transition-[bottom] duration-100 ease-out"
                style="bottom: {$droneControl.progress * 100}%"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
{/if}

