<script lang="ts">
  import { onMount } from 'svelte';
  import { displaySpeed, droneControl, droneEvents } from '../../stores/droneControl.svelte.js';
  import { fade } from 'svelte/transition';

  // 1. New visibility flag controlled by our startup timer
  let showUI = $state(false);

  let isColliding = $state(false);
  let alertTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentReduction = $state(0);

  onMount(() => {
    // 2. Start the 8-second initialization countdown when the scene mounts
    const mountDelayTimeout = setTimeout(() => {
      showUI = true;
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
      if (alertTimeout) clearTimeout(alertTimeout);
    };
  });
</script>

{#if showUI}
  <div class="hud-container" transition:fade={{ duration: 1000 }}   >
    <div class="speed-dashboard">
      <div class="header-speed">Speed: {$displaySpeed} units</div>
      <div class="gauge-ring">
        <div class="needle" style="transform: rotate({-100 + ($displaySpeed * 10)}deg)"></div>
      </div>
    </div>

    <div class="tophud">
     
      <div class="objective">Objective: Navigate through the wormhole and reach the next station</div>
    </div>

    <div class="tracker-container">
 
      <div class="boundary-line top-bracket"></div>
      <div class="boundary-line bottom-bracket"></div>
        
      <div class="station-name">Destination<br/>Station<br/>Alpha</div>
      <div class="percent-label">{Math.floor($droneControl.progress * 100)}%</div>
      <div class="indicator-triangle" style="bottom: {$droneControl.progress * 100}%"></div>
    </div>

    {#if $droneControl.progress >= 1.0}
      <div class="center-alert success">Entering a New Station</div>
    {:else if isColliding}
      <div class="center-alert danger">WARNING<br>-{currentReduction}% SPEED</div>
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
</style>