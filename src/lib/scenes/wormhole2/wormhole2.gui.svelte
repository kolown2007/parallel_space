<script lang="ts">
  import { onMount } from 'svelte';
  import { displaySpeed, droneControl, droneEvents, adjustDroneSpeed, updateProgress } from '../../stores/droneControl.svelte.js';
  import { fade } from 'svelte/transition';

  // 1. New visibility flag controlled by our startup timer
  let showUI = $state(false);

  let isColliding = $state(false);
  let tutorialStep = $state(0); // 0: off, 1: objective, 2: global, 3: navigation, 4: speed
  let isGameOver = $state(false);
  let isWin = $state(false);
  let alertTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentReduction = $state(0);
  
  let countdown = $state(60);
  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let apiValue = $state(0);
  
  let { totalUnits = 888, markerUnit = 300 }: { totalUnits?: number; markerUnit?: number } = $props();
  	const apiRevUrl = 'https://kolown.net/api/chrono-escapes/1/revolution';

  let apiProgress = $derived(Math.min(100, Math.max(0, (apiValue / totalUnits) * 100)));

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

  function nextTutorialStep() {
    tutorialStep = tutorialStep < 4 ? tutorialStep + 1 : 0;
  }

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
      tutorialStep = 1;
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
    <!-- Speed Dashboard -->
    <div class="pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2 text-center text-[#90ee90]">
      <div>Speed: {$displaySpeed} units</div>
      <div class="w-25 h-25 border-[3px] border-dashed border-[#90ee90]/60 rounded-full relative mx-auto my-1.25 bg-black/40">
        <div 
          class="w-0.75 h-11.25 bg-[#90ee90] absolute bottom-1/2 left-[calc(50%-1.5px)] origin-bottom transition-transform duration-100 ease-out" 
          style="transform: rotate({-100 + ($displaySpeed * 10)}deg)"
        ></div>
      </div>
    </div>

    {#if !isWin && !isGameOver}
      <div class="absolute top-5 left-1/2 -translate-x-1/2 text-center text-[#90ee90]">
        <div class="uppercase tracking-widest">reach the next station</div>
        <div class="text-[18px] mt-2.5 text-[#ff3e00] [text-shadow:0_0_10px_rgba(255,62,0,0.5)] font-bold">{countdown}s</div>
      </div>
    {/if}

    <!-- Global Timeline Tracker (Left) -->
    <div class="absolute left-10 top-1/2 -translate-y-1/2 h-75 w-6">
      <div class="absolute left-0 w-full h-0.5 bg-[#90ee90]/60 top-0"></div>
      <div class="absolute left-0 w-full h-0.5 bg-[#90ee90]/60 bottom-0"></div>
        
      <div class="absolute left-1/2 -translate-x-1/2 text-[12px] text-[#90ee90] text-center -top-7.5">2026</div>
      <div class="absolute left-1/2 -translate-x-1/2 text-[12px] text-[#90ee90] text-center -bottom-7.5">2050</div>
      <div 
        class="absolute w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-b-12 border-b-[#90ee90] left-1/2 -translate-x-1/2 translate-y-1/2 transition-[bottom] duration-100 ease-out" 
        style="bottom: {apiProgress}%"
      ></div>
    </div>

    <!-- Station Proximity Tracker (Right) -->
    <div class="absolute right-10 top-1/2 -translate-y-1/2 h-75 w-6">
      <div class="absolute left-0 w-full h-0.5 bg-[#90ee90]/60 top-0"></div>
      <div class="absolute left-0 w-full h-0.5 bg-[#90ee90]/60 bottom-0"></div>
        
      <div class="absolute -top-20 left-1/2 -translate-x-1/2 text-[12px] text-green-700 text-center">Destination<br/>Station<br/>Alpha</div>
      <div class="absolute -top-6.25 left-1/2 -translate-x-1/2 text-[#90ee90] whitespace-nowrap">{Math.floor($droneControl.progress * 100)}%</div>
      <div 
        class="absolute w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-b-12 border-b-[#90ee90] left-1/2 -translate-x-1/2 translate-y-1/2 transition-[bottom] duration-100 ease-out" 
        style="bottom: {$droneControl.progress * 100}%"
      ></div>
    </div>

    <!-- Central Alerts -->
    {#if isWin}
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[32px] font-bold text-center pointer-events-auto text-white">
        CONGRATULATIONS!<br>MISSION COMPLETE
        <button class="block mx-auto mt-5 bg-none border-2 border-current px-7.5 py-2.5 font-bold cursor-pointer hover:bg-white/10 transition-colors" onclick={restart}>CONTINUE</button>
      </div>
    {:else if isGameOver}
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[32px] font-bold text-center pointer-events-auto text-[#ff3e00] [text-shadow:0_0_20px_rgba(255,62,0,0.8)]">
        MISSION FAILED<br>TEMPORAL DESYNC
        <button class="block mx-auto mt-5 bg-none border-2 border-current px-7.5 py-2.5 font-bold cursor-pointer hover:bg-white/10 transition-colors" onclick={restart}>TRY AGAIN</button>
      </div>
    {:else if isColliding}
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[32px] font-bold text-center pointer-events-auto text-red-600">WARNING<br>-{currentReduction}% SPEED</div>
    {/if}

    <!-- Tutorial Layers -->
    {#if tutorialStep > 0}
      <div class="absolute inset-0 bg-black/20 pointer-events-auto z-100">
        {#if tutorialStep === 1}
          <div class="absolute top-25 left-1/2 -translate-x-1/2 bg-[#001400]/20 border-2 border-[#90ee90] rounded-xl p-5 w-62.5 shadow-[0_0_15px_rgba(144,238,144,0.4)] text-[#90ee90]">
            <div class="font-bold border-b border-[#90ee90] mb-2.5 pb-1.25">MISSION OBJECTIVE</div>
            <p class="text-[13px] leading-[1.4] mb-3.75">MISSION OBJECTIVE </p>
            <p class="text-[13px] leading-[1.4] mb-3.75">Your primary task is to navigate the wormhole safely and reach the next temporal station.</p>
            <button onclick={nextTutorialStep}>NEXT</button>
          </div>
        {:else if tutorialStep === 2}
          <div class="absolute left-20 top-1/2 -translate-y-1/2 bg-[#001400]/20 border-2 border-[#90ee90] rounded-xl p-5 w-62.5 shadow-[0_0_15px_rgba(144,238,144,0.4)] text-[#90ee90]">
            <div class="font-bold border-b border-[#90ee90] mb-2.5 pb-1.25">GLOBAL TIMELINE</div>
            <p class="text-[13px] leading-[1.4] mb-3.75">This tracks global progress across the wormhole from 2026 to 2050.</p>
            <button onclick={nextTutorialStep}>NEXT</button>
          </div>
        {:else if tutorialStep === 3}
          <div class="absolute right-20 top-1/2 -translate-y-1/2 bg-[#001400]/20 border-2 border-[#90ee90] rounded-xl p-5 w-62.5 shadow-[0_0_15px_rgba(144,238,144,0.4)] text-[#90ee90]">
            <div class="font-bold border-b border-[#90ee90] mb-2.5 pb-1.25">STATION PROXIMITY</div>
            <p class="text-[13px] leading-[1.4] mb-3.75">Monitor your distance to Station Alpha. Reach 100% to complete the jump.</p>
            <button onclick={nextTutorialStep}>NEXT</button>
          </div>
        {:else if tutorialStep === 4}
          <div class="absolute bottom-37.5 left-1/2 -translate-x-1/2 bg-[#001400]/20 border-2 border-[#90ee90] rounded-xl p-5 w-62.5 shadow-[0_0_15px_rgba(144,238,144,0.4)] text-[#90ee90]">
            <div class="font-bold border-b border-[#90ee90] mb-2.5 pb-1.25">FLIGHT SYSTEMS</div>
            <p class="text-[13px] leading-[1.4] mb-3.75">Watch your velocity. Collisions will result in temporary speed reduction.</p>
              <p class="text-[13px] leading-[1.4] mb-3.75">Tap screen to add velocity</p>
            <button onclick={nextTutorialStep}>INITIALIZE FLIGHT</button>
          </div>
        {/if}
        
        <button class="absolute top-5 right-5 bg-none border border-[#90ee90]/50 text-[#90ee90]/50 rounded-md px-2.5 py-1.25 cursor-pointer" onclick={() => tutorialStep = 0}>SKIP TUTORIAL</button>
      </div>
    {/if}
  </div>
{/if}

