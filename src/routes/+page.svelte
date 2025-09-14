<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
import * as BABYLON from '@babylonjs/core';
  import { CustomLoadingScreen } from '$lib/customLoadingScreen';
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
    const loadingScreen = new CustomLoadingScreen("I'm loading!!");
    engine.loadingScreen = loadingScreen;
    engine.displayLoadingUI();

    const handleResize = () => engine && engine.resize();
    window.addEventListener('resize', handleResize);

    let disposed = false;

    (async () => {
      // create scenes
      scene1 = WormHoleScene.CreateScene(engine, canvas);
      // AWAIT the async scene creation
      scene2 = await WormHoleScene2.CreateScene(engine, canvas);

      // hide loading UI after a short delay so the spinner is visible
      setTimeout(() => engine && engine.hideLoadingUI(), 600);

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