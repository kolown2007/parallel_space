import * as BABYLON from '@babylonjs/core';
  
  
  export class WormHoleScene {

  static sphereProgress = 0.0; // current position on path (0.0 to 1.0)
  static sphereSpeed = 0.0002; // movement speed
  static pathPoints: BABYLON.Vector3[] = [];

    static CreateScene(engine: any, canvas: HTMLCanvasElement) {
      const scene = new BABYLON.Scene(engine);
      console.log('wormhole1 scene created');

      const camera = new BABYLON.ArcRotateCamera('camera1', Math.PI / 2, Math.PI / 4, 10, BABYLON.Vector3.Zero(), scene);
      camera.attachControl(canvas, true);



      const light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 0), scene);
      light.intensity = 0.8;


      const torus = BABYLON.MeshBuilder.CreateTorus('torus', { diameter: 90, thickness: 10,tessellation: 20}, scene);
      torus.position.y = 1;



    var torusMaterial = new BABYLON.StandardMaterial("materialTorus1", scene);
    torusMaterial.wireframe = false;
    torus.material = torusMaterial;



 // Get torus dimensions from bounding box
      const boundingInfo = torus.getBoundingInfo();
      const boundingBox = boundingInfo.boundingBox;
      const torusDiameter = boundingBox.maximumWorld.x - boundingBox.minimumWorld.x;
      const torusThickness = 5; // store thickness since it's hard to calculate from bounding box
      


   // Create the navigation path (your vector line)
   const points = [];
      const torusOuterRadius = torusDiameter / 2; // 15
      const torusTubeRadius = torusThickness / 2; //
      const torusMainRadius = torusOuterRadius - torusTubeRadius; // 12.5 (center of tube)
      const lineRadius = torusTubeRadius * 0.6; // CONTROL: how far from tube center (0.1-0.9)
      
      const turns = 1; // CONTROL: loops around main torus (1, 2, 3...)
      const spiralTurns = 2; // CONTROL: how many times it spirals inside tube (2, 4, 8...)
      const segments = 128; // CONTROL: smoothness (64=rough, 256=very smooth)
      
      for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const mainAngle = t * Math.PI * 2 * turns; // angle around main torus
          const tubeAngle = t * Math.PI * 2 * spiralTurns; // CONTROL: spiral frequency
          
          // Position on the main torus ring
          const mainX = Math.cos(mainAngle) * torusMainRadius;
          const mainZ = Math.sin(mainAngle) * torusMainRadius;
          const mainY = 1; // same as torus center
          
          // Offset within the tube
          const tubeX = Math.cos(tubeAngle) * lineRadius;
          const tubeY = Math.sin(tubeAngle) * lineRadius;
          
          // Combine main position + tube offset
          const x = mainX + Math.cos(mainAngle) * tubeX; // offset in radial direction
          const z = mainZ + Math.sin(mainAngle) * tubeX; // offset in radial direction  
          const y = mainY + tubeY; // offset vertically
          
          points.push(new BABYLON.Vector3(x, y, z));
      }

      // Store path points for navigation
    WormHoleScene.pathPoints = points;
      
      const vectorLine = BABYLON.MeshBuilder.CreateLines('vectorLine', { points: points }, scene);
      vectorLine.color = new BABYLON.Color3(0, 1, 1); // cyan line
    


  const sphere = BABYLON.MeshBuilder.CreateSphere('sphere', { diameter: 2, segments: 32 }, scene);


// Navigation system functions
    function getPositionOnPath(progress: number): BABYLON.Vector3 {
      const clampedProgress = Math.max(0, Math.min(1, progress));
      const index = clampedProgress * (WormHoleScene.pathPoints.length - 1);
      const lowerIndex = Math.floor(index);
      const upperIndex = Math.min(lowerIndex + 1, WormHoleScene.pathPoints.length - 1);
      const t = index - lowerIndex;
      
      const lower = WormHoleScene.pathPoints[lowerIndex];
      const upper = WormHoleScene.pathPoints[upperIndex];
      
      return BABYLON.Vector3.Lerp(lower, upper, t);
    }
    
    function getDirectionOnPath(progress: number): BABYLON.Vector3 {
      const epsilon = 0.01;
      const currentPos = getPositionOnPath(progress);
      const nextPos = getPositionOnPath(progress + epsilon);
      return nextPos.subtract(currentPos).normalize();
    }

    // Navigation update loop
    scene.registerBeforeRender(() => {
      // Auto-move sphere along path
      WormHoleScene.sphereProgress += WormHoleScene.sphereSpeed;
      if (WormHoleScene.sphereProgress > 1) {
        WormHoleScene.sphereProgress = 0; // loop back to start
      }
      
      // Update sphere position and rotation
      const newPosition = getPositionOnPath(WormHoleScene.sphereProgress);
      const direction = getDirectionOnPath(WormHoleScene.sphereProgress);
      
      sphere.position = newPosition;
      
      // Optional: Orient sphere to face movement direction
      if (direction.length() > 0) {
        sphere.lookAt(sphere.position.add(direction));
      }
    });

    

 // Navigation controls
    window.addEventListener('keydown', (event) => {
      if (event.key === 'q') {
        torusMaterial.wireframe = !torusMaterial.wireframe;
        console.log('Wireframe:', torusMaterial.wireframe);
      }
      else if (event.key === 'ArrowRight') {
        WormHoleScene.sphereProgress = Math.min(1.0, WormHoleScene.sphereProgress + 0.05);
        console.log('Sphere progress:', WormHoleScene.sphereProgress);
      }
      else if (event.key === 'ArrowLeft') {
        WormHoleScene.sphereProgress = Math.max(0.0, WormHoleScene.sphereProgress - 0.05);
        console.log('Sphere progress:', WormHoleScene.sphereProgress);
      }
      else if (event.key === ' ') {
        // Toggle auto-movement
        WormHoleScene.sphereSpeed = WormHoleScene.sphereSpeed > 0 ? 0 : 0.02;
        console.log('Auto-movement:', WormHoleScene.sphereSpeed > 0 ? 'ON' : 'OFF');
      }
    });
    

      return scene;
    }

    
  }