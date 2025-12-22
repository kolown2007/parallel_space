// ============================================================================
// IMPORTS
// ============================================================================

import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import HavokPhysics from '@babylonjs/havok';

// Drone
import { setupSceneDrone } from '../chronoescape/drone/setupDrone';
import { updateDronePhysics, updateFollowCamera } from '../chronoescape/drone/droneControllers';

// World & Path
import { createTorus } from '../chronoescape/world/Torus';
import { getPositionOnPath, getDirectionOnPath } from '../chronoescape/world/PathUtils';

// Obstacles & Effects
import { createFloatingCubes } from '../chronoescape/obstacle/floatingCubes';
import { ObstaclesManager } from '../chronoescape/obstacle/Obstacles';
import { BillboardManager } from '../chronoescape/obstacle/BillboardManager';
import { createSolidParticleSystem } from '../particles/solidParticleSystem';

// System
import preloadContainers, { getDefaultAssetList } from '../chronoescape/assetContainers';
import { installKeyboardControls } from '../input/keyboardControls';
import { getPhysicsWasmUrl, getTextureUrl, getModelUrl, loadAssetsConfig, getTextureUrl as _getTextureUrl } from '../assetsConfig';

// ============================================================================
// SCENE CLASS
// ============================================================================

export class WormHoleScene2 {
	// Path animation state
	static sphereProgress = 0.0;
	static sphereSpeed = 0.0001;
	static pathPoints: BABYLON.Vector3[] = [];

	// ========================================================================
	// PHYSICS SETUP
	// ========================================================================

	private static async setupPhysics(scene: BABYLON.Scene) {
		const wasmUrl = await getPhysicsWasmUrl();
		const havok = await HavokPhysics({
			locateFile: () => wasmUrl
		});
		const gravityVector = new BABYLON.Vector3(0, 0, 0);
		const havokPlugin = new BABYLON.HavokPlugin(true, havok);
		scene.enablePhysics(gravityVector, havokPlugin);
	}

	// ========================================================================
	// MAIN SCENE CREATION
	// ========================================================================

	static async CreateScene(engine: any, canvas: HTMLCanvasElement): Promise<BABYLON.Scene> {
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

		await WormHoleScene2.setupPhysics(scene);

		// ====================================================================
		// CAMERAS
		// ====================================================================

		// Camera 1: ArcRotate (free view)
		const arcCamera = new BABYLON.ArcRotateCamera(
			'camera1',
			Math.PI / 2,
			Math.PI / 4,
			10,
			BABYLON.Vector3.Zero(),
			scene
		);
		arcCamera.attachControl(canvas, true);

		// Camera 2: Follow (game view)
		const followCamera = new BABYLON.UniversalCamera('movingCamera', new BABYLON.Vector3(), scene);
		followCamera.fov = Math.PI / 2;
		followCamera.minZ = 0.0001;
		followCamera.maxZ = 10000;
		followCamera.updateUpVectorFromRotation = true;
		followCamera.rotationQuaternion = new BABYLON.Quaternion();

		// Set initial camera (follow camera = game view)
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

		// ====================================================================
		// LIGHTING & ATMOSPHERE
		// ====================================================================

		const light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 0), scene);
		light.intensity = 0.2;

		scene.fogMode = BABYLON.Scene.FOGMODE_EXP;
		scene.fogColor = new BABYLON.Color3(0.9, 0.9, 0.85);
		scene.fogDensity = 0.0001;

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
		const points = torusResult.pathPoints;
		WormHoleScene2.pathPoints = points;
		const torusMaterial = torus.material as BABYLON.StandardMaterial;

		// Debug: verify path centering
		{
			// const debugLine = BABYLON.MeshBuilder.CreateLines('pathDebug', { points }, scene);
			// debugLine.color = new BABYLON.Color3(0, 1, 1);

			const center = torus.getAbsolutePosition();
			let minRad = Number.POSITIVE_INFINITY,
				maxRad = 0;
			let minY = Number.POSITIVE_INFINITY,
				maxY = Number.NEGATIVE_INFINITY;
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
			enableDebug: true
		});

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
			onSwitchCamera: switchCameraState
		});

		// Cleanup on dispose
		scene.onDisposeObservable.add(() => {
			try {
				uninstallKeyboard();
			} catch (e) {
				/* ignore */
			}
		});

		// ====================================================================
		// OBSTACLES & MARKERS
		// ====================================================================

		const markerSize = 4;
		const indices = [
			Math.floor(points.length * 0.25),
			Math.floor(points.length * 0.5),
			Math.floor(points.length * 0.75)
		];

		// Orange marker cubes
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
			await obstacles.place('orangeCube', {
				index: idx,
				offsetY: markerSize / 2,
				physics: { mass: 0.02, shape: BABYLON.PhysicsShapeType.BOX }
			});
		}

		// Create floating cubes via helper module (keeps this scene file small)
		const floating = createFloatingCubes(scene, WormHoleScene2.pathPoints, {
			count: 3,
			jitter: 0.05,
			verticalOffset: 0.5,
			sizeRange: [0.2, 1],
			massRange: [0.008, 0.8],
			antiGravityFactor: 1.0,
			linearDamping: 0.985
		});

		// ====================================================================
		// PARTICLE EFFECTS
		// ====================================================================
		const spsFx = createSolidParticleSystem(scene, {
			particleNb: 800,
			particleSize: 1.0,
			maxDistance: 220
		});

		// choose the path point for the effect - use indices[0] if available, otherwise center point
		const spsPointIndex =
			indices && indices.length > 0 ? indices[0] : Math.floor(WormHoleScene2.pathPoints.length / 2);
		const spsPosition = WormHoleScene2.pathPoints[spsPointIndex]
			? WormHoleScene2.pathPoints[spsPointIndex].clone()
			: new BABYLON.Vector3(0, 0, 0);
		spsPosition.y += 1.2;
		spsFx.mesh.position.copyFrom(spsPosition);
		spsFx.attachTo(torus);
		spsFx.start();

		// auto-dispose after 60s (optional)
		const spsAutoHandle = window.setTimeout(() => {
			try {
				spsFx.stop();
				spsFx.dispose();
			} catch (e) {
				/* ignore */
			}
		}, 60_000);

		// ====================================================================
		// ADDITIONAL MODELS (JOLLIBEE)
		// ====================================================================

		try {
			console.log('Loading Jollibee model...');

			const cfg = await loadAssetsConfig();
			const jolli = cfg.models?.jollibee;
			const rootUrl = (jolli && jolli.rootUrl) ? jolli.rootUrl : 'https://kolown.net/assets/p1sonet/';
			const fileName = (jolli && jolli.filename) ? jolli.filename : 'jollibee.glb';
			let container: any = null;
			const pluginOptions = {
				// example glTF plugin options; adjust if you need specific behavior
				gltf: {
					// skipMaterials: false,
					// extensionOptions: { MSFT_lod: { maxLODsToLoad: 1 } }
				}
			};

			// Use the module-level loader only (no fallback to SceneLoader).
			const moduleLoader =
				(BABYLON as any).loadAssetContainerAsync || (BABYLON as any).loadAssetContainer;
			if (typeof moduleLoader !== 'function') {
				throw new Error(
					'module-level loadAssetContainerAsync not available; project requires module-level loader API'
				);
			}

			try {
				container = await moduleLoader.call(BABYLON, fileName, scene, { rootUrl, pluginOptions });
			} catch (e) {
				console.error('module-level loadAssetContainerAsync failed', e);
				throw e;
			}

			try {
				if (container && typeof container.addAllToScene === 'function') container.addAllToScene();
			} catch (e) {
				/* ignore */
			}

			let template =
				container && Array.isArray(container.meshes)
					? (container.meshes.find((m: any) => m.geometry) as BABYLON.Mesh | undefined)
					: undefined;
			if (!template) {
				template = scene.meshes.find((m) => m.geometry && /jolli|jollibee/i.test(m.name)) as
					| BABYLON.Mesh
					| undefined;
			}

			if (template) {
				try {
					template.setEnabled(false);
				} catch (e) {
					/* ignore if not applicable */
				}

				const jolliPBR = new BABYLON.PBRMaterial('jolliPBR', scene);
				jolliPBR.metallic = 0.0; // non-metal for plasticy response
				jolliPBR.roughness = 0.25; // some gloss (lower = shinier)
				jolliPBR.directIntensity = 2.0; // amplify direct lights (drone)
				jolliPBR.environmentIntensity = 1.0; // reflections from env (if set)
				jolliPBR.emissiveColor = BABYLON.Color3.Black(); // avoid neutral emissive wash
				jolliPBR.backFaceCulling = true;

				// Create instances along path
				const instanceCount = 5;
				const step = Math.floor(WormHoleScene2.pathPoints.length / instanceCount);

				for (let i = 0; i < instanceCount; i++) {
					const pos = WormHoleScene2.pathPoints[i * step].clone();
					pos.y += -1; // Lift slightly

					// Visual instance (cast template to Mesh so TS recognizes createInstance)
					const instance = (template as unknown as BABYLON.Mesh).createInstance(`jollibee_${i}`);
					instance.position.copyFrom(pos);
					instance.scaling.setAll(10); // Scale down

					instance.material = jolliPBR;

					// Physics - directly on the instance (modern approach)
					new BABYLON.PhysicsAggregate(
						instance,
						BABYLON.PhysicsShapeType.SPHERE,
						{
							mass: 0.05, // Static
							restitution: 0.3, // Bounce
							friction: 0.05
						},
						scene
					);
				}

				console.log(`Created ${instanceCount} Jollibee instances`);
			}
		} catch (error) {
			console.error('Failed to load Jollibee model:', error);
		}

		// ====================================================================
		// BILLBOARDS & FINAL SETUP
		// ====================================================================
		try {
			requestAnimationFrame(() => {
				try {
					scene.render();
				} catch (e) {
					/* ignore */
				}
				requestAnimationFrame(() => {
					try {
						scene.render();
					} catch (e) {
						/* ignore */
					}
				});
			});
		} catch (e) {
			// loader hide is handled by the main page
		}

		// create multiple textured billboard planes along the drone track (via BillboardManager)
		try {
			const tribalTex = await getTextureUrl('tribal');
			const bm = new BillboardManager(scene, {
				count: 3,
				size: { width: 30, height: 30 },
				textureUrl: tribalTex || '/tribal.png',
				parent: torus
			});
			await bm.createAlongPath(WormHoleScene2.pathPoints);
		} catch (e) {
			console.warn('Failed to create billboards', e);
		}

		// Initial render pass
		try {
			requestAnimationFrame(() => {
				try {
					scene.render();
				} catch (e) {
					/* ignore */
				}
				requestAnimationFrame(() => {
					try {
						scene.render();
					} catch (e) {
						/* ignore */
					}
				});
			});
		} catch (e) {
			// Loader hide is handled by the main page
		}

		// ====================================================================
		// RENDER LOOP
		// ====================================================================

		scene.registerBeforeRender(() => {
			const dt = engine.getDeltaTime() / 1000;

			// Update floating cubes
			if (floating && typeof floating.update === 'function') {
				floating.update(dt);
			}

			// Update path progress
			WormHoleScene2.sphereProgress += WormHoleScene2.sphereSpeed;
			if (WormHoleScene2.sphereProgress > 1) {
				WormHoleScene2.sphereProgress = 0;
			}

			// Update drone physics
			updateDronePhysics(
				drone,
				droneAggregate,
				WormHoleScene2.pathPoints,
				WormHoleScene2.sphereProgress,
				keysPressed
			);

			// Update follow camera
			if (scene.activeCamera === followCamera) {
				updateFollowCamera(
					followCamera,
					drone,
					WormHoleScene2.pathPoints,
					WormHoleScene2.sphereProgress,
					gimbal
				);
			}
		});

		return scene;
	}
}
