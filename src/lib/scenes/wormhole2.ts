import * as BABYLON from 'babylonjs';
import HavokPhysics from "@babylonjs/havok";

export class WormHoleScene2 {
  static sphereProgress = 0.0; // current position on path (0.0 to 1.0)
  static sphereSpeed = 0.0002; // movement speed
  static pathPoints: BABYLON.Vector3[] = [];

  private static async setupPhysics(scene: BABYLON.Scene) {
    // locates the wasm file copied during build process
    const havok = await HavokPhysics({
      locateFile: (file) => {
        return "/HavokPhysics.wasm"
      }
    });
    const gravityVector: BABYLON.Vector3 = new BABYLON.Vector3(0, -9.81, 0);
    const havokPlugin: BABYLON.HavokPlugin = new BABYLON.HavokPlugin(true, havok);
    scene.enablePhysics(gravityVector, havokPlugin);
  }

  static async CreateScene(engine: any, canvas: HTMLCanvasElement): Promise<BABYLON.Scene> {
    const scene = new BABYLON.Scene(engine);
      console.log('wormhole2 scene created');

    await WormHoleScene2.setupPhysics(scene);

    const camera = new BABYLON.ArcRotateCamera('camera1', Math.PI / 2, Math.PI / 4, 10, BABYLON.Vector3.Zero(), scene);
    camera.attachControl(canvas, true);

    const light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.8;

   const torus = BABYLON.MeshBuilder.CreateTorus('torus', { diameter: 90, thickness: 10, tessellation: 20 }, scene);


   //TORUS KNOT
    //const torus = BABYLON.MeshBuilder.CreateTorusKnot("tk", {radius: 90, tube: 10, radialSegments: 100, p:5, q:2});



    torus.position.y = 1;



    // Use PhysicsAggregate for torus (static body) - CHANGED TO MESH for accurate torus collision
    const torusAggregate = new BABYLON.PhysicsAggregate(torus, BABYLON.PhysicsShapeType.MESH, {
      mass: 0, // static (doesn't move)
      restitution: 0.8, // bounciness
      friction: 0.5
    }, scene);

    var torusMaterial = new BABYLON.StandardMaterial("materialTorus1", scene);
    torusMaterial.wireframe = false;
    torus.material = torusMaterial;

    // Calculate torus dimensions (same as original wormhole.ts)
    const boundingInfo = torus.getBoundingInfo();
    const boundingBox = boundingInfo.boundingBox;
    const torusDiameter = boundingBox.maximumWorld.x - boundingBox.minimumWorld.x;
    const torusThickness = 5; // store thickness since it's hard to calculate from bounding box
    
    const torusOuterRadius = torusDiameter / 2; // 45
    const torusTubeRadius = torusThickness / 2; // 2.5
    const torusMainRadius = torusOuterRadius - torusTubeRadius; // 42.5 (center of tube)

    // Create the navigation path (spiral inside the torus)
    const points: BABYLON.Vector3[] = [];
    const lineRadius = torusTubeRadius * 0.6; // how far from tube center (0.1-0.9)
    
    const turns = 3; // loops around main torus (1, 2, 3...)
    const spiralTurns = 5; // how many times it spirals inside tube (2, 4, 8...)
    const segments = 128; // smoothness (64=rough, 256=very smooth)
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const mainAngle = t * Math.PI * 2 * turns; // angle around main torus
      const tubeAngle = t * Math.PI * 2 * spiralTurns; // spiral frequency
      
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
    WormHoleScene2.pathPoints = points;
    
    const vectorLine = BABYLON.MeshBuilder.CreateLines('vectorLine', { points: points }, scene);
    vectorLine.color = new BABYLON.Color3(0, 1, 1); // cyan line

    const sphere = BABYLON.MeshBuilder.CreateSphere('sphere', { diameter: 2, segments: 32 }, scene);
    
    // Position sphere at the start of the path
    const initialPosition = points[0];
    sphere.position = initialPosition.clone();

    // Use PhysicsAggregate for sphere (dynamic body)
    const sphereAggregate = new BABYLON.PhysicsAggregate(sphere, BABYLON.PhysicsShapeType.SPHERE, {
      mass: 1, // dynamic (can move)
      restitution: 0.8, // bounciness
      friction: 0.3
    }, scene);

    // Navigation system functions
    function getPositionOnPath(progress: number): BABYLON.Vector3 {
      const clampedProgress = Math.max(0, Math.min(1, progress));
      const index = clampedProgress * (WormHoleScene2.pathPoints.length - 1);
      const lowerIndex = Math.floor(index);
      const upperIndex = Math.min(lowerIndex + 1, WormHoleScene2.pathPoints.length - 1);
      const t = index - lowerIndex;
      
      const lower = WormHoleScene2.pathPoints[lowerIndex];
      const upper = WormHoleScene2.pathPoints[upperIndex];
      
      return BABYLON.Vector3.Lerp(lower, upper, t);
    }
    
    function getDirectionOnPath(progress: number): BABYLON.Vector3 {
      const epsilon = 0.01;
      const currentPos = getPositionOnPath(progress);
      const nextPos = getPositionOnPath(progress + epsilon);
      return nextPos.subtract(currentPos).normalize();
    }

    // Navigation update loop with physics
    scene.registerBeforeRender(() => {
      // Get target position on path
      const targetPosition = getPositionOnPath(WormHoleScene2.sphereProgress);
      const currentPosition = sphere.position;
      
      // Calculate distance from path
      const distanceFromPath = BABYLON.Vector3.Distance(currentPosition, targetPosition);
      
      // Apply force towards target
      const direction = targetPosition.subtract(currentPosition).normalize();
      
      // Stronger force if far from path, gentler if close
      const forceStrength = distanceFromPath > 5 ? 100 : 20; // adjust as needed
      const force = direction.scale(forceStrength);
      
      sphereAggregate.body.applyForce(force, sphere.position);
      
      // Update progress
      WormHoleScene2.sphereProgress += WormHoleScene2.sphereSpeed;
      if (WormHoleScene2.sphereProgress > 1) {
        WormHoleScene2.sphereProgress = 0; // loop back to start
      }
    });

    // Controls
    window.addEventListener('keydown', (event) => {
      if (event.key === 'q') {
        torusMaterial.wireframe = !torusMaterial.wireframe;
        console.log('Wireframe:', torusMaterial.wireframe);
      }
      else if (event.key === 'r') {
        // Reset sphere position to path start
        sphere.position = points[0].clone();
        sphereAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
        sphereAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
        WormHoleScene2.sphereProgress = 0;
        console.log('Sphere reset');
      }
      else if (event.key === 'ArrowRight') {
        WormHoleScene2.sphereProgress = Math.min(1.0, WormHoleScene2.sphereProgress + 0.05);
        console.log('Sphere progress:', WormHoleScene2.sphereProgress);
      }
      else if (event.key === 'ArrowLeft') {
        WormHoleScene2.sphereProgress = Math.max(0.0, WormHoleScene2.sphereProgress - 0.05);
        console.log('Sphere progress:', WormHoleScene2.sphereProgress);
      }
      else if (event.key === ' ') {
        // Toggle auto-movement
        WormHoleScene2.sphereSpeed = WormHoleScene2.sphereSpeed > 0 ? 0 : 0.02;
        console.log('Auto-movement:', WormHoleScene2.sphereSpeed > 0 ? 'ON' : 'OFF');
      }
    });

    return scene;
  }
}