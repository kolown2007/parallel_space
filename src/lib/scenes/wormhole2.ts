import * as BABYLON from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';
import { createFloatingCubes } from '../chronoescape/floatingCubes';
import { createSolidParticleSystem } from '../particles/solidParticleSystem';
import '@babylonjs/loaders/glTF';
import { BillboardManager } from '../chronoescape/BillboardManager';
import { createDrone } from '../chronoescape/Drone';
import { createTorus } from '../chronoescape/Torus';
import { getPositionOnPath, getDirectionOnPath } from '../chronoescape/PathUtils';
import { ObstaclesManager } from '../chronoescape/Obstacles';
import preloadContainers, { defaultAssetList } from '../chronoescape/assetContainers';


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
			// Preload required assets using a short-lived scene to provide an AssetsManager context
			try {
				const preloadScene = new BABYLON.Scene(engine);
				try {
					await preloadContainers(preloadScene, defaultAssetList, (loaded: number, total: number, last?: string) => {
						try { (engine as any)?.loadingScreen?.setLoadingText?.(`Loading ${loaded}/${total} ${last ?? ''}`); } catch {}
					});
				} catch (e) {
					console.warn('preloadContainers threw', e);
				} finally {
					try { preloadScene.dispose(); } catch (e) { /* ignore */ }
				}
			} catch (e) {
				console.warn('Preload failed or was skipped', e);
			}

			// Create the actual scene after preload completes
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

		//fog
		scene.fogMode = BABYLON.Scene.FOGMODE_EXP;

			scene.fogColor = new BABYLON.Color3(0.9, 0.9, 0.85);
			scene.fogDensity = 0.0001;



		// Create torus via component (encapsulates mesh, material, physics and path generation)

		

		const torusResult = createTorus(scene, {
			diameter: 80,
			thickness: 30,
			tessellation: 80,
			positionY: 1,
			lineRadiusFactor: 0.0,
			turns: 1,
			spiralTurns: 3,
			segments: 128,
			materialTextureUrl: '/metal.jpg'
		});
		const torus = torusResult.torus;
		const torusAggregate = torusResult.torusAggregate;
		const torusMainRadius = torusResult.torusMainRadius;
		const torusTubeRadius = torusResult.torusTubeRadius;
		const points = torusResult.pathPoints;
		WormHoleScene2.pathPoints = points;
		const lineRadius = torusTubeRadius * 0.0; // position inside tube (adjust if needed)
		const torusMaterial = torus.material as BABYLON.StandardMaterial;

		// DEBUG: draw path and compute statistics to verify centering
		{
			// const debugLine = BABYLON.MeshBuilder.CreateLines('pathDebug', { points }, scene);
			// debugLine.color = new BABYLON.Color3(0, 1, 1);

			const center = torus.getAbsolutePosition();
			let minRad = Number.POSITIVE_INFINITY, maxRad = 0;
			let minY = Number.POSITIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
			for (let i = 0; i < points.length; i++) {
				const p = points[i];
				const dx = p.x - center.x;
				const dz = p.z - center.z;
				const radial = Math.sqrt(dx * dx + dz * dz);
				minRad = Math.min(minRad, radial);
				maxRad = Math.max(maxRad, radial);
				minY = Math.min(minY, p.y - center.y);
				maxY = Math.max(maxY, p.y - center.y);
			}
			console.log('Path debug — torus center:', center);
			console.log(`Path radial distance (min, max): ${minRad.toFixed(4)}, ${maxRad.toFixed(4)} (expected ~${torusMainRadius.toFixed(4)})`);
			console.log(`Path Y offset from torus center (min, max): ${minY.toFixed(4)}, ${maxY.toFixed(4)} (expected within +/-${torusTubeRadius.toFixed(4)})`);

		
		}



		// Drone setup
	
		const { drone, droneVisual } = await createDrone(scene, '/glb/usb.glb');
		drone.rotation.z = -Math.PI / 2;

	
		drone.position = getPositionOnPath(WormHoleScene2.pathPoints, 0);
	
		const droneAggregate = new BABYLON.PhysicsAggregate(
			drone,
			BABYLON.PhysicsShapeType.MESH,
			{
				mass: 10, // dynamic (can move)
				restitution: 1, // bounciness
				friction: 0.3
			},
			scene
		);
	


		// vectorline
		// const vectorLine = BABYLON.MeshBuilder.CreateLines('vectorLine', { points: points }, scene);
		// // Lines use Color3 for color and a separate alpha value for transparency
		// vectorLine.color = new BABYLON.Color3(0, 1, 1);




		// Drone material with emissive color so GlowLayer can highlight it
		const droneMaterial = new BABYLON.StandardMaterial('droneMat', scene);
		droneMaterial.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
		droneMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.6, 1.0); // cyan-ish glow
		// assign material to the visual mesh if available, otherwise to the collider mesh
		if (droneVisual) {
			droneVisual.material = droneMaterial;
		} else {
			(drone as BABYLON.Mesh).material = droneMaterial;
		}

		// Create a GlowLayer and make it only pick up the drone's emissive color
		const gl = new BABYLON.GlowLayer('glow', scene);
		gl.intensity = 0.6;
		gl.customEmissiveColorSelector = (mesh, subMesh, material, result) => {
			// highlight only the actual visual mesh from the GLB (or drone collider if no visual)
			if (mesh === droneVisual || mesh === drone) {
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

// Use ObstaclesManager to create orange marker cubes at the indices
const obstacles = new ObstaclesManager(scene, points);
await obstacles.registerType('orangeCube', async (sc) => {
	const tpl = BABYLON.MeshBuilder.CreateBox('orangeCube_tpl', { size: markerSize }, sc);
	const mat = new BABYLON.StandardMaterial('orangeCubeMat_tpl', sc);
	mat.diffuseColor = new BABYLON.Color3(0.92, 0.45, 0.07); // orange
	tpl.material = mat;
	tpl.isVisible = false; // hide template
	return tpl;
});

for (let i = 0; i < indices.length; i++) {
	const idx = indices[i];
	// place the cube; ObstaclesManager will set position and metadata
	await obstacles.place('orangeCube', { index: idx, offsetY: markerSize / 2, physics: { mass: 0.02, shape: BABYLON.PhysicsShapeType.BOX } });
}


// Create floating cubes via helper module (keeps this scene file small)
const floating = createFloatingCubes(scene, WormHoleScene2.pathPoints, {
	count: 3,
	jitter: .05,
	verticalOffset: 0.5,
	sizeRange: [1.2, 3.2],
	massRange: [0.008, 0.8],
	antiGravityFactor: 1.0,
	linearDamping: 0.985
});

// Create a SolidParticleSystem and attach it to a point on the vector line (use the first marker)
const spsFx = createSolidParticleSystem(scene, { particleNb: 800, particleSize: 1.0, maxDistance: 220 });


// choose the path point for the effect - use indices[0] if available, otherwise center point
const spsPointIndex = indices && indices.length > 0 ? indices[0] : Math.floor(WormHoleScene2.pathPoints.length / 2);
const spsPosition = WormHoleScene2.pathPoints[spsPointIndex] ? WormHoleScene2.pathPoints[spsPointIndex].clone() : new BABYLON.Vector3(0, 0, 0);
// nudge up a bit so particles are visible above the path
spsPosition.y += 1.2;
spsFx.mesh.position.copyFrom(spsPosition);
// parent to drone so it moves with the scene origin if needed
spsFx.attachTo(torus);
// start updating SPS
spsFx.start();

// auto-dispose after 60s (optional)
const spsAutoHandle = window.setTimeout(() => {
  try { spsFx.stop(); spsFx.dispose(); } catch (e) { /* ignore */ }
}, 60_000);



try {
  console.log('Loading Jollibee model...');
	
	const rootUrl = "https://kolown.net/assets/p1sonet/";
	const fileName = "jollibee.glb";
	let container: any = null;
	const pluginOptions = {
		// example glTF plugin options; adjust if you need specific behavior
		gltf: {
			// skipMaterials: false,
			// extensionOptions: { MSFT_lod: { maxLODsToLoad: 1 } }
		}
	};

	// Use the module-level loader only (no fallback to SceneLoader).
	const moduleLoader = (BABYLON as any).loadAssetContainerAsync || (BABYLON as any).loadAssetContainer;
	if (typeof moduleLoader !== 'function') {
		throw new Error('module-level loadAssetContainerAsync not available; project requires module-level loader API');
	}

	try {
		container = await moduleLoader.call(BABYLON, fileName, scene, { rootUrl, pluginOptions });
	} catch (e) {
		console.error('module-level loadAssetContainerAsync failed', e);
		throw e;
	}

	try { if (container && typeof container.addAllToScene === 'function') container.addAllToScene(); } catch (e) { /* ignore */ }

	let template = container && Array.isArray(container.meshes) ? container.meshes.find((m: any) => m.geometry) as BABYLON.Mesh | undefined : undefined;
	if (!template) {
		template = scene.meshes.find(m => m.geometry && /jolli|jollibee/i.test(m.name)) as BABYLON.Mesh | undefined;
	}

	if (template) {
		try { template.setEnabled(false); } catch (e) { /* ignore if not applicable */ }


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

		// Render two frames to ensure the GPU has presented the scene, then hide loading UI
		try {
			requestAnimationFrame(() => {
				try { scene.render(); } catch (e) { /* ignore */ }
				requestAnimationFrame(() => {
					try { scene.render(); } catch (e) { /* ignore */ }
				});
			});
		} catch (e) {
			// loader hide is handled by the main page
		}




 
// create multiple textured billboard planes along the drone track (via BillboardManager)
try {
	const bm = new BillboardManager(scene, { count: 3, size: { width: 30, height: 30 }, textureUrl: '/tribal.png', parent: torus });
	await bm.createAlongPath(WormHoleScene2.pathPoints);
	// Optionally store bm somewhere if you want to dispose later. For now it will be GC'd when scene disposes.
} catch (e) { console.warn('Failed to create malunggay planes via BillboardManager', e); }






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
			const targetPos = getPositionOnPath(WormHoleScene2.pathPoints, WormHoleScene2.sphereProgress);
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
				const lookAtPoint = getPositionOnPath(WormHoleScene2.pathPoints, lookAheadProgress);

				// desired camera position: behind the drone along forward direction
				const forward = getDirectionOnPath(WormHoleScene2.pathPoints, WormHoleScene2.sphereProgress);
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
