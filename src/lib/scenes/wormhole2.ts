
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';


import { setupSceneDrone } from '../chronoescape/drone/setupDrone';
import { getPositionOnPath } from '../chronoescape/world/PathUtils';
import { createTorus } from '../chronoescape/world/Torus';
import { setupPhysics, setupLighting, setupCameras } from '../chronoescape/world/sceneUtils';
import { visualizePathDebug } from '../chronoescape/world/debugPath';
import { ObstacleManager } from '../chronoescape/obstacle/ObstacleManager';
import { installKeyboardControls } from '../input/keyboardControls';
import { randomFrom, getTextureUrl } from '../assetsConfig';
import { updateProgress, cleanupDroneControl,droneControl,displaySpeed,droneEvents } from '../stores/droneControl.svelte.js';
import { sceneRefStore } from '../stores/sceneRefStore';
import { registerScene, unregisterScene } from '../core/SceneRegistry';
import { initRealtimeControl } from '../services/RealtimeControl';
import { setOnRevolutionComplete } from '../stores/droneRevolution';
import { startAmbient, resumeAudioOnGesture, stopAmbient } from '$lib/scores/ambient';
import { WORMHOLE2_CONFIG } from './wormhole2/wormhole2.config';
import { getDronePathIndexFactory } from './wormhole2/wormhole2.helpers';
import { createKeyboardHandlers } from './wormhole2/wormhole2.keyboard';
import { setupDroneCollision } from './wormhole2/wormhole2.collision';
import { createRenderLoop } from './wormhole2/wormhole2.render';



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
		for (const container of this.modelCache.values()) {
			try { container.dispose(); } catch (e) { console.warn('Model cache disposal error:', e); }
		}
		this.modelCache.clear();
		try { stopAmbient(); } catch (e) { console.warn('stopAmbient error:', e); }
	}

	static async CreateScene(engine: any, canvas: HTMLCanvasElement, onPortalTrigger?: () => void): Promise<BABYLON.Scene> {
		// Reset static state from any previous scene creation
		WormHoleScene2.cleanupRegistry = [];
		WormHoleScene2.modelCache.clear();
		WormHoleScene2.pathPoints = [];

		const cfg = WORMHOLE2_CONFIG;
		const scene = new BABYLON.Scene(engine);

		await setupPhysics(scene);

		const { followCamera, switchCamera } = setupCameras(scene, canvas, 'follow');
		setupLighting(scene);

		startAmbient().catch(() => {});
		resumeAudioOnGesture(canvas);

		// Torus track
		const { torus, torusMainRadius, torusTubeRadius, pathPoints } = await createTorus(scene, {
			...cfg.torus,
			materialTextureId: randomFrom('collage1')
		});
		WormHoleScene2.pathPoints = pathPoints;
		const torusCenter = torus.getAbsolutePosition();
		const torusMaterial = torus.material as BABYLON.StandardMaterial;

		// Texture pool for revolution changes
		const textureIds = ['loading3', 'rag', 'mat', 'cube3', 'collage1', 'wood'];
		const texturePool = new Map<string, BABYLON.Texture>();
		await Promise.all(textureIds.map(async id => {
			try {
				const url = await getTextureUrl(id);
				if (url) texturePool.set(id, new BABYLON.Texture(url, scene, false));
			} catch { /* skip failed textures */ }
		}));

		setOnRevolutionComplete(() => {
			const tex = texturePool.get(randomFrom(...textureIds));
			if (torusMaterial && tex) torusMaterial.diffuseTexture = tex;
		});
		WormHoleScene2.registerCleanup(() => {
			texturePool.forEach(t => { try { t.dispose(); } catch {} });
			texturePool.clear();
		});

		visualizePathDebug(scene, pathPoints, {
			...cfg.debug.pathVisualization,
			torusCenter,
			torusMainRadius,
			torusTubeRadius
		});

		scene.onDisposeObservable.add(() => WormHoleScene2.disposeAll());

		


		// Portal state
		let portals: any[] = [];
		const getPortal = () => portals;
		const setPortal = (p: any, remove = false) => {
			if (remove && p) { portals = portals.filter(x => x !== p); return; }
			if (!p) { portals = []; return; }
			portals.push(...(Array.isArray(p) ? p : [p]));
		};

		// Obstacles (placed before drone to avoid being selected as template)
		const obstacles = new ObstacleManager(scene, pathPoints, WormHoleScene2.modelCache, WormHoleScene2.cleanupRegistry);
		let getDronePathIndex: () => number = () => 0;

		// Models
		for (const index of [0, 80, 100, 150, 200]) {
			try {
				await obstacles.place('model', {
					modelNames: [randomFrom('jollibee', 'rabbit', 'mario', 'army', 'armycatbike', 'manikineko')],
					count: 1, index, offsetY: -20, scaleRange: [10, 15], physics: false
				});
			} catch (e) { console.warn('Failed to place model at index', index, e); }
		}
		try {
			await obstacles.place('model', {
				modelNames: ['jollibee,'], count: 1, index: 25, offsetY: -1, scaleRange: [5, 7], physics: true
			});
		} catch (e) { console.warn('Failed to place physics Jollibee:', e); }

		// Billboards
		try {
			const bbIndices = [10, 20, 60, 80, 110, 160, 210, 260, 280, 310];
			const bbManager = await obstacles.place('billboard', {
				count: bbIndices.length,
				height: 15,
				textureId: ['tribal', 'billboard1', 'billboard2', 'billboard3', 'billboard4', 'billboard5', 'billboard6'],
			}) as any;
			for (let i = 0; i < bbIndices.length; i++) {
				const idx = ((bbIndices[i] % pathPoints.length) + pathPoints.length) % pathPoints.length;
				const pos = pathPoints[idx].clone();
				pos.y += 1.5;
				if (bbManager?.planes?.[i]) bbManager.planes[i].position.copyFrom(pos);
			}
		} catch (e) { console.warn('Billboard placement failed:', e); }

		// Portals
		// for (const index of [50, 200, 300]) {
		// 	try {
		// 		const p = await obstacles.place('portal', {
		// 			index,
		// 			posterTextureId: randomFrom('portal1', 'portal2'),
		// 			width: cfg.obstacles.portalWidth,
		// 			height: cfg.obstacles.portalHeight,
		// 			offsetY: 0,
		// 			onTrigger: () => { try { onPortalTrigger?.(); } catch {} }
		// 		}) as any;
		// 		setPortal(p);
		// 	} catch (e) { console.warn('Portal placement failed at index', index, e); }
		// }

		// Drone (created after obstacles)
		let drone: any, droneAggregate: any;
		const droneStartPos = getPositionOnPath(WormHoleScene2.pathPoints, cfg.drone.startPathPoint);

		try {
			const res = await setupSceneDrone(scene, {
				assetId: 'drone2',
				initialPosition: droneStartPos,
				initialRotation: new BABYLON.Vector3(cfg.drone.initialRotation.x, cfg.drone.initialRotation.y, cfg.drone.initialRotation.z),
				mass: cfg.drone.mass,
				restitution: cfg.drone.restitution,
				friction: cfg.drone.friction,
				enableDebug: cfg.debug.enableDroneDebug,
				scale: 1
			});
			drone = res.drone;
			droneAggregate = res.droneAggregate;

			if (drone.material instanceof BABYLON.StandardMaterial) {
				const mat = drone.material as BABYLON.StandardMaterial;
				mat.emissiveColor = new BABYLON.Color3(cfg.drone.emissiveColor.r, cfg.drone.emissiveColor.g, cfg.drone.emissiveColor.b);
				mat.diffuseColor = new BABYLON.Color3(cfg.drone.diffuseColor.r, cfg.drone.diffuseColor.g, cfg.drone.diffuseColor.b);
			}

			updateProgress(0);
			drone.position.copyFrom(droneStartPos);
			if (droneAggregate?.body) {
				try {
					droneAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
					droneAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
					(droneAggregate.body as any).setPosition?.({ x: droneStartPos.x, y: droneStartPos.y, z: droneStartPos.z });
				} catch { /* ignore transient physics positioning errors */ }
			}

			WormHoleScene2.registerCleanup(setupDroneCollision(droneAggregate));

			try {
				const sceneId = registerScene(scene, drone, WormHoleScene2.pathPoints);
				sceneRefStore.set({ sceneId, droneId: sceneId });
				WormHoleScene2.registerCleanup(() => {
					sceneRefStore.set({ sceneId: null, droneId: null });
					unregisterScene(sceneId);
				});
			} catch (e) { console.warn('Failed to set sceneRefStore:', e); }

			getDronePathIndex = getDronePathIndexFactory(drone, pathPoints);

			followCamera.position = drone.position.add(new BABYLON.Vector3(0, cfg.camera.initialOffsetY, cfg.camera.initialOffsetZ));
			const gimbal = {
				followDistance: cfg.camera.followDistance,
				followHeight: cfg.camera.followHeight,
				positionSmooth: cfg.camera.positionSmooth,
				rotationSmooth: cfg.camera.rotationSmooth,
				lookAheadDistance: cfg.camera.lookAheadDistance
			};

			const keyboardHandlers = createKeyboardHandlers({
				drone, droneAggregate, torusMaterial, obstacles,
				getDronePathIndex, switchCamera, onPortalTrigger, setPortal, pathPoints
			});
			WormHoleScene2.registerCleanup(installKeyboardControls(keyboardHandlers));
			WormHoleScene2.registerCleanup(() => cleanupDroneControl(false));

			// Auto-place cubes every 3 seconds
			const autoCubeInterval = setInterval(() => {
				keyboardHandlers.onPlaceCube?.();
			}, 3000);
			WormHoleScene2.registerCleanup(() => clearInterval(autoCubeInterval));

			// Touch: tap anywhere on canvas = burst (same as keyboard B)
			const onTap = (e: TouchEvent) => {
				e.preventDefault();
				keyboardHandlers.onBurst?.();
			};
			canvas.addEventListener('touchstart', onTap, { passive: false });
			WormHoleScene2.registerCleanup(() => canvas.removeEventListener('touchstart', onTap));

			const dronePosLogger = setInterval(() => {
				// getDronePathIndex(); // Uncomment to enable debug position logging
			}, cfg.debug.droneLogIntervalMs);
			WormHoleScene2.registerCleanup(() => clearInterval(dronePosLogger));

			const renderLoop = createRenderLoop({
				engine, scene, drone, droneAggregate, followCamera, pathPoints,
				obstacles, getPortal, setPortal, onPortalTrigger, getDronePathIndex,
				keysPressed: keyboardHandlers.keysPressed, gimbal,
				torusGeometry: { torusCenter, torusMainRadius, torusTubeRadius }
			});
			scene.registerBeforeRender(renderLoop);
			WormHoleScene2.registerCleanup(() => { try { scene.unregisterBeforeRender(renderLoop); } catch {} });

		} catch (e) {
			console.warn('Drone setup failed:', e);
		}

		try {
			(engine as any)?.loadingScreen?.notifyAssetsReady?.();
		} catch (e) { console.warn('Failed to notify loading screen:', e); }

		try {
			const realtimeConnection = await initRealtimeControl({ scene, droneMesh: drone, onPortalTrigger, setPortal });
			WormHoleScene2.registerCleanup(() => {
				try { realtimeConnection.disconnect(); } catch (e) { console.warn('Realtime disconnect error:', e); }
			});
		} catch (e) { console.warn('Failed to initialize realtime control:', e); }

		return scene;
	}
}
