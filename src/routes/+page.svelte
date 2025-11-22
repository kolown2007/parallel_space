<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
import * as BABYLON from '@babylonjs/core';
  import { CustomLoadingScreen } from '$lib/chronoescape/customLoadingScreen';
  import { WormHoleScene } from '$lib/scenes/wormhole';
  import { WormHoleScene2 } from '$lib/scenes/wormhole2';

  let canvas: HTMLCanvasElement | null = null;
  let engine: any = null;
  let scene1: any = null;
  let scene2: any = null;

  let sceneMode = $state('scene2');

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

      // create scenes (WormHoleScene2 will run preload but page owns the loading UI)
      scene1 = WormHoleScene.CreateScene(engine, canvas);
      scene2 = await WormHoleScene2.CreateScene(engine, canvas);

      // Render a few frames of the created scene, then hide the loading UI to avoid flashes
      try {
        const active = sceneMode === 'scene1' ? scene1 : scene2;
        requestAnimationFrame(() => {
          try { active && typeof active.render === 'function' && active.render(); } catch {}
          requestAnimationFrame(() => {
            try { active && typeof active.render === 'function' && active.render(); } catch {}
            requestAnimationFrame(() => {
              try { active && typeof active.render === 'function' && active.render(); } catch {}
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

      // render only the active scene
      engine.runRenderLoop(() => {
        if (disposed) return;
        if (sceneMode === 'scene1') {
          if (scene1 && typeof scene1.render === 'function') scene1.render();
        } else {
          if (scene2 && typeof scene2.render === 'function') scene2.render();
        }
      });
    })();

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      if (engine) {
        try {
          engine.stopRenderLoop();
          engine.dispose();
        } finally {
          engine = null;
          scene1 = null;
          scene2 = null;
        }
      }
    };
  });

  onDestroy(() => {
    if (engine) {
      engine.stopRenderLoop();
      engine.dispose();
      engine = null;
      scene1 = null;
      scene2 = null;
    }
  });

  $inspect(sceneMode);

  window.addEventListener('keydown', (event) => {
    if (event.key === '1') {
      sceneMode = 'scene1';
    } else if (event.key === '2') {
      sceneMode = 'scene2';
    }
  });
</script>

<style>
  .babylon-canvas {
    width: 100%;
    height: 100vh;
    display: block;
  }

  :global(body) { margin: 0; }
</style>

<canvas bind:this={canvas} class="babylon-canvas"></canvas>