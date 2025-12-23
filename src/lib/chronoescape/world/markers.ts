import * as BABYLON from '@babylonjs/core';
import { ObstaclesManager } from '../obstacle/Obstacles';

/**
 * Create marker obstacles at specified path positions
 */
export async function createPathMarkers(
	scene: BABYLON.Scene,
	pathPoints: BABYLON.Vector3[],
	obstacleManager: ObstaclesManager,
	options: {
		positions?: number[]; // fractions 0-1 along path
		size?: number;
		color?: BABYLON.Color3;
		physics?: { mass?: number; shape?: BABYLON.PhysicsShapeType };
	} = {}
): Promise<number[]> {
	const positions = options.positions ?? [0.25, 0.5, 0.75];
	const size = options.size ?? 4;
	const color = options.color ?? new BABYLON.Color3(0.92, 0.45, 0.07);

	const indices = positions.map(pos => Math.floor(pathPoints.length * pos));

	await obstacleManager.registerType('marker', async (sc) => {
		const cube = BABYLON.MeshBuilder.CreateBox('marker_tpl', { size }, sc);
		const mat = new BABYLON.StandardMaterial('markerMat', sc);
		mat.diffuseColor = color;
		cube.material = mat;
		cube.isVisible = false;
		return cube;
	});

	for (const idx of indices) {
		await obstacleManager.place('marker', {
			index: idx,
			offsetY: size / 2,
			physics: {
				mass: options.physics?.mass ?? 0.02,
				shape: options.physics?.shape ?? BABYLON.PhysicsShapeType.BOX
			}
		});
	}

	return indices;
}
