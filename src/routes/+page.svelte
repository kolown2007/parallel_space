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
      // Detect high-tier devices (desktop with enough memory/cores) to allow WebGPU.
      // Mobile devices always use WebGL for compatibility.
      const isHighTierDevice = (): boolean => {
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile) return false;
        const mem = (navigator as any).deviceMemory as number | undefined;
        if (mem !== undefined && mem < 4) return false;
        const cores = navigator.hardwareConcurrency;
        if (cores !== undefined && cores < 4) return false;
        return true;
      };

      // WebGL is the default. WebGPU is only attempted on high-tier desktop devices.
      const createEngine = async () => {
        if (isHighTierDevice()) {
          try {
            const RuntimeWebGPUEngine = (BABYLON as any).WebGPUEngine as any;
            if ((navigator as any).gpu && RuntimeWebGPUEngine) {
              // Use requestAdapter() — the correct spec-compliant check for real
              // WebGPU support. A null adapter means WebGPU isn't usable here.
              const adapter = await (navigator as any).gpu.requestAdapter();
              if (adapter) {
                const webgpuEngine = new RuntimeWebGPUEngine(canv, { preserveDrawingBuffer: true, stencil: true, enableGPUDebugMarkers: false, antialias: false });
                if (webgpuEngine.initAsync) {
                  await webgpuEngine.initAsync();
                }
                console.info('Using WebGPU engine (high-tier device)');
                return webgpuEngine;
              } else {
                console.warn('navigator.gpu.requestAdapter() returned null - using WebGL');
              }
            }
          } catch (e) {
            console.warn('WebGPU engine initialization failed, using WebGL', e);
          }
        } else {
          console.info('Mobile or low-tier device detected - using WebGL');
        }
        // Default: WebGL
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