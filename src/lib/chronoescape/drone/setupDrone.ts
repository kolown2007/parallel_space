import * as BABYLON from '@babylonjs/core';
import {
	createDrone,
	createDroneMaterial,
	installDroneGlow,
	attachDroneLight,
	debugPhysicsAggregate,
	setMeshSubmeshGlow,
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
	/** Physics aggregate for collision/movement */
	droneAggregate: BABYLON.PhysicsAggregate;
	/** Material applied to the drone */
	droneMaterial: BABYLON.StandardMaterial;
	/** Point light attached to the drone */
	/** Light attached to the drone (point/spot/rect visual) */
	droneLight: BABYLON.Light;
	/** Glow layer for the drone */
	glowLayer: BABYLON.GlowLayer;
	/** Toggle glow on/off */
	toggleGlow: (enabled: boolean) => void;
	/** Set glow intensity */
	setGlowIntensity: (intensity: number) => void;
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
	/** Physics restitution/bounciness (default: 1) */
	restitution?: number;
	/** Physics friction (default: 0.3) */
	friction?: number;
	/** Glow layer intensity (default: 0.4) */
	glowIntensity?: number;
	/** Submesh index to apply glow to (default: 1) */
	glowSubmeshIndex?: number;
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
			restitution = 1,
			friction = 0.3,
			glowIntensity = 0.4,
			glowSubmeshIndex = 1,
			enableDebug = false,
			rectangularLight = true,
			lightRange = 3.0
	} = options;



	// -------------------------------------------------------------------------
	// 1. RESOLVE GLB URL
	// -------------------------------------------------------------------------
	const resolvedGlbUrl = await resolveGlbUrl(assetId, glbUrl);

	// -------------------------------------------------------------------------
	// 2. LOAD DRONE MESH
	// -------------------------------------------------------------------------
	const { drone, droneVisual } = await createDrone(scene, resolvedGlbUrl);
	
	drone.position.copyFrom(initialPosition);
	drone.rotation.copyFrom(initialRotation);

	// -------------------------------------------------------------------------
	// 3. CREATE PHYSICS
	// -------------------------------------------------------------------------
	const droneAggregate = new BABYLON.PhysicsAggregate(
		drone,
		BABYLON.PhysicsShapeType.MESH,
		{ mass, restitution, friction },
		scene
	);

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
	// 5. APPLY MATERIAL
	// -------------------------------------------------------------------------
	const droneMaterial = createDroneMaterial(scene);
	const targetMesh = droneVisual ?? drone;
	targetMesh.material = droneMaterial;

	// -------------------------------------------------------------------------
	// 6. INSTALL GLOW
	// -------------------------------------------------------------------------
	const glowLayer = installDroneGlow(scene, drone, droneVisual, glowIntensity);

	// Set submesh glow if applicable
	try {
		const srcMesh = (droneVisual as any)?.sourceMesh ?? droneVisual ?? drone;
		if (srcMesh?.subMeshes?.length > 0) {
			const indexToGlow = Math.min(glowSubmeshIndex, srcMesh.subMeshes.length - 1);
			setMeshSubmeshGlow(srcMesh, indexToGlow);
		}
	} catch (e) {
		console.warn('Failed to set submesh glow:', e);
	}

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
	// Detect WebGPU engine to pick softer defaults when necessary
	const engineAny = (scene.getEngine && (scene.getEngine() as any)) || {};
	const isWebGPU = typeof engineAny?.constructor?.name === 'string' && engineAny.constructor.name.toLowerCase().includes('webgpu');
	const defaultOnLightIntensity = isWebGPU ? 1.5 : 3.0;

	// Ensure the created light uses a reasonable base intensity for current backend
	try { droneLight.intensity = defaultOnLightIntensity; } catch (e) { /* ignore */ }

	const toggleGlow = (enabled: boolean) => {
		glowLayer.intensity = enabled ? glowIntensity : 0;
		try { droneLight.intensity = enabled ? defaultOnLightIntensity : 0; } catch (e) { /* ignore */ }
	};

	const setGlowIntensity = (intensity: number) => {
		glowLayer.intensity = intensity;
	};

	// -------------------------------------------------------------------------
	// 9. RETURN RESULT
	// -------------------------------------------------------------------------
	return {
		drone,
		droneVisual,
		droneAggregate,
		droneMaterial,
		droneLight,
		glowLayer,
		toggleGlow,
		setGlowIntensity
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
	installDroneGlow,
	attachDroneLight,
	setMeshGlow,
	setMeshSubmeshGlow,
	createDebugHelper,
	debugPhysicsAggregate,
	type DroneResult,
	type DroneInstanceOptions,
	type DebugHelperOptions,
	type GlowOptions
} from './DroneProp';
