<script lang="ts">
  import { SceneManager } from '@kolown/scene-manager';
 
  import { WormholeScene } from '$lib/parallel2/mainScene';
  import {VideoScene} from '$lib/video/video1';
  import { DOMScene } from '$lib/dom/domScene';
  import { onMount } from 'svelte';

  // Scene Manager
  const sceneManager = new SceneManager();

  let canvas: HTMLCanvasElement;
  let domElement: HTMLElement;
  let videoElement: HTMLVideoElement;
  let isLoading = true;

 

  // Initialize scenes after DOM is ready
  
  let domScene: DOMScene;
  let videoscene: VideoScene;
  let wormholeScene: WormholeScene;

  onMount(() => {
    let handleKeydown: (event: KeyboardEvent) => void;
    let handleTouchStart: (e: TouchEvent) => void;
    let handleTouchEnd: (e: TouchEvent) => void;

    async function initializeScenes() {
      if (!canvas) return;

      try {
       
        wormholeScene = new WormholeScene('wormhole', canvas);
     
   
        await wormholeScene.initialize();
        domScene = new DOMScene('dom', domElement);
        videoscene = new VideoScene('video', videoElement);

     
        sceneManager.addScene(domScene);
        sceneManager.addScene(videoscene);
        sceneManager.addScene(wormholeScene);

        // Start with wormhole scene
        sceneManager.switchTo('wormhole');
        isLoading = false;

        // Function to manage element visibility
        const updateVisibility = (activeScene: string) => {
          // canvas now represents the wormhole scene
          if (canvas) canvas.style.display = (activeScene === 'wormhole') ? 'block' : 'none';
          if (domElement) domElement.style.display = (activeScene === 'dom') ? 'block' : 'none';
          if (videoElement) videoElement.style.display = (activeScene === 'video') ? 'block' : 'none';
        };

        // Set initial visibility to wormhole
        updateVisibility('wormhole');

        // keyboard controls for scene switching
        handleKeydown = (event: KeyboardEvent) => {
          if (event.key === '1') {
            // 1 -> wormhole (canvas)
            sceneManager.switchTo('wormhole');
            updateVisibility('wormhole');
            console.log('wormhole scene');
          } else if (event.key === '2') {
            sceneManager.switchTo('dom');
            updateVisibility('dom');
            console.log('dom scene');
          } else if (event.key === '3') {
            sceneManager.switchTo('video');
            updateVisibility('video');
            console.log('video scene');
          } else if (event.key === '4') {
            sceneManager.switchTo('wormhole');
            updateVisibility('wormhole');
            console.log('wormhole scene');
          }
        };

        // Native swipe up detection for random scene switching
  const sceneNames = ['dom', 'video', 'wormhole'];
        let startY = 0;

        handleTouchStart = (e: TouchEvent) => {
          startY = e.touches[0].clientY;
        };

        handleTouchEnd = (e: TouchEvent) => {
          const endY = e.changedTouches[0].clientY;
          if (startY - endY > 50) { // 50px threshold for swipe up
            // Pick a random scene
            const randomIndex = Math.floor(Math.random() * sceneNames.length);
            const randomScene = sceneNames[randomIndex];
            sceneManager.switchTo(randomScene);
            updateVisibility(randomScene);
            console.log(`Switched to random scene: ${randomScene}`);
          }
        };

        // Attach to document.body so it works on all scenes
        document.body.addEventListener('touchstart', handleTouchStart);
        document.body.addEventListener('touchend', handleTouchEnd);
        window.addEventListener('keydown', handleKeydown);

      } catch (error) {
        console.error('Scene initialization error:', error);
        isLoading = false;
      }
    }

    initializeScenes();

    // Cleanup function
    return () => {
      if (handleKeydown) window.removeEventListener('keydown', handleKeydown);
      if (handleTouchStart) document.body.removeEventListener('touchstart', handleTouchStart);
      if (handleTouchEnd) document.body.removeEventListener('touchend', handleTouchEnd);
    };
  });
</script>

<style>
    :global(html, body) {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
  }
  #sceneCanvas {
    height: 100vh;
    width: 100vw;
    display: block;
  }

  #domScene {
    display: none;
    background-color: chartreuse;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
  }

  #videoScene {
    display: none;
    width: 100%;
    height: 100%;
    background-color: black; /* Optional: Add a background color */
}

:global(.video-active) #videoScene {
    display: block; /* Make the video visible when active */
}
</style>
<canvas id="sceneCanvas" bind:this={canvas}></canvas>
<div id="domScene" bind:this={domElement}>
</div>
<div>
    <video id="videoScene" bind:this={videoElement} >
      <track kind="captions" label="English captions" src="" srclang="en" default>
    </video>
  </div>