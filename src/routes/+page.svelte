<script lang="ts">
  import { onMount } from 'svelte';
  import { initGameRuntime, type GameRuntime, type RendererOverride } from '$lib/app/runtime';

  import DroneHUD from '$lib/scenes/wormhole2/wormhole2.gui.svelte';
  import OceanGUI from '$lib/scenes/ocean.gui.svelte';
  import IntroScene from '$lib/scenes/IntroScene.svelte';
  import { missionRetry } from '$lib/stores/missionState';
  import { gameMode, type GameMode } from '$lib/stores/gameState';
  import { resetDrone } from '$lib/stores/droneControl.svelte';
  import { setCompletedStations, setTotalStations } from '$lib/stores/stationProgress';

  const SCENE_TO_MODE: Record<string, GameMode> = {
    loading: 'loading',
    intro:   'intro',
    scene2:  'wormhole',
    scene3:  'ocean',
    scene1:  'video'
  };
  let canvas: HTMLCanvasElement | null = null;
  let engine: any = null;
  let sceneManager: any = null;
  let runtime: GameRuntime | null = null;
  let keydownCleanup: (() => void) | null = null;

  // Track the active scene reactively via Svelte runes
  type AppScene = 'loading' | 'intro' | 'scene2' | 'scene1' | 'scene3';
  let activeScene: AppScene = $state('loading');
  let gameplaySessionActive = $state(false);
  const isGameplayActive = () => activeScene === 'scene2';

  // =========================================================================
  // MASTER SYNC FUNCTION: Updates both Babylon AND Svelte UI at the same time
  // =========================================================================
  const changeScene = (sceneName: AppScene) => {
    if (sceneName === 'scene3' && (activeScene !== 'scene2' || !gameplaySessionActive)) {
      console.warn('+page: ignored stale ocean transition from', activeScene, 'sessionActive=', gameplaySessionActive);
      return;
    }

    if (sceneName === 'scene2') {
      gameplaySessionActive = true;
    }

    if (sceneName === 'intro') {
      gameplaySessionActive = false;
    }

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

  const startWormhole = () => {
    resetDrone();
    missionRetry.set(false);
    scene3Result = 'success';
    gameplaySessionActive = true;
    changeScene('scene2');
  };

  const retryMission = () => {
    resetDrone();
    missionRetry.set(true);
    scene3Result = 'success';
    gameplaySessionActive = true;
    changeScene('scene2');
  };

  const backToIntro = () => {
    resetDrone();
    missionRetry.set(false);
    gameplaySessionActive = false;
    changeScene('intro');
  };

  const handleMissionFailed = () => {
    if (activeScene !== 'scene2' || !gameplaySessionActive) {
      console.warn('+page: ignored failed mission while not in active wormhole scene');
      return;
    }
    scene3Result = 'failure';
    changeScene('scene3');
  };

  const handleMissionSuccess = () => {
    if (activeScene !== 'scene2' || !gameplaySessionActive) {
      console.warn('+page: ignored successful mission while not in active wormhole scene');
      return;
    }
    scene3Result = 'success';
    changeScene('scene3');
  };

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
      const rendererOverride = new URLSearchParams(window.location.search).get('renderer')?.toLowerCase() as RendererOverride;

      try {
        runtime = await initGameRuntime(canv, {
          rendererOverride,
          onPortalTrigger: () => changeScene('scene1'),
          onMissionSuccess: handleMissionSuccess,
          onReturnToScene2: () => changeScene('scene2')
        });

        engine = runtime.engine;
        sceneManager = runtime.sceneManager;

        if (runtime.loadingScreen) {
          runtime.loadingScreen.hideLoadingUI();
          await runtime.loadingScreen.hidden;
        }

        missionRetry.set(false);
        changeScene('intro');

        const handleDebugKeys = (e: KeyboardEvent) => {
          if (!import.meta.env.DEV) return;
          if (e.key === '1') changeScene('scene1');
          else if (e.key === '2') changeScene('scene2');
          else if (e.key === '3') changeScene('scene3');
        };

        window.addEventListener('keydown', handleDebugKeys);
        keydownCleanup = () => window.removeEventListener('keydown', handleDebugKeys);

      } catch (err) {
        console.error('Engine initialization failed:', err);
      }
    })();

    return () => {
      keydownCleanup?.();
      document.body.style.cursor = 'default';
      runtime?.dispose();
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