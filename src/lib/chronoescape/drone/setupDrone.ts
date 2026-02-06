import * as BABYLON from '@babylonjs/core';
import {
	createDrone,
	createDroneMaterial,
	attachDroneLight,
	debugPhysicsAggregate,
	type DroneResult
} from './DroneProp';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** Complete result from drone setup */
export interface DroneSetupResult {
	/** The main drone mesh (used for physics) */
	drone: BABYLON.Mesh;
	/** Visual mesh if different from physics mesh */
	droneVisual?: BABYLON.Mesh;
	/** Physics aggregate for collision/movement (may be undefined if creation failed) */
	droneAggregate?: BABYLON.PhysicsAggregate;
	/** Material applied to the drone */
	droneMaterial: BABYLON.StandardMaterial;
	/** Point light attached to the drone */
	/** Light attached to the drone (point/spot/rect visual) */
	droneLight: BABYLON.Light;
	/** Toggle helpers removed: glow handled by material/light only */
}

/** Options for drone setup */
export interface DroneSetupOptions {
	/** Asset ID to load from assets.json (e.g., 'drone', 'spacecraft') */
	assetId?: string;
	/** Direct URL to GLB file (overrides assetId) */
	glbUrl?: string;
	/** Initial position in world space */
	initialPosition?: BABYLON.Vector3;
	/** Initial rotation in radians */
	initialRotation?: BABYLON.Vector3;
	/** Physics mass (default: 2) */
	mass?: number;
	/** Physics collision shape type (default: BOX) */
	physicsShape?: BABYLON.PhysicsShapeType;
	/** Physics restitution/bounciness (default: 1) */
	restitution?: number;
	/** Physics friction (default: 0.3) */
	friction?: number;
	/** Uniform scale to apply to the loaded model (overrides targetSize) */
	scale?: number;
	/** Target maximum dimension (meters) to normalize the model to (used when `scale` not provided) */
	targetSize?: number;
	/** Optional primary emissive color for the drone material */
	primaryColor?: BABYLON.Color3;
	/** Optional secondary emissive color for the second mesh/subMesh */
	secondaryColor?: BABYLON.Color3;
	/** Reduce CPU work during setup (skip bounding-box normalization and physics) */
	lowCpuMode?: boolean;
	/** (Glow removed) */
	/** Enable debug physics visualization (default: false) */
	enableDebug?: boolean;
	/** If true, attach a small rectangular-style light to the drone (visual plane + short-range spot) */
	rectangularLight?: boolean;
	/** Range for the attached light when using rectangularLight (default: 3) */
	lightRange?: number;
}

// ============================================================================
// MAIN SETUP FUNCTION
// ============================================================================

/**
 * Create and fully configure a drone with physics, materials, glow, and lighting.
 * This is the main entry point for drone creation - consolidates all setup into a single call.
 * 
 * @param scene - The Babylon.js scene
 * @param options - Configuration options
 * @returns Promise resolving to complete drone setup result
 * 
 * @example
 * ```typescript
 * // Using asset ID (recommended)
 * const result = await setupSceneDrone(scene, {
 *   assetId: 'drone',
 *   initialPosition: new BABYLON.Vector3(0, 1, 0),
 *   glowIntensity: 0.5
 * });
 * 
 * // Using direct GLB URL
 * const result = await setupSceneDrone(scene, {
 *   glbUrl: '/models/custom-ship.glb',
 *   mass: 5
 * });
 * 
 * // Toggle glow at runtime
 * result.toggleGlow(false); // off
 * result.toggleGlow(true);  // on
 * result.setGlowIntensity(0.8); // adjust intensity
 * ```
 */
export async function setupSceneDrone(
	scene: BABYLON.Scene,
	options: DroneSetupOptions = {}
): Promise<DroneSetupResult> {
	const {
		assetId,
		glbUrl,
		initialPosition = BABYLON.Vector3.Zero(),
		initialRotation = new BABYLON.Vector3(0, 0, -Math.PI / 2),
			mass = 2,
			physicsShape = BABYLON.PhysicsShapeType.BOX,
			restitution = 1,
			friction = 0.3,
			enableDebug = false,
			// rectangularLight = true,
			// lightRange = 3.0
	} = options;



	// -------------------------------------------------------------------------
	// 1. RESOLVE GLB URL
	// -------------------------------------------------------------------------
	const resolvedGlbUrl = await resolveGlbUrl(assetId, glbUrl);

	// -------------------------------------------------------------------------
	// 2. LOAD DRONE MESH
	// -------------------------------------------------------------------------
	const droneResult = await createDrone(scene, resolvedGlbUrl) as any;
	let drone: BABYLON.Mesh = droneResult.drone;
	let droneVisual: BABYLON.Mesh | undefined = droneResult.droneVisual;

	drone.position.copyFrom(initialPosition);
	drone.rotation.copyFrom(initialRotation);

	// -------------------------------------------------------------------------
	// 3. APPLY SCALING (optional) + CREATE PHYSICS AFTER SCALING
	// -------------------------------------------------------------------------
	let droneAggregate: BABYLON.PhysicsAggregate | undefined;

	// Determine scale factor: explicit `scale` wins, otherwise normalize to `targetSize` if provided
	const scaleFactor = ((): number => {
		if (typeof options.scale === 'number') return options.scale;
		if (typeof options.targetSize !== 'number') return 1;

		try {
			const meshesToCheck: BABYLON.Mesh[] = [];
			if (droneVisual) meshesToCheck.push(droneVisual);
			else meshesToCheck.push(drone);

			let minX = Infinity, minY = Infinity, minZ = Infinity;
			let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

			for (const m of meshesToCheck) {
				try {
					m.computeWorldMatrix(true);
					const bi = m.getBoundingInfo();
					const min = bi.boundingBox.minimumWorld;
					const max = bi.boundingBox.maximumWorld;
					minX = Math.min(minX, min.x);
					minY = Math.min(minY, min.y);
					minZ = Math.min(minZ, min.z);
					maxX = Math.max(maxX, max.x);
					maxY = Math.max(maxY, max.y);
					maxZ = Math.max(maxZ, max.z);
				} catch (e) {
					/* ignore per-mesh errors */
				}
			}

			const sizeX = maxX - minX;
			const sizeY = maxY - minY;
			const sizeZ = maxZ - minZ;
			const maxDimension = Math.max(sizeX, sizeY, sizeZ);
			if (maxDimension > 0) {
				return options.targetSize! / maxDimension;
			}
		} catch (e) {
			console.warn('Failed to compute targetSize normalization for drone:', e);
		}
		return 1;
	})();

	if (scaleFactor !== 1) {
		try {
			drone.scaling.setAll(scaleFactor);
			if (droneVisual) droneVisual.scaling.setAll(scaleFactor);
			console.log(`↳ Applied drone scaleFactor=${scaleFactor.toFixed(3)}`);
		} catch (e) {
			console.warn('Failed to apply drone scale:', e);
		}
	}

	// Now create physics aggregate so collision shape matches visual scale
	try {
		droneAggregate = new BABYLON.PhysicsAggregate(
			drone,
			physicsShape,
			{ mass, restitution, friction },
			scene
		);
	} catch (e) {
		console.warn('Failed to create drone physics aggregate:', e);
		droneAggregate = undefined;
	}

	// -------------------------------------------------------------------------
	// 4. DEBUG VISUALIZATION (optional)
	// -------------------------------------------------------------------------
	if (enableDebug) {
		try {
			const debugBox = debugPhysicsAggregate(scene, droneAggregate, drone, {
				color: new BABYLON.Color3(1, 0.2, 0.2),
				wireframe: true
			});
			if (debugBox) {
				console.log('✓ Physics debug visualization created');
			}
		} catch (e) {
			console.warn('Failed to create physics debug:', e);
		}
	}

	// -------------------------------------------------------------------------
	// 5. APPLY MATERIAL (support per-subMesh coloring)
	// -------------------------------------------------------------------------
	const primaryMat = createDroneMaterial(scene, options.primaryColor ?? new BABYLON.Color3(0.1, 0.6, 1.0));
	const secondaryMat = createDroneMaterial(scene, options.secondaryColor ?? new BABYLON.Color3(0.66, 0.66, 0.68));

	const merged = (droneVisual ?? drone) as BABYLON.Mesh;

	try { (primaryMat as any).backFaceCulling = true; } catch {}
	try { (secondaryMat as any).backFaceCulling = true; } catch {}

	// If mesh already contains subMeshes (typical when MergeMeshes preserved them),
	// create a MultiMaterial and map subMeshes to the two materials.
	const subs = (merged as any).subMeshes as BABYLON.SubMesh[] | undefined;
	if (subs && subs.length > 1) {
		const MultiMat = (BABYLON as any).MultiMaterial as typeof BABYLON.MultiMaterial;
		const multi = new MultiMat('drone_multi', scene) as BABYLON.MultiMaterial;
		// assign subMaterials: index 0 => primary, index 1 => secondary, others => primary
		multi.subMaterials = [primaryMat, secondaryMat];
		merged.material = multi;
		try {
			for (let i = 0; i < subs.length; i++) {
				subs[i].materialIndex = i === 1 ? 1 : 0;
			}
		} catch (e) { /* ignore */ }
	} else {
		// Single-material case: apply primary material
		try { merged.material = primaryMat; } catch (e) { /* ignore */ }
	}

	// Diagnostic: log bounding box and camera position to detect camera-inside-mesh cases
	try {
		const bi = drone.getBoundingInfo?.();
		const bbox = bi?.boundingBox;
		if (bbox) {
			console.debug('drone boundingBox world min/max:', bbox.minimumWorld?.toString?.(), bbox.maximumWorld?.toString?.());
		}
		const cam = scene.activeCamera;
		if (cam && bbox) {
			const p = cam.position;
			const inside = p.x >= bbox.minimumWorld.x && p.x <= bbox.maximumWorld.x && p.y >= bbox.minimumWorld.y && p.y <= bbox.maximumWorld.y && p.z >= bbox.minimumWorld.z && p.z <= bbox.maximumWorld.z;
			if (inside) {
				console.warn('Camera appears to be inside the drone bounding box — this will show interior faces.');
			}
			console.debug('activeCamera position:', p.toString());
		}
	} catch (e) {
		/* ignore diagnostics errors */
	}

	// (Glow layer removed) use material emissive and attached lights only

	// -------------------------------------------------------------------------
	// 7. ATTACH LIGHT
	// -------------------------------------------------------------------------
	const droneLight = attachDroneLight(
		scene,
		drone,
		droneVisual as BABYLON.Mesh,
		options.rectangularLight ? { type: 'rect', range: options.lightRange ?? 3.0 } : undefined
	);

	// -------------------------------------------------------------------------
	// 8. CREATE CONTROL FUNCTIONS
	// -------------------------------------------------------------------------
	// glow control removed; keep light intensity adjustments via droneLight

	// -------------------------------------------------------------------------
	// 9. RETURN RESULT
	// -------------------------------------------------------------------------
	return {
		drone,
		droneVisual,
		droneAggregate,
		droneMaterial: primaryMat,
		droneLight
	};
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Resolve GLB URL from assetId or direct URL.
 * Priority: glbUrl > assetId > default 'drone' asset
 */
async function resolveGlbUrl(assetId?: string, glbUrl?: string): Promise<string> {
	// Direct URL takes priority
	if (glbUrl) {
		return glbUrl;
	}

	// Try to resolve from asset ID
	if (assetId) {
		try {
			const { getModelUrl } = await import('../../assetsConfig');
			const url = await getModelUrl(assetId);
			if (url) return url;
		} catch (e) {
			console.warn(`Failed to resolve assetId '${assetId}':`, e);
		}
	}

	// Fallback to default drone asset
	try {
		const { getModelUrl } = await import('../../assetsConfig');
		const url = await getModelUrl('drone');
		if (url) return url;
	} catch {
		// Ignore
	}

	// Ultimate fallback
	return '/glb/usb.glb';
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Re-export commonly used functions from DroneProp for convenience
export {
	createDrone,
	createDroneMaterial,
	createDroneInstance,
	attachDroneLight,
	createDebugHelper,
	debugPhysicsAggregate,
	type DroneResult,
	type DroneInstanceOptions,
	type DebugHelperOptions
} from './DroneProp';
