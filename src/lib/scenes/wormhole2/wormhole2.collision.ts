import { get } from 'svelte/store';
import { hitCollision, droneControl, MAX_SPEED } from '../../stores/droneControl.svelte';
import { playCollisionNote, playCollisionNoteSingle } from '../../scores/ambient';
import { triggerDualShockRumble } from '../../input/dualshockControls';
import { WORMHOLE2_CONFIG } from './wormhole2.config';
import type { DronePhysicsState } from '../../drone/droneControllers';

export function setupDroneCollision(droneAggregate: any, state: DronePhysicsState): () => void {
	if (!droneAggregate?.body) {
		console.warn('No physics body for collision setup');
		return () => {};
	}

	const obstacleLastHit = new Map<any, number>();
	const cleanupInterval = setInterval(() => {
		const now = Date.now();
		for (const [key, time] of obstacleLastHit.entries()) {
			if (now - time > 60000) obstacleLastHit.delete(key);
		}
	}, 30000);

	try {
		droneAggregate.body.setCollisionCallbackEnabled(true);
		
		const collisionObservable = droneAggregate.body.getCollisionObservable();
		const collisionObserver = collisionObservable.add((collisionEvent: any) => {
			const collidedMesh = collisionEvent.collidedAgainst?.transformNode
				|| collisionEvent.other?.transformNode
				|| collisionEvent.otherBody?.transformNode
				|| collisionEvent.transformNode
				|| collisionEvent.hitMesh
				|| collisionEvent.mesh
				|| null;
			
			if (!collidedMesh) return;
			
			const collidedName = collidedMesh?.name || collisionEvent.collidedAgainst?.name || 'unknown';
			const nameLower = collidedName.toLowerCase();
			
			const isObstacle = nameLower.includes('model_instance')
				|| nameLower.includes('hoverbox')
				|| nameLower.includes('billboard')
				|| nameLower.includes('obstacle_cube');
			
			if (isObstacle) {
				// Debounce repeated hits on the same mesh
				const meshKey = collidedMesh.uniqueId ?? collidedMesh.id ?? collidedName;
				const now = Date.now();
				const last = obstacleLastHit.get(meshKey) || 0;
				
				if (now - last < WORMHOLE2_CONFIG.collision.debounceMs) {
					return;
				}
				
				obstacleLastHit.set(meshKey, now);
				state.collisionStopUntil = performance.now() + 250;
				
				console.log(`✨ Drone hit obstacle: ${collidedName}`);
				
				const controlState = get(droneControl);
				const velocity = Math.min(controlState.speed / MAX_SPEED, 1.0);
				if (nameLower.includes('obstacle_cube')) {
					hitCollision({ percent: 1, minSpeed: 0 });
					playCollisionNoteSingle(velocity);
					triggerDualShockRumble(250, 1.0, 0.8);
				} else {
					hitCollision({ percent: WORMHOLE2_CONFIG.collision.speedPenaltyPercent });
					playCollisionNote(velocity);
				}
			}
		});
		
		console.log('✓ Drone collision detection enabled');
		
		return () => {
			collisionObservable.remove(collisionObserver);
			clearInterval(cleanupInterval);
			obstacleLastHit.clear();
		};
	} catch (e) {
		console.warn('Failed to setup drone collision callback:', e);
		clearInterval(cleanupInterval);
		return () => {};
	}
}
