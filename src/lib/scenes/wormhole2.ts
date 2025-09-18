import * as BABYLON from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';
 import { createFloatingCubes } from './floatingCubes';
import '@babylonjs/loaders/glTF';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';




const modelUrl = "https://kolown.net/assets/p1sonet/jollibee.glb";


export class WormHoleScene2 {
	static sphereProgress = 0.0; // current position on path (0.0 to 1.0)
	static sphereSpeed = 0.0001; // movement speed
	static pathPoints: BABYLON.Vector3[] = [];

	private static async setupPhysics(scene: BABYLON.Scene) {
		// locates the wasm file copied during build processq
		const havok = await HavokPhysics({
			locateFile: (file) => {
				return '/HavokPhysics.wasm';
			}
		});
		const gravityVector: BABYLON.Vector3 = new BABYLON.Vector3(0, 0, 0);
		const havokPlugin: BABYLON.HavokPlugin = new BABYLON.HavokPlugin(true, havok);
		scene.enablePhysics(gravityVector, havokPlugin);
	}

	static async CreateScene(engine: any, canvas: HTMLCanvasElement): Promise<BABYLON.Scene> {
		const scene = new BABYLON.Scene(engine);
		console.log('wormhole2 scene created');

		await WormHoleScene2.setupPhysics(scene);

		//camera 1
		const arcCamera = new BABYLON.ArcRotateCamera(
			'camera1',
			Math.PI / 2,
			Math.PI / 4,
			10,
			BABYLON.Vector3.Zero(),
			scene
		);
		arcCamera.attachControl(canvas, true);

		//camera 2
		const followCamera = new BABYLON.UniversalCamera('movingCamera', new BABYLON.Vector3(), scene);
		followCamera.fov = Math.PI / 2;
		followCamera.minZ = 0.0001;
		followCamera.maxZ = 10000;
		followCamera.updateUpVectorFromRotation = true;
		followCamera.rotationQuaternion = new BABYLON.Quaternion();

		// followCamera.position = new BABYLON.Vector3(0, 2, -8);

		// Set initial camera
		scene.activeCamera = followCamera;
		let currentCameraState = 1;

		function switchCameraState() {
			if (currentCameraState === 1) {
				// Switch to Follow Camera (game view)
				scene.activeCamera = followCamera;
				currentCameraState = 2;
				console.log('🎮 Switched to Follow Camera (Game View)');
			} else {
				// Switch to ArcRotate Camera (free view)
				scene.activeCamera = arcCamera;
				currentCameraState = 1;
				console.log('🔄 Switched to ArcRotate Camera (Free View)');
			}
		}

		//light
		const light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 0), scene);
		light.intensity = 0.2;


		   scene.fogMode = BABYLON.Scene.FOGMODE_EXP;

				scene.fogColor = new BABYLON.Color3(0.9, 0.9, 0.85);
				scene.fogDensity = 0.0001;



		//wormhole shape
		const torus = BABYLON.MeshBuilder.CreateTorus(
			'torus',
			{ diameter: 80, thickness: 30, tessellation: 80, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
			scene
		);

		//TORUS KNOT
		//const torus = BABYLON.MeshBuilder.CreateTorusKnot("tk", {radius: 90, tube: 10, radialSegments: 100, p:5, q:2});

		torus.position.y = 1;

		// Use PhysicsAggregate for torus (static body) - CHANGED TO MESH for accurate torus collision
		const torusAggregate = new BABYLON.PhysicsAggregate(
			torus,
			BABYLON.PhysicsShapeType.MESH,
			{
				mass: 0, // static (doesn't move)
				restitution: 0.8, // bounciness
				friction: 0.5
			},
			scene
		);

		var torusMaterial = new BABYLON.StandardMaterial('materialTorus1', scene);
		const torusTexture = new BABYLON.Texture('/metal.jpg', scene);
		torusMaterial.wireframe = false;

		torusMaterial.diffuseTexture = torusTexture;
		torusMaterial.emissiveColor = new BABYLON.Color3(0.2, 0.2, 0.2); // Add slight glow
		//torusMaterial.backFaceCulling = false;
		torus.material = torusMaterial;

		// const sphere = BABYLON.MeshBuilder.CreateSphere('sphere', { diameter: 2, segments: 32 }, scene);
		const drone = BABYLON.MeshBuilder.CreateCapsule(
			'capsule',
			{
				radius: 0.5,
				capSubdivisions: 1,
				height: 2,
				tessellation: 4,
				topCapSubdivisions: 12
			},
			scene
		);

		drone.rotation.z = -Math.PI / 2;
		//  drone.isVisible = false;

		// Get torus dimensions from bounding box (same as wormhole.ts)
		const boundingInfo = torus.getBoundingInfo();
		const boundingBox = boundingInfo.boundingBox;
		const torusDiameter = boundingBox.maximumWorld.x - boundingBox.minimumWorld.x;
		const torusThickness = Math.abs(boundingBox.maximumWorld.y - boundingBox.minimumWorld.y);
		const points = [];
		const torusOuterRadius = torusDiameter / 2; // 45
		const torusTubeRadius = torusThickness / 2; // 5
		const torusMainRadius = torusOuterRadius - torusTubeRadius; // 40 (center of tube)
		const lineRadius = torusTubeRadius * 0.0; // Position inside the tube (0.8 = 80% of tube radius)

		// Position drone at the start of the path (same as sphere in wormhole.ts)
		const startProgress = 0; // Start at beginning of path
		const mainAngle = startProgress * Math.PI * 2; // angle around main torus
		const tubeAngle = startProgress * Math.PI * 4; // spiral angle (2 turns like original)

		// Position on the main torus ring
		const mainX = Math.cos(mainAngle) * torusMainRadius;
		const mainZ = Math.sin(mainAngle) * torusMainRadius;
		const mainY = 1; // same as torus center

		// Offset within the tube (same spiral logic as wormhole.ts)
		const tubeX = Math.cos(tubeAngle) * lineRadius;
		const tubeY = Math.sin(tubeAngle) * lineRadius;

		// Combine main position + tube offset
		const x = mainX + Math.cos(mainAngle) * tubeX;
		const z = mainZ + Math.sin(mainAngle) * tubeX;
		const y = mainY + tubeY;

		drone.position = new BABYLON.Vector3(x, y, z);
		//console.log('Drone positioned using wormhole.ts formula:', drone.position);

		const turns = 1; // CONTROL: loops around main torus (1, 2, 3...)
		const spiralTurns = 3; // CONTROL: how many times it spirals inside tube (2, 4, 8...)
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
		WormHoleScene2.pathPoints = points;


		// vectorline
		// const vectorLine = BABYLON.MeshBuilder.CreateLines('vectorLine', { points: points }, scene);
		// // Lines use Color3 for color and a separate alpha value for transparency
		// vectorLine.color = new BABYLON.Color3(0, 1, 1);

		// Navigation system functions (exact copy from wormhole.ts)
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

		// Use PhysicsAggregate for sphere (dynamic body)
		const droneAggregate = new BABYLON.PhysicsAggregate(
			drone,
			BABYLON.PhysicsShapeType.MESH,
			{
				mass: 10, // dynamic (can move)
				restitution: 1, // bouncinessc
				friction: 0.3
			},
			scene
		);

		// Drone material with emissive color so GlowLayer can highlight it
		const droneMaterial = new BABYLON.StandardMaterial('droneMat', scene);
		droneMaterial.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
		droneMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.6, 1.0); // cyan-ish glow
		drone.material = droneMaterial;

		// Create a GlowLayer and make it only pick up the drone's emissive color
		const gl = new BABYLON.GlowLayer('glow', scene);
		gl.intensity = 0.6;
		gl.customEmissiveColorSelector = (mesh, subMesh, material, result) => {
			if (mesh === drone) {
				const mat = material as BABYLON.StandardMaterial | null;
				const em = mat && mat.emissiveColor ? mat.emissiveColor : new BABYLON.Color3(0.1, 0.6, 1.0);
				result.set(em.r, em.g, em.b, 1.0);
			} else {
				result.set(0, 0, 0, 0);
			}
		};

		// Add a real point light attached to the drone so it illuminates nearby objects
		const droneLight = new BABYLON.PointLight('droneLight', new BABYLON.Vector3(0, 0, 0), scene);
		droneLight.diffuse = new BABYLON.Color3(0.1, 0.6, 1.0); // cyan-ish
		droneLight.specular = new BABYLON.Color3(0.6, 0.9, 1.0);
		droneLight.intensity = 3.0;
		droneLight.range = 12;

		// position the light slightly in front/top of the drone so it casts visible highlights
		droneLight.parent = drone;
		droneLight.position = new BABYLON.Vector3(0.5, 0.5, 0);

	
		followCamera.position = drone.position.add(new BABYLON.Vector3(0, 2, -8));

		// Gimbal / follow camera tuning
		const gimbal = {
			followDistance: 8,    // distance behind the drone
			followHeight: 2,      // height above the drone
			positionSmooth: 0.08, // interpolation factor for position (0..1)
			rotationSmooth: 0.12, // slerp factor for rotation
			lookAheadDistance: 5  // how far ahead on the path the camera looks
		};
		// DRONE CONTROLS: Track which keys are pressed
		const keysPressed: { [key: string]: boolean } = {
			w: false,
			a: false,
			s: false,
			d: false
		};


const markerSize = 4;
const indices = [
  Math.floor(points.length * 0.25),
  Math.floor(points.length * 0.5),
  Math.floor(points.length * 0.75)
];

for (let i = 0; i < indices.length; i++) {
  const p = points[indices[i]];
  if (!p) { continue; }
  const box = BABYLON.MeshBuilder.CreateBox('pathCube' + i, { size: markerSize }, scene);
  box.position = p.clone();
  // lift cube half its height so it sits nicely on the path (tweak if needed)
  box.position.y += markerSize / 2;

  const mat = new BABYLON.StandardMaterial('pathCubeMat' + i, scene);
  mat.diffuseColor = new BABYLON.Color3(0.8, 0.2, 0.2);
  box.material = mat;

  // Add physics collider so the drone will collide with the box.
  // mass = 0 makes the cube static; set mass > 0 if you want it to be movable.
  new BABYLON.PhysicsAggregate(box, BABYLON.PhysicsShapeType.BOX, {
    mass: 0.02,
    restitution: 0.2,
    friction: 0.6
  }, scene);

}


// Create floating cubes via helper module (keeps this scene file small)
const floating = createFloatingCubes(scene, WormHoleScene2.pathPoints, {
	count: 10,
	jitter: 0.5,
	verticalOffset: 0.5,
	sizeRange: [1.2, 3.2],
	massRange: [0.008, 0.8],
	antiGravityFactor: 2.0,
	linearDamping: 0.985
});



try {
  console.log('Loading Jollibee model...');
  const result = await SceneLoader.ImportMeshAsync("", "https://kolown.net/assets/p1sonet/", "jollibee.glb", scene);
  const template = result.meshes.find(mesh => mesh.geometry);
  
  if (template) {
    template.setEnabled(false); // Hide original


const jolliPBR = new BABYLON.PBRMaterial('jolliPBR', scene);
    jolliPBR.metallic = 0.0;            // non-metal for plasticy response
   jolliPBR.roughness = 0.25;         // some gloss (lower = shinier)
   jolliPBR.directIntensity = 2.0;    // amplify direct lights (drone)
    jolliPBR.environmentIntensity = 1.0; // reflections from env (if set)
    jolliPBR.emissiveColor = BABYLON.Color3.Black(); // avoid neutral emissive wash
    jolliPBR.backFaceCulling = true;



    
    // Create instances along path
    const instanceCount = 5;
    const step = Math.floor(WormHoleScene2.pathPoints.length / instanceCount);
    
	for (let i = 0; i < instanceCount; i++) {
	  const pos = WormHoleScene2.pathPoints[i * step].clone();
	  pos.y += -1 // Lift slightly
	  
	  // Visual instance (cast template to Mesh so TS recognizes createInstance)
	  const instance = (template as unknown as BABYLON.Mesh).createInstance(`jollibee_${i}`);
	  instance.position.copyFrom(pos);
	  instance.scaling.setAll(10); // Scale down

	     instance.material = jolliPBR;
	  
	  // Physics - directly on the instance (modern approach)
	  new BABYLON.PhysicsAggregate(instance, BABYLON.PhysicsShapeType.SPHERE, {
		mass: 0.05,           // Static
		restitution: 0.3,  // Bounce
		friction: 0.05
	  }, scene);
	}
    
    console.log(`Created ${instanceCount} Jollibee instances`);
  }
} catch (error) {
  console.error('Failed to load Jollibee model:', error);
}



 








		scene.registerBeforeRender(() => {



		// update floating cubes module (handles anti-gravity, centering, damping)
		const dt = engine.getDeltaTime() / 1000;
		if (floating && typeof floating.update === 'function') {
			floating.update(dt);
			floating.update(dt);
		}

	



			drone.rotation.x = -Math.PI / 2;

			WormHoleScene2.sphereProgress += WormHoleScene2.sphereSpeed;
			if (WormHoleScene2.sphereProgress > 1) {
				WormHoleScene2.sphereProgress = 0; // loop back to start
			}

			// Move the drone via physics (do NOT teleport the mesh each frame)
			const targetPos = getPositionOnPath(WormHoleScene2.sphereProgress);
			const toTarget = targetPos.subtract(drone.position);
			const distance = toTarget.length();

			// tuning params
			const maxFollowSpeed = 12; // units/sec (tweak)
			const followStrength = 6.0; // multiplier for distance -> desired speed

			let desiredVel = BABYLON.Vector3.Zero();
			if (distance > 0.02) {
				const speed = Math.min(maxFollowSpeed, distance * followStrength);
				desiredVel = toTarget.normalize().scale(speed);
			}

			// Apply the velocity to the physics body so collisions are handled.
			// Bake a small damping factor into the final velocity to keep motion stable.
			const velocityDamping = 0.995;
			droneAggregate.body.setLinearVelocity(desiredVel.scale(velocityDamping));

			if (scene.activeCamera === followCamera) {
				// compute look-ahead point on the path
				const currentProgress = WormHoleScene2.sphereProgress;
				const lookAheadProgress = Math.min(
					1,
					currentProgress + gimbal.lookAheadDistance / WormHoleScene2.pathPoints.length
				);
				const lookAtPoint = getPositionOnPath(lookAheadProgress);

				// desired camera position: behind the drone along forward direction
				const forward = getDirectionOnPath(WormHoleScene2.sphereProgress);
				const desiredCamPos = drone.position
					.add(forward.scale(-gimbal.followDistance))
					.add(new BABYLON.Vector3(0, gimbal.followHeight, 0));

				// smooth camera position
				followCamera.position = BABYLON.Vector3.Lerp(
					followCamera.position,
					desiredCamPos,
					gimbal.positionSmooth
				);

				// compute desired rotation to look at lookAtPoint (no roll)
				const toTarget = lookAtPoint.subtract(followCamera.position).normalize();
				const yaw = Math.atan2(toTarget.x, toTarget.z);
				const pitch = Math.asin(BABYLON.Scalar.Clamp(toTarget.y, -1, 1));

				const targetQuat = BABYLON.Quaternion.RotationYawPitchRoll(yaw, -pitch, 0);
				if (!followCamera.rotationQuaternion) {
					followCamera.rotationQuaternion = new BABYLON.Quaternion();
				}
				followCamera.rotationQuaternion = BABYLON.Quaternion.Slerp(
					followCamera.rotationQuaternion,
					targetQuat,
					gimbal.rotationSmooth
				);
			}

			// Left/Right: Try these directions
			if (keysPressed.a) {
				const leftForce = new BABYLON.Vector3(0, 0, 8); // More left
				droneAggregate.body.applyForce(leftForce, drone.position);
			}
			if (keysPressed.d) {
				const rightForce = new BABYLON.Vector3(0, 0, -8); // More right
				droneAggregate.body.applyForce(rightForce, drone.position);
			}
		});

		// Controls
		window.addEventListener('keydown', (event) => {
			const key = event.key.toLowerCase();

			if (key === 'q') {
				torusMaterial.wireframe = !torusMaterial.wireframe;
				console.log('Wireframe:', torusMaterial.wireframe);
			} else if (key === 'r') {
				// Reset drone position and velocity
				drone.position = new BABYLON.Vector3(40, 1, 0);
				droneAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
				droneAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
				console.log('Drone reset');
			} else if (['w', 'a', 's', 'd'].includes(key)) {
				// Set WASD keys as pressed
				keysPressed[key] = true;
			} else if (key === 'c') {
				switchCameraState();
			}
		});

		window.addEventListener('keyup', (event) => {
			const key = event.key.toLowerCase();
			if (['w', 'a', 's', 'd'].includes(key)) {
				keysPressed[key] = false;
			}
		});

		return scene;
	}
}
