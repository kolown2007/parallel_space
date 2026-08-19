import * as BABYLON from '@babylonjs/core';
import { getPositionOnPath, getDirectionOnPath } from '../wormhole/PathUtils';
import type { DroneInputState, KeysPressed } from '../input/inputTypes';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface DronePhysicsConfig {
    maxFollowSpeed?: number;
    followStrength?: number;
    velocityDamping?: number;
    lateralForce?: number;
    yawRate?: number;
}

export interface CameraGimbalConfig {
    followDistance: number;
    followHeight: number;
    positionSmooth: number;
    rotationSmooth: number;
    lookAheadDistance: number;
}

export interface CameraBounds {
    torusCenter: BABYLON.Vector3;
    torusMainRadius: number;
    torusTubeRadius: number;
    margin?: number;
}

export interface DronePhysicsState {
    collisionStopUntil: number;
}

// ============================================================================
// DEFAULT CONFIGS
// ============================================================================

export const DEFAULT_PHYSICS_CONFIG: Required<DronePhysicsConfig> = {
    maxFollowSpeed: 40,
    followStrength: 100.0,
    velocityDamping: 0.98,
    lateralForce: 8,
    yawRate: 0.04
};

export const DEFAULT_GIMBAL_CONFIG: CameraGimbalConfig = {
    followDistance: 8,
    followHeight: 2,
    positionSmooth: 0.08,
    rotationSmooth: 0.12,
    lookAheadDistance: 5
};

// ============================================================================
// ZERO-ALLOCATION MEMORY CACHE (PERFORMANCE OPTIMIZATION)
// ============================================================================
// These vectors are created ONCE when the file loads. 
// We recycle them every frame to prevent Garbage Collection stutters.
const _tempToTarget = new BABYLON.Vector3();
const _tempCurrentVel = new BABYLON.Vector3();
const _tempDesiredVel = new BABYLON.Vector3();
const _tempVelocityError = new BABYLON.Vector3();
const _tempStabilizedVel = new BABYLON.Vector3();
const _tempLateralForce = new BABYLON.Vector3();
const _tempAngularVelocity = new BABYLON.Vector3();

const _tempDesiredCamPos = new BABYLON.Vector3();
const _tempToCamTarget = new BABYLON.Vector3();
const _tempTargetQuat = new BABYLON.Quaternion();
const _tempOrientationQuat = new BABYLON.Quaternion();
const _tempOrientationMatrix = new BABYLON.Matrix();
const _tempForward = new BABYLON.Vector3();
const _tempRight = new BABYLON.Vector3();
const _tempUp = new BABYLON.Vector3();

// ============================================================================
// DRONE PHYSICS
// ============================================================================

/**
 * Update drone physics to follow a path with smooth velocity control.
 */
export function updateDronePhysics(
    drone: BABYLON.AbstractMesh,
    aggregate: BABYLON.PhysicsAggregate,
    pathPoints: BABYLON.Vector3[],
    pathProgress: number,
    input: DroneInputState,
    state: DronePhysicsState,
    config: DronePhysicsConfig = {}
): void {
    const {
        maxFollowSpeed,
        followStrength,
        velocityDamping,
        yawRate
    } = { ...DEFAULT_PHYSICS_CONFIG, ...config };

    const droneMetadata = ((drone as any).metadata ??= {}) as Record<string, any>;
    const collisionStopUntil = state.collisionStopUntil;
    const wasReorienting = droneMetadata._wasReorienting as boolean | undefined;
    const isReorienting = input.brake > 0;
    droneMetadata._wasReorienting = isReorienting;

    // During collision recovery, leave separation and contact response to Havok.
    if (performance.now() < collisionStopUntil) return;

    if (isReorienting) {
        aggregate.body.disablePreStep = false;

        _tempForward.copyFrom(getDirectionOnPath(pathPoints, pathProgress));
        _tempForward.normalize();
        _tempUp.copyFrom(BABYLON.Axis.Y);
        BABYLON.Vector3.CrossToRef(_tempUp, _tempForward, _tempRight);
        if (_tempRight.lengthSquared() < 0.0001) {
            _tempUp.copyFrom(BABYLON.Axis.Z);
            BABYLON.Vector3.CrossToRef(_tempUp, _tempForward, _tempRight);
        }
        _tempRight.normalize();
        BABYLON.Vector3.CrossToRef(_tempForward, _tempRight, _tempUp);
        _tempUp.normalize();

        BABYLON.Matrix.FromXYZAxesToRef(
            _tempForward.scale(-1),
            _tempUp,
            _tempRight,
            _tempOrientationMatrix
        );
        BABYLON.Quaternion.FromRotationMatrixToRef(_tempOrientationMatrix, _tempOrientationQuat);
        if (!drone.rotationQuaternion) drone.rotationQuaternion = new BABYLON.Quaternion();
        BABYLON.Quaternion.SlerpToRef(drone.rotationQuaternion, _tempOrientationQuat, 0.38, drone.rotationQuaternion);
        aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
    } else if (wasReorienting) {
        aggregate.body.disablePreStep = true;
    }

    // Get target positions
    const targetPos = getPositionOnPath(pathPoints, pathProgress);
    
    // ZERO-ALLOCATION: Calculate vector to target
    targetPos.subtractToRef(drone.position, _tempToTarget);
    const distance = _tempToTarget.length();

    // Get the drone's current actual velocity safely
    const bodyVel = aggregate.body.getLinearVelocity();
    if (bodyVel) {
        _tempCurrentVel.copyFrom(bodyVel);
    } else {
        _tempCurrentVel.setAll(0);
    }

    if (distance > 0.02) {
        // Dynamic scaling: If running at 20x throttle, lower the snapping force
        const speedMultiplier = maxFollowSpeed > 100 ? 0.4 : 1.0; 
        
        const distanceMultiplier = Math.min(3.0, 1.0 + (distance / 5.0));
        const effectiveStrength = followStrength * distanceMultiplier * speedMultiplier;
        const speed = Math.min(maxFollowSpeed, distance * effectiveStrength);
        
        // ZERO-ALLOCATION: Normalize and scale
        _tempToTarget.normalizeToRef(_tempDesiredVel);
        _tempDesiredVel.scaleInPlace(speed);
    } else {
        _tempDesiredVel.setAll(0);
    }

    // =========================================================================
    // APPLIED PROPORTIONAL-DERIVATIVE BRAKING (Zero-Allocation)
    // =========================================================================
    
    // velocityError = desiredVel - currentVel
    _tempDesiredVel.subtractToRef(_tempCurrentVel, _tempVelocityError);
    
    // At high speeds, increase damping dynamically
    const activeDamping = maxFollowSpeed > 150 ? 0.85 : velocityDamping;

    // velocityError *= (1 - activeDamping)
    _tempVelocityError.scaleInPlace(1 - activeDamping);

    // stabilizedVel = currentVel + velocityError
    _tempCurrentVel.addToRef(_tempVelocityError, _tempStabilizedVel);

    // Clamp the ultimate velocity vector so it never violates your physical max speed limits
    if (_tempStabilizedVel.lengthSquared() > maxFollowSpeed * maxFollowSpeed) {
        _tempStabilizedVel.normalize().scaleInPlace(maxFollowSpeed);
    }

    // Commit cleanly back to the simulation body
    aggregate.body.setLinearVelocity(_tempStabilizedVel);

}

/**
 * Reset drone to a specific position with zeroed velocity.
 */
export function resetDronePosition(
    drone: BABYLON.AbstractMesh,
    aggregate: BABYLON.PhysicsAggregate,
    position: BABYLON.Vector3
): void {
    drone.position.copyFrom(position);
    if ((drone as any).metadata) {
        delete (drone as any).metadata._stabilizedOrientation;
    }
    try {
        aggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
        aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
        
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
    
    // ZERO-ALLOCATION: desiredCamPos = drone.pos + (forward * -distance) + height
    forward.scaleToRef(-gimbal.followDistance, _tempDesiredCamPos);
    _tempDesiredCamPos.addInPlace(drone.position);
    _tempDesiredCamPos.y += gimbal.followHeight;

    // ZERO-ALLOCATION: Smooth position interpolation
    BABYLON.Vector3.LerpToRef(camera.position, _tempDesiredCamPos, gimbal.positionSmooth, camera.position);

    // ZERO-ALLOCATION: Calculate and apply smooth rotation
    lookAtPoint.subtractToRef(camera.position, _tempToCamTarget);
    _tempToCamTarget.normalize();
    
    const yaw = Math.atan2(_tempToCamTarget.x, _tempToCamTarget.z);
    const pitch = Math.asin(BABYLON.Scalar.Clamp(_tempToCamTarget.y, -1, 1));

    BABYLON.Quaternion.RotationYawPitchRollToRef(yaw, -pitch, 0, _tempTargetQuat);
    
    if (!camera.rotationQuaternion) {
        camera.rotationQuaternion = new BABYLON.Quaternion();
    }
    
    BABYLON.Quaternion.SlerpToRef(
        camera.rotationQuaternion,
        _tempTargetQuat,
        gimbal.rotationSmooth,
        camera.rotationQuaternion
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

export function indexToProgress(index: number, pathPoints: BABYLON.Vector3[]): number {
    return pathPoints.length > 0 ? index / pathPoints.length : 0;
}

export function createKeysPressed(): KeysPressed {
    return { w: false, a: false, s: false, d: false };
}