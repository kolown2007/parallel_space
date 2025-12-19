import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface DroneResult {
	drone: BABYLON.Mesh;
	droneVisual?: BABYLON.Mesh;
}

interface DebugHelperOptions {
	useBox?: boolean;
	color?: BABYLON.Color3;
}

interface InstanceOptions {
	id?: string;
	position?: BABYLON.Vector3;
	scale?: number;
	material?: BABYLON.Material;
	physicsShape?: BABYLON.PhysicsShapeType;
	physicsOptions?: any;
	debug?: boolean;
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
		return (mesh as any).getBoundingInfo?.() || null;
	} catch {
		return null;
	}
}

/** Create a wireframe helper material */
function createDebugMaterial(
	name: string,
	scene: BABYLON.Scene,
	color: BABYLON.Color3,
	alpha = 0.3
): BABYLON.StandardMaterial {
	const mat = new BABYLON.StandardMaterial(name, scene);
	mat.diffuseColor = color;
	mat.emissiveColor = color;
	mat.alpha = alpha;
	mat.wireframe = true;
	return mat;
}

/** Mark mesh as debug helper (so it's ignored by glow layer) */
function markAsDebugHelper(mesh: BABYLON.Mesh): void {
	const metadata = ensureMetadata(mesh);
	metadata._debugHelper = true;
	mesh.isPickable = false;
}

/** Sync helper position with source mesh each frame */
function syncHelperPosition(
	helper: BABYLON.Mesh,
	source: BABYLON.AbstractMesh,
	scene: BABYLON.Scene
): void {
	const updatePosition = () => {
		try {
			helper.position.copyFrom((source as any).getAbsolutePosition());
		} catch {
			// Ignore sync errors
		}
	};

	// Initial position
	updatePosition();

	// Keep synced per-frame
	const observer = scene.onBeforeRenderObservable.add(updatePosition);
	(helper as any)._debugObserver = observer;
}

// ============================================================================
// DRONE LOADING & CREATION
// ============================================================================

/**
 * Load a GLB file and merge all geometry meshes into a single drone mesh.
 * Falls back to a simple box if loading fails.
 */
export async function createDrone(
	scene: BABYLON.Scene,
	glbUrl = '/glb/usb.glb'
): Promise<DroneResult> {
	try {
		const { rootUrl, fileName } = parseGlbUrl(glbUrl);
		const container = await loadGlbContainer(scene, rootUrl, fileName);
		const meshes = extractGeometryMeshes(container);

		addContainerToScene(container);

		const drone = mergeMeshes(meshes) || meshes[0];
		drone.name = 'drone_merged';

		return { drone, droneVisual: drone };
	} catch (e) {
		console.warn('Failed to load drone GLB, using fallback box', e);
		const fallback = BABYLON.MeshBuilder.CreateBox('drone_fallback', {
			width: 1,
			height: 2,
			depth: 1
		}, scene);
		return { drone: fallback, droneVisual: fallback };
	}
}

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

async function loadGlbContainer(scene: BABYLON.Scene, rootUrl: string, fileName: string) {
	const loader =
		(BABYLON as any).loadAssetContainerAsync || (BABYLON as any).loadAssetContainer;
	if (typeof loader !== 'function') {
		throw new Error('BabylonJS loadAssetContainerAsync not available');
	}
	return await loader.call(BABYLON, fileName, scene, {
		rootUrl,
		pluginOptions: { gltf: {} }
	});
}

function extractGeometryMeshes(container: any): BABYLON.Mesh[] {
	const meshes = (container?.meshes || []) as BABYLON.AbstractMesh[];
	const withGeometry = meshes.filter(
		(m: any) => m instanceof BABYLON.Mesh && m.geometry
	) as BABYLON.Mesh[];
	if (withGeometry.length === 0) {
		throw new Error('No geometry meshes found in GLB');
	}
	return withGeometry;
}

function addContainerToScene(container: any): void {
	try {
		container?.addAllToScene?.();
	} catch {
		// Ignore if already added or unavailable
	}
}

function mergeMeshes(meshes: BABYLON.Mesh[]): BABYLON.Mesh | null {
	return BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
}

// ============================================================================
// INSTANCING
// ============================================================================

/**
 * Create an instance from a template mesh with optional physics and debug visualization.
 */
export function createDroneInstanceFromTemplate(
	template: BABYLON.Mesh,
	scene: BABYLON.Scene,
	options: InstanceOptions = {}
): { instance: BABYLON.InstancedMesh; aggregate?: BABYLON.PhysicsAggregate | null } {
	const id = options.id ?? `instance_${Math.floor(Math.random() * 10000)}`;
	const instance = template.createInstance(id);

	instance.isPickable = true;
	ensureMetadata(instance as unknown as BABYLON.AbstractMesh);

	applyInstanceTransforms(instance, options);

	const aggregate = attachPhysics(instance, scene, options);

	if (options.debug) {
		createDebugHelperForMesh(instance as unknown as BABYLON.AbstractMesh, scene, {
			useBox: options.physicsShape === BABYLON.PhysicsShapeType.BOX
		});
	}

	return { instance, aggregate };
}

function applyInstanceTransforms(instance: BABYLON.InstancedMesh, options: InstanceOptions): void {
	if (options.position) instance.position.copyFrom(options.position);
	if (options.scale) instance.scaling.setAll(options.scale);
	if (options.material) instance.material = options.material;
}

function attachPhysics(
	instance: BABYLON.InstancedMesh,
	scene: BABYLON.Scene,
	options: InstanceOptions
): BABYLON.PhysicsAggregate | null {
	try {
		return new BABYLON.PhysicsAggregate(
			instance as unknown as BABYLON.AbstractMesh,
			options.physicsShape ?? BABYLON.PhysicsShapeType.MESH,
			options.physicsOptions ?? { mass: 0.05, restitution: 0.3, friction: 0.05 },
			scene
		);
	} catch (e) {
		console.warn('Failed to create PhysicsAggregate for instance', e);
		return null;
	}
}

// ============================================================================
// GLOW CONTROL
// ============================================================================

/** Enable/disable glow on an entire mesh */
export function setMeshGlow(mesh: BABYLON.AbstractMesh, enabled = true): void {
	const metadata = ensureMetadata(mesh);
	metadata.glow = !!enabled;
}

/** Set which submesh index should glow (null to disable submesh glow) */
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
 */
export function installDroneGlow(
	scene: BABYLON.Scene,
	drone: BABYLON.Mesh,
	droneVisual?: BABYLON.Mesh,
	intensity = 0.8
): BABYLON.GlowLayer {
	const glow = new BABYLON.GlowLayer('glow', scene);
	glow.intensity = intensity;

	glow.customEmissiveColorSelector = (mesh, subMesh, material, result) => {
		const source = getSourceMesh(mesh as BABYLON.AbstractMesh);
		const metadata = (source as any).metadata || {};

		// Check if specific submesh is selected
		if (typeof metadata.selectedSubmesh === 'number' && source.subMeshes) {
			const index = source.subMeshes.indexOf(subMesh);
			if (index === metadata.selectedSubmesh) {
				setEmissiveColor(result, material);
				return;
			}
			result.set(0, 0, 0, 0);
			return;
		}

		// Otherwise check if this is the drone mesh
		if (mesh === droneVisual || mesh === drone) {
			setEmissiveColor(result, material);
		} else {
			result.set(0, 0, 0, 0);
		}
	};

	return glow;
}

function setEmissiveColor(result: BABYLON.Color4, material: BABYLON.Material): void {
	const mat = material as BABYLON.StandardMaterial | null;
	const emissive = mat?.emissiveColor || new BABYLON.Color3(0.1, 0.6, 1.0);
	result.set(emissive.r, emissive.g, emissive.b, 1.0);
}

// ============================================================================
// MATERIALS & LIGHTING
// ============================================================================

/** Create the standard drone material with emissive glow */
export function createDroneMaterial(scene: BABYLON.Scene): BABYLON.StandardMaterial {
	const material = new BABYLON.StandardMaterial('droneMat', scene);
	material.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
	material.emissiveColor = new BABYLON.Color3(0.1, 0.6, 1.0);
	return material;
}

/** Attach a point light to the drone (parents to attachTo mesh if provided) */
export function attachDroneLight(
	scene: BABYLON.Scene,
	drone: BABYLON.Mesh,
	attachTo?: BABYLON.Mesh
): BABYLON.PointLight {
	const light = new BABYLON.PointLight('droneLight', BABYLON.Vector3.Zero(), scene);
	light.diffuse = new BABYLON.Color3(0.1, 0.6, 1.0);
	light.specular = new BABYLON.Color3(0.6, 0.9, 1.0);
	light.intensity = 3.0;
	light.range = 12;
	light.parent = attachTo ?? drone;
	light.position = new BABYLON.Vector3(0.5, 0.5, 0);
	return light;
}

// ============================================================================
// DEBUG VISUALIZATION
// ============================================================================

/**
 * Create a wireframe helper to visualize mesh bounds.
 * Helper syncs position with the source mesh each frame.
 */
export function createDebugHelperForMesh(
	mesh: BABYLON.AbstractMesh,
	scene: BABYLON.Scene,
	opts: DebugHelperOptions = {}
): BABYLON.Mesh | null {
	const source = getSourceMesh(mesh);
	const bounds = getBoundingInfo(source);

	try {
		const helper = createHelperGeometry(source, scene, bounds, opts);
		const color = opts.color ?? new BABYLON.Color3(1, 0.2, 0.2);

		helper.material = createDebugMaterial(`${source.name}_helper_mat`, scene, color);
		markAsDebugHelper(helper);
		syncHelperPosition(helper, source, scene);

		return helper;
	} catch (e) {
		console.warn('Failed to create debug helper', e);
		return null;
	}
}

function createHelperGeometry(
	source: BABYLON.Mesh,
	scene: BABYLON.Scene,
	bounds: BABYLON.BoundingInfo | null,
	opts: DebugHelperOptions
): BABYLON.Mesh {
	if (opts.useBox && bounds?.boundingBox) {
		const size = bounds.boundingBox.maximumWorld.subtract(bounds.boundingBox.minimumWorld);
		return BABYLON.MeshBuilder.CreateBox(`${source.name}_helper`, {
			width: Math.max(0.01, Math.abs(size.x)),
			height: Math.max(0.01, Math.abs(size.y)),
			depth: Math.max(0.01, Math.abs(size.z))
		}, scene);
	}

	const radius = bounds?.boundingSphere?.radiusWorld ?? 0.5;
	return BABYLON.MeshBuilder.CreateSphere(`${source.name}_helper`, {
		diameter: radius * 2,
		segments: 12
	}, scene);
}

/**
 * Visualize physics aggregate bounds with a synced wireframe box.
 * Uses the owner mesh's world-space bounding box.
 */
export function debugPhysicsAggregate(
	scene: BABYLON.Scene,
	aggregate: BABYLON.PhysicsAggregate | null | undefined,
	owner: BABYLON.AbstractMesh,
	opts: { color?: BABYLON.Color3; wireframe?: boolean } = {}
): BABYLON.Mesh | null {
	if (!aggregate || !owner) {
		console.warn('debugPhysicsAggregate: missing aggregate or owner');
		return null;
	}

	const source = getSourceMesh(owner);
	const bounds = getBoundingInfo(source);

	if (!bounds?.boundingBox) {
		console.warn('debugPhysicsAggregate: no bounding box available', source.name);
		return null;
	}

	try {
		const helper = createBoundingBoxHelper(source, scene, bounds);
		const color = opts.color ?? new BABYLON.Color3(1, 0.2, 0.2);

		helper.material = createDebugMaterial(`${helper.name}_mat`, scene, color, 0.28);
		if (opts.wireframe !== undefined) {
			(helper.material as BABYLON.StandardMaterial).wireframe = opts.wireframe;
		}

		markAsDebugHelper(helper);
		syncBoundingBoxHelper(helper, source, scene);

		return helper;
	} catch (e) {
		console.warn('Failed to create aggregate debug helper', e);
		return null;
	}
}

function createBoundingBoxHelper(
	source: BABYLON.Mesh,
	scene: BABYLON.Scene,
	bounds: BABYLON.BoundingInfo
): BABYLON.Mesh {
	// Get bounding box in local space
	const min = bounds.boundingBox.minimum;
	const max = bounds.boundingBox.maximum;
	const size = max.subtract(min);
	const localCenter = min.add(max).scale(0.5);

	const helper = BABYLON.MeshBuilder.CreateBox(`${source.name}_physics_box`, {
		width: Math.max(0.01, Math.abs(size.x)),
		height: Math.max(0.01, Math.abs(size.y)),
		depth: Math.max(0.01, Math.abs(size.z))
	}, scene);

	// Parent to source so it moves with it
	helper.parent = source;
	helper.position.copyFrom(localCenter);
	return helper;
}

function syncBoundingBoxHelper(
	helper: BABYLON.Mesh,
	source: BABYLON.AbstractMesh,
	scene: BABYLON.Scene
): void {
	// Helper is parented to source, so it automatically follows
	// No need for manual sync in render loop
}
