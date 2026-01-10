import * as BABYLON from '@babylonjs/core';
import { ObstacleFactory } from '../obstacle/ObstacleFactory';

/**
 * Create marker obstacles at specified path positions
 */
export async function createPathMarkers(
	scene: BABYLON.Scene,
	pathPoints: BABYLON.Vector3[],
	obstacles: ObstacleFactory,
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


	for (const idx of indices) {
		await obstacles.place('cube', {
			index: idx,
			offsetY: size / 2,
			size,
			color,
			physics: options.physics ?? { mass: 0.02, shape: BABYLON.PhysicsShapeType.BOX }
		});
	}

	return indices;
}
