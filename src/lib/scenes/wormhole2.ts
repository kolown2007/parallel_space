
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

// Drone
import { setupSceneDrone } from '../chronoescape/drone/setupDrone';
import { updateDronePhysics, updateFollowCamera } from '../chronoescape/drone/droneControllers';

// World & Utilities
import { createTorus } from '../chronoescape/world/Torus';
import { getPositionOnPath } from '../chronoescape/world/PathUtils';
import { setupPhysics, setupLighting, setupCameras } from '../chronoescape/world/sceneUtils';
import { visualizePathDebug } from '../chronoescape/world/debugPath';

// Obstacles
import { ObstacleFactory } from '../chronoescape/obstacle/ObstacleFactory';

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
	private static cleanupRegistry: Array<() => void> = [];
	private static modelCache: Map<string, BABYLON.AssetContainer> = new Map();

	private static registerCleanup(cleanup: () => void): void {
		this.cleanupRegistry.push(cleanup);
	}

	private static disposeAll(): void {
		for (const cleanup of this.cleanupRegistry) {
			try { cleanup(); } catch (e) { console.warn('Cleanup error:', e); }
		}
		this.cleanupRegistry = [];
		
		// Dispose cached model containers
		for (const container of this.modelCache.values()) {
			try { container.dispose(); } catch (e) { console.warn('Model cache disposal error:', e); }
		}
		this.modelCache.clear();
	}

	static async CreateScene(engine: any, canvas: HTMLCanvasElement, onPortalTrigger?: () => void): Promise<BABYLON.Scene> {
		// ====================================================================
		// ASSET PRELOADING
		// ====================================================================
		try {
			const preloadScene = new BABYLON.Scene(engine);
			try {
				const assetList = await getDefaultAssetList();
				// Load ALL assets (including models) before scene starts
				await preloadContainers(
					preloadScene,
					assetList || [],
					(loaded: number, total: number, last?: string) => {
						try {
							(engine as any)?.loadingScreen?.setLoadingText?.(
								`Loading assets ${loaded}/${total}${last ? ': ' + last : ''}`
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
			try {
				const audioEngine = await BABYLON.CreateAudioEngineAsync();

				const narration = await BABYLON.CreateStreamingSoundAsync("narration",
					//  "https://assets.babylonjs.com/sound/alarm-1.mp3"
					"https://kolown.net/storage/library/chronoescape/audio/bg1.mp3"
				);

				// Wait until audio engine is ready to play sounds.
				await audioEngine.unlockAsync();

				narration.play();

				// Register audio cleanup
				WormHoleScene2.registerCleanup(() => {
					narration?.stop();
					narration?.dispose();
					audioEngine?.dispose();
				});
			} catch (e) {
				console.warn('Audio initialization failed:', e);
			}
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
			pointsPerCircle: 360,
			materialTextureUrl: metalTextureUrl || '/metal.jpg'
		});
		const torus = torusResult.torus;
		const torusAggregate = torusResult.torusAggregate;
		const torusMainRadius = torusResult.torusMainRadius;
		const torusTubeRadius = torusResult.torusTubeRadius;
		const pathPoints = torusResult.pathPoints;
		WormHoleScene2.pathPoints = pathPoints;
		console.log('PathPoints count:', pathPoints.length);
		const torusMaterial = torus.material as BABYLON.StandardMaterial;

		// ====================================================================
		// PATH DEBUG VISUALIZATION
		// ====================================================================
		visualizePathDebug(scene, pathPoints, {
			showLine: false, //true to view
			showLabels: false,
			labelInterval: 10,
			showStats: true,
			torusCenter: torus.getAbsolutePosition(),
			torusMainRadius,
			torusTubeRadius
		});

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

		// Ensure drone always starts at pathpoint 0
		try {
			updateProgress(0);
			const startPos = getPositionOnPath(WormHoleScene2.pathPoints, 0);
			drone.position.copyFrom(startPos);
			if (droneAggregate?.body) {
				try {
					droneAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
					droneAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
					// Some physics engines expose a setPosition method; attempt if available
					if (typeof (droneAggregate.body as any).setPosition === 'function') {
						(droneAggregate.body as any).setPosition({ x: startPos.x, y: startPos.y, z: startPos.z });
					}
				} catch (e) {
					/* ignore transient physics positioning errors */
				}
			}
		} catch (e) {
			console.warn('Failed to enforce drone start at pathpoint 0:', e);
		}

		// Enable collision detection on drone
		if (droneAggregate?.body) {
			try {
				droneAggregate.body.setCollisionCallbackEnabled(true);
				
				const collisionObservable = droneAggregate.body.getCollisionObservable();
				const collisionObserver = collisionObservable.add((collisionEvent: any) => {
					const collidedMesh = collisionEvent.collidedAgainst?.transformNode;
					const collidedName = collidedMesh?.name || 'unknown';
					
					// Check if it's a model instance
					if (collidedName.toLowerCase().includes('model_instance')) {
						console.log(`✨ Drone hit model: ${collidedName}`);
						// Add your collision response here (e.g., score, sound, effects)
					}
				});
				WormHoleScene2.registerCleanup(() => {
					collisionObservable.remove(collisionObserver);
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
			},
			onPlaceCube: async () => {
				try {
					const currentPointIndex = getDronePathIndex();
					const targetIndex = (currentPointIndex + 10) % pathPoints.length;
					await obstacles.place('cube', { index: targetIndex, size: 2, physics: true });
					console.log(`📦 Placed cube at point ${targetIndex} (drone @ ${currentPointIndex})`);
				} catch (e) {
					console.warn('Failed to place cube:', e);
				}
			}
		});

		// Register keyboard cleanup
		
		WormHoleScene2.registerCleanup(() => uninstallKeyboard());

		// Helper: compute nearest path point index for drone
		const getDronePathIndex = () => {
			if (!drone || !pathPoints || pathPoints.length === 0) return 0;
			let currentPointIndex = 0;
			let minDistSq = Number.POSITIVE_INFINITY;
			for (let i = 0; i < pathPoints.length; i++) {
				const dx = pathPoints[i].x - drone.position.x;
				const dy = pathPoints[i].y - drone.position.y;
				const dz = pathPoints[i].z - drone.position.z;
				const d2 = dx * dx + dy * dy + dz * dz;
				if (d2 < minDistSq) {
					minDistSq = d2;
					currentPointIndex = i;
				}
			}
			return currentPointIndex;
		};

		// DRONE POSITION LOGGER
		// ====================================================================
		const _dronePosLogger = setInterval(() => {
			try {
				if (!drone || !pathPoints || pathPoints.length === 0) return;
				const currentPointIndex = getDronePathIndex();
				const p = drone.position;
				console.log('Drone @ point', currentPointIndex, '/', pathPoints.length, '| xyz:', { x: p.x.toFixed(2), y: p.y.toFixed(2), z: p.z.toFixed(2) });
			} catch (e) {
				console.warn('Drone position logger error:', e);
			}
		}, 10000);
		WormHoleScene2.registerCleanup(() => clearInterval(_dronePosLogger));

		// Cleanup on dispose
			// ====================================================================
		scene.onDisposeObservable.add(() => {
			WormHoleScene2.disposeAll();
		});


		// OBSTACLES & MARKERS
		// ====================================================================

		const obstacles = new ObstacleFactory(scene, pathPoints, WormHoleScene2.modelCache, WormHoleScene2.cleanupRegistry);

		let portal: any | undefined;

		// Example: Enable floating cubes
		// await obstacles.place('floating-cube', {
		// 	count: 3,
		// 	jitter: 0.05,
		// 	verticalOffset: 0.5,
		// 	sizeRange: [0.2, 1],
		// 	massRange: [0.008, 0.8],
		// 	antiGravityFactor: 1.0,
		// 	linearDamping: 0.985
		// });

		// ====================================================================
		// EFFECTS
		// ====================================================================

		// const particleIdx = Math.floor(pathPoints.length / 2);
		// createParticles(scene, pathPoints, particleIdx, torus, { autoDispose: 60_000 });

		// ====================================================================
		// MODELS & OBSTACLES
		// ====================================================================

		// Place models using unified API
		await obstacles.place('model', {
			modelNames: ['mario'],
			count: 1,
			randomPositions: true,
			scaleRange: [4, 8],
			physics: true
		});

	

			portal = await obstacles.place('portal', {
				index: Math.floor(pathPoints.length / 2),
				posterRef: 'malunggay',
				videoRef: 'plant1',
				width: 15,
				height: 25
			}) as any;
			try {
				console.log('Placed portal:', portal?.mesh?.position ?? portal);
			} catch (e) { /* ignore logging errors */ }


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
		// if (floating && typeof floating.update === 'function') {
		// 	floating.update(dt);
		// }



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

	// Notify loading screen that scene and assets are ready
	try {
		const loadingScreen = (engine as any)?.loadingScreen;
		if (loadingScreen && typeof loadingScreen.notifyAssetsReady === 'function') {
			loadingScreen.notifyAssetsReady();
		}
	} catch (e) {
		console.warn('Failed to notify loading screen:', e);
	}

	return scene;
	}
}
