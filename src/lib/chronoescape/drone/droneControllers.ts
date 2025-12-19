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
		maxFollowSpeed = 12,
		followStrength = 6.0,
		velocityDamping = 0.995,
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
		const speed = Math.min(maxFollowSpeed, distance * followStrength);
		desiredVel = toTarget.normalize().scale(speed);
	}

	aggregate.body.setLinearVelocity(desiredVel.scale(velocityDamping));

	// Apply lateral controls
	if (keysPressed.a) {
		const leftForce = new BABYLON.Vector3(0, 0, lateralForce);
		aggregate.body.applyForce(leftForce, drone.position);
	}
	if (keysPressed.d) {
		const rightForce = new BABYLON.Vector3(0, 0, -lateralForce);
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
	gimbal: CameraGimbalConfig
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
}
