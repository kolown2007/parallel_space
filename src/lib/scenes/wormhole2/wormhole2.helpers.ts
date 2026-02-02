import * as BABYLON from '@babylonjs/core';

/**
 * Helper utilities for WormHoleScene2
 */

/**
 * Compute the nearest path point index to a mesh's current position
 */
export function getDronePathIndexFactory(
	droneMesh: BABYLON.AbstractMesh,
	pathPoints: BABYLON.Vector3[]
) {
	return (): number => {
		if (!droneMesh || !pathPoints || pathPoints.length === 0) return 0;
		
		let currentPointIndex = 0;
		let minDistSq = Number.POSITIVE_INFINITY;
		
		const dronePos = droneMesh.position;
		for (let i = 0; i < pathPoints.length; i++) {
			const dx = pathPoints[i].x - dronePos.x;
			const dy = pathPoints[i].y - dronePos.y;
			const dz = pathPoints[i].z - dronePos.z;
			const d2 = dx * dx + dy * dy + dz * dz;
			
			if (d2 < minDistSq) {
				minDistSq = d2;
				currentPointIndex = i;
			}
		}
		
		return currentPointIndex;
	};
}

/**
 * Calculate target path index with wrapping
 */
export function getTargetPathIndex(
	currentIndex: number,
	offset: number,
	pathLength: number
): number {
	return (currentIndex + offset) % pathLength;
}
