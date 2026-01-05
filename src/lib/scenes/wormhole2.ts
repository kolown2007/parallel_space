// ============================================================================
// IMPORTS
// ============================================================================

import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

// Drone
import { setupSceneDrone } from '../chronoescape/drone/setupDrone';
import { updateDronePhysics, updateFollowCamera } from '../chronoescape/drone/droneControllers';

// World & Utilities
import { createTorus } from '../chronoescape/world/Torus';
import { getPositionOnPath } from '../chronoescape/world/PathUtils';
import { setupPhysics, setupLighting, setupCameras } from '../chronoescape/world/sceneUtils';
import { createPathMarkers } from '../chronoescape/world/markers';
import { createBillboards, createPortal, createParticles } from '../chronoescape/world/effects';

// Obstacles
import { createFloatingCubes } from '../chronoescape/obstacle/floatingCubes';
import { ObstaclesManager } from '../chronoescape/obstacle/Obstacles';
import { ModelPlacer } from '../chronoescape/obstacle/ModelPlacer';

// System
import preloadContainers, { getDefaultAssetList } from '../chronoescape/assetContainers';
import { installKeyboardControls } from '../input/keyboardControls';
import { getTextureUrl, getModelUrl, loadAssetsConfig } from '../assetsConfig';
import { droneControl, updateProgress, adjustDroneSpeed } from '../stores/droneControl';
import { get } from 'svelte/store';

// ============================================================================
// SCENE CLASS
// ============================================================================

export class WormHoleScene2 {
	static pathPoints: BABYLON.Vector3[] = [];

	static async CreateScene(engine: any, canvas: HTMLCanvasElement, onPortalTrigger?: () => void): Promise<BABYLON.Scene> {
		// ====================================================================
		// ASSET PRELOADING
		// ====================================================================
		try {
			const preloadScene = new BABYLON.Scene(engine);
			try {
				const assetList = await getDefaultAssetList();
				await preloadContainers(
					preloadScene,
					assetList,
					(loaded: number, total: number, last?: string) => {
						try {
							(engine as any)?.loadingScreen?.setLoadingText?.(
								`Loading ${loaded}/${total} ${last ?? ''}`
							);
						} catch {}
					}
				);
			} catch (e) {
				console.warn('preloadContainers threw', e);
			} finally {
				try {
					preloadScene.dispose();
				} catch (e) {
					/* ignore */
				}
			}
		} catch (e) {
			console.warn('Preload failed or was skipped', e);
		}

		// ====================================================================
		// SCENE INITIALIZATION
		// ====================================================================

		const scene = new BABYLON.Scene(engine);
		console.log('wormhole2 scene created');

		await setupPhysics(scene);

		// ====================================================================
		// CAMERAS & LIGHTING
		// ====================================================================

		const { followCamera, switchCamera } = setupCameras(scene, canvas, 'follow');
		setupLighting(scene);


		
		// ====================================================================
		// SOUND
		// ====================================================================

		(async () => {
			const audioEngine = await BABYLON.CreateAudioEngineAsync();

			const narration = await BABYLON.CreateStreamingSoundAsync("narration",
   			//  "https://assets.babylonjs.com/sound/alarm-1.mp3"
			"https://kolown.net/storage/library/audio/field/bbc_rainforest_nhu0501214.mp3"
);

			// Wait until audio engine is ready to play sounds.
			await audioEngine.unlockAsync();

			narration.play()
		})();




		// ====================================================================
		// WORLD: TORUS TRACK
		// ====================================================================

		const metalTextureUrl = await getTextureUrl('metal');
		const torusResult = createTorus(scene, {
			diameter: 80,
			thickness: 30,
			tessellation: 80,
			positionY: 1,
			lineRadiusFactor: 0.0,
			turns: 1,
			spiralTurns: 3,
			segments: 128,
			materialTextureUrl: metalTextureUrl || '/metal.jpg'
		});
		const torus = torusResult.torus;
		const torusAggregate = torusResult.torusAggregate;
		const torusMainRadius = torusResult.torusMainRadius;
		const torusTubeRadius = torusResult.torusTubeRadius;
		const pathPoints = torusResult.pathPoints;
		WormHoleScene2.pathPoints = pathPoints;
		const torusMaterial = torus.material as BABYLON.StandardMaterial;

		// Debug: verify path centering
		{
// const debugLine = BABYLON.MeshBuilder.CreateLines('pathDebug', { points: pathPoints }, scene);
			// debugLine.color = new BABYLON.Color3(0, 1, 1);

			const center = torus.getAbsolutePosition();
			let minRad = Number.POSITIVE_INFINITY,
				maxRad = 0;
			let minY = Number.POSITIVE_INFINITY,
				maxY = Number.NEGATIVE_INFINITY;
			for (let i = 0; i < pathPoints.length; i++) {
				const p = pathPoints[i];
				const dx = p.x - center.x;
				const dz = p.z - center.z;
				const radial = Math.sqrt(dx * dx + dz * dz);
				minRad = Math.min(minRad, radial);
				maxRad = Math.max(maxRad, radial);
				minY = Math.min(minY, p.y - center.y);
				maxY = Math.max(maxY, p.y - center.y);
			}
			console.log('Path debug — torus center:', center);
			console.log(
				`Path radial distance (min, max): ${minRad.toFixed(4)}, ${maxRad.toFixed(4)} (expected ~${torusMainRadius.toFixed(4)})`
			);
			console.log(
				`Path Y offset from torus center (min, max): ${minY.toFixed(4)}, ${maxY.toFixed(4)} (expected within +/-${torusTubeRadius.toFixed(4)})`
			);
		}

		// ====================================================================
		// DRONE: LOADING & SETUP
		// ====================================================================

		const initialPosition = getPositionOnPath(WormHoleScene2.pathPoints, 0);
		const droneGlbUrl = await getModelUrl('drone');
		const { drone, droneAggregate } = await setupSceneDrone(scene, {
			glbUrl: droneGlbUrl || '/glb/usb.glb',
			initialPosition: initialPosition,
			initialRotation: new BABYLON.Vector3(0, 0, -Math.PI / 2),
			mass: 2,
			restitution: 1,
			friction: 0.3,
			glowIntensity: 0.4,
			glowSubmeshIndex: 1,
			enableDebug: false
		});

		// Enable collision detection on drone
		if (droneAggregate?.body) {
			try {
				droneAggregate.body.setCollisionCallbackEnabled(true);
				
				const collisionObservable = droneAggregate.body.getCollisionObservable();
				collisionObservable.add((collisionEvent: any) => {
					const collidedMesh = collisionEvent.collidedAgainst?.transformNode;
					const collidedName = collidedMesh?.name || 'unknown';
					
					// console.log('🎯 Drone collision:', {
					// 	collidedWith: collidedName,
					// 	impulse: collisionEvent.impulse,
					// 	point: collisionEvent.point
					// });

					// Check if it's a Jollibee
					if (collidedName.toLowerCase().includes('jollibee') || 
					    collidedName.toLowerCase().includes('model_instance')) {
						console.log('✨ Drone hit Jollibee!');
						// Add your collision response here (e.g., score, sound, effects)
					}
				});
				console.log('✓ Drone collision detection enabled');
			} catch (e) {
				console.warn('Failed to setup drone collision callback:', e);
			}
		}

		// ====================================================================
		// CAMERA SETTINGS & CONTROLS
		// ====================================================================

		followCamera.position = drone.position.add(new BABYLON.Vector3(0, 2, -8));

		// Follow camera tuning
		const gimbal = {
			followDistance: 8, // distance behind the drone
			followHeight: 2, // height above the drone
			positionSmooth: 0.08, // interpolation factor for position (0..1)
			rotationSmooth: 0.12, // slerp factor for rotation
			lookAheadDistance: 5
		};

		// Keyboard controls state
		const keysPressed: { [key: string]: boolean } = {
			w: false,
			a: false,
			s: false,
			d: false
		};

		// Install keyboard handlers
		const uninstallKeyboard = installKeyboardControls({
			keysPressed,
			onToggleWireframe: () => {
				torusMaterial.wireframe = !torusMaterial.wireframe;
				console.log('Wireframe:', torusMaterial.wireframe);
			},
			onReset: () => {
				drone.position = new BABYLON.Vector3(40, 1, 0);
				try {
					droneAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
					droneAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
				} catch (e) {
					/* ignore if aggregate missing */
				}
				console.log('Drone reset');
			},
			onSwitchCamera: switchCamera,
			onSpeedUp: () => {
				adjustDroneSpeed(0.00002);
				const newSpeed = get(droneControl).speed;
				console.log('Speed increased:', (newSpeed * 10000).toFixed(3));
			},
			onSpeedDown: () => {
				adjustDroneSpeed(-0.00002);
				const newSpeed = get(droneControl).speed;
				console.log('Speed decreased:', (newSpeed * 10000).toFixed(3));
			}
		});

		// Cleanup on dispose
		scene.onDisposeObservable.add(() => {
			try {
				uninstallKeyboard();
			} catch (e) {
				/* ignore */
			}
		});
		// OBSTACLES & MARKERS
		// ====================================================================

		const obstacles = new ObstaclesManager(scene, pathPoints);
		const indices = await createPathMarkers(scene, pathPoints, obstacles);

		const floating = createFloatingCubes(scene, pathPoints, {
			count: 3,
			jitter: 0.05,
			verticalOffset: 0.5,
			sizeRange: [0.2, 1],
			massRange: [0.008, 0.8],
			antiGravityFactor: 1.0,
			linearDamping: 0.985
		});

		// ====================================================================
		// EFFECTS
		// ====================================================================

		const particleIdx = indices[0] ?? Math.floor(pathPoints.length / 2);
		createParticles(scene, pathPoints, particleIdx, torus, { autoDispose: 60_000 });

		// ====================================================================
		// MODELS & BILLBOARDS
		// ====================================================================

		(async () => {
			try {
				const cfg = await loadAssetsConfig();
				const jolli = cfg.models?.jollibee;
				const rootUrl = jolli?.rootUrl ?? 'https://kolown.net/assets/p1sonet/';
				const fileName = jolli?.filename ?? 'jollibee.glb';
				const container = await (BABYLON as any).loadAssetContainerAsync(fileName, scene, {
					rootUrl,
					pluginOptions: { gltf: {} }
				});

				container.addAllToScene();

				// Find the main mesh to use as template
				const jolliTemplate = container.meshes.find((m: any) => m.geometry) as BABYLON.Mesh;

				// Also place some static instances
				const modelPlacer = new ModelPlacer(scene, pathPoints);
				await modelPlacer.load({
					rootUrl,
					filename: fileName,
					count: 5,
					scale: 10,
					offsetY: -1,
					physics: { mass: 0.05, restitution: 0.3, friction: 0.05, shape: BABYLON.PhysicsShapeType.MESH }
			});
		} catch (error) {
			console.error('Failed to load models:', error);
		}
	})();

	await createBillboards(scene, pathPoints, torus);
	let portal = await createPortal(scene, pathPoints, indices[0] ?? Math.floor(pathPoints.length / 2));

	// ====================================================================
	// RENDER LOOP
	// ====================================================================

	scene.registerBeforeRender(() => {
		const dt = engine.getDeltaTime() / 1000;

		// Get current drone control state from store
		const control = get(droneControl);

		// Portal collision check (approximate USB AABB from drone position)
		if (portal && onPortalTrigger) {
			try {
				const usbAabb = {
					min: { x: drone.position.x - 0.5, y: drone.position.y - 0.5, z: drone.position.z - 0.5 },
					max: { x: drone.position.x + 0.5, y: drone.position.y + 0.5, z: drone.position.z + 0.5 }
				};
				if (portal.intersects(usbAabb)) {
					onPortalTrigger();
					try {
						portal.reset();
					} catch {}
					portal = undefined;
				}
			} catch (e) {
				/* ignore transient errors */
			}
		}

		// Update floating cubes
		if (floating && typeof floating.update === 'function') {
			floating.update(dt);
		}

		// Update path progress using store value
		let newProgress = control.progress + control.speed;
		if (newProgress > 1) {
			newProgress = 0;
		}
		updateProgress(newProgress);

		// Update drone physics with lateral force from store
		updateDronePhysics(
			drone,
			droneAggregate,
			WormHoleScene2.pathPoints,
			control.progress,
			keysPressed,
			{ lateralForce: control.lateralForce }
		);

		// Update follow camera
		if (scene.activeCamera === followCamera) {
			updateFollowCamera(followCamera, drone, WormHoleScene2.pathPoints, control.progress, gimbal);
		}
	});

	return scene;
	}
}
