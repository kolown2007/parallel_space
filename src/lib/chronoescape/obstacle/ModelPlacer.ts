import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

export interface ModelPlacerConfig {
	rootUrl: string;
	filename: string;
	count: number;
	scale?: number;
	offsetY?: number;
	material?: BABYLON.Material;
	physics?: {
		mass?: number;
		restitution?: number;
		friction?: number;
		shape?: BABYLON.PhysicsShapeType;
	};
	// Optional: provide a preloaded AssetContainer instead of loading from URL
	container?: BABYLON.AssetContainer;
	// If container provided, ModelPlacer will NOT dispose it (owner is external)
}

export class ModelPlacer {
	private scene: BABYLON.Scene;
	private pathPoints: BABYLON.Vector3[];
	private container?: BABYLON.AssetContainer;
	private template?: BABYLON.Mesh;
	private instances: BABYLON.InstancedMesh[] = [];
	private ownsContainer = false;

	constructor(scene: BABYLON.Scene, pathPoints: BABYLON.Vector3[]) {
		this.scene = scene;
		this.pathPoints = pathPoints;
	}

	/**
	 * Load and place model instances along the path
	 */
	async load(config: ModelPlacerConfig): Promise<void> {
		console.log(`Loading model: ${config.filename}`);

		try {
			if (config.container) {
				// Use provided preloaded container
				this.container = config.container;
				this.ownsContainer = false;
				if (this.container?.addAllToScene) {
					this.container.addAllToScene();
				}
			} else {
				const moduleLoader = (BABYLON as any).loadAssetContainerAsync;
				if (typeof moduleLoader !== 'function') {
					throw new Error('loadAssetContainerAsync not available');
				}

				this.container = await moduleLoader.call(BABYLON, config.filename, this.scene, {
					rootUrl: config.rootUrl,
					pluginOptions: { gltf: {} }
				});
				this.ownsContainer = true;

				if (this.container?.addAllToScene) {
					this.container.addAllToScene();
				}
			}

			this.template = this.findTemplateMesh();
			if (!this.template) {
				throw new Error('No valid mesh found in model');
			}

			// Hide template but keep enabled so instances work
			this.template.isVisible = false;

			// Only apply custom material if provided, otherwise keep original
			if (config.material) {
				this.template.material = config.material;
			}

			await this.createInstances(config);

			console.log(`Created ${config.count} model instances`);
		} catch (error) {
			console.error('Failed to load model:', error);
			throw error;
		}
	}

	private findTemplateMesh(): BABYLON.Mesh | undefined {
		// Try container first
		if (this.container?.meshes) {
			const mesh = this.container.meshes.find((m: any) => m.geometry) as BABYLON.Mesh | undefined;
			if (mesh) return mesh;
		}
		// Search scene for recently added meshes with geometry
		const meshes = this.scene.meshes.filter(m => m.geometry) as BABYLON.Mesh[];
		return meshes[meshes.length - 1]; // Get most recently added mesh
	}

	private async createInstances(config: ModelPlacerConfig): Promise<void> {
		if (!this.template) return;

		const step = Math.floor(this.pathPoints.length / config.count);
		const scale = config.scale ?? 1;
		const offsetY = config.offsetY ?? 0;

		for (let i = 0; i < config.count; i++) {
			const pos = this.pathPoints[i * step]?.clone();
			if (!pos) continue;

			pos.y += offsetY;

			const instance = this.template.createInstance(`model_instance_${i}`);
			instance.position.copyFrom(pos);
			instance.scaling.setAll(scale);
		instance.isVisible = true;

		if (config.physics) {
			this.addPhysics(instance, config.physics);
		}

			this.instances.push(instance);
		}
	}

	private addPhysics(
		instance: BABYLON.InstancedMesh,
		physics: NonNullable<ModelPlacerConfig['physics']>
	): void {
		const shape = physics.shape ?? BABYLON.PhysicsShapeType.MESH;
		const mass = physics.mass ?? 0.05;
		const restitution = physics.restitution ?? 0.3;
		const friction = physics.friction ?? 0.05;

		try {
			new BABYLON.PhysicsAggregate(instance, shape, { mass, restitution, friction }, this.scene);
		} catch (e) {
			if (shape === BABYLON.PhysicsShapeType.MESH) {
				console.warn('Mesh physics failed, falling back to box:', e);
				try {
					new BABYLON.PhysicsAggregate(
						instance,
						BABYLON.PhysicsShapeType.BOX,
						{ mass, restitution, friction },
						this.scene
					);
				} catch (err) {
					console.warn('Box physics also failed:', err);
				}
			}
		}
	}

	dispose(): void {
		this.instances.forEach((instance) => {
			try {
				instance.dispose();
			} catch (e) {
				/* ignore */
			}
		});
		this.instances = [];

		if (this.template) {
			try {
				this.template.dispose();
			} catch (e) {
				/* ignore */
			}
		}

		if (this.container && this.ownsContainer) {
			try {
				this.container.dispose();
			} catch (e) {
				/* ignore */
			}
		}
	}

	getInstances(): BABYLON.InstancedMesh[] {
		return this.instances;
	}
}
