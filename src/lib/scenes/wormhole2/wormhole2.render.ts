import * as BABYLON from '@babylonjs/core';
import { get } from 'svelte/store';
import { droneControl, updateProgress, enterPortal, FPS, MAX_SPEED } from '../../stores/droneControl.svelte';
import { revolutionStore, notifyRevolutionComplete } from '../../stores/droneRevolution';
import { playRevolutionComplete, playPortalSound, playCollisionNoteSingle } from '../../scores/ambient';
import { updateDronePhysics, updateFollowCamera } from '../../chronoescape/drone/droneControllers';
import { getPositionOnPath } from '../../chronoescape/world/PathUtils';
import type { ObstacleManager } from '../../chronoescape/obstacle/ObstacleManager';
import { WORMHOLE2_CONFIG } from './wormhole2.config';

export interface RenderLoopDeps {
	engine: any;
	scene: BABYLON.Scene;
	drone: BABYLON.AbstractMesh;
	droneAggregate: any;
	followCamera: any;
	pathPoints: BABYLON.Vector3[];
	obstacles: ObstacleManager;
	getPortal: () => any;
	setPortal: (portal: any) => void;
	onPortalTrigger?: () => void;
	getDronePathIndex: () => number;
	keysPressed: any;
	gimbal: {
		followDistance: number;
		followHeight: number;
		positionSmooth: number;
		rotationSmooth: number;
		lookAheadDistance: number;
	};
	torusGeometry: {
		torusCenter: BABYLON.Vector3;
		torusMainRadius: number;
		torusTubeRadius: number;
	};
}

export function createRenderLoop(deps: RenderLoopDeps) {
	const {
		engine,
		scene,
		drone,
		droneAggregate,
		followCamera,
		pathPoints,
		obstacles,
		getPortal,
		setPortal,
		onPortalTrigger,
		getDronePathIndex,
		keysPressed,
		gimbal,
		torusGeometry
	} = deps;

	let lastLoggedLoops = 0;

	return () => {
		const dt = engine.getDeltaTime() / 1000;
		const control = get(droneControl);
		const portal = getPortal();

		// Portal collision check
		if (portal && onPortalTrigger) {
			try {
				const radius = WORMHOLE2_CONFIG.collision.droneAabbRadius;
				const usbAabb = {
					min: {
						x: drone.position.x - radius,
						y: drone.position.y - radius,
						z: drone.position.z - radius
					},
					max: {
						x: drone.position.x + radius,
						y: drone.position.y + radius,
						z: drone.position.z + radius
					}
				};
				
				if (portal.intersects(usbAabb)) {
					try { console.debug('portal collision detected — calling playPortalSound'); } catch {}
					try { playPortalSound(); } catch (e) { console.warn('playPortalSound failed', e); }
					try {
						// also trigger a collision-style note (mirrors cube collision behaviour)
						const state = get(droneControl);
						const velocity = Math.min(state.speed / (MAX_SPEED || 1), 1.0);
						try { playCollisionNoteSingle(velocity); } catch (e) {}
					} catch (e) {}
					console.log('✨ Drone entered portal');
					enterPortal();
					onPortalTrigger();
					try {
						portal.reset();
					} catch {}
					setPortal(undefined);
				}
			} catch (e) {
				/* ignore transient errors */
			}
		}

		// Check drone distance from path - pause forward progress if too far
		const targetPathPos = getPositionOnPath(pathPoints, control.progress);
		const distanceFromPath = BABYLON.Vector3.Distance(drone.position, targetPathPos);
		
		let progressMultiplier = 1.0;
		if (distanceFromPath > WORMHOLE2_CONFIG.path.maxSafeDistance) {
			progressMultiplier = WORMHOLE2_CONFIG.path.offTrackProgressMultiplier;
		}
		
		// Scale speed by frame time so movement is consistent across variable FPS.
		const frameFactor = Math.max(0, dt * FPS); // at 60fps dt~1/60 -> frameFactor ~1
		let newProgress = control.progress + (control.speed * progressMultiplier * frameFactor);
		if (newProgress > 1) {
			newProgress = 0;
		}
		updateProgress(newProgress);

		// Revolution tracking and particle spawning
		try {
			revolutionStore.updateFromPathFraction(newProgress);
			const loops = get(revolutionStore).loopsCompletedCount;
			
			if (loops !== lastLoggedLoops) {
				console.log(`Drone completed loop(s): ${loops}`);
				lastLoggedLoops = loops;
				
				playRevolutionComplete(loops);
				notifyRevolutionComplete(loops);

				// Spawn particle bursts on revolution complete
				try {
					const droneIdx = getDronePathIndex();
					const aheadIdx = (droneIdx + WORMHOLE2_CONFIG.particles.revolutionAheadOffset) % pathPoints.length;
					
					obstacles.place('particles', {
						index: aheadIdx + WORMHOLE2_CONFIG.particles.revolutionSpawnOffset,
						count: WORMHOLE2_CONFIG.particles.revolutionCount,
						size: WORMHOLE2_CONFIG.particles.revolutionSize,
						autoDispose: WORMHOLE2_CONFIG.particles.revolutionAutoDispose,
						offsetY: 1.2
					});
				} catch (e) {
					console.warn('Failed to spawn revolution particles:', e);
				}
			}
		} catch (e) {
			/* ignore if store missing */
		}

		// Update drone physics
		// Do not clamp `maxFollowSpeed` to a low constant here — allow the physics
		// defaults (or scene overrides) to control top speed so `droneControl.speed`
		// has visible effect.
		updateDronePhysics(
			drone,
			droneAggregate,
			pathPoints,
			control.progress,
			keysPressed,
			{ lateralForce: control.lateralForce }
		);

		// Update follow camera
		if (scene.activeCamera === followCamera) {
			updateFollowCamera(
				followCamera,
				drone,
				pathPoints,
				control.progress,
				gimbal,
				{
					torusCenter: torusGeometry.torusCenter,
					torusMainRadius: torusGeometry.torusMainRadius,
					torusTubeRadius: torusGeometry.torusTubeRadius,
					margin: 0.9
				}
			);
		}
	};
}
