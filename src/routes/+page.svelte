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
  import OceanGUI from '$lib/scenes/ocean.gui.svelte';
  import IntroScene from '$lib/scenes/IntroScene.svelte';
  import { missionRetry } from '$lib/stores/missionState';
  import { gameMode, type GameMode } from '$lib/stores/gameState';
  import { setCompletedStations, setTotalStations } from '$lib/stores/stationProgress';

  const SCENE_TO_MODE: Record<string, GameMode> = {
    loading: 'loading',
    intro:   'intro',
    scene2:  'wormhole',
    scene3:  'ocean',
    scene1:  'video'
  };
  let canvas: HTMLCanvasElement | null = null;

  async function fetchCompletedStations() {
    try {
      const response = await fetch('https://kolown.net/api/chrono-escapes/1/revolution');
      if (!response.ok) {
        console.warn('Failed to fetch completed stations:', response.status);
        return;
      }
      const data = await response.json();
      const value = typeof data.revolution === 'number' ? data.revolution : 0;
      setCompletedStations(value);
    } catch (error) {
      console.warn('Failed to fetch completed stations:', error);
    }
  }
  let engine: any = null;
  let sceneManager: SceneManager | null = null;
  let cursorTimeout: number | null = null;
  let ac: AbortController | null = null;
  let loadingScreen: CustomLoadingScreen | null = null;

  // Track the active scene reactively via Svelte runes
  type AppScene = 'loading' | 'intro' | 'scene2' | 'scene1' | 'scene3';
  let activeScene: AppScene = $state('loading');
  const isGameplayActive = () => activeScene === 'scene2';

  // =========================================================================
  // MASTER SYNC FUNCTION: Updates both Babylon AND Svelte UI at the same time
  // =========================================================================
  const changeScene = (sceneName: AppScene) => {
    if (sceneManager && sceneName !== 'loading' && sceneName !== 'intro') {
      try { sceneManager.switchTo(sceneName as any); } catch (e) { console.warn('+page: sceneManager.switchTo threw', e); }
    }
    if (sceneManager && sceneName === 'intro') {
      try { sceneManager.pause(); } catch (e) { console.warn('+page: sceneManager.pause threw', e); }
    }
    activeScene = sceneName;
    gameMode.set(SCENE_TO_MODE[sceneName] ?? 'loading');
  };

  let scene3Result: 'success' | 'failure' = $state('failure');

  const startWormhole = () => { missionRetry.set(false); scene3Result = 'success'; changeScene('scene2'); };
  const retryMission  = () => { missionRetry.set(true);  scene3Result = 'success'; changeScene('scene2'); };
  const backToIntro = () => { missionRetry.set(false); changeScene('intro'); };

  const handleMissionFailed = () => { scene3Result = 'failure'; changeScene('scene3'); };
  const handleMissionSuccess = () => { scene3Result = 'success'; changeScene('scene3'); };

  const updateCompletedStations = (count: number) => {
    setCompletedStations(count);
  };

  const updateTotalStations = (count: number) => {
    setTotalStations(count);
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
        await fetchCompletedStations();
        engine = await createEngine();

        try {
          canv.style.width = canv.style.width || '100%';
          canv.style.height = canv.style.height || '100vh';
        } catch (e) {}
        try { engine.resize(); } catch (e) {}

        loadingScreen = new CustomLoadingScreen("Loading...");
        engine.loadingScreen = loadingScreen;
        try { loadingScreen.displayLoadingUI(); } catch {}

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
          const createScene2 = async () => WormHoleScene2.CreateScene(engine, canv, () => {
            changeScene('scene1');
          }, retryMission);
          const scene2 = await createScene2();

          // B. CHANGED: Sync UI state when VideoScene finishes playback loops
          sceneManager = new SceneManager(
            engine,
            scene2,
            createScene2,
            () => createOceanScene(engine, canv),
            () => mountVideoScene(undefined, undefined, () => changeScene('scene2'))
          );

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setTimeout(() => { try { engine?.hideLoadingUI(); } catch {} }, 50);
            });
          });
        } catch (error) {
          console.error('Scene creation failed:', error);
          try { engine?.hideLoadingUI(); } catch {}
        }

        if (loadingScreen) {
          loadingScreen.hideLoadingUI();
          await loadingScreen.hidden;
        }

        missionRetry.set(false);
        activeScene = 'intro';

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
  <canvas
    bind:this={canvas}
    class="babylon-canvas"
    style="pointer-events: {isGameplayActive() ? 'auto' : 'none'}"
  ></canvas>

  {#if activeScene === 'intro'}
    <IntroScene initialCountdown={60} onStart={startWormhole} />
  {/if}

  {#if activeScene === 'scene3'}
    <OceanGUI result={scene3Result} onNewMission={backToIntro} />
  {/if}

  {#if isGameplayActive()}
    <DroneHUD missionFailed={handleMissionFailed} missionSuccess={handleMissionSuccess} />
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
    pointer-events: none;
  }
</style>