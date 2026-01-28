import * as BABYLON from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';
import { getPhysicsWasmUrl } from '../../assetsConfig';

/**
 * Initialize Havok physics engine with zero gravity
 */
export async function setupPhysics(scene: BABYLON.Scene, gravity = new BABYLON.Vector3(0, 0, 0)): Promise<void> {
	const wasmUrl = await getPhysicsWasmUrl();
	const havok = await HavokPhysics({ locateFile: () => wasmUrl });
	const havokPlugin = new BABYLON.HavokPlugin(true, havok);
	scene.enablePhysics(gravity, havokPlugin);
}

/**
 * Setup basic scene lighting and fog
 */
export function setupLighting(
	scene: BABYLON.Scene,
	options: {
		intensity?: number;
		fogMode?: number;
		fogColor?: BABYLON.Color3;
		fogDensity?: number;
	} = {}
): BABYLON.HemisphericLight {
	const light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 0), scene);
	light.intensity = options.intensity ?? 0.1;

	// Enable subtle exponential fog by default
	scene.fogMode = options.fogMode ?? BABYLON.Scene.FOGMODE_EXP;
	scene.fogEnabled = true;
	scene.fogColor = options.fogColor ?? new BABYLON.Color3(0.9, 0.9, 0.85);
	// Slightly increased default density for a light atmospheric haze
	scene.fogDensity = options.fogDensity ?? 0.0009;

	return light;
}

/**
 * Setup dual camera system (arc + follow)
 */
export function setupCameras(
	scene: BABYLON.Scene,
	canvas: HTMLCanvasElement,
	initialCamera: 'arc' | 'follow' = 'follow'
) {
	const arcCamera = new BABYLON.ArcRotateCamera(
		'arcCamera',
		Math.PI / 2,
		Math.PI / 4,
		10,
		BABYLON.Vector3.Zero(),
		scene
	);
	arcCamera.attachControl(canvas, true);

	const followCamera = new BABYLON.UniversalCamera('followCamera', new BABYLON.Vector3(), scene);
	followCamera.fov = Math.PI / 2;
	followCamera.minZ = 0.0001;
	followCamera.maxZ = 10000;
	followCamera.updateUpVectorFromRotation = true;
	followCamera.rotationQuaternion = new BABYLON.Quaternion();

	scene.activeCamera = initialCamera === 'arc' ? arcCamera : followCamera;

	let isFollowCamera = initialCamera === 'follow';
	
	const switchCamera = () => {
		isFollowCamera = !isFollowCamera;
		scene.activeCamera = isFollowCamera ? followCamera : arcCamera;
		console.log(isFollowCamera ? '🎮 Follow Camera' : '🔄 Arc Camera');
	};

	return { arcCamera, followCamera, switchCamera };
}
