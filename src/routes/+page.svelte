<script lang="ts">
  import { onMount } from 'svelte';
  import * as BABYLON from '@babylonjs/core';
  // WebGPU engine may or may not be present in the bundled Babylon package.
  // We'll look it up at runtime via `BABYLON.WebGPUEngine` to avoid Vite import errors.
  import { CustomLoadingScreen } from '$lib/scenes/customLoadingScreen';
  import mountVideoScene from '$lib/scenes/videoscene';
  import { WormHoleScene2 } from '$lib/scenes/wormhole2';
  import createOceanScene from '$lib/scenes/ocean';
  import { SceneManager } from '$lib/core/SceneManager';


  import DroneHUD from '$lib/scenes/wormhole2/wormhole2.gui.svelte';

  let canvas: HTMLCanvasElement | null = null;
  let engine: any = null;
  let sceneManager: SceneManager | null = null;
  let cursorTimeout: number | null = null;
  let ac: AbortController | null = null;

  // Track the active scene reactively via Svelte runes
  let activeScene = $state('scene2');

  // =========================================================================
  // MASTER SYNC FUNCTION: Updates both Babylon AND Svelte UI at the same time
  // =========================================================================
  const changeScene = (sceneName: string) => {
    if (!sceneManager) return;
    sceneManager.switchTo(sceneName as any);
    activeScene = sceneName; // Triggers Svelte conditional DOM mounting instantly
  };

  onMount(() => {
    if (!canvas) return;
    const canv = canvas as HTMLCanvasElement;

    (async () => {
      // Allow manual renderer override via URL query param: ?renderer=webgpu or ?renderer=webgl
      const rendererOverride = new URLSearchParams(window.location.search).get('renderer')?.toLowerCase();

      const createEngine = async () => {
        if (rendererOverride === 'webgpu') {
          try {
            const RuntimeWebGPUEngine = (BABYLON as any).WebGPUEngine as any;
            if ((navigator as any).gpu && RuntimeWebGPUEngine) {
              const adapter = await (navigator as any).gpu.requestAdapter();
              if (adapter) {
                const webgpuEngine = new RuntimeWebGPUEngine(canv, { preserveDrawingBuffer: true, stencil: true, enableGPUDebugMarkers: false, antialias: false });
                if (webgpuEngine.initAsync) {
                  await webgpuEngine.initAsync();
                }
                console.info('Using WebGPU engine (forced via ?renderer=webgpu)');
                return webgpuEngine;
              } else {
                console.warn('navigator.gpu.requestAdapter() returned null - falling back to WebGL');
              }
            }
          } catch (e) {
            console.warn('WebGPU engine initialization failed, falling back to WebGL', e);
          }
        }
        console.info('Using WebGL engine');
        return new BABYLON.Engine(canv, true, { preserveDrawingBuffer: true, stencil: true });
      };

      try {
        engine = await createEngine();

        try {
          canv.style.width = canv.style.width || '100%';
          canv.style.height = canv.style.height || '100vh';
        } catch (e) {}
        try { engine.resize(); } catch (e) {}

        const loadingScreen = new CustomLoadingScreen("Loading...");
        engine.loadingScreen = loadingScreen;
        try { engine.displayLoadingUI(); } catch {}

        ac = new AbortController();
        const { signal } = ac;

        window.addEventListener('resize', () => engine?.resize(), { signal });

        const resetCursorTimeout = () => {
          document.body.style.cursor = 'default';
          if (cursorTimeout) clearTimeout(cursorTimeout);
          cursorTimeout = window.setTimeout(() => {
            document.body.style.cursor = 'none';
          }, 6000);
        };
        window.addEventListener('mousemove', resetCursorTimeout, { signal });
        resetCursorTimeout();

        try {
          // A. CHANGED: Sync UI state when WormHole transitions internally
          const scene2 = await WormHoleScene2.CreateScene(engine, canv, () => {
            changeScene('scene1');
          });

          // B. CHANGED: Sync UI state when VideoScene finishes playback loops
          sceneManager = new SceneManager(
            engine,
            scene2,
            () => createOceanScene(engine, canv),
            () => mountVideoScene(undefined, undefined, () => changeScene('scene2'))
          );

          // C. CHANGED: Boot up into scene2 safely utilizing the sync function
          changeScene('scene2');

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setTimeout(() => { try { engine?.hideLoadingUI(); } catch {} }, 50);
            });
          });
        } catch (error) {
          console.error('Scene creation failed:', error);
          try { engine?.hideLoadingUI(); } catch {}
        }

        // D. CHANGED: Use sync utility for your debug keyboard listener keys
        window.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === '1') changeScene('scene1');
          else if (e.key === '2') changeScene('scene2');
          else if (e.key === '3') changeScene('scene3');
        }, { signal });

      } catch (err) {
        console.error('Engine initialization failed:', err);
      }
    })();

    return () => {
      ac?.abort();
      if (cursorTimeout) clearTimeout(cursorTimeout);
      document.body.style.cursor = 'default';
      sceneManager?.dispose();
      engine?.dispose();
    };
  });
</script>

<div class="view-wrapper">
  <canvas bind:this={canvas} class="babylon-canvas"></canvas>

  {#if activeScene === 'scene2'}
    <DroneHUD />
  {/if}

  
</div>

<style>
  .view-wrapper {
    position: relative; 
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
  .babylon-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>