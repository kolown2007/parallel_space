import * as BABYLON from '@babylonjs/core';
import { CustomLoadingScreen } from '$lib/scenes/customLoadingScreen';
import mountVideoScene from '$lib/scenes/videoscene';
import { WormHoleScene2 } from '$lib/scenes/wormhole2';
import createOceanScene from '$lib/scenes/ocean';
import { SceneManager } from '$lib/scenemanager/SceneManager';
import { setCompletedStations } from '$lib/stores/stationProgress';

export type RendererOverride = 'webgpu' | 'webgl' | undefined;

export interface RuntimeOptions {
  rendererOverride?: RendererOverride;
  onPortalTrigger: () => void;
  onMissionSuccess: () => void;
  onReturnToScene2: () => void;
}

export interface GameRuntime {
  engine: BABYLON.Engine;
  sceneManager: SceneManager;
  loadingScreen: CustomLoadingScreen;
  dispose: () => void;
}

export async function createBabylonEngine(canvas: HTMLCanvasElement, rendererOverride?: RendererOverride): Promise<BABYLON.Engine> {
  if (rendererOverride === 'webgpu') {
    try {
      const RuntimeWebGPUEngine = (BABYLON as any).WebGPUEngine as any;
      if ((navigator as any).gpu && RuntimeWebGPUEngine) {
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (adapter) {
          const engine = new RuntimeWebGPUEngine(canvas, {
            preserveDrawingBuffer: true,
            stencil: true,
            enableGPUDebugMarkers: false,
            antialias: false
          });
          if (engine.initAsync) {
            await engine.initAsync();
          }
          console.info('Using WebGPU engine (forced via ?renderer=webgpu)');
          return engine;
        }
        console.warn('navigator.gpu.requestAdapter() returned null - falling back to WebGL');
      }
    } catch (e) {
      console.warn('WebGPU engine initialization failed, falling back to WebGL', e);
    }
  }

  console.info('Using WebGL engine');
  return new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
}

export function attachRuntimeEvents(engine: BABYLON.Engine, canvas: HTMLCanvasElement): () => void {
  const abortController = new AbortController();
  const { signal } = abortController;

  const resetCursorTimeout = () => {
    document.body.style.cursor = 'default';
    window.clearTimeout((resetCursorTimeout as any)._timeoutId);
    (resetCursorTimeout as any)._timeoutId = window.setTimeout(() => {
      document.body.style.cursor = 'none';
    }, 6000);
  };

  window.addEventListener('resize', () => engine?.resize(), { signal });
  window.addEventListener('mousemove', resetCursorTimeout, { signal });
  resetCursorTimeout();

  return () => {
    abortController.abort();
    window.clearTimeout((resetCursorTimeout as any)._timeoutId);
    document.body.style.cursor = 'default';
  };
}

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

export function createSceneManager(
  engine: BABYLON.Engine,
  canvas: HTMLCanvasElement,
  onPortalTrigger: () => void,
  onMissionSuccess: () => void,
  onReturnToScene2: () => void
): SceneManager {
  const createScene2 = async () => WormHoleScene2.CreateScene(engine, canvas, onPortalTrigger, onMissionSuccess);

  return new SceneManager(
    engine,
    createScene2,
    () => createOceanScene(engine, canvas),
    () => mountVideoScene(undefined, undefined, onReturnToScene2)
  );
}

export async function initGameRuntime(canvas: HTMLCanvasElement, options: RuntimeOptions): Promise<GameRuntime> {
  await fetchCompletedStations();
  const engine = await createBabylonEngine(canvas, options.rendererOverride);

  try {
    canvas.style.width = canvas.style.width || '100%';
    canvas.style.height = canvas.style.height || '100vh';
  } catch {
    // ignore styling failures
  }

  engine.resize();

  const loadingScreen = new CustomLoadingScreen('Loading...');
  engine.loadingScreen = loadingScreen;
  try { loadingScreen.displayLoadingUI(); } catch {}

  const sceneManager = createSceneManager(
    engine,
    canvas,
    options.onPortalTrigger,
    options.onMissionSuccess,
    options.onReturnToScene2
  );
  const detachEvents = attachRuntimeEvents(engine, canvas);

  return {
    engine,
    sceneManager,
    loadingScreen,
    dispose: () => {
      try { detachEvents(); } catch {
        /* ignore */
      }
      try { sceneManager.dispose(); } catch {
        /* ignore */
      }
      try { engine.dispose(); } catch {
        /* ignore */
      }
    }
  };
}
