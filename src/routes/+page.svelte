<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as BABYLON from 'babylonjs';
  import { CustomLoadingScreen } from '$lib/customLoadingScreen';
  import { WormHoleScene } from '$lib/scenes/wormhole';
  import { WormHoleScene2 } from '$lib/scenes/wormhole2';

  let canvas: HTMLCanvasElement | null = null;
  let engine: any = null;
  let scene1: any = null;
  let scene2: any = null;


  let sceneMode = $state('scene1');

  onMount(() => {
    if (!canvas) return;

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

    // set up and show custom loading screen before creating the scene
    const loadingScreen = new CustomLoadingScreen("I'm loading!!");
    engine.loadingScreen = loadingScreen;
    engine.displayLoadingUI();

    
    // create scene
    scene1 = WormHoleScene.CreateScene(engine, canvas);
    scene2 = WormHoleScene2.CreateScene(engine, canvas);

    // hide loading UI after a short delay so the spinner is visible
    setTimeout(() => engine.hideLoadingUI(), 600);

    // render only the active scene
    engine.runRenderLoop(() => {
      if (sceneMode === 'scene1') {
        if (scene1 && typeof scene1.render === 'function') scene1.render();
      } else {
        if (scene2 && typeof scene2.render === 'function') scene2.render();
      }
    });

    const handleResize = () => engine && engine.resize();
    window.addEventListener('resize', handleResize);

    return () => {
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