import * as BABYLON from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';

export interface DroneResult {
    drone: BABYLON.Mesh;
    droneVisual?: BABYLON.Mesh;
}

export async function createDrone(scene: BABYLON.Scene, glbUrl = '/glb/usb.glb'): Promise<DroneResult> {
	let drone: BABYLON.Mesh;
	let droneVisual: BABYLON.Mesh | undefined;
	try {
		const res = await SceneLoader.ImportMeshAsync('', '', glbUrl, scene);
		const droneRoot = new BABYLON.TransformNode('drone_glb_root', scene);
		const imported = res.meshes as BABYLON.AbstractMesh[];

		// Compute combined center of all imported meshes (world space) so we can
		// re-center the model to the collider origin. Some glTFs have offsets
		// baked into their meshes which place the visual far from local origin.
		let centerWorld = new BABYLON.Vector3(0, 0, 0);
		let count = 0;
		imported.forEach(m => {
			if (m instanceof BABYLON.Mesh && m.getBoundingInfo && m.getBoundingInfo().boundingBox) {
				const c = m.getBoundingInfo().boundingBox.centerWorld.clone();
				centerWorld.addInPlace(c);
				count++;
			}
		});
		if (count > 0) {
			centerWorld = centerWorld.scale(1 / count);
		}

		// Parent only mesh nodes to the root (we'll offset the root so the combined
		// center of the visuals sits at the origin where the collider will be).
		imported.forEach(m => {
			if (m instanceof BABYLON.Mesh) {
				m.parent = droneRoot;
			}
		});

		droneVisual = imported.find(m => (m instanceof BABYLON.Mesh) && !!(m as BABYLON.Mesh).geometry) as BABYLON.Mesh | undefined;
		if (!droneVisual) {
			droneVisual = imported.find(m => m instanceof BABYLON.Mesh) as BABYLON.Mesh | undefined;
		}

		// create invisible collider used as the movement/physics root
		const droneCollider = BABYLON.MeshBuilder.CreateCapsule(
			'drone_collider',
			{
				radius: 0.5,
				capSubdivisions: 1,
				height: 2,
				tessellation: 4,
				topCapSubdivisions: 12
			},
			scene
		);
		droneCollider.visibility = 0;
		droneRoot.parent = droneCollider;
		drone = droneCollider;

		// small defaults
		// move the visual root so the model center is at local origin (collider will be at origin)
		droneRoot.position = centerWorld.negate();
		droneRoot.scaling = new BABYLON.Vector3(1, 1, 1);
		droneRoot.rotation = droneRoot.rotation || new BABYLON.Vector3();

	} catch (e) {
		console.warn('Failed to load drone GLB, falling back to capsule', e);
		drone = BABYLON.MeshBuilder.CreateCapsule(
			'capsule',
			{
				radius: 0.5,
				capSubdivisions: 1,
				height: 2,
				tessellation: 4,
				topCapSubdivisions: 12
			},
			scene
		);
		droneVisual = drone;
	}

	return { drone, droneVisual };
}
