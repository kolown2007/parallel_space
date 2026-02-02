import { get } from 'svelte/store';
import { hitCollision, droneControl, MAX_SPEED } from '../../stores/droneControl.svelte';
import { playCollisionNote, playCollisionNoteSingle } from '../../scores/ambient';
import { WORMHOLE2_CONFIG } from './wormhole2.config';

const obstacleLastHit = new Map<any, number>();

export function setupDroneCollision(droneAggregate: any): () => void {
	if (!droneAggregate?.body) {
		console.warn('No physics body for collision setup');
		return () => {};
	}

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
				
				console.log(`✨ Drone hit obstacle: ${collidedName}`);
				hitCollision({ percent: WORMHOLE2_CONFIG.collision.speedPenaltyPercent });
				
				// Trigger collision sound based on drone speed (0-1 normalized)
				const state = get(droneControl);
				const velocity = Math.min(state.speed / MAX_SPEED, 1.0);
				
				if (nameLower.includes('obstacle_cube')) {
					playCollisionNoteSingle(velocity);
				} else {
					playCollisionNote(velocity);
				}
			}
		});
		
		console.log('✓ Drone collision detection enabled');
		
		return () => {
			collisionObservable.remove(collisionObserver);
		};
	} catch (e) {
		console.warn('Failed to setup drone collision callback:', e);
		return () => {};
	}
}
