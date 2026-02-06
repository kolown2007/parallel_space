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
	renderingGroupId?: number;
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

// Glow options removed

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

		// Mark this mesh as the drone so other systems (glow selector, debug helpers)
		// can identify it reliably even when instanced or merged.
		try { (ensureMetadata(drone) as any)._isDrone = true; } catch (e) { /* ignore */ }

		return { drone, droneVisual: drone };
	} catch (e) {
		console.warn('Failed to load drone GLB, using fallback box:', e);
		const fallback = BABYLON.MeshBuilder.CreateBox('drone_fallback', {
			width: 1,
			height: 2,
			depth: 1
		}, scene);
		try { (ensureMetadata(fallback) as any)._isDrone = true; } catch (e) { /* ignore */ }
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

	// Ensure renderingGroupId (and other per-template render state) is applied
	// to the source/template mesh — setting it on an InstancedMesh has no effect.
	try {
		if (typeof options.renderingGroupId === 'number') {
			template.renderingGroupId = options.renderingGroupId;
		}
	} catch (e) { /* ignore */ }

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
			options.physicsShape ?? BABYLON.PhysicsShapeType.BOX,
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
export interface DroneLightOptions {
	/** 'point' (default) or 'rect' */
	type?: 'point' | 'rect' | 'spot';
	color?: BABYLON.Color3;
	intensity?: number;
	range?: number;
	/** width (for rect visual) */
	width?: number;
	/** height (for rect visual) */
	height?: number;
}

export function attachDroneLight(
	scene: BABYLON.Scene,
	drone: BABYLON.Mesh,
	attachTo?: BABYLON.Mesh,
	options: DroneLightOptions = {}
): BABYLON.Light {
	// If running on WebGPU the same intensity may appear brighter; reduce defaults slightly.
	const engineAny = (scene.getEngine && (scene.getEngine() as any)) || {};
	const isWebGPU = typeof engineAny?.constructor?.name === 'string' && engineAny.constructor.name.toLowerCase().includes('webgpu');
	const defaultIntensity = isWebGPU ? 2.5 : 5.0;
	const defaultSpotIntensity = isWebGPU ? 1.0 : 2.0;
	const defaultSpotIntensity2 = isWebGPU ? 1.5 : 3.0;
	const opts = Object.assign({ type: 'point', color: new BABYLON.Color3(0.1, 0.6, 1.0), intensity: defaultIntensity, range: 10.0, width: 0.4, height: 0.18 }, options);

		if (opts.type === 'rect') {
			// Create a short-range spot light to provide lighting
			const spot = new BABYLON.SpotLight('droneRectLight', new BABYLON.Vector3(0, 0, 1), new BABYLON.Vector3(0, 0, 1), Math.PI / 3, 1, scene);
			spot.diffuse = opts.color!;
			spot.specular = new BABYLON.Color3(Math.min(opts.color!.r + 0.5, 1), Math.min(opts.color!.g + 0.5, 1), Math.min(opts.color!.b + 0.5, 1));
			spot.intensity = opts.intensity ?? defaultSpotIntensity;
			spot.range = opts.range ?? 3.0;
			spot.parent = attachTo ?? drone;
			spot.position = new BABYLON.Vector3(0.5, 0.35, 0.0);
			spot.direction = new BABYLON.Vector3(0, 0, 1);

		// Visual rectangular emissive plane to simulate a rectangle light source
		try {
			const plane = BABYLON.MeshBuilder.CreatePlane('droneRectLightPlane', { width: opts.width, height: opts.height }, scene);
			const mat = new BABYLON.StandardMaterial('droneRectLightMat', scene);
			mat.emissiveColor = opts.color!;
			mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
			mat.specularColor = new BABYLON.Color3(0, 0, 0);
			mat.backFaceCulling = false;
			plane.material = mat;
			plane.parent = attachTo ?? drone;
			plane.position = new BABYLON.Vector3(0.5, 0.35, 0.02);
			plane.rotation = new BABYLON.Vector3(0, 0, 0);
			plane.isPickable = false;
		} catch (e) {
			// ignore visual creation failures
		}

		return spot;
	}

	if (opts.type === 'spot') {
			const spot = new BABYLON.SpotLight('droneSpotLight', new BABYLON.Vector3(0, 0, 1), new BABYLON.Vector3(0, 0, 1), Math.PI / 6, 2, scene);
			spot.diffuse = opts.color!;
			spot.specular = new BABYLON.Color3(Math.min(opts.color!.r + 0.5, 1), Math.min(opts.color!.g + 0.5, 1), Math.min(opts.color!.b + 0.5, 1));
			spot.intensity = opts.intensity ?? defaultSpotIntensity2;
			spot.range = opts.range ?? 6.0;
			spot.parent = attachTo ?? drone;
			spot.position = new BABYLON.Vector3(0.5, 0.5, 0);
			spot.direction = new BABYLON.Vector3(0, 0, 1);
			return spot;
	}

	// default: point light
	const light = new BABYLON.PointLight('droneLight', BABYLON.Vector3.Zero(), scene);
	light.diffuse = opts.color!;
	light.specular = new BABYLON.Color3(Math.min(opts.color!.r + 0.5, 1), Math.min(opts.color!.g + 0.5, 1), Math.min(opts.color!.b + 0.5, 1));
	light.intensity = opts.intensity ?? defaultIntensity;
	light.range = opts.range ?? 10.0;
	light.parent = attachTo ?? drone;
	light.position = new BABYLON.Vector3(0.5, 0.5, 0);
	return light;
}

// (Glow system removed) use material emissive & lights for bloom-like effects

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
		const observer = scene.onBeforeRenderObservable.add(updatePosition);

		// Hook into mesh disposal to automatically cleanup observer
		const originalDispose = helper.dispose.bind(helper);
		helper.dispose = () => {
			try { scene.onBeforeRenderObservable.remove(observer); } catch {}
			originalDispose();
		};

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
