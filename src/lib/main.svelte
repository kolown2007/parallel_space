<script lang="ts">
import { BabylonEngine } from './parallel/engine';
import { SceneCamera } from './parallel/camera';
import { World } from './parallel/world';
import { SceneLighting } from './parallel/lights';
import { onDestroy } from 'svelte';
import { Scene, Vector3, PhysicsShapeType } from '@babylonjs/core';
import { AssetManager, AssetType } from './parallel/assets';
import { BallShooter } from './parallel/shooter';

import { Inspector } from '@babylonjs/inspector';


let canvas: HTMLCanvasElement;
let babylonEngine: BabylonEngine;
let sceneCamera: SceneCamera;
let scene: Scene;
let world: World;
let assetManager: AssetManager;
let lighting: SceneLighting;
let isLoading = true;
let ballShooter: BallShooter;



async function initializeEngine() {
    if (!canvas) return;
    
    try {
        // Initialize engine and wait for ready
        babylonEngine = new BabylonEngine(canvas);
        await babylonEngine.initialize();


        scene = babylonEngine.getScene();

        
        // Initialize camera
        sceneCamera = new SceneCamera(scene, canvas);

        // Initialize world and verify
        world = new World(scene);
        await world.initialize();

        // Get the shadow generator after world initialization
        const shadowGen = world.getShadowGenerator();

        // Initialize asset manager
        assetManager = new AssetManager(scene);
        await assetManager.initialize();

        // Initialize ball shooter with shadow generator
        lighting = new SceneLighting(scene);
        ballShooter = new BallShooter(scene, sceneCamera.getCamera(), lighting);
        
  

        // Add event listener for inspector toggle
        window.addEventListener('keydown', (ev) => {
            if (ev.key === 'i') {
            if (scene.debugLayer.isVisible()) {
                scene.debugLayer.hide();
            } else {
                scene.debugLayer.show();
            }
            }
        });

         
        // // Create multiple Jollibee instances at random positions
        for (let i = 0; i < 100; i++) {
            const randomX = Math.random() * 20 - 10; // Range: -10 to 10
            const randomY = Math.random() * 10 + 5;  // Range: 5 to 15
            const randomZ = Math.random() * 20 - 10; // Range: -10 to 10
            
            const jollibee = assetManager.createAsset({
                type: AssetType.JOLLIBEE,
                position: new Vector3(randomX, randomY, randomZ),
                scale: new Vector3(5, 5, 5),
                physics: {
                    shape: PhysicsShapeType.CONVEX_HULL,  // Changed to CONVEX_HULL
                    mass: 5,  // Changed to 0 to make it static
                    restitution: 0.4,  // Adjusted for better bounce
                    friction: 0.8  // Increased friction
                }
            });

            // Add created jollibee to shadow generator
            if (jollibee) {
                world.addShadowCaster(jollibee);
            }
        }





        // Create multiple Jollibee instances at random positions

        for (let i = 0; i < 20; i++) {
            const randomX = Math.random() * 20 - 10; // Range: -10 to 10
            const randomY = Math.random() * 10 + 5;  // Range: 5 to 15
            const randomZ = Math.random() * 20 - 30; // Range: -10 to 10
       
            const jollibee = assetManager.createAsset({
                type: AssetType.JOLLIBEE,
                position: new Vector3(70, randomX, randomZ),
                scale: new Vector3(50, 50, 50),
                physics: {
                    shape: PhysicsShapeType.CONVEX_HULL,  // Changed to CONVEX_HULL
                    mass: 30, //Changed to 0 to make it static
                    restitution: 0.4,  // Adjusted for better bounce
                    friction: 0.8  // Increased friction
                }
            });

            // Add created jollibee to shadow generator
            if (jollibee) {
                world.addShadowCaster(jollibee);
            }
        
        }


        
       
        
       
        // Start render loop only after world is ready
        scene.executeWhenReady(() => {
            babylonEngine.startRenderLoop();
            isLoading = false;
            console.log("World initialized:", world.getGround() !== undefined);
        });
        
    } catch (error) {
        console.error("Initialization error:", error);
        isLoading = false;
    }
}

// Initialize when canvas is ready
$: if (canvas) {
    initializeEngine();
}

onDestroy(() => {
    lighting?.dispose();
    world?.dispose();
    sceneCamera?.dispose();
    babylonEngine?.dispose();
    ballShooter?.dispose();
});
</script>

{#if isLoading}
<div class="loading">Loading...</div>
{/if}

<canvas bind:this={canvas} class:loading={isLoading}></canvas>

<style>
    canvas {
        width: 100%;
        height: 100%;
        display: block;
        margin: 0;
        padding: 0;
        overflow: hidden;
    }

    .loading {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-size: 1.2em;
    }

    canvas.loading {
        opacity: 0;
    }
</style>