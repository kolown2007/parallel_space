import * as BABYLON from '@babylonjs/core';
import { getPositionOnPath, getDirectionOnPath } from '../world/PathUtils';
// note: SpawnController uses the drone mesh world position directly

export interface SpawnConfig {
	modelName: string; // 'jollibee', 'cube', etc.
	distance?: number; // units in front of drone
	offsetY?: number; // vertical offset
	offsetLateral?: number; // left(-)/right(+) offset
	scale?: number;
	physics?: {
		mass?: number;
		restitution?: number;
		friction?: number;
		shape?: BABYLON.PhysicsShapeType;
	};
}

export class SpawnController {
	private scene: BABYLON.Scene;
	private pathPoints: BABYLON.Vector3[];
	private templates: Map<string, BABYLON.Mesh> = new Map();
	private spawnedInstances: BABYLON.AbstractMesh[] = [];

	constructor(scene: BABYLON.Scene, pathPoints: BABYLON.Vector3[]) {
		this.scene = scene;
		this.pathPoints = pathPoints;
	}

	update(): void {
		// No-op
	}

	/**
	 * Register a model template for spawning
	 */
	registerTemplate(name: string, mesh: BABYLON.Mesh): void {
		if (!mesh) {
			console.warn(`Cannot register null template: ${name}`);
			return;
		}
		mesh.isVisible = false; // Hide template
		this.templates.set(name, mesh);
		console.log(`✓ Registered spawn template: ${name}`, mesh);
		console.log(`  Available templates:`, Array.from(this.templates.keys()));
	}

	/**
	 * Spawn an obstacle in front of the drone
	 */
	spawnInFront(droneProgress: number, config: SpawnConfig): BABYLON.AbstractMesh | null {
		const template = this.templates.get(config.modelName);
		if (!template) {
			console.warn(`No template registered for: ${config.modelName}`);
			return null;
		}

		try {
			const offsetY = config.offsetY ?? 0;
			const offsetLateral = config.offsetLateral ?? 0;
			const scale = config.scale ?? 1;
			const progressOffset = config.distance ?? 0.05; // 5% ahead by default

			// Add offset to spawn ahead
			let spawnProgress = droneProgress + progressOffset;
			if (spawnProgress > 1) spawnProgress -= 1;

			console.log(`🎯 Spawn: drone=${droneProgress.toFixed(3)}, spawn=${spawnProgress.toFixed(3)}`);

			// Get position on path
			const basePos = getPositionOnPath(this.pathPoints, spawnProgress);
			const forward = getDirectionOnPath(this.pathPoints, spawnProgress);
			const right = BABYLON.Vector3.Cross(forward, BABYLON.Vector3.Up()).normalize();
			const spawnPos = basePos.add(BABYLON.Vector3.Up().scale(offsetY)).add(right.scale(offsetLateral));

			// Create instance
			const instance = template.createInstance(`${config.modelName}_${Date.now()}`);
			instance.position.copyFrom(spawnPos);
			instance.scaling.setAll(scale);
			instance.isVisible = true;
			instance.lookAt(spawnPos.add(forward));

			// Add physics
			if (config.physics) {
				this.addPhysics(instance, config.physics);
			}

			this.spawnedInstances.push(instance);
			return instance;
		} catch (error) {
			console.error(`Failed to spawn ${config.modelName}:`, error);
			return null;
		}
	}

	/**
	 * Add physics to spawned instance
	 */
	private addPhysics(instance: BABYLON.AbstractMesh, physics: NonNullable<SpawnConfig['physics']>): void {
		const shape = physics.shape ?? BABYLON.PhysicsShapeType.BOX;
		const mass = physics.mass ?? 0.05;
		const restitution = physics.restitution ?? 0.3;
		const friction = physics.friction ?? 0.05;

		try {
			new BABYLON.PhysicsAggregate(instance, shape, { mass, restitution, friction }, this.scene);
		} catch (e) {
			console.warn('Physics failed for spawned instance:', e);
		}
	}

	/**
	 * Spawn from WebSocket message
	 */
	handleWebSocketSpawn(droneProgress: number, message: any): void {
		try {
			const config: SpawnConfig = {
				modelName: message.modelName || 'jollibee',
				distance: message.distance ?? 0.05,
				offsetY: message.offsetY ?? 0,
				offsetLateral: message.offsetLateral ?? 0,
				scale: message.scale ?? 1,
				physics: message.physics ?? {
					mass: 0.05,
					restitution: 0.3,
					friction: 0.05
				}
			};

			this.spawnInFront(droneProgress, config);
		} catch (error) {
			console.error('Failed to handle WebSocket spawn:', error);
		}
	}

	/**
	 * Clear all spawned instances
	 */
	clearAll(): void {
		this.spawnedInstances.forEach((instance) => {
			try {
				instance.dispose();
			} catch (e) {
				console.warn('Failed to dispose instance:', e);
			}
		});
		this.spawnedInstances = [];
	}

	/**
	 * Cleanup
	 */
	dispose(): void {
		this.clearAll();
		this.templates.forEach((template) => {
			try {
				template.dispose();
			} catch (e) {
				console.warn('Failed to dispose template:', e);
			}
		});
		this.templates.clear();
	}

	/**
	 * Get spawned instances count
	 */
	getSpawnedCount(): number {
		return this.spawnedInstances.length;
	}
}
