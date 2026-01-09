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
	// Optional: start placing instances from this path index instead of beginning
	startIndex?: number;
}

export class ModelPlacer {
	private scene: BABYLON.Scene;
	private pathPoints: BABYLON.Vector3[];
	private container?: BABYLON.AssetContainer;
	private template?: BABYLON.Mesh;
	private instances: BABYLON.InstancedMesh[] = [];
	private ownsContainer = false;
	private containerWasInScene = false;

	constructor(scene: BABYLON.Scene, pathPoints: BABYLON.Vector3[]) {
		this.scene = scene;
		this.pathPoints = pathPoints;
	}

	/**
	 * Load and place model instances along the path
	 */
	async load(config: ModelPlacerConfig): Promise<void> {
		console.log(`📦 ModelPlacer.load: ${config.filename}, count: ${config.count}, scale: ${config.scale ?? 1}`);

		try {
			if (config.container) {
				// Use provided preloaded container
				console.log(`  ↳ Using preloaded container (not owned by placer)`);
				this.container = config.container;
				this.ownsContainer = false;
				
				// Check if container is already in scene by checking if its meshes have parent scene
				const firstMesh = this.container?.meshes?.[0];
				this.containerWasInScene = !!(firstMesh && firstMesh.getScene());
				
				if (!this.containerWasInScene && this.container?.addAllToScene) {
					console.log(`  ↳ Adding container to scene for first time`);
					this.container.addAllToScene();
					this.containerWasInScene = true;
				} else {
					console.log(`  ↳ Container already in scene, will instantiate from existing meshes`);
				}
			} else {
				console.log(`  ↳ Loading new container from URL: ${config.rootUrl}${config.filename}`);
				const moduleLoader = (BABYLON as any).SceneLoader.LoadAssetContainerAsync;
				if (typeof moduleLoader !== 'function') {
					console.error('✗ SceneLoader.LoadAssetContainerAsync not available!');
					console.log('Available BABYLON.SceneLoader methods:', Object.keys(BABYLON.SceneLoader || {}));
					throw new Error('SceneLoader.LoadAssetContainerAsync not available');
				}

				// Correct order: rootUrl, sceneFilename, scene, onSuccess, onProgress, onError, pluginExtension
				console.log(`  ↳ Calling LoadAssetContainerAsync with:`, { rootUrl: config.rootUrl, filename: config.filename });
				this.container = await moduleLoader.call(
					BABYLON.SceneLoader,
					config.rootUrl,
					config.filename,
					this.scene,
					undefined, // onSuccess
					undefined, // onProgress
					undefined, // onError
					'.glb' // pluginExtension
				);
				console.log(`  ↳ Container loaded, meshes count:`, this.container?.meshes?.length);
				this.ownsContainer = true;
				this.containerWasInScene = false;

				if (this.container?.addAllToScene) {
					this.container.addAllToScene();
					this.containerWasInScene = true;
					console.log(`  ↳ Added container to scene`);
				}
			}

			this.template = this.findTemplateMesh();
			if (!this.template) {
				throw new Error('No valid mesh found in model');
			}

			console.log(`  ↳ Using template mesh:`, this.template.name, `(isVisible: ${this.template.isVisible})`);

			// Hide template but keep enabled so instances work
			this.template.isVisible = false;

			// Only apply custom material if provided, otherwise keep original
			if (config.material) {
				this.template.material = config.material;
			}

			await this.createInstances(config);

			console.log(`✓ ModelPlacer created ${this.instances.length}/${config.count} instances`);
		} catch (error) {
			console.error('✗ ModelPlacer.load failed:', error);
			throw error;
		}
	}

	private findTemplateMesh(): BABYLON.Mesh | undefined {
		// Try container first - this is most reliable
		if (this.container?.meshes) {
			console.log(`  ↳ Container has ${this.container.meshes.length} meshes:`, this.container.meshes.map((m: any) => m.name));
			const mesh = this.container.meshes.find((m: any) => m.geometry) as BABYLON.Mesh | undefined;
			if (mesh) {
				console.log(`  ↳ Found template mesh in container:`, mesh.name);
				return mesh;
			}
			console.warn(`  ⚠ No mesh with geometry found in container!`);
		} else {
			console.warn(`  ⚠ Container has no meshes!`);
		}
		// Fallback: Search scene for recently added meshes with geometry
		// This is less reliable and can grab wrong meshes like billboards/portals
		console.warn(`  ⚠ Falling back to scene search for template mesh`);
		const meshes = this.scene.meshes.filter(m => m.geometry && !m.name.includes('billboard') && !m.name.includes('portal')) as BABYLON.Mesh[];
		console.log(`  ↳ Found ${meshes.length} candidate meshes in scene (last 5):`, meshes.slice(-5).map(m => m.name));
		const candidate = meshes[meshes.length - 1];
		if (candidate) {
			console.warn(`  ⚠ Using fallback template search, found:`, candidate.name);
		}
		return candidate;
	}

	private async createInstances(config: ModelPlacerConfig): Promise<void> {
		if (!this.template) return;

		const step = Math.floor(this.pathPoints.length / config.count);
		const scale = config.scale ?? 1;
		const offsetY = config.offsetY ?? 0;
		const startIndex = config.startIndex ?? 0;

		for (let i = 0; i < config.count; i++) {
			const pathIndex = (startIndex + (i * step)) % this.pathPoints.length;
			const pos = this.pathPoints[pathIndex]?.clone();
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
		console.log(`🗑️ ModelPlacer.dispose: disposing ${this.instances.length} instances, ownsContainer: ${this.ownsContainer}`);
		
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
