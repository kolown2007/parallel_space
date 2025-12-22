import * as BABYLON from '@babylonjs/core';
import { createDrone } from './DroneProp';
import {
	createDroneMaterial,
	installDroneGlow,
	attachDroneLight,
	debugPhysicsAggregate,
	setMeshSubmeshGlow
} from './DroneProp';

export interface DroneSetupResult {
	drone: BABYLON.Mesh;
	droneVisual?: BABYLON.Mesh;
	droneAggregate: BABYLON.PhysicsAggregate;
	droneMaterial: BABYLON.StandardMaterial;
	droneLight: BABYLON.PointLight;
	glowLayer: BABYLON.GlowLayer;
}

export interface DroneSetupOptions {
	glbUrl?: string;
	initialPosition?: BABYLON.Vector3;
	initialRotation?: BABYLON.Vector3;
	mass?: number;
	restitution?: number;
	friction?: number;
	glowIntensity?: number;
	glowSubmeshIndex?: number;
	enableDebug?: boolean;
}

/**
 * Create and fully configure a drone with physics, materials, glow, and lighting.
 * Consolidates all drone setup into a single function call.
 */
export async function setupSceneDrone(
	scene: BABYLON.Scene,
	options: DroneSetupOptions = {}
): Promise<DroneSetupResult> {
	const {
		glbUrl = '/glb/usb.glb',
		initialPosition = BABYLON.Vector3.Zero(),
		initialRotation = new BABYLON.Vector3(0, 0, -Math.PI / 2),
		mass = 2,
		restitution = 1,
		friction = 0.3,
		glowIntensity = 0.4,
		glowSubmeshIndex = 1,
		enableDebug = true
	} = options;

	// resolve default GLB URL from assets.json if not provided
	let resolvedGlbUrl = glbUrl;
	if (!resolvedGlbUrl) {
		try {
			const { getModelUrl } = await import('../../assetsConfig');
			resolvedGlbUrl = await getModelUrl('drone');
		} catch (e) {
			resolvedGlbUrl = '/glb/usb.glb';
		}
	}

	// Load drone mesh
	const { drone, droneVisual } = await createDrone(scene, resolvedGlbUrl);
	
	// Set position and rotation
	drone.position.copyFrom(initialPosition);
	drone.rotation.copyFrom(initialRotation);

	// Create physics aggregate
	const droneAggregate = new BABYLON.PhysicsAggregate(
		drone,
		BABYLON.PhysicsShapeType.MESH,
		{ mass, restitution, friction },
		scene
	);

	// Debug visualization
	if (enableDebug) {
		try {
			const debugBox = debugPhysicsAggregate(scene, droneAggregate, drone, {
				color: new BABYLON.Color3(1, 0.2, 0.2),
				wireframe: true
			});
			if (debugBox) {
				console.log('Created physics aggregate debug box:', debugBox.name);
			}
		} catch (e) {
			console.warn('Failed to create aggregate debug box', e);
		}
	}

	// Apply material
	const droneMaterial = createDroneMaterial(scene);
	if (droneVisual) {
		droneVisual.material = droneMaterial;
	} else {
		drone.material = droneMaterial;
	}

	// Install glow layer
	const glowLayer = installDroneGlow(scene, drone, droneVisual, glowIntensity);

	// Set submesh glow
	try {
		const srcMesh =
			droneVisual && (droneVisual as any).sourceMesh
				? (droneVisual as any).sourceMesh
				: (droneVisual ?? drone);
		if (srcMesh?.subMeshes?.length > 0) {
			const indexToGlow = Math.min(glowSubmeshIndex, srcMesh.subMeshes.length - 1);
			setMeshSubmeshGlow(srcMesh, indexToGlow);
			console.log('Set glow on submesh', indexToGlow, 'of', srcMesh.name);
		}
	} catch (e) {
		console.warn('Failed to set submesh glow', e);
	}

	// Attach light
	const droneLight = attachDroneLight(
		scene,
		drone,
		(droneVisual as BABYLON.Mesh) ?? drone
	);

	return {
		drone,
		droneVisual,
		droneAggregate,
		droneMaterial,
		droneLight,
		glowLayer
	};
}
