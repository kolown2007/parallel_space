import * as BABYLON from '@babylonjs/core';
import { getPositionOnPath, getDirectionOnPath } from '../world/PathUtils';

export interface DronePhysicsConfig {
	maxFollowSpeed?: number;
	followStrength?: number;
	velocityDamping?: number;
	lateralForce?: number;
}

export interface CameraGimbalConfig {
	followDistance: number;
	followHeight: number;
	positionSmooth: number;
	rotationSmooth: number;
	lookAheadDistance: number;
}

/**
 * Update drone physics to follow the path with smooth velocity control.
 */
export function updateDronePhysics(
	drone: BABYLON.AbstractMesh,
	aggregate: BABYLON.PhysicsAggregate,
	pathPoints: BABYLON.Vector3[],
	pathProgress: number,
	keysPressed: { [key: string]: boolean },
	config: DronePhysicsConfig = {}
): void {
	const {
		maxFollowSpeed = 40,
		followStrength = 100.0, // Very strong pull back to path
		velocityDamping = 0.98,
		lateralForce = 8
	} = config;

	// Maintain drone orientation
	drone.rotation.x = -Math.PI / 2;

	// Calculate path following velocity
	const targetPos = getPositionOnPath(pathPoints, pathProgress);
	const toTarget = targetPos.subtract(drone.position);
	const distance = toTarget.length();

	let desiredVel = BABYLON.Vector3.Zero();
	if (distance > 0.02) {
		// Scale strength based on distance - farther = stronger pull
		const distanceMultiplier = Math.min(3.0, 1.0 + (distance / 5.0));
		const effectiveStrength = followStrength * distanceMultiplier;
		const speed = Math.min(maxFollowSpeed, distance * effectiveStrength);
		desiredVel = toTarget.normalize().scale(speed);
	}

	// Very strong snap-back: use desired velocity directly
	aggregate.body.setLinearVelocity(desiredVel.scale(velocityDamping));

	// Apply lateral controls with very reduced force to minimize drift
	if (keysPressed.a) {
		const leftForce = new BABYLON.Vector3(0, 0, lateralForce * 0.3); // Further reduced
		aggregate.body.applyForce(leftForce, drone.position);
	}
	if (keysPressed.d) {
		const rightForce = new BABYLON.Vector3(0, 0, -lateralForce * 0.3); // Further reduced
		aggregate.body.applyForce(rightForce, drone.position);
	}
}

/**
 * Update follow camera to smoothly track the drone along the path.
 */
export function updateFollowCamera(
	camera: BABYLON.UniversalCamera,
	drone: BABYLON.AbstractMesh,
	pathPoints: BABYLON.Vector3[],
	pathProgress: number,
	gimbal: CameraGimbalConfig,
	bounds?: {
		torusCenter?: BABYLON.Vector3;
		torusMainRadius?: number;
		torusTubeRadius?: number;
		margin?: number;
	}
): void {
	// Calculate look-ahead point
	const lookAheadProgress = Math.min(
		1,
		pathProgress + gimbal.lookAheadDistance / pathPoints.length
	);
	const lookAtPoint = getPositionOnPath(pathPoints, lookAheadProgress);

	// Calculate desired camera position
	const forward = getDirectionOnPath(pathPoints, pathProgress);
	const desiredCamPos = drone.position
		.add(forward.scale(-gimbal.followDistance))
		.add(new BABYLON.Vector3(0, gimbal.followHeight, 0));

	// Smooth position interpolation
	camera.position = BABYLON.Vector3.Lerp(
		camera.position,
		desiredCamPos,
		gimbal.positionSmooth
	);

	// Calculate camera rotation to look at target
	const toTarget = lookAtPoint.subtract(camera.position).normalize();
	const yaw = Math.atan2(toTarget.x, toTarget.z);
	const pitch = Math.asin(BABYLON.Scalar.Clamp(toTarget.y, -1, 1));

	const targetQuat = BABYLON.Quaternion.RotationYawPitchRoll(yaw, -pitch, 0);
	if (!camera.rotationQuaternion) {
		camera.rotationQuaternion = new BABYLON.Quaternion();
	}
	
	// Smooth rotation interpolation
	camera.rotationQuaternion = BABYLON.Quaternion.Slerp(
		camera.rotationQuaternion,
		targetQuat,
		gimbal.rotationSmooth
	);

	// If torus bounds provided, clamp camera to stay within torus tube
	try {
		if (bounds && bounds.torusCenter && typeof bounds.torusMainRadius === 'number' && typeof bounds.torusTubeRadius === 'number') {
			const center = bounds.torusCenter;
			const mainR = bounds.torusMainRadius;
			const tubeR = bounds.torusTubeRadius;
			const margin = typeof bounds.margin === 'number' ? bounds.margin : 0.5;

			// Project onto XZ plane
			const dx = camera.position.x - center.x;
			const dz = camera.position.z - center.z;
			const distXZ = Math.sqrt(dx * dx + dz * dz);

			// Desired radial offset from main radius
			const radialOffset = distXZ - mainR;
			const maxOffset = Math.max(0, tubeR - margin);
			const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, radialOffset));
			const newDistXZ = mainR + clampedOffset;

			if (distXZ > 1e-5) {
				const scale = newDistXZ / distXZ;
				camera.position.x = center.x + dx * scale;
				camera.position.z = center.z + dz * scale;
			} else {
				// If camera exactly at center, nudge it to the inner side of the tube
				camera.position.x = center.x + newDistXZ;
				camera.position.z = center.z;
			}

			// Clamp Y to tube vertical bounds
			const minY = center.y - maxOffset;
			const maxY = center.y + maxOffset;
			camera.position.y = Math.max(minY, Math.min(maxY, camera.position.y));
		}
	} catch (e) {
		// don't let clamping break camera updates
		// console.warn('camera clamp failed', e);
	}
}
