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
    dodgeTimer?: number;    // Tracks remaining dodge duration
    dodgeDir?: number;      // -1 for Left, +1 for Right
}

// ============================================================================
// DEFAULT CONFIGS & CONSTANTS
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

const BURST_SPEED_BOOST = 25.0; // Extra speed added when bursting with W / forward
const DODGE_DURATION = 0.75;    // Snappy dodge duration in seconds
const DODGE_DISTANCE = 20.0;    // Lateral displacement force

// ============================================================================
// ZERO-ALLOCATION MEMORY CACHE (PERFORMANCE OPTIMIZATION)
// ============================================================================
const _tempToTarget = new BABYLON.Vector3();
const _tempCurrentVel = new BABYLON.Vector3();
const _tempDesiredVel = new BABYLON.Vector3();
const _tempStabilizedVel = new BABYLON.Vector3();
const _tempLateralForce = new BABYLON.Vector3();

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
 * Update drone physics to follow a path with smooth velocity control, forward burst, and dynamic dodging.
 */
export function updateDronePhysics(
    drone: BABYLON.AbstractMesh,
    aggregate: BABYLON.PhysicsAggregate,
    pathPoints: BABYLON.Vector3[],
    pathProgress: number,
    input: DroneInputState,
    state: DronePhysicsState,
    deltaTime: number,
    config: DronePhysicsConfig = {}
): void {
    const { maxFollowSpeed } = { ...DEFAULT_PHYSICS_CONFIG, ...config };
    const droneMetadata = ((drone as any).metadata ??= {}) as Record<string, any>;
    const collisionStopUntil = state.collisionStopUntil;
    const isReorienting = input.brake > 0;

    // 1. Initial Orientation Setup
    const orientationInitialized = droneMetadata._orientationInitialized as boolean | undefined;
    if (!orientationInitialized) {
        _tempForward.copyFrom(getDirectionOnPath(pathPoints, pathProgress)).normalize();
        _tempUp.copyFrom(BABYLON.Axis.Y);
        BABYLON.Vector3.CrossToRef(_tempUp, _tempForward, _tempRight);
        if (_tempRight.lengthSquared() < 0.0001) {
            _tempUp.copyFrom(BABYLON.Axis.Z);
            BABYLON.Vector3.CrossToRef(_tempUp, _tempForward, _tempRight);
        }
        _tempRight.normalize();
        BABYLON.Matrix.FromXYZAxesToRef(
            _tempForward.scale(-1),
            _tempUp,
            _tempRight,
            _tempOrientationMatrix
        );
        BABYLON.Quaternion.FromRotationMatrixToRef(_tempOrientationMatrix, _tempOrientationQuat);
        if (!drone.rotationQuaternion) drone.rotationQuaternion = new BABYLON.Quaternion();
        drone.rotationQuaternion.copyFrom(_tempOrientationQuat);
        aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
        droneMetadata._orientationInitialized = true;
    }

    // 2. Compute Direction Vectors
    _tempForward.copyFrom(getDirectionOnPath(pathPoints, pathProgress)).normalize();
    _tempUp.copyFrom(BABYLON.Axis.Y);
    BABYLON.Vector3.CrossToRef(_tempUp, _tempForward, _tempRight);
    if (_tempRight.lengthSquared() < 0.0001) {
        _tempUp.copyFrom(BABYLON.Axis.Z);
        BABYLON.Vector3.CrossToRef(_tempUp, _tempForward, _tempRight);
    }
    _tempRight.normalize();

    // 3. Collision Recovery Check
    if (performance.now() < collisionStopUntil) {
        aggregate.body.disablePreStep = true;
        state.dodgeTimer = 0;
        droneMetadata._wasDodgingInput = false;
        return;
    }

    // 4. Active Reorientation (Brake Input)
    if (isReorienting) {
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
    }

    // 5. Trigger Dodge Sequence (Jump Left / Right)
    const isDodgingInput = input.moveX !== 0;
    const wasDodgingInput = droneMetadata._wasDodgingInput as boolean | undefined ?? false;
    droneMetadata._wasDodgingInput = isDodgingInput;

    if (isDodgingInput && !wasDodgingInput && (!state.dodgeTimer || state.dodgeTimer <= 0)) {
        state.dodgeTimer = DODGE_DURATION;
        state.dodgeDir = Math.sign(input.moveX);
    }

    // 6. Compute Forward Velocity (Fixes Late-Game Burst Failure)
    const targetPos = getPositionOnPath(pathPoints, pathProgress);
    targetPos.subtractToRef(drone.position, _tempToTarget);
    
    const forwardOffset = BABYLON.Vector3.Dot(_tempForward, _tempToTarget);
    const isBursting = input.moveY > 0;
    
    let desiredForwardSpeed: number;

    if (isBursting) {
        // Guaranteed burst velocity: always push forward during burst.
        desiredForwardSpeed = maxFollowSpeed + BURST_SPEED_BOOST;
    } else {
        // Standard path tracking when not bursting.
        // Prevent negative reverse drive when the drone is off-track vertically.
        desiredForwardSpeed = Math.min(maxFollowSpeed, Math.max(0, forwardOffset * 8.0));
    }

    // 7. Compute Lateral Velocity (PD Controller with Anti-Overshoot Damping)
    let desiredLateralSpeed = 0;
    const lateralError = BABYLON.Vector3.Dot(_tempRight, _tempToTarget);

    const bodyVel = aggregate.body.getLinearVelocity();
    const currentLateralSpeed = bodyVel ? BABYLON.Vector3.Dot(_tempRight, bodyVel) : 0;

    if (state.dodgeTimer && state.dodgeTimer > 0) {
        state.dodgeTimer -= deltaTime;
        
        const progress = 1.0 - Math.max(0, state.dodgeTimer) / DODGE_DURATION;
        const dodgeVelocity = Math.sin(progress * 2 * Math.PI) * DODGE_DISTANCE * (state.dodgeDir ?? 1);
        
        const springForce = lateralError * 4.0;
        const dampingForce = currentLateralSpeed * 0.4;
        desiredLateralSpeed = dodgeVelocity + (springForce - dampingForce);
        
        if (state.dodgeTimer <= 0) {
            state.dodgeTimer = 0;
        }
    } else {
        // PD Centering Spring:
        // 'springForce' pulls toward track, 'dampingForce' brakes to prevent overshooting 0
        const springForce = lateralError * 8.0;
        const dampingForce = currentLateralSpeed * 0.85;
        
        desiredLateralSpeed = BABYLON.Scalar.Clamp(springForce - dampingForce, -25.0, 25.0);
    }

    // 8. Combine Vectors & Apply to Havok Body
    _tempDesiredVel.copyFrom(_tempForward).scaleInPlace(desiredForwardSpeed);
    _tempLateralForce.copyFrom(_tempRight).scaleInPlace(desiredLateralSpeed);
    _tempDesiredVel.addInPlace(_tempLateralForce);

    if (bodyVel) {
        _tempCurrentVel.copyFrom(bodyVel);
        // Instant response during burst, smooth lerp during normal flight
        const lerpFactor = isBursting ? 0.85 : 0.4;
        BABYLON.Vector3.LerpToRef(_tempCurrentVel, _tempDesiredVel, lerpFactor, _tempStabilizedVel);
    } else {
        _tempStabilizedVel.copyFrom(_tempDesiredVel);
    }

    aggregate.body.disablePreStep = false;
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
    const lookAheadProgress = Math.min(1, pathProgress + gimbal.lookAheadDistance / pathPoints.length);
    const lookAtPoint = getPositionOnPath(pathPoints, lookAheadProgress);

    const forward = getDirectionOnPath(pathPoints, pathProgress);
    
    forward.scaleToRef(-gimbal.followDistance, _tempDesiredCamPos);
    _tempDesiredCamPos.addInPlace(drone.position);
    _tempDesiredCamPos.y += gimbal.followHeight;

    BABYLON.Vector3.LerpToRef(camera.position, _tempDesiredCamPos, gimbal.positionSmooth, camera.position);

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

        const dx = camera.position.x - torusCenter.x;
        const dz = camera.position.z - torusCenter.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);

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

        const minY = torusCenter.y - maxOffset;
        const maxY = torusCenter.y + maxOffset;
        camera.position.y = BABYLON.Scalar.Clamp(camera.position.y, minY, maxY);
    } catch {
        // Prevent clamping errors from breaking frame execution
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