
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
import { ObstacleManager } from '../chronoescape/obstacle/ObstacleManager';

// System
import preloadContainers, { getDefaultAssetList } from '../chronoescape/assetContainers';
import { installKeyboardControls } from '../input/keyboardControls';
import { getTextureUrl, getModelUrl, loadAssetsConfig } from '../assetsConfig';
import { droneControl, updateProgress, adjustDroneSpeed, hitCollision, enterPortal, burstAccelerate, cleanupDroneControl, type DroneControlState } from '../stores/droneControl.svelte.js';
import { sceneRefStore } from '../stores/sceneRefStore';
import { revolutionStore } from '../stores/droneRevolution';
import { get } from 'svelte/store';
import { registerScene, unregisterScene } from '../core/SceneRegistry';
import { initRealtimeControl } from '../services/RealtimeControl';

//scores
import { startAmbient, stopAmbient, playCollisionNote, resumeAudioOnGesture,playCollisionNoteSingle } from '$lib/scores/ambient'

// Debounce repeated quick collisions on the same obstacle (ms)
const HIT_DEBOUNCE_MS = 500
const obstacleLastHit = new Map<any, number>()

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
			
				startAmbient().catch(() => {});
				resumeAudioOnGesture(canvas);

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
			tessellation: 100,
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
		const torusCenter = torus.getAbsolutePosition();
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
			restitution: 0.6,
			friction: 0.1,
			glowIntensity: 0.2,
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
					// Try several places for the collided transform node depending on physics backend
					const collidedMesh = collisionEvent.collidedAgainst?.transformNode
						|| collisionEvent.other?.transformNode
						|| collisionEvent.otherBody?.transformNode
						|| collisionEvent.transformNode
						|| collisionEvent.hitMesh
						|| collisionEvent.mesh
						|| null;
					const collidedName = collidedMesh?.name || (collisionEvent.collidedAgainst?.name) || 'unknown';
					
					if (!collidedMesh) {
						console.debug('Collision event without transformNode, event:', collisionEvent);
						return; // nothing we can match to
					}
					
					const nameLower = collidedName.toLowerCase();
					// Treat named model instances, floating hover boxes, billboards, and placed cubes as obstacles
					const isObstacle = nameLower.includes('model_instance')
						|| nameLower.includes('hoverbox')
						|| nameLower.includes('billboard')
						|| nameLower.includes('obstacle_cube');
					
					if (isObstacle) {
						// debounce repeated hits on the same mesh
						const meshKey = collidedMesh.uniqueId ?? collidedMesh.id ?? collidedName
						const now = Date.now()
						const last = obstacleLastHit.get(meshKey) || 0
						if (now - last < HIT_DEBOUNCE_MS) {
							return
						}
						obstacleLastHit.set(meshKey, now)

						console.log(`✨ Drone hit obstacle: ${collidedName}`);
						hitCollision({ percent: 0.2 }); // reduce speed by 20%

						// Trigger collision sound based on drone speed (0-1 normalized)
						const state = get(droneControl);
						const velocity = Math.min(state.speed / 0.0002, 1.0); // MAX_PROGRESS_SPEED = 0.0002
						if (nameLower.includes('obstacle_cube')) {
							// play single random key for simple box collisions
							playCollisionNoteSingle(velocity);
						} else {
							playCollisionNote(velocity);
						}
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

		// Publish lightweight references: register heavy objects elsewhere and store IDs
		try {
			const sceneId = registerScene(scene, drone, WormHoleScene2.pathPoints);
			sceneRefStore.set({ sceneId, droneId: sceneId, pathPoints: WormHoleScene2.pathPoints });
			WormHoleScene2.registerCleanup(() => {
				try {
					sceneRefStore.set({ sceneId: null, droneId: null, pathPoints: null });
					unregisterScene(sceneId);
				} catch (e) {}
			});
		} catch (e) {
			console.warn('Failed to set sceneRefStore:', e);
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
				// reset revolution counter as well
				try { revolutionStore.reset(); } catch (e) {}
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
			onBurst: () => {
				burstAccelerate(5, 500);
				console.log('🚀 Burst acceleration activated!');
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
		
		// Register drone control cleanup (burst timers etc)
		WormHoleScene2.registerCleanup(() => cleanupDroneControl(false));


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
				// console.log('Drone @ point', currentPointIndex, '/', pathPoints.length, '| xyz:', { x: p.x.toFixed(2), y: p.y.toFixed(2), z: p.z.toFixed(2) });
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

		const obstacles = new ObstacleManager(scene, pathPoints, WormHoleScene2.modelCache, WormHoleScene2.cleanupRegistry);

		let lastLoggedLoops = 0;

		let portal: any | undefined;

		// ====================================================================
		// MODELS & OBSTACLES
		// ====================================================================

		// Place models using unified API (delayed)
		setTimeout(async () => {
			try {
				await obstacles.place('model', {
					modelNames: ['mario', 'jollibee'],
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
					console.log('Placed models + portal');
				} catch (e) { /* ignore logging errors */ }
			} catch (e) {
				console.warn('Delayed model/portal placement failed:', e);
			}
		}, 0);


	// ====================================================================
	// RENDER LOOP
	// ====================================================================

	scene.registerBeforeRender(() => {
		const dt = engine.getDeltaTime() / 1000;

		// Read current drone control state
		const control = get(droneControl);

		// Portal collision check (approximate USB AABB from drone position)
		if (portal && onPortalTrigger) {
			try {
				const usbAabb = {
					min: { x: drone.position.x - 0.5, y: drone.position.y - 0.5, z: drone.position.z - 0.5 },
					max: { x: drone.position.x + 0.5, y: drone.position.y + 0.5, z: drone.position.z + 0.5 }
				};
				if (portal.intersects(usbAabb)) {
					enterPortal(); // set speed to zero
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

		// Record loop progress for revolution counter and log when a full loop completes
		try {
			revolutionStore.updateFromPathFraction(newProgress);
			const loops = get(revolutionStore).loopsCompletedCount;
			if (loops !== lastLoggedLoops) {
				console.log(`Drone completed loop(s): ${loops}`);
				lastLoggedLoops = loops;
			}
		} catch (e) { /* ignore if store missing */ }

		// Update drone physics with lateral force from store
		updateDronePhysics(
			drone,
			droneAggregate,
			WormHoleScene2.pathPoints,
			control.progress,
			keysPressed,
			{ lateralForce: control.lateralForce, maxFollowSpeed: 5 }
		);

		// Update follow camera
		if (scene.activeCamera === followCamera) {
			updateFollowCamera(
				followCamera,
				drone,
				WormHoleScene2.pathPoints,
				control.progress,
				gimbal,
				{ torusCenter, torusMainRadius, torusTubeRadius, margin: 0.9 }
			);
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

	// Initialize realtime control (websocket)
	try {
		const realtimeConnection = await initRealtimeControl({
			scene,
			droneMesh: drone
		});
		WormHoleScene2.registerCleanup(() => {
			try {
				realtimeConnection.disconnect();
			} catch (e) {
				console.warn('Realtime disconnect error:', e);
			}
		});
		console.log('🌐 Realtime control enabled');
	} catch (e) {
		console.warn('Failed to initialize realtime control:', e);
	}

	return scene;
	}
}
