<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as BABYLON from '@babylonjs/core';
  // WebGPU engine may or may not be present in the bundled Babylon package.
  // We'll look it up at runtime via `BABYLON.WebGPUEngine` to avoid Vite import errors.
  import { CustomLoadingScreen } from '$lib/scenes/customLoadingScreen';
  import mountVideoScene from '$lib/scenes/videoscene';
  import { WormHoleScene2 } from '$lib/scenes/wormhole2';
  import { SceneManager } from '$lib/core/SceneManager';

  let canvas: HTMLCanvasElement | null = null;
  let engine: any = null;
  let sceneManager: SceneManager | null = null;
  let cursorTimeout: number | null = null;
  // Event handler references (declared so they can be added/removed safely)
  let handleResize: (() => void) | null = null;
  let handleKeyDown: ((e: KeyboardEvent) => void) | null = null;
  let handleMouseMove: (() => void) | null = null;

  onMount(() => {
    if (!canvas) return;
    const canv = canvas as HTMLCanvasElement;

    // Defer creating the Engine until we've attempted WebGPU so we don't
    // accidentally create a WebGL context first (which can make
    // `canvas.getContext('webgpu')` return null).
    try {
      canvas.style.width = canvas.style.width || '100%';
      canvas.style.height = canvas.style.height || '100vh';
    } catch (e) {}

    (async () => {
      // Try to create a WebGPU engine when available, otherwise fall back to WebGL
      const createEngine = async () => {
        try {
          const RuntimeWebGPUEngine = (BABYLON as any).WebGPUEngine as any;
          if ((navigator as any).gpu && RuntimeWebGPUEngine) {
            try {
                // Check whether the canvas can provide a WebGPU context before
                // attempting to construct the Babylon WebGPUEngine. If the
                // context is null, constructing the engine will fail when the
                // internals try to call `context.configure(...)`.
                const webgpuCtx = (canv as any)?.getContext ? (canv as any).getContext('webgpu') : null;
                if (!webgpuCtx) {
                  console.warn("Canvas.getContext('webgpu') returned null - skipping WebGPU engine");
                } else {
                  const webgpuEngine = new RuntimeWebGPUEngine(canv, { preserveDrawingBuffer: true, stencil: true, enableGPUDebugMarkers: false });
                  if (webgpuEngine.initAsync) {
                    await webgpuEngine.initAsync();
                  }
                  console.info('Using WebGPU engine');
                  return webgpuEngine;
                }
              } catch (e) {
                console.warn('WebGPU engine initialization failed, falling back to WebGL', e);
              }
          }
        } catch (e) {
          console.warn('WebGPU check failed', e);
        }
        // fallback
        return new BABYLON.Engine(canv, true, { preserveDrawingBuffer: true, stencil: true });
      };

      try {
        engine = await createEngine();

        // Ensure canvas element has correct CSS sizing and notify engine of initial size
        try {
          canv.style.width = canv.style.width || '100%';
          canv.style.height = canv.style.height || '100vh';
        } catch (e) {}
        try { engine.resize(); } catch (e) {}

        const loadingScreen = new CustomLoadingScreen("Loading...");
        engine.loadingScreen = loadingScreen;
        try { engine.displayLoadingUI(); } catch {}

        handleResize = () => engine?.resize();
        window.addEventListener('resize', handleResize);

        // Auto-hide cursor after 6 seconds of inactivity
        const resetCursorTimeout = () => {
          document.body.style.cursor = 'default';
          if (cursorTimeout) clearTimeout(cursorTimeout);
          cursorTimeout = window.setTimeout(() => {
            document.body.style.cursor = 'none';
          }, 6000);
        };
        handleMouseMove = () => resetCursorTimeout();
        window.addEventListener('mousemove', handleMouseMove);
        resetCursorTimeout();

        try {
          // Scene creation now awaits all asset loading
          const scene2 = await WormHoleScene2.CreateScene(engine, canv, () => {
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

        // Global input
        handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === '1') sceneManager?.switchTo('scene1');
          else if (e.key === '2') sceneManager?.switchTo('scene2');
        };
        window.addEventListener('keydown', handleKeyDown);

      } catch (err) {
        console.error('Engine initialization failed:', err);
      }
    })();

    return () => {
      try { if (handleResize) window.removeEventListener('resize', handleResize); } catch {}
      try { if (handleKeyDown) window.removeEventListener('keydown', handleKeyDown); } catch {}
      try { if (handleMouseMove) window.removeEventListener('mousemove', handleMouseMove); } catch {}
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