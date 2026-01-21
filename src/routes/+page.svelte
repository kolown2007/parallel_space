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
  let cursorTimeout: number | null = null;

  onMount(() => {
    if (!canvas) return;

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    // Ensure canvas element has correct CSS sizing and notify engine of initial size
    try {
      canvas.style.width = canvas.style.width || '100%';
      canvas.style.height = canvas.style.height || '100vh';
    } catch (e) {}
    try { engine.resize(); } catch (e) {}

    const loadingScreen = new CustomLoadingScreen("Loading...");
    engine.loadingScreen = loadingScreen;
    try { engine.displayLoadingUI(); } catch {}

    const handleResize = () => engine?.resize();
    window.addEventListener('resize', handleResize);

    // Auto-hide cursor after 6 seconds of inactivity
    const resetCursorTimeout = () => {
      document.body.style.cursor = 'default';
      if (cursorTimeout) clearTimeout(cursorTimeout);
      cursorTimeout = window.setTimeout(() => {
        document.body.style.cursor = 'none';
      }, 6000);
    };
    
    const handleMouseMove = () => resetCursorTimeout();
    window.addEventListener('mousemove', handleMouseMove);
    resetCursorTimeout();

    (async () => {
      try {
        // Scene creation now awaits all asset loading
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

        // Hide loading UI only after everything is ready
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => { try { engine?.hideLoadingUI(); } catch {} }, 50);
          });
        });
      } catch (error) {
        console.error('Scene creation failed:', error);
        try { engine?.hideLoadingUI(); } catch {}
      }
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
      window.removeEventListener('mousemove', handleMouseMove);
      if (cursorTimeout) clearTimeout(cursorTimeout);
      document.body.style.cursor = 'default';
      sceneManager?.dispose();
      engine?.dispose();
    };
  });

  onDestroy(() => {
    if (cursorTimeout) clearTimeout(cursorTimeout);
    document.body.style.cursor = 'default';
    sceneManager?.dispose();
    engine?.dispose();
  });
</script>



<canvas bind:this={canvas} class="babylon-canvas"></canvas>