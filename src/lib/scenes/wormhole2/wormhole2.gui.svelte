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

  	let { totalUnits = 888, markerUnit = 300 }: { totalUnits?: number; markerUnit?: number } =
		$props();
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

  onMount(() => {
    fetchRevolutionData();
    const apiInterval = setInterval(fetchRevolutionData, 5000);

    // 2. Start the 8-second initialization countdown when the scene mounts
    const mountDelayTimeout = setTimeout(() => {
      showUI = true;
      tutorialStep = 1; // Start tutorial when UI shows
      
      // Start countdown when UI initializes
      countdownInterval = setInterval(() => {
        if (countdown > 0 && !isGameOver) {
          countdown--;
          if (countdown === 0) {
            handleGameOver();
          }
        }
      }, 1000);
    }, 8000); // 8000 milliseconds = 8 seconds

    

    // Keep your event stream listener alive in the background
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

  function handleGameOver() {
    isGameOver = true;
    adjustDroneSpeed(-100); // Stop the drone
    if (countdownInterval) clearInterval(countdownInterval);

    // Optional: Auto-reset after 3 seconds
    setTimeout(() => {
      window.location.reload(); // Simplest way to reset the whole state
    }, 4000);
  }

  function handleWin() {
    isWin = true;
    adjustDroneSpeed(-100); // Stop the drone
    updateProgress(1.0);    // Snap visual to 100%
    if (countdownInterval) clearInterval(countdownInterval);

    // Auto-reset after celebration
    setTimeout(() => {
      window.location.reload();
    }, 6000);
  }
</script>

{#if showUI}
  <div class="hud-container" transition:fade={{ duration: 1000 }}   >
    <div class="speed-dashboard">
      <div class="header-speed">Speed: {$displaySpeed} units</div>
      <div class="gauge-ring">
        <div class="needle" style="transform: rotate({-100 + ($displaySpeed * 10)}deg)"></div>
      </div>
    </div>

    {#if !isWin && !isGameOver}
      <div class="tophud">
        <div class="objective">reach the next station</div>
        <div class="countdown-timer">{countdown}s</div>
      </div>
    {/if}

    <div class="tracker-container left-tracker">
      <div class="boundary-line top-bracket"></div>
      <div class="boundary-line bottom-bracket"></div>
        
      <div class="year-label top">2026</div>
      <div class="year-label bottom">2050</div>
      <div class="indicator-triangle" style="bottom: {apiProgress}%"></div>
    </div>

    <div class="tracker-container">
 
      <div class="boundary-line top-bracket"></div>
      <div class="boundary-line bottom-bracket"></div>
        
      <div class="station-name">Destination<br/>Station<br/>Alpha</div>
      <div class="percent-label">{Math.floor($droneControl.progress * 100)}%</div>
      <div class="indicator-triangle" style="bottom: {$droneControl.progress * 100}%"></div>
    </div>

    {#if isWin}
      <div class="center-alert success">CONGRATULATIONS!<br>MISSION COMPLETE</div>
    {:else if isGameOver}
      <div class="center-alert failure">MISSION FAILED<br>TEMPORAL DESYNC</div>
    {:else if isColliding}
      <div class="center-alert danger">WARNING<br>-{currentReduction}% SPEED</div>
    {/if}

    {#if tutorialStep > 0}
      <div class="tutorial-overlay">
        {#if tutorialStep === 1}
          <div class="tutorial-bubble bubble-top">
            <div class="bubble-title">MISSION OBJECTIVE </div>
            <p>Your primary task is to navigate the wormhole safely and reach the next temporal station.</p>
            <button onclick={nextTutorialStep}>NEXT</button>
          </div>
        {:else if tutorialStep === 2}
          <div class="tutorial-bubble bubble-left">
            <div class="bubble-title">GLOBAL TIMELINE</div>
            <p>This tracks global progress across the wormhole from 2026 to 2050.</p>
            <button onclick={nextTutorialStep}>NEXT</button>
          </div>
        {:else if tutorialStep === 3}
          <div class="tutorial-bubble bubble-right">
            <div class="bubble-title">STATION PROXIMITY</div>
            <p>Monitor your distance to Station Alpha. Reach 100% to complete the jump.</p>
            <button onclick={nextTutorialStep}>NEXT</button>
          </div>
        {:else if tutorialStep === 4}
          <div class="tutorial-bubble bubble-bottom">
            <div class="bubble-title">FLIGHT SYSTEMS</div>
            <p>Watch your velocity. Collisions will result in temporary speed reduction.</p>
              <p>Tap screen to add velocity</p>
            <button onclick={nextTutorialStep}>INITIALIZE FLIGHT</button>
          </div>
        {/if}
        
        <button class="skip-btn" onclick={() => tutorialStep = 0}>SKIP TUTORIAL</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* All your beautiful HUD CSS remains completely untouched */
  .hud-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    font-family: 'Lucida Console', Courier, monospace;
    z-index: 10;
  }

  .speed-dashboard {
    pointer-events: auto; 
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    color: lightgreen;
  }

  .gauge-ring {
    width: 100px;
    height: 100px;
    border: 3px dashed rgba(144, 238, 144, 0.6);
    border-radius: 50%;
    position: relative;
    margin: 5px auto;
    background: rgba(0, 0, 0, 0.4);
  }

  .needle {
    width: 3px;
    height: 45px;
    background: lightgreen;
    position: absolute;
    bottom: 50%;
    left: calc(50% - 1.5px);
    transform-origin: bottom center;
    transition: transform 0.1s ease-out;
  }

  .tracker-container {
    position: absolute;
    right: 40px;
    top: 50%;
    transform: translateY(-50%);
    height: 300px;
    width: 24px;
  }

  .boundary-line {
    position: absolute;
    left: 0;
    width: 100%;
    height: 2px;
    background: rgba(144, 238, 144, 0.6);
  }

  .left-tracker {
    right: auto;
    left: 40px;
  }

  .year-label {
    position: absolute;
    left: 50%;
    font-size: 12px;
    transform: translateX(-50%);
    color: lightgreen;
    text-align: center;
  }
  .year-label.top { top: -30px; }
  .year-label.bottom { bottom: -30px; }

  .top-bracket { top: 0; }
  .bottom-bracket { bottom: 0; }

  .station-name {
    position: absolute;
    top: -80px;
    left: 50%;
    font-size: 12px;
    transform: translateX(-50%);
    color: green;
    text-align: center;
  }

  .percent-label {
    position: absolute;
    top: -25px;
    left: 50%;
    transform: translateX(-50%);
    color: lightgreen;
    white-space: nowrap;
  }

  .indicator-triangle {
    position: absolute;
    width: 0;
    height: 0;
    border-left: 8px solid transparent;  
    border-right: 8px solid transparent; 
    border-bottom: 12px solid lightgreen; 
    left: 50%;
    transform: translateX(-50%) translateY(50%);
    transition: bottom 0.1s ease-out;
  }

  .tophud {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    color: lightgreen;
  }

  .countdown-timer {
    font-size: 18px;
    margin-top: 10px;
    color: #ff3e00; /* High-contrast orange/red for urgency */
    text-shadow: 0 0 10px rgba(255, 62, 0, 0.5);
    font-weight: bold;
  }

  .center-alert {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 32px;
    font-weight: bold;
    text-align: center;
  }
  .success { color: white; }
  .danger { color: red; }
  .failure { color: #ff3e00; text-shadow: 0 0 20px rgba(255, 62, 0, 0.8); }

  /* Tutorial Styles */
  .tutorial-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.2);
    pointer-events: auto;
    z-index: 100;
  }

  .tutorial-bubble {
    position: absolute;
    background: rgba(0, 20, 0, 0.2);
    border: 2px solid lightgreen;
    border-radius: 12px;
    padding: 20px;
    width: 250px;
    box-shadow: 0 0 15px rgba(144, 238, 144, 0.4);
    color: lightgreen;
  }

  .bubble-title {
    font-weight: bold;
    border-bottom: 1px solid lightgreen;
    margin-bottom: 10px;
    padding-bottom: 5px;
  }

  .tutorial-bubble p {
    font-size: 13px;
    line-height: 1.4;
    margin-bottom: 15px;
  }

  .tutorial-bubble button {
    background: lightgreen;
    color: black;
    border: none;
    border-radius: 6px;
    padding: 5px 15px;
    font-family: inherit;
    font-weight: bold;
    cursor: pointer;
  }

  .bubble-top {
    top: 100px;
    left: 50%;
    transform: translateX(-50%);
  }

  .bubble-left {
    left: 80px;
    top: 50%;
    transform: translateY(-50%);
  }

  .bubble-right {
    right: 80px;
    top: 50%;
    transform: translateY(-50%);
  }

  .bubble-bottom {
    bottom: 150px;
    left: 50%;
    transform: translateX(-50%);
  }

  .skip-btn {
    position: absolute;
    top: 20px;
    right: 20px;
    background: none;
    border: 1px solid rgba(144, 238, 144, 0.5);
    color: rgba(144, 238, 144, 0.5);
    border-radius: 6px;
    padding: 5px 10px;
    cursor: pointer;
  }
</style>