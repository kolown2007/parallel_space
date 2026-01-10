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
				console.error('  ✗ No valid mesh found in model - container meshes:', this.container?.meshes?.map((m:any)=>m.name));
				throw new Error('No valid mesh found in model');
			}

			console.log(`  ↳ Using template mesh:`, this.template.name, `(isVisible: ${this.template.isVisible})`);
			try {
				console.log('  ↳ Template scene:', !!this.template.getScene(), 'template parent:', this.template.parent?.name ?? null);
				console.log('  ↳ Template position:', this.template.position?.toString?.() ?? this.template.position);
				console.log('  ↳ Scene mesh count (before instances):', this.scene.meshes.length);
			} catch (e) {
				console.warn('  ⚠ Template debug log failed:', e);
			}

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

		console.log(`  ↳ createInstances: count=${config.count}, step=${step}, scale=${scale}, startIndex=${startIndex}`);

		for (let i = 0; i < config.count; i++) {
			const pathIndex = (startIndex + (i * step)) % this.pathPoints.length;
			const pos = this.pathPoints[pathIndex]?.clone();
			if (!pos) continue;

			pos.y += offsetY;

			const instance = this.template.createInstance(`model_instance_${i}`);
			if (!instance) {
				console.warn('  ⚠ createInstance returned null for', this.template.name);
				continue;
			}
			instance.position.copyFrom(pos);
			instance.scaling.setAll(scale);
			instance.isVisible = true;
			try {
				console.log(`  ↳ Created instance: ${instance.name}, visible: ${instance.isVisible}, pos: ${pos.toString()}, scene?: ${!!instance.getScene()}`);
			} catch (e) {
				/* ignore logging errors */
			}

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

	/**
	 * Static helper: Place multiple models by name with automatic normalization.
	 * @param scene - Babylon scene
	 * @param pathPoints - Path points for placement
	 * @param modelNames - Array of model IDs from assets.json
	 * @param options - Configuration options
	 * @param modelCache - Cache for loaded containers
	 * @param cleanupRegistry - Registry for cleanup callbacks
	 */
	static async placeModels(
		scene: BABYLON.Scene,
		pathPoints: BABYLON.Vector3[],
		modelNames: string[],
		options: {
			countPerModel?: number;
			randomPositions?: boolean;
			scaleRange?: [number, number];
			physics?: boolean;
			targetSize?: number;
		} = {},
		modelCache: Map<string, BABYLON.AssetContainer>,
		cleanupRegistry: Array<() => void>
	): Promise<void> {
		try {
			// Dynamically import loadAssetsConfig to avoid circular dependencies
			const { loadAssetsConfig } = await import('../../assetsConfig');
			const cfg = await loadAssetsConfig();
			
			const {
				countPerModel,
				randomPositions = true,
				scaleRange = [0.5, 2.0],
				physics = true,
				targetSize = 2.0
			} = options;

			console.log(`🎨 Placing models: ${modelNames.join(', ')}, normalized to ${targetSize}m`);

			for (const modelId of modelNames) {
				try {
					const def = cfg.models?.[modelId];
					if (!def?.rootUrl || !def?.filename) {
						console.warn(`⚠️ Model "${modelId}" not found in assets`);
						continue;
					}

					const instanceCount = countPerModel ?? (Math.floor(Math.random() * 3) + 1);

					let container = modelCache.get(modelId);
					if (container) {
						const meshScene = container.meshes[0]?.getScene();
						if (meshScene !== scene) {
							try { container.dispose(); } catch (e) { /* ignore */ }
							container = undefined as any;
							modelCache.delete(modelId);
						}
					}
					if (!container) {
						container = await BABYLON.SceneLoader.LoadAssetContainerAsync(
							def.rootUrl,
							def.filename,
							scene
						);
						if (container?.addAllToScene) {
							container.addAllToScene();
						}
						modelCache.set(modelId, container);
					}

					let normalizeScale = 1.0;
					try {
						const meshesWithGeometry = container.meshes.filter((m: any) => m.getTotalVertices && m.getTotalVertices() > 0);
						
						if (meshesWithGeometry.length > 0) {
							let minX = Infinity, minY = Infinity, minZ = Infinity;
							let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
							
							for (const mesh of meshesWithGeometry) {
								mesh.computeWorldMatrix(true);
								const boundingInfo = mesh.getBoundingInfo();
								const min = boundingInfo.boundingBox.minimumWorld;
								const max = boundingInfo.boundingBox.maximumWorld;
								
								minX = Math.min(minX, min.x);
								minY = Math.min(minY, min.y);
								minZ = Math.min(minZ, min.z);
								maxX = Math.max(maxX, max.x);
								maxY = Math.max(maxY, max.y);
								maxZ = Math.max(maxZ, max.z);
							}
							
							const sizeX = maxX - minX;
							const sizeY = maxY - minY;
							const sizeZ = maxZ - minZ;
							const maxDimension = Math.max(sizeX, sizeY, sizeZ);
							
							if (maxDimension > 0) {
								normalizeScale = targetSize / maxDimension;
								console.log(`  ↳ ${modelId}: native size=${sizeX.toFixed(3)}×${sizeY.toFixed(3)}×${sizeZ.toFixed(3)}m, max=${maxDimension.toFixed(3)}m, normalize scale=${normalizeScale.toFixed(3)}`);
							}
						} else {
							console.warn(`  ⚠ ${modelId}: No meshes with geometry found for normalization`);
						}
					} catch (e) {
						console.warn(`  ⚠ ${modelId}: Failed to calculate normalization:`, e);
					}

					for (let i = 0; i < instanceCount; i++) {
						const placer = new ModelPlacer(scene, pathPoints);
						const userScale = scaleRange[0] + Math.random() * (scaleRange[1] - scaleRange[0]);
						const finalScale = normalizeScale * userScale;
						const pathIndex = randomPositions ? Math.floor(Math.random() * pathPoints.length) : Math.floor((i / instanceCount) * pathPoints.length);

						await placer.load({
							container,
							rootUrl: def.rootUrl,
							filename: def.filename,
							count: 1,
							scale: finalScale,
							offsetY: (def as any).offsetY ?? 0,
							physics: physics && scene.getPhysicsEngine() ? {
								mass: 0.05,
								restitution: 0.3,
								friction: 0.05,
								shape: BABYLON.PhysicsShapeType.MESH
							} : undefined,
							startIndex: pathIndex
						});

						cleanupRegistry.push(() => {
							try { placer.dispose(); } catch (e) { /* ignore */ }
						});

						console.log(`✓ Placed ${modelId} #${i + 1} at index ${pathIndex}, userScale: ${userScale.toFixed(2)}, finalScale: ${finalScale.toFixed(2)}`);
					}
				} catch (e) {
					console.warn(`Failed to place model ${modelId}:`, e);
				}
			}

			console.log(`✨ Placed ${modelNames.length} model types`);
		} catch (e) {
			console.error('placeModels failed:', e);
		}
	}
}
