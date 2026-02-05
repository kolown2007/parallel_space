
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

// Drone
import { setupSceneDrone } from '../chronoescape/drone/setupDrone';
import { getPositionOnPath } from '../chronoescape/world/PathUtils';

// World & Utilities
import { createTorus } from '../chronoescape/world/Torus';
import { setupPhysics, setupLighting, setupCameras } from '../chronoescape/world/sceneUtils';
import { visualizePathDebug } from '../chronoescape/world/debugPath';

// Obstacles
import { ObstacleManager } from '../chronoescape/obstacle/ObstacleManager';

// System
import preloadContainers, { getDefaultAssetList } from '../chronoescape/assetContainers';
import { installKeyboardControls } from '../input/keyboardControls';
import { randomFrom } from '../assetsConfig';
import { updateProgress, cleanupDroneControl } from '../stores/droneControl.svelte.js';
import { sceneRefStore } from '../stores/sceneRefStore';
import { registerScene, unregisterScene } from '../core/SceneRegistry';
import { initRealtimeControl } from '../services/RealtimeControl';

// Scores
import { startAmbient, resumeAudioOnGesture } from '$lib/scores/ambient';

// Scene modules
import { WORMHOLE2_CONFIG } from './wormhole2/wormhole2.config';
import { getDronePathIndexFactory } from './wormhole2/wormhole2.helpers';
import { createKeyboardHandlers } from './wormhole2/wormhole2.keyboard';
import { setupDroneCollision } from './wormhole2/wormhole2.collision';
import { createRenderLoop } from './wormhole2/wormhole2.render';

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

		const cfg = WORMHOLE2_CONFIG;
		const torusResult = await createTorus(scene, {
			diameter: cfg.torus.diameter,
			thickness: cfg.torus.thickness,
			tessellation: cfg.torus.tessellation,
			positionY: cfg.torus.positionY,
			lineRadiusFactor: cfg.torus.lineRadiusFactor,
			turns: cfg.torus.turns,
			spiralTurns: cfg.torus.spiralTurns,
			segments: cfg.torus.segments,
			pointsPerCircle: cfg.torus.pointsPerCircle,
			emissiveIntensity: cfg.torus.emissiveIntensity,
			materialTextureId: randomFrom('collage1')
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
			...cfg.debug.pathVisualization,
			torusCenter: torus.getAbsolutePosition(),
			torusMainRadius,
			torusTubeRadius
		});

		// ====================================================================
		// DRONE: LOADING & SETUP
		// ====================================================================

		const initialPosition = getPositionOnPath(WormHoleScene2.pathPoints, cfg.drone.startPathPoint);
		let drone: any, droneAggregate: any;
		{
			const res = await setupSceneDrone(scene, {
				assetId: 'drone',
				initialPosition: initialPosition,
				initialRotation: new BABYLON.Vector3(
					cfg.drone.initialRotation.x,
					cfg.drone.initialRotation.y,
					cfg.drone.initialRotation.z
				),
				mass: cfg.drone.mass,
				restitution: cfg.drone.restitution,
				friction: cfg.drone.friction,
				glowIntensity: cfg.drone.glowIntensity,
				glowSubmeshIndex: 0,
				enableDebug: cfg.debug.enableDroneDebug
			});
			drone = res.drone;
			droneAggregate = res.droneAggregate;

		

			if (drone.material && drone.material instanceof BABYLON.StandardMaterial) {
				const mat = drone.material as BABYLON.StandardMaterial;
				mat.emissiveColor = new BABYLON.Color3(
					cfg.drone.emissiveColor.r,
					cfg.drone.emissiveColor.g,
					cfg.drone.emissiveColor.b
				);
				mat.diffuseColor = new BABYLON.Color3(
					cfg.drone.diffuseColor.r,
					cfg.drone.diffuseColor.g,
					cfg.drone.diffuseColor.b
				);
			}
		}

		// Ensure drone always starts at pathpoint 0
		try {
			updateProgress(0);
			const startPos = getPositionOnPath(WormHoleScene2.pathPoints, cfg.drone.startPathPoint);
			drone.position.copyFrom(startPos);
			if (droneAggregate?.body) {
				try {
					droneAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
					droneAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
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
		const cleanupCollision = setupDroneCollision(droneAggregate);
		WormHoleScene2.registerCleanup(cleanupCollision);

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

		followCamera.position = drone.position.add(new BABYLON.Vector3(
			0,
			cfg.camera.initialOffsetY,
			cfg.camera.initialOffsetZ
		));

		const gimbal = {
			followDistance: cfg.camera.followDistance,
			followHeight: cfg.camera.followHeight,
			positionSmooth: cfg.camera.positionSmooth,
			rotationSmooth: cfg.camera.rotationSmooth,
			lookAheadDistance: cfg.camera.lookAheadDistance
		};

		// OBSTACLES & MARKERS
		// ====================================================================

		const obstacles = new ObstacleManager(scene, pathPoints, WormHoleScene2.modelCache, WormHoleScene2.cleanupRegistry);

		// Helper: compute nearest path point index for drone (defined early for keyboard handlers)
		const getDronePathIndex = getDronePathIndexFactory(drone, pathPoints);

		// Portal state management (support multiple portals)
		let portals: any[] = [];
		const getPortal = () => portals;
		const setPortal = (p: any, remove = false) => {
			try {
				if (typeof remove === 'boolean' && remove && p) {
					portals = portals.filter(x => x !== p);
					return;
				}
				if (!p) {
					portals = [];
					return;
				}
				if (Array.isArray(p)) portals.push(...p);
				else portals.push(p);
			} catch (e) { /* ignore */ }
		};

		// Install keyboard handlers
		const keyboardHandlers = createKeyboardHandlers({
			drone,
			droneAggregate,
			torusMaterial,
			obstacles,
			getDronePathIndex,
			switchCamera,
			onPortalTrigger,
			setPortal,
			pathPoints
		});

		const uninstallKeyboard = installKeyboardControls(keyboardHandlers);
		WormHoleScene2.registerCleanup(() => uninstallKeyboard());
		WormHoleScene2.registerCleanup(() => cleanupDroneControl(false));

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
		}, cfg.debug.droneLogIntervalMs);
		WormHoleScene2.registerCleanup(() => clearInterval(_dronePosLogger));

		// Cleanup on dispose
		// ====================================================================
		scene.onDisposeObservable.add(() => {
			WormHoleScene2.disposeAll();
		});

		// ====================================================================
		// MODELS & OBSTACLES
		// ====================================================================

		// Place models using unified API (delayed)
		setTimeout(async () => {
			try {
				// Place multiple models using a for-loop for easy configuration
				try {
					const modelIndices = [ 0,150];
					for (const mi of modelIndices) {
						try {
							await obstacles.place('model', {
								modelNames: [randomFrom('jollibee', 'rabbit', 'mario','army','armycatbike','manikineko')],
								count: 1,
								index: mi,
								offsetY: -1,
								scaleRange: [4, 8],
								physics: true
							});
							console.log('Placed model at index', mi);
						} catch (e) {
							console.warn('Failed to place model at index', mi, e);
						}
					}
				} catch (e) {
					console.warn('Model placement loop failed:', e);
				}

				// Place billboards and move them to explicit path indices
				try {
					const indices = [10, 60, 110, 160, 210, 260];
					const bbManager = await obstacles.place('billboard', {
						count: indices.length,
						height: 8,
						// pass an array so each billboard can resolve a random texture independently
						textureId: ['collage1','tribal','metal'],
					}) as any;

					// Reposition planes to requested path indices
					for (let i = 0; i < indices.length; i++) {
						try {
							const idx = ((indices[i] % pathPoints.length) + pathPoints.length) % pathPoints.length;
							const pos = pathPoints[idx].clone();
							// match internal BillboardManager offset (creates at +1.5)
							pos.y += 1.5;
							if (bbManager && bbManager.planes && bbManager.planes[i]) {
								bbManager.planes[i].position.copyFrom(pos);
							}
						} catch (e) {
							console.warn('Failed to reposition billboard plane', i, e);
						}
					}
					console.log('Placed billboards at indices', indices);
				} catch (e) {
					console.warn('Billboard placement failed:', e);
				}

				

				

			try {




			try {
				const portalIndices = [50, 200, 300];
				let firstPortal: any = undefined;
				for (const pi of portalIndices) {
					try {
						const p = await obstacles.place('portal', {
							index: pi,
							posterTextureId: randomFrom('portal1','portal2'),
							width: WORMHOLE2_CONFIG.obstacles.portalWidth,
							height: WORMHOLE2_CONFIG.obstacles.portalHeight,
							offsetY: 0,
							onTrigger: () => {
								try { onPortalTrigger?.(); } catch (e) {}
							}
						}) as any;
						if (!firstPortal) {
							firstPortal = p;
						}
						// Register every placed portal so collision checks see them all
						setPortal(p);
						console.log('🌀 Portal placed at index', pi);
					} catch (pErr) {
						console.warn('Portal placement failed at index', pi, pErr);
					}
				}
			} catch (e) {
				console.warn('Portal placement loop failed:', e);
			}


			  
				
			} catch (orbErr) {
				console.warn('Orb placement failed:', orbErr);
			}

                try {
                    console.log('Placed models');
                } catch (e) { /* ignore logging errors */ }
            } catch (e) {
                console.warn('Delayed model/portal placement failed:', e);
            }
        }, 0);

	// ====================================================================
	// RENDER LOOP
	// ====================================================================

	const renderLoop = createRenderLoop({
		engine,
		scene,
		drone,
		droneAggregate,
		followCamera,
		pathPoints,
		obstacles,
		getPortal,
		setPortal,
		onPortalTrigger,
		getDronePathIndex,
		keysPressed: keyboardHandlers.keysPressed,
		gimbal,
		torusGeometry: { torusCenter, torusMainRadius, torusTubeRadius }
	});
 
	scene.registerBeforeRender(renderLoop);
	WormHoleScene2.registerCleanup(() => {
		try { scene.unregisterBeforeRender(renderLoop); } catch {}
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
