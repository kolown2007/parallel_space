import * as BABYLON from '@babylonjs/core';
import { ModelPlacer } from './ModelPlacer';
import { Portal } from './Portal';
import { BillboardManager } from './BillboardManager';
import { createFloatingCubes, type FloatingCubesResult } from './floatingCubes';

export type ObstacleType = 'cube' | 'model' | 'portal' | 'billboard' | 'floating-cube';

export interface BaseObstacleOptions {
	index?: number;
	indices?: number | number[];
	count?: number;
	offsetY?: number;
	physics?: boolean | {
		mass?: number;
		shape?: BABYLON.PhysicsShapeType;
		restitution?: number;
		friction?: number;
	};
	scale?: number | BABYLON.Vector3;
	randomPositions?: boolean;
}

export interface CubeOptions extends BaseObstacleOptions {
	size?: number;
	color?: BABYLON.Color3;
}

export interface ModelOptions extends BaseObstacleOptions {
	modelNames: string[];
	scaleRange?: [number, number];
	targetSize?: number;
}

export interface PortalOptions extends BaseObstacleOptions {
	posterRef: string;
	videoRef: string;
	width?: number;
	height?: number;
	onTrigger?: () => void;
}

export interface BillboardOptions extends BaseObstacleOptions {
	textureUrl?: string;
	width?: number;
	height?: number;
}

export interface FloatingCubeOptions extends BaseObstacleOptions {
	jitter?: number;
	verticalOffset?: number;
	sizeRange?: [number, number];
	massRange?: [number, number];
	antiGravityFactor?: number;
	linearDamping?: number;
}

export type ObstacleOptions = 
	| CubeOptions 
	| ModelOptions 
	| PortalOptions 
	| BillboardOptions 
	| FloatingCubeOptions;

/**
 * Unified API for placing all types of obstacles along a path
 */
export class ObstacleFactory {
	private scene: BABYLON.Scene;
	private pathPoints: BABYLON.Vector3[];
	private modelCache: Map<string, BABYLON.AssetContainer>;
	private cleanupRegistry: Array<() => void>;
	private instances: BABYLON.AbstractMesh[] = [];

	constructor(
		scene: BABYLON.Scene,
		pathPoints: BABYLON.Vector3[],
		modelCache: Map<string, BABYLON.AssetContainer>,
		cleanupRegistry: Array<() => void>
	) {
		this.scene = scene;
		this.pathPoints = pathPoints;
		this.modelCache = modelCache;
		this.cleanupRegistry = cleanupRegistry;
	}

	/**
	 * Resolve index or indices from options supporting `index`, `progress`, `degree`, `indices`, and `randomPositions`.
	 * If `count` > 1 and randomPositions true, returns an array of indices.
	 */
	private resolveIndices(opts: any = {}, count = 1): number | number[] {
		const pts = this.pathPoints || [];
		if (!pts.length) return 0;
		if (opts.indices !== undefined && opts.indices !== null) {
			if (Array.isArray(opts.indices)) return opts.indices.map((i: number) => this.normalizeIndex(i));
			return this.normalizeIndex(opts.indices as number);
		}
		if (typeof opts.index === 'number') return this.normalizeIndex(opts.index);
		if (typeof opts.progress === 'number') {
			const prog = Math.max(0, Math.min(1, opts.progress));
			return Math.round(prog * (pts.length - 1));
		}
		if (typeof opts.degree === 'number') {
			const prog = (((opts.degree % 360) + 360) % 360) / 360;
			return Math.round(prog * (pts.length - 1));
		}
		if (opts.randomPositions) {
			if (count <= 1) return Math.floor(Math.random() * pts.length);
			const out: number[] = [];
			for (let i = 0; i < count; i++) out.push(Math.floor(Math.random() * pts.length));
			return out;
		}
		return 0;
	}

	/**
	 * Place obstacles of any type along the path
	 */
	async place(type: ObstacleType, options: ObstacleOptions): Promise<any> {
		switch (type) {
			case 'cube':
				return this.placeCube(options as CubeOptions);
			case 'model':
				return this.placeModel(options as ModelOptions);
			case 'portal':
				return this.placePortal(options as PortalOptions);
			case 'billboard':
				return this.placeBillboard(options as BillboardOptions);
			case 'floating-cube':
				return this.placeFloatingCubes(options as FloatingCubeOptions);
			default:
				throw new Error(`Unknown obstacle type: ${type}`);
		}
	}

	/**
	 * Place a simple cube obstacle
	 */
	private placeCube(options: CubeOptions): BABYLON.Mesh {
		const {
			size = 2,
			color = new BABYLON.Color3(1, 0.5, 0),
			physics = true,
			offsetY = 0,
			count = 1
		} = options;

		const indices = this.resolveIndices(options, count);
		const createAt = (idx: number) => {
			const actualIndex = this.normalizeIndex(idx);
			const pos = this.pathPoints[actualIndex].clone();
			pos.y += offsetY;

			const cube = BABYLON.MeshBuilder.CreateBox(
				`obstacle_cube_${actualIndex}_${Date.now()}`,
				{ size },
				this.scene
			);
			cube.position.copyFrom(pos);

			const mat = new BABYLON.StandardMaterial(`cubeMat_${Date.now()}`, this.scene);
			mat.diffuseColor = color;
			mat.emissiveColor = color.scale(0.3);
			cube.material = mat;

			if (physics && this.scene.getPhysicsEngine()) {
				const physicsOptions = typeof physics === 'object' ? physics : {
					mass: 0.05,
					restitution: 0.3,
					friction: 0.05
				};
				new BABYLON.PhysicsAggregate(
					cube,
					physicsOptions.shape ?? BABYLON.PhysicsShapeType.BOX,
					{
						mass: physicsOptions.mass ?? 0.05,
						restitution: physicsOptions.restitution ?? 0.3,
						friction: physicsOptions.friction ?? 0.05
					},
					this.scene
				);
			}

			this.instances.push(cube);
			return cube;
		};

		if (Array.isArray(indices)) {
			const created = indices.map((i) => createAt(i));
			return created[0];
		} else {
			return createAt(indices as number);
		}

	}

	/**
	 * Place 3D model(s) using ModelPlacer
	 */
	private async placeModel(options: ModelOptions): Promise<void> {
		const {
			modelNames,
			count = 1,
			randomPositions = false,
			indices,
			scaleRange = [1.0, 1.0],
			physics = true,
			targetSize = 2.0
		} = options;

		await ModelPlacer.placeModels(
			this.scene,
			this.pathPoints,
			modelNames,
			{
				countPerModel: count,
				randomPositions,
				positionIndices: indices,
				scaleRange,
				physics: typeof physics === 'boolean' ? physics : true,
				targetSize
			},
			this.modelCache,
			this.cleanupRegistry
		);
	}

	/**
	 * Place a portal
	 */
	private placePortal(options: PortalOptions): Portal {
		const {
			index = 0,
			posterRef,
			videoRef,
			width = 3,
			height = 4,
			offsetY = 0,
			count = 1
		} = options;

		const indices = this.resolveIndices(options, count);
		const createPortalAt = (idx: number) => {
			const actualIndex = this.normalizeIndex(idx);
			const pos = this.pathPoints[actualIndex].clone();
			pos.y += offsetY;

			const portal = new Portal(
				posterRef,
				videoRef,
				pos,
				{ x: width, y: height, z: 0.5 },
				this.scene,
				{ width, height }
			);
			return portal;
		};

		if (Array.isArray(indices)) {
			const created = indices.map((i) => createPortalAt(i));
			for (const p of created) {
				try {
					if (p?.mesh) this.instances.push(p.mesh);
					this.cleanupRegistry.push(() => { try { p.reset(); } catch {} });
				} catch (e) {}
			}
			return created[0];
		} else {
			const p = createPortalAt(indices as number);
			try {
				if (p?.mesh) this.instances.push(p.mesh);
				this.cleanupRegistry.push(() => { try { p.reset(); } catch {} });
			} catch (e) {}
			return p;
		}
	}

	/**
	 * Place billboards along the path
	 */
	private async placeBillboard(options: BillboardOptions): Promise<BillboardManager> {
		const {
			count = 8,
			textureUrl,
			width = 4,
			height = 4
		} = options;

		const billboardManager = new BillboardManager(this.scene, {
			count,
			textureUrl,
			size: { width, height }
		});

		await billboardManager.createAlongPath(this.pathPoints);
		return billboardManager;
	}

	/**
	 * Place floating cubes with physics
	 */
	private placeFloatingCubes(options: FloatingCubeOptions): FloatingCubesResult {
		const {
			count = 3,
			jitter = 0.05,
			verticalOffset = 0.5,
			sizeRange = [0.2, 1],
			massRange = [0.008, 0.8],
			antiGravityFactor = 1.0,
			linearDamping = 0.985
		} = options;

		const result = createFloatingCubes(this.scene, this.pathPoints, {
			count,
			jitter,
			verticalOffset,
			sizeRange,
			massRange,
			antiGravityFactor,
			linearDamping
		});

		this.cleanupRegistry.push(() => {
			try { result.dispose(); } catch (e) { /* ignore */ }
		});

		return result;
	}

	/**
	 * Helper: normalize index to valid path range
	 */
	private normalizeIndex(index: number): number {
		if (!this.pathPoints || this.pathPoints.length === 0) return 0;
		return ((index % this.pathPoints.length) + this.pathPoints.length) % this.pathPoints.length;
	}

	/**
	 * Get all placed instances
	 */
	getInstances(): BABYLON.AbstractMesh[] {
		return this.instances;
	}

	/**
	 * Dispose all managed obstacles
	 */
	dispose(): void {
		for (const instance of this.instances) {
			try { instance.dispose(); } catch (e) { /* ignore */ }
		}
		this.instances = [];
	}
}
