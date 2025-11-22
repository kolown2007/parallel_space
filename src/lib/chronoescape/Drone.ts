import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

export interface DroneResult {
    drone: BABYLON.Mesh;
    droneVisual?: BABYLON.Mesh;
}

export async function createDrone(scene: BABYLON.Scene, glbUrl = '/glb/usb.glb', debug = true): Promise<DroneResult> {
	let drone: BABYLON.Mesh;
	let droneVisual: BABYLON.Mesh | undefined;
	try {
		// Load into an AssetContainer using the module-level loader API (no fallback)
		let rootUrl = '';
		let fileName = glbUrl;
		if (glbUrl.includes('/')) {
			const idx = glbUrl.lastIndexOf('/');
			rootUrl = glbUrl.substring(0, idx + 1);
			fileName = glbUrl.substring(idx + 1);
		}

		const moduleLoader = (BABYLON as any).loadAssetContainerAsync || (BABYLON as any).loadAssetContainer;
		if (typeof moduleLoader !== 'function') {
			throw new Error('module-level loadAssetContainerAsync not available; update Babylon to a version exposing the module loader API');
		}

		const pluginOptions = { gltf: {} };
		const container = await moduleLoader.call(BABYLON, fileName, scene, { rootUrl, pluginOptions });
		
		const imported = (container && Array.isArray(container.meshes) ? container.meshes : []) as BABYLON.AbstractMesh[];
		
		// Find all meshes with geometry
		const meshesToMerge = imported.filter((m: any) => m instanceof BABYLON.Mesh && m.geometry) as BABYLON.Mesh[];
		
		if (meshesToMerge.length === 0) {
			throw new Error('No geometry meshes found in GLB');
		}

		// Add container to scene so meshes are available
		try { if (container && typeof container.addAllToScene === 'function') container.addAllToScene(); } catch (e) { /* ignore */ }

		// Merge all meshes into one combined mesh (Jollibee pattern but combined first)
		const merged = BABYLON.Mesh.MergeMeshes(meshesToMerge, true, true, undefined, false, true);
		
		if (!merged) {
			// Fallback: use first mesh if merge fails
			drone = meshesToMerge[0];
		} else {
			drone = merged;
		}
		
		drone.name = 'drone_merged';
		droneVisual = drone;

	} catch (e) {
		console.warn('Failed to load drone GLB, falling back to box', e);
		drone = BABYLON.MeshBuilder.CreateBox('drone_fallback', { width: 1, height: 2, depth: 1 }, scene);
		droneVisual = drone;
	}

	return { drone, droneVisual };
}

// Helper: create an instance from a template mesh and attach a PhysicsAggregate (BOX shape) directly to it.
// Simple approach: copy the mesh (via createInstance), set position/scale/material, attach physics.
export function createDroneInstanceFromTemplate(
	template: BABYLON.Mesh,
	scene: BABYLON.Scene,
	options: {
		id?: string;
		position?: BABYLON.Vector3;
		scale?: number;
		material?: BABYLON.Material;
		physicsShape?: BABYLON.PhysicsShapeType;
		physicsOptions?: any;
		debug?: boolean;
	} = {}
): { instance: BABYLON.InstancedMesh; aggregate?: BABYLON.PhysicsAggregate | null } {
	const id = options.id ?? `instance_${Math.floor(Math.random() * 10000)}`;
	
	// Visual instance (cast template to Mesh so TS recognizes createInstance)
	const instance = (template as unknown as BABYLON.Mesh).createInstance(id);
	if (options.position) instance.position.copyFrom(options.position);
	if (options.scale) instance.scaling.setAll(options.scale);
	if (options.material) instance.material = options.material;

	// Physics - directly on the instance (modern approach)
	let aggregate: BABYLON.PhysicsAggregate | null = null;
	try {
		aggregate = new BABYLON.PhysicsAggregate(
			instance,
			options.physicsShape ?? BABYLON.PhysicsShapeType.BOX,
			options.physicsOptions ?? { mass: 0.05, restitution: 0.3, friction: 0.05 },
			scene
		);
	} catch (e) {
		console.warn('createDroneInstanceFromTemplate: PhysicsAggregate creation failed', e);
	}

	// Optional visible debug helper
	if (options.debug && aggregate) {
		try {
			const bi = instance.getBoundingInfo();
			let helper: BABYLON.Mesh;
			if (options.physicsShape === BABYLON.PhysicsShapeType.BOX && bi) {
				const size = bi.boundingBox.maximumWorld.subtract(bi.boundingBox.minimumWorld);
				helper = BABYLON.MeshBuilder.CreateBox(id + '_helper', {
					width: Math.max(0.01, size.x),
					height: Math.max(0.01, size.y),
					depth: Math.max(0.01, size.z)
				}, scene);
			} else {
				const radius = bi?.boundingSphere.radiusWorld ?? 0.5;
				helper = BABYLON.MeshBuilder.CreateSphere(id + '_helper', { diameter: radius * 2, segments: 16 }, scene);
			}
			const mat = new BABYLON.StandardMaterial(id + '_helper_mat', scene);
			mat.diffuseColor = new BABYLON.Color3(1, 0.2, 0.2);
			mat.emissiveColor = new BABYLON.Color3(1, 0.2, 0.2);
			mat.alpha = 0.35;
			mat.wireframe = true;
			helper.material = mat;
			helper.isPickable = false;
			helper.parent = instance as unknown as BABYLON.Node;
			helper.position.set(0, 0, 0);
		} catch (e) {
			console.warn('createDroneInstanceFromTemplate: debug helper creation failed', e);
		}
	}

	return { instance, aggregate };
}
