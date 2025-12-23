<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as BABYLON from '@babylonjs/core';
  import { CustomLoadingScreen } from '$lib/chronoescape/customLoadingScreen';
  import mountVideoScene from '$lib/scenes/videoscene';
  import { WormHoleScene2 } from '$lib/scenes/wormhole2';
  import { SceneManager } from '$lib/core/SceneManager';

  let canvas: HTMLCanvasElement | null = null;
  let engine: any = null;
  let sceneManager: SceneManager | null = null;

  onMount(() => {
    if (!canvas) return;

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    
    const loadingScreen = new CustomLoadingScreen("Loading...");
    engine.loadingScreen = loadingScreen;
    try { engine.displayLoadingUI(); } catch {}

    const handleResize = () => engine?.resize();
    window.addEventListener('resize', handleResize);

    (async () => {
      const scene2 = await WormHoleScene2.CreateScene(engine, canvas, () => {
        sceneManager?.switchTo('scene1');
      });

      // Create scene manager
      sceneManager = new SceneManager(
        engine,
        scene2,
        () => mountVideoScene(undefined, undefined, () => sceneManager?.switchTo('scene2'))
      );

      // Start with scene2
      sceneManager.switchTo('scene2');

      // Hide loading UI after a few frames
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => { try { engine?.hideLoadingUI(); } catch {} }, 50);
        });
      });
    })();

    // Global input
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1') sceneManager?.switchTo('scene1');
      else if (e.key === '2') sceneManager?.switchTo('scene2');
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      sceneManager?.dispose();
      engine?.dispose();
    };
  });

  onDestroy(() => {
    sceneManager?.dispose();
    engine?.dispose();
  });
</script>

<style>
  .babylon-canvas { width: 100%; height: 100vh; display: block; }
  :global(body) { margin: 0; }
</style>

<canvas bind:this={canvas} class="babylon-canvas"></canvas>