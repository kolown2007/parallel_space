import * as BABYLON from '@babylonjs/core';
import { getPositionOnPath, getDirectionOnPath } from '../world/PathUtils';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** Configuration for drone physics behavior */
export interface DronePhysicsConfig {
	/** Maximum speed when following path (default: 40) */
	maxFollowSpeed?: number;
	/** Strength of path-following force (default: 100) */
	followStrength?: number;
	/** Velocity damping factor 0-1 (default: 0.98) */
	velocityDamping?: number;
	/** Force applied for lateral (A/D) movement (default: 8) */
	lateralForce?: number;
}

/** Configuration for follow camera behavior */
export interface CameraGimbalConfig {
	/** Distance behind the drone */
	followDistance: number;
	/** Height above the drone */
	followHeight: number;
	/** Position interpolation factor (0-1, higher = faster) */
	positionSmooth: number;
	/** Rotation interpolation factor (0-1, higher = faster) */
	rotationSmooth: number;
	/** How far ahead to look along the path */
	lookAheadDistance: number;
}

/** Bounds for camera clamping within torus */
export interface CameraBounds {
	torusCenter: BABYLON.Vector3;
	torusMainRadius: number;
	torusTubeRadius: number;
	/** Margin from tube wall (default: 0.5) */
	margin?: number;
}

/** Keyboard input state */
export interface KeysPressed {
	w: boolean;
	a: boolean;
	s: boolean;
	d: boolean;
	[key: string]: boolean;
}

// ============================================================================
// DEFAULT CONFIGS
// ============================================================================

/** Default physics configuration */
export const DEFAULT_PHYSICS_CONFIG: Required<DronePhysicsConfig> = {
	maxFollowSpeed: 40,
	followStrength: 100.0,
	velocityDamping: 0.98,
	lateralForce: 8
};

/** Default camera gimbal configuration */
export const DEFAULT_GIMBAL_CONFIG: CameraGimbalConfig = {
	followDistance: 8,
	followHeight: 2,
	positionSmooth: 0.08,
	rotationSmooth: 0.12,
	lookAheadDistance: 5
};

// ============================================================================
// DRONE PHYSICS
// ============================================================================

/**
 * Update drone physics to follow a path with smooth velocity control.
 * Call this in your render loop to keep the drone moving along the path.
 * 
 * @param drone - The drone mesh
 * @param aggregate - The drone's physics aggregate
 * @param pathPoints - Array of path points to follow
 * @param pathProgress - Current progress along path (0-1)
 * @param keysPressed - Current keyboard input state
 * @param config - Optional physics configuration
 * 
 * @example
 * ```typescript
 * scene.onBeforeRenderObservable.add(() => {
 *   updateDronePhysics(drone, aggregate, pathPoints, progress, keysPressed, {
 *     maxFollowSpeed: 50,
 *     lateralForce: 10
 *   });
 * });
 * ```
 */
export function updateDronePhysics(
	drone: BABYLON.AbstractMesh,
	aggregate: BABYLON.PhysicsAggregate,
	pathPoints: BABYLON.Vector3[],
	pathProgress: number,
	keysPressed: KeysPressed,
	config: DronePhysicsConfig = {}
): void {
	const {
		maxFollowSpeed,
		followStrength,
		velocityDamping,
		lateralForce
	} = { ...DEFAULT_PHYSICS_CONFIG, ...config };

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

	// Apply velocity with damping
	aggregate.body.setLinearVelocity(desiredVel.scale(velocityDamping));

	// Apply lateral controls (reduced force to minimize drift)
	const reducedLateral = lateralForce * 0.3;
	if (keysPressed.a) {
		aggregate.body.applyForce(new BABYLON.Vector3(0, 0, reducedLateral), drone.position);
	}
	if (keysPressed.d) {
		aggregate.body.applyForce(new BABYLON.Vector3(0, 0, -reducedLateral), drone.position);
	}
}

/**
 * Reset drone to a specific position with zeroed velocity.
 * 
 * @param drone - The drone mesh
 * @param aggregate - The drone's physics aggregate
 * @param position - Position to reset to
 */
export function resetDronePosition(
	drone: BABYLON.AbstractMesh,
	aggregate: BABYLON.PhysicsAggregate,
	position: BABYLON.Vector3
): void {
	drone.position.copyFrom(position);
	try {
		aggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
		aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
		
		// Some physics backends have setPosition
		if (typeof (aggregate.body as any).setPosition === 'function') {
			(aggregate.body as any).setPosition({ x: position.x, y: position.y, z: position.z });
		}
	} catch (e) {
		console.warn('Failed to reset physics body:', e);
	}
}

// ============================================================================
// CAMERA CONTROLLER
// ============================================================================

/**
 * Update follow camera to smoothly track the drone along a path.
 * Call this in your render loop after updating drone physics.
 * 
 * @param camera - The camera to update
 * @param drone - The drone mesh to follow
 * @param pathPoints - Array of path points
 * @param pathProgress - Current progress along path (0-1)
 * @param gimbal - Camera gimbal configuration
 * @param bounds - Optional torus bounds for camera clamping
 * 
 * @example
 * ```typescript
 * scene.onBeforeRenderObservable.add(() => {
 *   updateFollowCamera(camera, drone, pathPoints, progress, gimbal, {
 *     torusCenter: new BABYLON.Vector3(0, 0, 0),
 *     torusMainRadius: 150,
 *     torusTubeRadius: 25
 *   });
 * });
 * ```
 */
export function updateFollowCamera(
	camera: BABYLON.UniversalCamera,
	drone: BABYLON.AbstractMesh,
	pathPoints: BABYLON.Vector3[],
	pathProgress: number,
	gimbal: CameraGimbalConfig,
	bounds?: Partial<CameraBounds>
): void {
	// Calculate look-ahead point
	const lookAheadProgress = Math.min(1, pathProgress + gimbal.lookAheadDistance / pathPoints.length);
	const lookAtPoint = getPositionOnPath(pathPoints, lookAheadProgress);

	// Calculate desired camera position
	const forward = getDirectionOnPath(pathPoints, pathProgress);
	const desiredCamPos = drone.position
		.add(forward.scale(-gimbal.followDistance))
		.add(new BABYLON.Vector3(0, gimbal.followHeight, 0));

	// Smooth position interpolation
	camera.position = BABYLON.Vector3.Lerp(camera.position, desiredCamPos, gimbal.positionSmooth);

	// Calculate and apply smooth rotation
	const toTarget = lookAtPoint.subtract(camera.position).normalize();
	const yaw = Math.atan2(toTarget.x, toTarget.z);
	const pitch = Math.asin(BABYLON.Scalar.Clamp(toTarget.y, -1, 1));

	const targetQuat = BABYLON.Quaternion.RotationYawPitchRoll(yaw, -pitch, 0);
	if (!camera.rotationQuaternion) {
		camera.rotationQuaternion = new BABYLON.Quaternion();
	}
	camera.rotationQuaternion = BABYLON.Quaternion.Slerp(
		camera.rotationQuaternion,
		targetQuat,
		gimbal.rotationSmooth
	);

	// Clamp camera within torus bounds if provided
	if (bounds?.torusCenter && bounds.torusMainRadius !== undefined && bounds.torusTubeRadius !== undefined) {
		clampCameraToTorus(camera, bounds as CameraBounds);
	}
}

/**
 * Clamp camera position to stay within torus tube bounds.
 */
function clampCameraToTorus(camera: BABYLON.UniversalCamera, bounds: CameraBounds): void {
	try {
		const { torusCenter, torusMainRadius, torusTubeRadius, margin = 0.5 } = bounds;

		// Project onto XZ plane
		const dx = camera.position.x - torusCenter.x;
		const dz = camera.position.z - torusCenter.z;
		const distXZ = Math.sqrt(dx * dx + dz * dz);

		// Clamp radial distance
		const maxOffset = Math.max(0, torusTubeRadius - margin);
		const radialOffset = distXZ - torusMainRadius;
		const clampedOffset = BABYLON.Scalar.Clamp(radialOffset, -maxOffset, maxOffset);
		const newDistXZ = torusMainRadius + clampedOffset;

		if (distXZ > 1e-5) {
			const scale = newDistXZ / distXZ;
			camera.position.x = torusCenter.x + dx * scale;
			camera.position.z = torusCenter.z + dz * scale;
		} else {
			camera.position.x = torusCenter.x + newDistXZ;
			camera.position.z = torusCenter.z;
		}

		// Clamp Y to tube vertical bounds
		const minY = torusCenter.y - maxOffset;
		const maxY = torusCenter.y + maxOffset;
		camera.position.y = BABYLON.Scalar.Clamp(camera.position.y, minY, maxY);
	} catch {
		// Don't let clamping break camera updates
	}
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Find the nearest path point index to a given position.
 * 
 * @param position - World position to find nearest point for
 * @param pathPoints - Array of path points
 * @returns Index of nearest path point
 */
export function getNearestPathIndex(
	position: BABYLON.Vector3,
	pathPoints: BABYLON.Vector3[]
): number {
	let nearestIndex = 0;
	let nearestDist = Infinity;

	for (let i = 0; i < pathPoints.length; i++) {
		const dist = BABYLON.Vector3.DistanceSquared(position, pathPoints[i]);
		if (dist < nearestDist) {
			nearestDist = dist;
			nearestIndex = i;
		}
	}

	return nearestIndex;
}

/**
 * Convert path index to normalized progress (0-1).
 * 
 * @param index - Path point index
 * @param pathPoints - Array of path points
 * @returns Normalized progress value
 */
export function indexToProgress(index: number, pathPoints: BABYLON.Vector3[]): number {
	return pathPoints.length > 0 ? index / pathPoints.length : 0;
}

/**
 * Create an initial keyboard state object.
 * 
 * @returns Clean keyboard state
 */
export function createKeysPressed(): KeysPressed {
	return { w: false, a: false, s: false, d: false };
}
