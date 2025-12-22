<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
import * as BABYLON from '@babylonjs/core';
  import { CustomLoadingScreen } from '$lib/chronoescape/customLoadingScreen';
 import mountVideoScene, { type VideoMount } from '$lib/scenes/videoscene';
  import { WormHoleScene2 } from '$lib/scenes/wormhole2';

  let canvas: HTMLCanvasElement | null = null;
  let engine: any = null;
  let videoMount: VideoMount | null = null;
  let scene2: any = null;

  let sceneMode = $state<'scene1' | 'scene2'>('scene2');
  let renderLoopActive = false;

  // run async work inside an IIFE so onMount returns the cleanup function synchronously
  onMount(() => {
    if (!canvas) return;

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

    // set up and show custom loading screen before creating the scene
    const loadingScreen = new CustomLoadingScreen("Loading...");
    engine.loadingScreen = loadingScreen;
    try { engine.displayLoadingUI(); } catch {}

    const handleResize = () => engine && engine.resize();
    window.addEventListener('resize', handleResize);

    let disposed = false;

    (async () => {

      // create scene (WormHoleScene2 will run preload but page owns the loading UI)
      scene2 = await WormHoleScene2.CreateScene(engine, canvas);

      // Render a few frames of the created scene, then hide the loading UI to avoid flashes
      try {
        requestAnimationFrame(() => {
          try { scene2 && typeof scene2.render === 'function' && scene2.render(); } catch {}
          requestAnimationFrame(() => {
            try { scene2 && typeof scene2.render === 'function' && scene2.render(); } catch {}
            requestAnimationFrame(() => {
              try { scene2 && typeof scene2.render === 'function' && scene2.render(); } catch {}
              // small timeout to allow compositor
              setTimeout(() => {
                try { engine && engine.hideLoadingUI(); } catch {}
              }, 50);
            });
          });
        });
      } catch (e) {
        try { engine && engine.hideLoadingUI(); } catch {}
      }

      // Start render loop
      startRenderLoop();
    })();

    function startRenderLoop() {
      if (renderLoopActive || !engine) return;
      renderLoopActive = true;
      
      engine.runRenderLoop(() => {
        if (disposed || sceneMode !== 'scene2') return;
        if (scene2 && typeof scene2.render === 'function') {
          scene2.render();
        }
      });
    }

    function stopRenderLoop() {
      if (!renderLoopActive || !engine) return;
      renderLoopActive = false;
      try {
        engine.stopRenderLoop();
      } catch {}
    }

    // Watch sceneMode changes to control rendering
    $effect(() => {
      if (sceneMode === 'scene2') {
        startRenderLoop();
      } else {
        stopRenderLoop();
      }
    });

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      try { videoMount?.cleanup(); } catch {}
      if (engine) {
        try {
          engine.stopRenderLoop();
          engine.dispose();
        } finally {
          engine = null;
          videoMount = null;
          scene2 = null;
          renderLoopActive = false;
        }
      }
    };
  });

  onDestroy(() => {
    try { videoMount?.cleanup(); } catch {}
    if (engine) {
      engine.stopRenderLoop();
      engine.dispose();
      engine = null;
      videoMount = null;
      scene2 = null;
      renderLoopActive = false;
    }
  });

  $inspect(sceneMode);

  window.addEventListener('keydown', (event) => {
    if (event.key === '1') {
      sceneMode = 'scene1';
      if (!videoMount) {
        videoMount = mountVideoScene(undefined, undefined, () => {
          // Auto-switch back to scene2 when video ends
          sceneMode = 'scene2';
          if (videoMount) {
            try { videoMount.cleanup(); } catch {}
            videoMount = null;
          }
        });
      }
    } else if (event.key === '2') {
      sceneMode = 'scene2';
      if (videoMount) {
        try { videoMount.cleanup(); } catch {}
        videoMount = null;
      }
    }
  });
</script>

<style>
  .babylon-canvas {
    width: 100%;
    height: 100vh;
    display: block;
  }

  /* :global(body) { margin: 0; 
    cursor: none;} */


      :global(body) { margin: 0; 
  }
    
</style>

<canvas bind:this={canvas} class="babylon-canvas"></canvas>