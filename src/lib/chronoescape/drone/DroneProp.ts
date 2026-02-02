import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { getModelUrl } from '../../assetsConfig';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** Result from loading a drone mesh */
export interface DroneResult {
	drone: BABYLON.Mesh;
	droneVisual?: BABYLON.Mesh;
}

/** Options for creating drone instances */
export interface DroneInstanceOptions {
	id?: string;
	position?: BABYLON.Vector3;
	scale?: number;
	material?: BABYLON.Material;
	physicsShape?: BABYLON.PhysicsShapeType;
	physicsOptions?: { mass?: number; restitution?: number; friction?: number };
	debug?: boolean;
}

/** Options for debug visualization */
export interface DebugHelperOptions {
	useBox?: boolean;
	color?: BABYLON.Color3;
	wireframe?: boolean;
	alpha?: number;
}

/** Options for glow configuration */
export interface GlowOptions {
	intensity?: number;
	color?: BABYLON.Color3;
}

// ============================================================================
// PRIVATE UTILITIES
// ============================================================================

/** Ensure mesh has metadata object and return it */
function ensureMetadata(mesh: BABYLON.AbstractMesh): Record<string, any> {
	(mesh as any).metadata = (mesh as any).metadata || {};
	return (mesh as any).metadata;
}

/** Get the source mesh (handles instanced meshes) */
function getSourceMesh(mesh: BABYLON.AbstractMesh): BABYLON.Mesh {
	return ((mesh as any).sourceMesh || mesh) as BABYLON.Mesh;
}

/** Safely get bounding info from a mesh */
function getBoundingInfo(mesh: BABYLON.AbstractMesh): BABYLON.BoundingInfo | null {
	try {
		return mesh.getBoundingInfo?.() || null;
	} catch {
		return null;
	}
}

/** Parse GLB URL into root and filename */
function parseGlbUrl(url: string): { rootUrl: string; fileName: string } {
	if (!url.includes('/')) {
		return { rootUrl: '', fileName: url };
	}
	const idx = url.lastIndexOf('/');
	return {
		rootUrl: url.substring(0, idx + 1),
		fileName: url.substring(idx + 1)
	};
}

/** Load GLB as asset container */
async function loadGlbContainer(
	scene: BABYLON.Scene,
	rootUrl: string,
	fileName: string
): Promise<BABYLON.AssetContainer> {
	const loader = (BABYLON as any).loadAssetContainerAsync || (BABYLON as any).loadAssetContainer;
	if (typeof loader !== 'function') {
		throw new Error('BabylonJS loadAssetContainerAsync not available');
	}
	return await loader.call(BABYLON, fileName, scene, { rootUrl, pluginOptions: { gltf: {} } });
}

/** Extract meshes with geometry from container */
function extractGeometryMeshes(container: BABYLON.AssetContainer): BABYLON.Mesh[] {
	const meshes = (container?.meshes || []) as BABYLON.AbstractMesh[];
	const withGeometry = meshes.filter(
		(m) => m instanceof BABYLON.Mesh && (m as BABYLON.Mesh).geometry
	) as BABYLON.Mesh[];
	if (withGeometry.length === 0) {
		throw new Error('No geometry meshes found in GLB');
	}
	return withGeometry;
}

// ============================================================================
// DRONE LOADING
// ============================================================================

/**
 * Load a GLB file and merge all geometry meshes into a single drone mesh.
 * Falls back to a simple box if loading fails.
 * 
 * @param scene - The Babylon.js scene
 * @param glbUrl - Optional URL to the GLB file (defaults to 'drone' asset)
 * @returns Promise with drone mesh and optional visual mesh
 */
export async function createDrone(
	scene: BABYLON.Scene,
	glbUrl?: string
): Promise<DroneResult> {
	// Resolve GLB URL from assets.json when not provided
	let resolved = glbUrl;
	if (!resolved) {
		try {
			resolved = await getModelUrl('drone');
		} catch {
			resolved = '/glb/usb.glb';
		}
	}

	try {
		const { rootUrl, fileName } = parseGlbUrl(resolved);
		const container = await loadGlbContainer(scene, rootUrl, fileName);
		const meshes = extractGeometryMeshes(container);

		container.addAllToScene?.();

		const drone = BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, true) || meshes[0];
		drone.name = 'drone_merged';

		return { drone, droneVisual: drone };
	} catch (e) {
		console.warn('Failed to load drone GLB, using fallback box:', e);
		const fallback = BABYLON.MeshBuilder.CreateBox('drone_fallback', {
			width: 1,
			height: 2,
			depth: 1
		}, scene);
		return { drone: fallback, droneVisual: fallback };
	}
}

// ============================================================================
// INSTANCING
// ============================================================================

/**
 * Create an instance from a template mesh with optional physics.
 * 
 * @param template - The source mesh to instance
 * @param scene - The Babylon.js scene
 * @param options - Instance configuration options
 * @returns The created instance and optional physics aggregate
 */
export function createDroneInstance(
	template: BABYLON.Mesh,
	scene: BABYLON.Scene,
	options: DroneInstanceOptions = {}
): { instance: BABYLON.InstancedMesh; aggregate: BABYLON.PhysicsAggregate | null } {
	const id = options.id ?? `drone_instance_${Date.now()}`;
	const instance = template.createInstance(id);

	instance.isPickable = true;
	ensureMetadata(instance as unknown as BABYLON.AbstractMesh);

	// Apply transforms
	if (options.position) instance.position.copyFrom(options.position);
	if (options.scale) instance.scaling.setAll(options.scale);
	if (options.material) instance.material = options.material;

	// Attach physics
	let aggregate: BABYLON.PhysicsAggregate | null = null;
	try {
		const physicsOpts = {
			mass: options.physicsOptions?.mass ?? 0.05,
			restitution: options.physicsOptions?.restitution ?? 0.3,
			friction: options.physicsOptions?.friction ?? 0.05
		};
		aggregate = new BABYLON.PhysicsAggregate(
			instance as unknown as BABYLON.AbstractMesh,
			options.physicsShape ?? BABYLON.PhysicsShapeType.MESH,
			physicsOpts,
			scene
		);
	} catch (e) {
		console.warn('Failed to create physics for instance:', e);
	}

	// Debug visualization
	if (options.debug) {
		createDebugHelper(instance as unknown as BABYLON.AbstractMesh, scene, {
			useBox: options.physicsShape === BABYLON.PhysicsShapeType.BOX
		});
	}

	return { instance, aggregate };
}

// ============================================================================
// MATERIALS
// ============================================================================

/**
 * Create the standard drone material with emissive glow.
 * 
 * @param scene - The Babylon.js scene
 * @param color - Optional emissive color (defaults to cyan)
 * @returns StandardMaterial configured for drone
 */
export function createDroneMaterial(
	scene: BABYLON.Scene,
	color?: BABYLON.Color3
): BABYLON.StandardMaterial {
	const material = new BABYLON.StandardMaterial('droneMat', scene);
	material.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
	material.emissiveColor = color ?? new BABYLON.Color3(0.1, 0.6, 1.0);
	return material;
}

// ============================================================================
// LIGHTING
// ============================================================================

/**
 * Attach a point light to the drone mesh.
 * 
 * @param scene - The Babylon.js scene
 * @param drone - The drone mesh to attach light to
 * @param attachTo - Optional specific mesh to parent the light to
 * @returns The created PointLight
 */
export function attachDroneLight(
	scene: BABYLON.Scene,
	drone: BABYLON.Mesh,
	attachTo?: BABYLON.Mesh
): BABYLON.PointLight {
	const light = new BABYLON.PointLight('droneLight', BABYLON.Vector3.Zero(), scene);
	light.diffuse = new BABYLON.Color3(0.1, 0.6, 1.0);
	light.specular = new BABYLON.Color3(0.6, 0.9, 1.0);
	light.intensity = 5.0;
	light.range = 10.0 ;
	light.parent = attachTo ?? drone;
	light.position = new BABYLON.Vector3(0.5, 0.5, 0);
	return light;
}

// ============================================================================
// GLOW SYSTEM
// ============================================================================

/**
 * Enable/disable glow on an entire mesh via metadata.
 * 
 * @param mesh - The mesh to configure
 * @param enabled - Whether glow is enabled
 */
export function setMeshGlow(mesh: BABYLON.AbstractMesh, enabled = true): void {
	const metadata = ensureMetadata(mesh);
	metadata.glow = enabled;
}

/**
 * Set which submesh index should glow (null to disable submesh-specific glow).
 * 
 * @param mesh - The mesh to configure
 * @param subIndex - The submesh index to glow, or null to disable
 */
export function setMeshSubmeshGlow(mesh: BABYLON.AbstractMesh, subIndex: number | null): void {
	const metadata = ensureMetadata(mesh);
	if (subIndex === null) {
		delete metadata.selectedSubmesh;
	} else {
		metadata.selectedSubmesh = subIndex;
	}
}

/**
 * Install a GlowLayer that respects per-submesh glow settings.
 * Uses metadata.selectedSubmesh to highlight specific submeshes.
 * 
 * @param scene - The Babylon.js scene
 * @param drone - The main drone mesh
 * @param droneVisual - Optional visual mesh (if different from physics mesh)
 * @param intensity - Glow intensity (0-1, default 0.8)
 * @returns The created GlowLayer
 */
export function installDroneGlow(
	scene: BABYLON.Scene,
	drone: BABYLON.Mesh,
	droneVisual?: BABYLON.Mesh,
	intensity = 0.8
): BABYLON.GlowLayer {
	const glow = new BABYLON.GlowLayer('droneGlow', scene);
	glow.intensity = intensity;

	glow.customEmissiveColorSelector = (mesh, subMesh, material, result) => {
		const source = getSourceMesh(mesh as BABYLON.AbstractMesh);
		const metadata = (source as any).metadata || {};

		// Skip debug helpers
		if (metadata._debugHelper) {
			result.set(0, 0, 0, 0);
			return;
		}

		// Check if specific submesh is selected
		if (typeof metadata.selectedSubmesh === 'number' && source.subMeshes) {
			const index = source.subMeshes.indexOf(subMesh);
			if (index === metadata.selectedSubmesh) {
				applyEmissiveColor(result, material);
				return;
			}
			result.set(0, 0, 0, 0);
			return;
		}

		// Otherwise check if this is the drone mesh
		if (mesh === droneVisual || mesh === drone) {
			applyEmissiveColor(result, material);
		} else {
			result.set(0, 0, 0, 0);
		}
	};

	return glow;
}

/** Apply emissive color from material to glow result */
function applyEmissiveColor(result: BABYLON.Color4, material: BABYLON.Material): void {
	const mat = material as BABYLON.StandardMaterial | null;
	const emissive = mat?.emissiveColor || new BABYLON.Color3(0.1, 0.6, 1.0);
	result.set(emissive.r, emissive.g, emissive.b, 1.0);
}

// ============================================================================
// DEBUG VISUALIZATION
// ============================================================================

/**
 * Create a wireframe helper to visualize mesh bounds.
 * 
 * @param mesh - The mesh to visualize
 * @param scene - The Babylon.js scene
 * @param options - Debug visualization options
 * @returns The created helper mesh, or null on failure
 */
export function createDebugHelper(
	mesh: BABYLON.AbstractMesh,
	scene: BABYLON.Scene,
	options: DebugHelperOptions = {}
): BABYLON.Mesh | null {
	const source = getSourceMesh(mesh);
	const bounds = getBoundingInfo(source);

	try {
		const color = options.color ?? new BABYLON.Color3(1, 0.2, 0.2);
		const alpha = options.alpha ?? 0.3;
		let helper: BABYLON.Mesh;

		if (options.useBox && bounds?.boundingBox) {
			const size = bounds.boundingBox.maximumWorld.subtract(bounds.boundingBox.minimumWorld);
			helper = BABYLON.MeshBuilder.CreateBox(`${source.name}_debug`, {
				width: Math.max(0.01, Math.abs(size.x)),
				height: Math.max(0.01, Math.abs(size.y)),
				depth: Math.max(0.01, Math.abs(size.z))
			}, scene);
		} else {
			const radius = bounds?.boundingSphere?.radiusWorld ?? 0.5;
			helper = BABYLON.MeshBuilder.CreateSphere(`${source.name}_debug`, {
				diameter: radius * 2,
				segments: 12
			}, scene);
		}

		// Create debug material
		const mat = new BABYLON.StandardMaterial(`${helper.name}_mat`, scene);
		mat.diffuseColor = color;
		mat.emissiveColor = color;
		mat.alpha = alpha;
		mat.wireframe = options.wireframe ?? true;
		helper.material = mat;

		// Mark as debug helper
		const metadata = ensureMetadata(helper);
		metadata._debugHelper = true;
		helper.isPickable = false;

		// Sync position with source
		const updatePosition = () => {
			try {
				helper.position.copyFrom(source.getAbsolutePosition());
			} catch { /* ignore */ }
		};
		updatePosition();
		scene.onBeforeRenderObservable.add(updatePosition);

		return helper;
	} catch (e) {
		console.warn('Failed to create debug helper:', e);
		return null;
	}
}

/**
 * Visualize physics aggregate bounds with a synced wireframe box.
 * 
 * @param scene - The Babylon.js scene
 * @param aggregate - The physics aggregate to visualize
 * @param owner - The mesh that owns the aggregate
 * @param options - Debug visualization options
 * @returns The created helper mesh, or null on failure
 */
export function debugPhysicsAggregate(
	scene: BABYLON.Scene,
	aggregate: BABYLON.PhysicsAggregate | null | undefined,
	owner: BABYLON.AbstractMesh,
	options: DebugHelperOptions = {}
): BABYLON.Mesh | null {
	if (!aggregate || !owner) {
		console.warn('debugPhysicsAggregate: missing aggregate or owner');
		return null;
	}

	const source = getSourceMesh(owner);
	const bounds = getBoundingInfo(source);

	if (!bounds?.boundingBox) {
		console.warn('debugPhysicsAggregate: no bounding box for', source.name);
		return null;
	}

	try {
		// Get bounding box in local space
		const min = bounds.boundingBox.minimum;
		const max = bounds.boundingBox.maximum;
		const size = max.subtract(min);
		const localCenter = min.add(max).scale(0.5);

		const helper = BABYLON.MeshBuilder.CreateBox(`${source.name}_physics_debug`, {
			width: Math.max(0.01, Math.abs(size.x)),
			height: Math.max(0.01, Math.abs(size.y)),
			depth: Math.max(0.01, Math.abs(size.z))
		}, scene);

		// Create material
		const color = options.color ?? new BABYLON.Color3(1, 0.2, 0.2);
		const mat = new BABYLON.StandardMaterial(`${helper.name}_mat`, scene);
		mat.diffuseColor = color;
		mat.emissiveColor = color;
		mat.alpha = options.alpha ?? 0.28;
		mat.wireframe = options.wireframe ?? true;
		helper.material = mat;

		// Mark as debug helper
		const metadata = ensureMetadata(helper);
		metadata._debugHelper = true;
		helper.isPickable = false;

		// Parent to source so it follows automatically
		helper.parent = source;
		helper.position.copyFrom(localCenter);

		return helper;
	} catch (e) {
		console.warn('Failed to create physics debug helper:', e);
		return null;
	}
}
