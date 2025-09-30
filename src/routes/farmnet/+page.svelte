<script lang="ts">
import * as BABYLON from '@babylonjs/core';
import { GradientMaterial } from '@babylonjs/materials/gradient';
import '@babylonjs/loaders/glTF';
import HavokPhysics from '@babylonjs/havok';
import { onMount } from 'svelte';
import * as Ably from 'ably';
import { ORBIT } from '$lib/farmnet/config';
import type { FloatingBall } from '$lib/farmnet/config';
import { updateOrbits } from '$lib/farmnet/orbit';

onMount(() => {
  // 1. Ably orientation ingestion
  const apiKey = 'Yb71sw.QZOH2w:zr9J3Yub0IxlwZMzRa2TEoaBigpKXqDjHHxQjMrbN9E'; // TODO: move to env
  const ably = new Ably.Realtime({ key: apiKey });
  const channel = ably.channels.get('channel1');
  const targetRotation = new BABYLON.Vector3();
  const DEBUG_ABLY = true; // set false to silence logs
  channel.subscribe(msg => {
    let data: any = msg.data;
    if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
      data = new TextDecoder().decode(bytes);
    }
    try { if (typeof data === 'string') data = JSON.parse(data); } catch {}
    const toRad = (d:number)=> d * Math.PI / 180;
    if (data && typeof data === 'object') {
      const pitch = data.pitch ?? data.p ?? data.ax;
      const roll  = data.roll  ?? data.r ?? data.ay;
      const yaw   = data.yaw   ?? data.y ?? data.az;
      if (typeof pitch === 'number') targetRotation.x = toRad(pitch);
      if (typeof yaw   === 'number') targetRotation.y = toRad(-yaw);
      if (typeof roll  === 'number') targetRotation.z = toRad(-roll);
     
    }
  });

  // 2. Canvas & engine
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement | null;
  if (!canvas) return () => {};
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene  = new BABYLON.Scene(engine);

  // 3. Scene-level refs
  let hoeAggregate: BABYLON.PhysicsAggregate | null = null;
  let floatingBalls: FloatingBall[] = [];
  // track falling cubes we spawn so we can clean them up
  let fallingCubes: Array<{ mesh: BABYLON.Mesh; agg?: BABYLON.PhysicsAggregate | null }> = [];
  let dropInterval: number | null = null;
  let stickMesh: BABYLON.Mesh | null = null;

  // 4. Rotation application - custom physics shape approach (Babylon forum solution)
  const applyHoeRotation = (rot: BABYLON.Vector3) => {
    if (!stickMesh) return;
    stickMesh.rotation = rot;
    
    // Create a custom physics shape that follows the mesh transform
    if (hoeAggregate && scene) {
      try {
        // Dispose old physics aggregate
        hoeAggregate.dispose();
        
        // Create a custom box shape that will follow the mesh transform
        const getBoxShape = (mesh: BABYLON.AbstractMesh) => {
          const scaling = mesh.scaling;
          const size = new BABYLON.Vector3(0.18 * scaling.x, 2 * scaling.y, 0.18 * scaling.z);
          const center = new BABYLON.Vector3(0, size.y / 2, 0);
          return new (BABYLON as any).PhysicsShapeBox(center, size, mesh.getScene());
        };
        
        // Create new aggregate with custom shape
        const customShape = getBoxShape(stickMesh);
        hoeAggregate = new BABYLON.PhysicsAggregate(stickMesh, customShape, { 
          mass: 0, 
          restitution: 0.5, 
          friction: 0.6 
        }, scene);
      } catch (e) {
        console.warn('Failed to recreate physics aggregate with custom shape:', e);
        // Fallback to standard approach
        try {
          hoeAggregate = new BABYLON.PhysicsAggregate(stickMesh, BABYLON.PhysicsShapeType.BOX, { 
            mass: 0, 
            restitution: 0.5, 
            friction: 0.6 
          }, scene);
        } catch (fallbackError) {
          console.warn('Fallback physics aggregate creation failed:', fallbackError);
        }
      }
    }
  };

  // 5. Camera & lights
  const camera = new BABYLON.ArcRotateCamera('cam', 0, 1.2, 9, new BABYLON.Vector3(0,0.6,0), scene);
  camera.attachControl(canvas, true);

  // Set default camera view to match the supplied reference image.
  // Tweak these numbers if you want a slightly different angle/zoom.
  const setDefaultCameraView = () => {
    try {
      // World-space position for the camera (x, y, z)
      const camPos = new BABYLON.Vector3(0, 1.2, 9.0);
      // Where the camera should look at (the scene center / slightly above ground)
      const camTarget = new BABYLON.Vector3(0, 0.6, 0);
      camera.setTarget(camTarget);
      camera.setPosition(camPos);
      // Recompute spherical parameters alpha/beta/radius from position/target
      camera.alpha = camera.alpha; camera.beta = camera.beta; camera.radius = camera.radius;
    } catch (e) { console.warn('setDefaultCameraView failed', e); }
  };
  // Apply it once at startup
  setDefaultCameraView();
  new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0,1,0), scene).intensity = 0.9;
  const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.5,-1,-0.3), scene);
  sun.position = new BABYLON.Vector3(10,20,-10); sun.intensity = 0.1;
  const shadowGen = new BABYLON.ShadowGenerator(1024, sun); shadowGen.useBlurExponentialShadowMap = true; shadowGen.bias = 0.0005;

  // 6. Ground
  const ground = BABYLON.MeshBuilder.CreateGround('ground',{ width:50, height:50, subdivisions:2 }, scene);
  const gMat = new BABYLON.StandardMaterial('gmat', scene);
  gMat.diffuseColor = new BABYLON.Color3(0.07, 0.6, 0.1);
  gMat.specularColor = new BABYLON.Color3(0.1,0.1,0.1);
  ground.material = gMat; (ground as any).receiveShadows = true; ground.position.y = -3;
  // Set scene background color back to light blue
  scene.clearColor = new BABYLON.Color4(0.94,0.97,1.0,1);

  // 7. Sky - vertical plane backdrop with gradient
  try {
    const gradientMaterial = new GradientMaterial('grad', scene);
    gradientMaterial.topColor = new BABYLON.Color3(0.6, 0.9, 0.98);     // light blue top
    gradientMaterial.bottomColor = new BABYLON.Color3(0.5, 0.75, 0.95); // darker blue bottom
    gradientMaterial.offset = 0.9;
    gradientMaterial.scale = 0.5;
    gradientMaterial.backFaceCulling = false; // visible from both sides
    
    // Create vertical plane (standing up) for backdrop
    const skyPlane = BABYLON.MeshBuilder.CreatePlane('skyPlane', { 
      width: 90, 
      height: 20, 
      sideOrientation: BABYLON.Mesh.DOUBLESIDE 
    }, scene);
    
    // Position plane as backdrop (far behind the action)
    skyPlane.position.set(0, 0, -15); // x=0, y=7 (center vertically), z=-15 (behind)
    skyPlane.material = gradientMaterial;
    skyPlane.isPickable = false; // don't interfere with interactions
    // Add linear fog anchored at world Z = -14
    try {
      const fogPlaneZ = -14;
      scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
      scene.fogColor = gradientMaterial.topColor.clone();
      // fogIntensity 0..1 (0 = very faint, 1 = full strength)
      const fogIntensity = 0.35; // lower value reduces perceived fog density
      // compute camera distance to the fog plane and set a range scaled by intensity
      const camToPlane = Math.abs((camera.position.z) - fogPlaneZ);
      const baseStart = Math.max(1, camToPlane - 4);
      const baseEnd = Math.max(baseStart + 2, camToPlane + 6);
      // interpolate between no fog (start=end large) and base range
      scene.fogStart = baseStart + (1 - fogIntensity) * 8; // push start further when intensity low
      scene.fogEnd = baseEnd + (1 - fogIntensity) * 12;   // push end further too
    } catch (e) { console.warn('fog setup failed', e); }
  } catch (e) {
    console.warn('Gradient sky plane setup failed', e);
  }


    // 9. Physics + hoe + falling cubes (spawner)
    (async () => {
      try {
        const havok = await HavokPhysics({ locateFile: () => '/HavokPhysics.wasm' });
        const plugin = new (BABYLON as any).HavokPlugin(true, havok);
  const gravity = new BABYLON.Vector3(0, -9.81, 0);
  scene.enablePhysics(gravity, plugin);
  if (gravity.y === 0) console.warn('Physics gravity is zero — objects will float');
        new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass:0, restitution:0.9, friction:0.8 }, scene);
      } catch(e) { console.warn('Physics init failed', e); }

      // Instead of loading the hoe GLB, create a simple rectangular stick mesh
      // This is useful when the GLB has been removed/undone — the stick will behave similarly
      let hoe: BABYLON.Mesh | null = null;
      try {
        const stickWidth = 0.18;
        const stickDepth = 0.18;
        const stickHeight = 2; // total height of the stick
        const stick = BABYLON.MeshBuilder.CreateBox('hoe_stick', { width: stickWidth, height: stickHeight, depth: stickDepth }, scene);
        // place base at y=0 (so minimum.y == 0) similar to how the GLB was aligned
        stick.position.set(0, 0, 0);
        stick.computeWorldMatrix(true);
        // give it a PBR material with emissive color so the stick 'glows'
        const pbr = new BABYLON.PBRMaterial('hoePBR', scene);
        pbr.metallic = 0;
        pbr.roughness = 0.25;
        pbr.emissiveColor = new BABYLON.Color3(0.06, 0.9, 0.06); // bright green-ish emissive
        stick.material = pbr;
        try { shadowGen.addShadowCaster(stick); } catch {}

        // Add a point light parented to the stick so it emits light and follows its transforms
        try {
          const stickLight = new BABYLON.PointLight('stickLight', new BABYLON.Vector3(0, stickHeight * 0.6, 0), scene);
          stickLight.parent = stick;
          stickLight.diffuse = new BABYLON.Color3(0.2, 1.0, 0.2);
          stickLight.intensity = 1.6;
          stickLight.range = 10;
        } catch (e) { console.warn('stick light creation failed', e); }

        // Create a GlowLayer once on the scene to make emissive areas bloom
        try {
          if (!(scene as any).__glowLayer) {
            const glow = new (BABYLON as any).GlowLayer('glow', scene);
            glow.intensity = 0.6;
            (scene as any).__glowLayer = glow;
          }
        } catch (e) { console.warn('create glow failed', e); }

        // Make the stick static in the physics world using BOX (more stable than MESH)
        try { hoeAggregate = new BABYLON.PhysicsAggregate(stick, BABYLON.PhysicsShapeType.BOX, { mass:0, restitution:0.5, friction:0.6 }, scene); } catch(e){ console.warn('hoe physics failed', e); }
        hoe = stick;
      } catch(e) { console.warn('Create stick failed', e); }

      // Spawn a metallic cube above the hoe's XY every 5 seconds so it drops onto the hoe
      const spawnMetalCube = () => {
        try {
       

       
          const x = 0; const z = 0; const y = 5;

          const cube = BABYLON.MeshBuilder.CreateBox('metalCube_'+Date.now(), { size: 1.0 }, scene);
          cube.position.set(x, y, z);
          const pbr = new BABYLON.PBRMaterial('metalCubeMat', scene);
          pbr.metallic = 0.0; pbr.roughness = 0.15; pbr.albedoColor = new BABYLON.Color3(0.06,0.25,0.06);
          cube.material = pbr;
          try { shadowGen.addShadowCaster(cube); } catch {}

          let agg: BABYLON.PhysicsAggregate | undefined;
          try { agg = new BABYLON.PhysicsAggregate(cube, BABYLON.PhysicsShapeType.BOX, { mass: 0.5, restitution: 0.5, friction: 0.2 }, scene); } catch (e) { console.warn('Cube physics create failed', e); }

          fallingCubes.push({ mesh: cube, agg: agg ?? null });
        } catch (err) { console.warn('spawnMetalCube error', err); }
      };

      try { dropInterval = window.setInterval(spawnMetalCube, 1000); } catch (e) { console.warn('setInterval failed', e); }
      spawnMetalCube();
      stickMesh = hoe;
    })();

  // 10. Render loop
  // Set to 1 for immediate response (no smoothing). Lower values smooth the motion.
  const lerpFactor = 1.0;
  let __frameCount = 0;
  engine.runRenderLoop(()=>{
    __frameCount++;
    if (stickMesh) {
      const newRot = BABYLON.Vector3.Lerp(stickMesh.rotation, targetRotation, lerpFactor);
      applyHoeRotation(newRot);
    }
    // debug: once per ~60 frames, print simple status so we can see if targetRotation is updated
    if (__frameCount % 60 === 0) {
      try {
        console.log('[render status]', {
          haveMesh: !!stickMesh,
          meshRotation: stickMesh ? { x: stickMesh.rotation.x.toFixed(3), y: stickMesh.rotation.y.toFixed(3), z: stickMesh.rotation.z.toFixed(3) } : null,
          targetRotation: { x: targetRotation.x.toFixed(3), y: targetRotation.y.toFixed(3), z: targetRotation.z.toFixed(3) }
        });
      } catch {}
    }
    updateOrbits(floatingBalls, stickMesh);
    scene.render();
  });

  // 11. Resize & cleanup
  const resize = () => engine.resize();
  window.addEventListener('resize', resize); window.addEventListener('orientationchange', resize);
  return () => {
    try { channel.unsubscribe(); ably.close(); } catch {}
    try { engine.stopRenderLoop(); engine.dispose(); } catch {}
    // clear drop interval and dispose any spawned cubes
    try {
      if (dropInterval !== null) { window.clearInterval(dropInterval); dropInterval = null; }
    } catch (e) { console.warn('clearInterval failed', e); }
    try {
      for (const item of fallingCubes) {
        try { if (item.agg && (item.agg as any).dispose) (item.agg as any).dispose(); } catch {}
        try { item.mesh.dispose(); } catch {}
      }
      fallingCubes = [];
    } catch (e) { console.warn('dispose falling cubes failed', e); }
    window.removeEventListener('resize', resize); window.removeEventListener('orientationchange', resize);
  };
});
</script>

<canvas id="renderCanvas"></canvas>
<style>
  #renderCanvas { 
    width: 100%; 
    height: 100vh; 
    display: block; 
    touch-action: none;
  }
  :global(html, body){ margin:0; padding:0; }
</style>

