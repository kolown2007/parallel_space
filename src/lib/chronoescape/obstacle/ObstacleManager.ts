import * as BABYLON from '@babylonjs/core';
import { ModelPlacer } from './Model';
import { Portal } from './Portal';
import { BillboardManager } from './Billboard';
import { createFloatingCubes, type FloatingCubesResult } from './Cubes';
import { createParticles, type ParticleOptions } from './Particles';
import { createOrb, type OrbResult } from './Orb';
import { getTextureUrl } from '../../assetsConfig';

export type ObstacleType = 'cube' | 'model' | 'portal' | 'billboard' | 'floating-cube' | 'particles' | 'orb';

//updates

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
	thrustMs?: number;
	thrustSpeed?: number;
	distance?: number;
	autoDisposeMs?: number;
	pointsAhead?: number;
	textureId?: string;
	textureUrl?: string;
	/** Texture URL for 6-face UV mapping */
	faceUVTextureUrl?: string;
	/** Asset ID to resolve faceUV texture via getTextureUrl() */
	faceUVTextureId?: string;
	/** Layout: 'vertical' (6 rows), 'horizontal' (6 cols), or 'grid' (3x2) */
	faceUVLayout?: 'vertical' | 'horizontal' | 'grid';
}

export interface ModelOptions extends BaseObstacleOptions {
	/** Single model id or array of model ids from assets.json */
	modelNames: string | string[];
	scaleRange?: [number, number];
	targetSize?: number;
}

export interface PortalOptions extends BaseObstacleOptions {
	/** texture id or direct url for the poster; may be a single id/string or an array of ids for random selection */
	posterTextureId?: string | string[];
	width?: number;
	height?: number;
	onTrigger?: () => void;
}

export interface BillboardOptions extends BaseObstacleOptions {
	textureUrl?: string;
	/** Asset id or array of ids to resolve via getTextureUrl() */
	textureId?: string | string[];
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
	distance?: number; // For inFrontOfDrone methods
	spread?: number; // For inFrontOfDrone methods
}

export interface OrbOptions extends BaseObstacleOptions {
	height?: number;
	diameter?: number;
	glowIntensity?: number;
	lightIntensity?: number;
	lightRange?: number;
	color?: BABYLON.Color3;
	/** Local point-light radius to limit illumination around the orb */
	localRange?: number;
	/** Enable glow/bloom around the orb */
	glow?: boolean;
	/** Use a rectangular area light when available (fallback to point light) */
	areaLight?: boolean;
	/** [width, height] for rectangular area light */
	areaLightSize?: [number, number];
	/** Intensity for rectangular area light (separate from point/area unified intensity) */
	areaLightIntensity?: number;
	/** Local offset applied to the light position relative to orb */
	areaLightOffset?: BABYLON.Vector3;
}

export type ObstacleOptions = 
	| CubeOptions 
	| ModelOptions 
	| PortalOptions 
	| BillboardOptions 
	| FloatingCubeOptions
	| ParticleOptions
	| OrbOptions;

/**
 * Unified obstacle management system for the game.
 * Provides instance methods for path-based placement and static helpers for common patterns.
 */
export class ObstacleManager {
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

		// Ensure the manager disposes its instances when the global cleanup runs
		this.cleanupRegistry.push(() => {
			try { this.dispose(); } catch (e) { /* ignore */ }
		});
	}

	// ===================================================================
	// STATIC HELPERS - Universal patterns (no path required)
	// ===================================================================

	/**
	 * Place a cube obstacle in front of a drone (common game pattern).
	 * Default: spawns 5 units ahead with thrust for 2 seconds.
	 */
	static cubeInFrontOfDrone(
		scene: BABYLON.Scene,
		droneMesh: BABYLON.AbstractMesh,
		options?: CubeOptions
	): BABYLON.Mesh | undefined {
		const {
			distance = 10,
			size = 6,
			color = new BABYLON.Color3(1, 0.5, 0),
			physics = true,
			offsetY = 0,
			thrustMs = 2000,
			thrustSpeed = 5,
			pointsAhead = 10,
			autoDisposeMs = 60000,
			faceUVTextureUrl,
			faceUVTextureId,
			faceUVLayout = 'grid'
		} = options || {};

		const pathPoints: BABYLON.Vector3[] = (scene as any).metadata?.pathPoints || (scene as any).pathPoints || [];

		const normalizeIndex = (idx: number) => {
			if (!pathPoints || pathPoints.length === 0) return 0;
			return ((idx % pathPoints.length) + pathPoints.length) % pathPoints.length;
		};

		if (pathPoints && pathPoints.length > 0) {
			// find nearest path point to drone
			let currentPointIndex = 0;
			let minDistSq = Number.POSITIVE_INFINITY;
			const dronePos = (droneMesh as any).position ?? droneMesh.getAbsolutePosition?.();
			for (let i = 0; i < pathPoints.length; i++) {
				const d = pathPoints[i].subtract(dronePos).lengthSquared();
				if (d < minDistSq) { minDistSq = d; currentPointIndex = i; }
			}

			const targetIndex = (typeof (options as any)?.index === 'number')
				? normalizeIndex((options as any).index)
				: normalizeIndex(currentPointIndex + (pointsAhead || 0));

			const pos = pathPoints[targetIndex].clone();
			pos.y += offsetY;

			// Generate faceUV if using faceUV texture
			let faceUV: BABYLON.Vector4[] | undefined;
			if (faceUVTextureUrl || faceUVTextureId) {
				faceUV = new Array(6);
				if (faceUVLayout === 'vertical') {
					for (let i = 0; i < 6; i++) {
						faceUV[i] = new BABYLON.Vector4(0, i / 6, 1, (i + 1) / 6);
					}
				} else if (faceUVLayout === 'horizontal') {
					for (let i = 0; i < 6; i++) {
						faceUV[i] = new BABYLON.Vector4(i / 6, 0, (i + 1) / 6, 1);
					}
				} else {
					// Grid layout (3x2) - Babylon.js face order: back, front, right, left, top, bottom
					faceUV[0] = new BABYLON.Vector4(0, 0.5, 1/3, 1);
					faceUV[1] = new BABYLON.Vector4(1/3, 0.5, 2/3, 1);
					faceUV[2] = new BABYLON.Vector4(2/3, 0.5, 1, 1);
					faceUV[3] = new BABYLON.Vector4(0, 0, 1/3, 0.5);
					faceUV[4] = new BABYLON.Vector4(1/3, 0, 2/3, 0.5);
					faceUV[5] = new BABYLON.Vector4(2/3, 0, 1, 0.5);
				}
			}

			const boxOptions: any = { size };
			if (faceUV) {
				boxOptions.faceUV = faceUV;
			}

			const cube = BABYLON.MeshBuilder.CreateBox(
				`obstacle_cube_${targetIndex}_${Date.now()}`,
				boxOptions,
				scene
			);
			cube.position.copyFrom(pos);

			const mat = new BABYLON.StandardMaterial(`cubeMat_${Date.now()}`, scene);
			mat.backFaceCulling = false;
			const applyFallbackColor = () => {
				mat.diffuseColor = color;
				mat.emissiveColor = BABYLON.Color3.Black();
			};

			// Apply faceUV texture helper
			const applyFaceUVTexture = (url: string) => {
				const texture = new BABYLON.Texture(url, scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
				texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
				texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
				mat.diffuseTexture = texture;
				mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
				mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
			};

			// Priority 1: faceUVTextureUrl
			if (faceUVTextureUrl) {
				applyFaceUVTexture(faceUVTextureUrl);
			}
			// Priority 2: faceUVTextureId (async resolve) - await it!
			else if (faceUVTextureId) {
				// Use IIFE to await the texture URL resolution
				(async () => {
					try {
						const url = await getTextureUrl(faceUVTextureId);
						if (url) {
							console.log(`✅ Resolved faceUVTextureId '${faceUVTextureId}' -> ${url}`);
							applyFaceUVTexture(url);
						} else {
							console.warn(`⚠️ faceUVTextureId '${faceUVTextureId}' resolved to empty URL`);
							applyFallbackColor();
						}
					} catch (e) {
						console.error(`❌ Failed to resolve faceUVTextureId '${faceUVTextureId}':`, e);
						applyFallbackColor();
					}
				})();
				// Apply placeholder color immediately while texture loads
				applyFallbackColor();
			}
			// Priority 3: textureUrl
			else if ((options as any)?.textureUrl) {
				mat.diffuseTexture = new BABYLON.Texture((options as any).textureUrl, scene);
				mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
			}
			// Priority 4: textureId (async resolve)
			else if ((options as any)?.textureId) {
				(async () => {
					try {
						const url = await getTextureUrl((options as any).textureId);
						if (url) mat.diffuseTexture = new BABYLON.Texture(url, scene);
						else applyFallbackColor();
					} catch {
						applyFallbackColor();
					}
				})();
			} else {
				// Priority 5: Fallback color
				applyFallbackColor();
			}
		
			cube.material = mat;
			if (physics && scene.getPhysicsEngine()) {
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
					scene
				);

				// Optional thrust along path tangent (use opposite direction to drone)
				if (thrustMs && thrustSpeed && pathPoints.length > 1) {
					const nextIdx = normalizeIndex(targetIndex + 1);
					const dir = pathPoints[nextIdx].subtract(pathPoints[targetIndex]).normalize();
					const initialVel = dir.scale(-thrustSpeed); // opposite the forward/path tangent

					setTimeout(() => {
						try {
							if ((cube as any).physicsBody?.setLinearVelocity) {
								(cube as any).physicsBody.setLinearVelocity(initialVel);
							}
							if ((cube as any).physicsImpostor?.setLinearVelocity) {
								(cube as any).physicsImpostor.setLinearVelocity(initialVel);
							}
						} catch (e) { /* ignore */ }
					}, 0);

					setTimeout(() => {
						try {
							if ((cube as any).physicsBody?.setLinearVelocity) {
								(cube as any).physicsBody.setLinearVelocity(BABYLON.Vector3.Zero());
							}
							if ((cube as any).physicsImpostor?.setLinearVelocity) {
								(cube as any).physicsImpostor.setLinearVelocity(BABYLON.Vector3.Zero());
							}
						} catch (e) { /* ignore */ }
					}, thrustMs);
				}

				// Auto-dispose to free memory after a configurable delay
				if (autoDisposeMs && typeof autoDisposeMs === 'number' && autoDisposeMs > 0) {
					setTimeout(() => {
						try { cube.dispose(); } catch (e) { /* ignore */ }
					}, autoDisposeMs);
				}
			}

			return cube;
		}

		// Fallback: original behaviour (place directly in front of drone) if no pathPoints
		const forward = droneMesh.forward.clone().normalize();
		const targetPos = droneMesh.position.clone().add(forward.scale(distance));
		targetPos.y += offsetY;

		// Generate faceUV if using faceUV texture (fallback branch)
		let faceUVFallback: BABYLON.Vector4[] | undefined;
		if (faceUVTextureUrl || faceUVTextureId) {
			faceUVFallback = new Array(6);
			if (faceUVLayout === 'vertical') {
				for (let i = 0; i < 6; i++) {
					faceUVFallback[i] = new BABYLON.Vector4(0, i / 6, 1, (i + 1) / 6);
				}
			} else if (faceUVLayout === 'horizontal') {
				for (let i = 0; i < 6; i++) {
					faceUVFallback[i] = new BABYLON.Vector4(i / 6, 0, (i + 1) / 6, 1);
				}
			} else {
				// Grid layout (3x2)
				faceUVFallback[0] = new BABYLON.Vector4(0, 0.5, 1/3, 1);
				faceUVFallback[1] = new BABYLON.Vector4(1/3, 0.5, 2/3, 1);
				faceUVFallback[2] = new BABYLON.Vector4(2/3, 0.5, 1, 1);
				faceUVFallback[3] = new BABYLON.Vector4(0, 0, 1/3, 0.5);
				faceUVFallback[4] = new BABYLON.Vector4(1/3, 0, 2/3, 0.5);
				faceUVFallback[5] = new BABYLON.Vector4(2/3, 0, 1, 0.5);
			}
		}

		const boxOptionsFallback: any = { size };
		if (faceUVFallback) {
			boxOptionsFallback.faceUV = faceUVFallback;
		}

		const cube = BABYLON.MeshBuilder.CreateBox(
			`obstacle_cube_${Date.now()}`,
			boxOptionsFallback,
			scene
		);
		cube.position.copyFrom(targetPos);

		const mat = new BABYLON.StandardMaterial(`cubeMat_${Date.now()}`, scene);
		mat.backFaceCulling = false;
		const applyFallbackColor2 = () => {
			mat.diffuseColor = color;
			mat.emissiveColor = color.scale(0.3);
		};

		// Apply faceUV texture helper (fallback branch)
		const applyFaceUVTextureFallback = (url: string) => {
			const texture = new BABYLON.Texture(url, scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
			texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
			texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
			mat.diffuseTexture = texture;
			mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
			mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
		};

		// Priority 1: faceUVTextureUrl
		if (faceUVTextureUrl) {
			applyFaceUVTextureFallback(faceUVTextureUrl);
		}
		// Priority 2: faceUVTextureId (async resolve)
		else if (faceUVTextureId) {
			(async () => {
				try {
					const url = await getTextureUrl(faceUVTextureId);
					if (url) {
						console.log(`✅ Resolved faceUVTextureId '${faceUVTextureId}' -> ${url}`);
						applyFaceUVTextureFallback(url);
					} else {
						console.warn(`⚠️ faceUVTextureId '${faceUVTextureId}' resolved to empty URL`);
						applyFallbackColor2();
					}
				} catch (e) {
					console.error(`❌ Failed to resolve faceUVTextureId '${faceUVTextureId}':`, e);
					applyFallbackColor2();
				}
			})();
			// Placeholder color while texture loads
			applyFallbackColor2();
		}
		// Priority 3: textureUrl
		else if ((options as any)?.textureUrl) {
			try {
				mat.diffuseTexture = new BABYLON.Texture((options as any).textureUrl, scene);
				mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
			} catch (e) {
				applyFallbackColor2();
			}
		}
		// Priority 4: textureId (async resolve)
		else if ((options as any)?.textureId) {
			(async () => {
				try {
					const url = await getTextureUrl((options as any).textureId);
					if (url) mat.diffuseTexture = new BABYLON.Texture(url, scene);
				} catch (e) {
					applyFallbackColor2();
				}
			})();
			applyFallbackColor2();
		} else {
			applyFallbackColor2();
		}
		cube.material = mat;

		if (physics && scene.getPhysicsEngine()) {
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
				scene
			);

			// Apply thrust opposite the drone forward
			if (thrustMs && thrustSpeed) {
				const initialVel = forward.scale(-thrustSpeed);
				setTimeout(() => {
					try {
						if ((cube as any).physicsBody?.setLinearVelocity) {
							(cube as any).physicsBody.setLinearVelocity(initialVel);
						}
						if ((cube as any).physicsImpostor?.setLinearVelocity) {
							(cube as any).physicsImpostor.setLinearVelocity(initialVel);
						}
					} catch (e) { /* ignore */ }
				}, 0);

				setTimeout(() => {
					try {
						if ((cube as any).physicsBody?.setLinearVelocity) {
							(cube as any).physicsBody.setLinearVelocity(BABYLON.Vector3.Zero());
						}
						if ((cube as any).physicsImpostor?.setLinearVelocity) {
							(cube as any).physicsImpostor.setLinearVelocity(BABYLON.Vector3.Zero());
						}
					} catch (e) { /* ignore */ }
				}, thrustMs);
			}

			// Auto-dispose to free memory after a configurable delay
			if (autoDisposeMs && typeof autoDisposeMs === 'number' && autoDisposeMs > 0) {
				setTimeout(() => {
					try { cube.dispose(); } catch (e) { /* ignore */ }
				}, autoDisposeMs);
			}
		}

		return cube;
	}

	/**
	 * Place floating cubes in front of drone
	 */
	static floatingCubesInFrontOfDrone(
		scene: BABYLON.Scene,
		droneMesh: BABYLON.AbstractMesh,
		cleanupRegistry: Array<() => void>,
		options?: FloatingCubeOptions
	): FloatingCubesResult {
		const { 
			distance = 8, 
			spread = 3,
			count = 3,
			jitter = 0.3,
			verticalOffset = 0.5,
			sizeRange = [0.8, 2.0],
			massRange = [0.6, 1.8]
		} = options || {};
		
		const forward = droneMesh.forward.clone().normalize();
		const basePos = droneMesh.position.clone().add(forward.scale(distance));
		
		const pathPoints: BABYLON.Vector3[] = [];
		for (let i = 0; i < count; i++) {
			const offset = new BABYLON.Vector3(
				(Math.random() - 0.5) * spread,
				(Math.random() - 0.5) * spread * 0.5,
				(Math.random() - 0.5) * spread
			);
			pathPoints.push(basePos.clone().add(offset));
		}

		const result = createFloatingCubes(scene, pathPoints, {
			count,
			jitter,
			verticalOffset,
			sizeRange,
			massRange
		}, cleanupRegistry);

		cleanupRegistry.push(() => {
			try { result.dispose(); } catch (e) {}
		});

		return result;
	}

	// ===================================================================
	// INSTANCE METHODS - Path-based placement
	// ===================================================================

	/**
	 * Place any obstacle type along the path
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
			case 'particles':
				return this.placeParticles(options as any);
			case 'floating-cube':
				return this.placeFloatingCubes(options as FloatingCubeOptions);
			case 'orb':
				return this.placeOrb(options as OrbOptions);
			default:
				throw new Error(`Unknown obstacle type: ${type}`);
		}
	}

	/**
	 * Place a cube along the path
	 */
	private placeCube(options: CubeOptions): BABYLON.Mesh {
		const {
			size = 2,
			color = new BABYLON.Color3(1, 0.5, 0),
			physics = true,
			offsetY = 0,
			count = 1,
			thrustMs,
			thrustSpeed,
			autoDisposeMs,
			faceUVTextureUrl,
			faceUVTextureId,
			faceUVLayout = 'grid'
		} = options;

		const indices = this.resolveIndices(options, count);
		const createAt = (idx: number) => {
			const actualIndex = this.normalizeIndex(idx);
			const pos = this.pathPoints[actualIndex].clone();
			pos.y += offsetY;

			// Generate faceUV if using faceUV texture
			let faceUV: BABYLON.Vector4[] | undefined;
			if (faceUVTextureUrl || faceUVTextureId) {
				faceUV = new Array(6);
				if (faceUVLayout === 'vertical') {
					for (let i = 0; i < 6; i++) {
						faceUV[i] = new BABYLON.Vector4(0, i / 6, 1, (i + 1) / 6);
					}
				} else if (faceUVLayout === 'horizontal') {
					for (let i = 0; i < 6; i++) {
						faceUV[i] = new BABYLON.Vector4(i / 6, 0, (i + 1) / 6, 1);
					}
				} else {
					// Grid layout (3x2)
					faceUV[0] = new BABYLON.Vector4(0, 0.5, 1/3, 1);
					faceUV[1] = new BABYLON.Vector4(1/3, 0.5, 2/3, 1);
					faceUV[2] = new BABYLON.Vector4(2/3, 0.5, 1, 1);
					faceUV[3] = new BABYLON.Vector4(0, 0, 1/3, 0.5);
					faceUV[4] = new BABYLON.Vector4(1/3, 0, 2/3, 0.5);
					faceUV[5] = new BABYLON.Vector4(2/3, 0, 1, 0.5);
				}
			}

			const boxOptions: any = { size };
			if (faceUV) boxOptions.faceUV = faceUV;

			const cube = BABYLON.MeshBuilder.CreateBox(
				`obstacle_cube_${actualIndex}_${Date.now()}`,
				boxOptions,
				this.scene
			);
			cube.position.copyFrom(pos);

			const mat = new BABYLON.StandardMaterial(`cubeMat_${Date.now()}`, this.scene);
			mat.backFaceCulling = false;
			const applyFallbackColor3 = () => {
				mat.diffuseColor = color;
				mat.emissiveColor = BABYLON.Color3.Black();
			};

			// Helper to apply a face-UV texture
			const applyFaceUVTexture = (url: string) => {
				const texture = new BABYLON.Texture(url, this.scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
				texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
				texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
				mat.diffuseTexture = texture;
				mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
				mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
			};

			// Priority 1: faceUVTextureUrl
			if (faceUVTextureUrl) {
				applyFaceUVTexture(faceUVTextureUrl);
			}
			// Priority 2: faceUVTextureId (async resolve)
			else if (faceUVTextureId) {
				(async () => {
					try {
						const url = await getTextureUrl(faceUVTextureId);
						if (url) {
							applyFaceUVTexture(url);
						} else {
							applyFallbackColor3();
						}
					} catch (e) {
						applyFallbackColor3();
					}
				})();
				// Apply placeholder color immediately while texture loads
				applyFallbackColor3();
			}
			// Priority 3: textureUrl
			else if ((options as any)?.textureUrl) {
				try {
					mat.diffuseTexture = new BABYLON.Texture((options as any).textureUrl, this.scene);
					mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
				} catch (e) {
					applyFallbackColor3();
				}
			}
			// Priority 4: textureId (async resolve)
			else if ((options as any)?.textureId) {
				(async () => {
					try {
						const url = await getTextureUrl((options as any).textureId);
						if (url) mat.diffuseTexture = new BABYLON.Texture(url, this.scene);
					} catch (e) {
						applyFallbackColor3();
					}
				})();
				applyFallbackColor3();
			} else {
				// Priority 5: Fallback color
				applyFallbackColor3();
			}
			cube.material = mat;

			if (physics && this.scene.getPhysicsEngine()) {
				const physicsOptions = typeof physics === 'object' ? physics : {
					mass: 0.05,
					restitution: 0.3,
					friction: 0.05
				};
				const agg = new BABYLON.PhysicsAggregate(
					cube,
					physicsOptions.shape ?? BABYLON.PhysicsShapeType.BOX,
					{
						mass: physicsOptions.mass ?? 0.05,
						restitution: physicsOptions.restitution ?? 0.3,
						friction: physicsOptions.friction ?? 0.05
					},
					this.scene
				);
				// attach aggregate reference for later disposal
				(cube as any)._physicsAgg = agg;

				// Optional thrust along path tangent
				if (thrustMs && thrustSpeed && this.pathPoints.length > 1) {
					const nextIdx = this.normalizeIndex(actualIndex + 1);
					const dir = this.pathPoints[nextIdx].subtract(this.pathPoints[actualIndex]).normalize();
					const initialVel = dir.scale(thrustSpeed);

					setTimeout(() => {
						try {
							if ((cube as any).physicsBody?.setLinearVelocity) {
								(cube as any).physicsBody.setLinearVelocity(initialVel);
							}
							if ((cube as any).physicsImpostor?.setLinearVelocity) {
								(cube as any).physicsImpostor.setLinearVelocity(initialVel);
							}
						} catch (e) { /* ignore */ }
					}, 0);

					setTimeout(() => {
						try {
							if ((cube as any).physicsBody?.setLinearVelocity) {
								(cube as any).physicsBody.setLinearVelocity(BABYLON.Vector3.Zero());
							}
							if ((cube as any).physicsImpostor?.setLinearVelocity) {
								(cube as any).physicsImpostor.setLinearVelocity(BABYLON.Vector3.Zero());
							}
						} catch (e) { /* ignore */ }
					}, thrustMs);
				}

				// Auto-dispose to free memory after a configurable delay
				if (autoDisposeMs && typeof autoDisposeMs === 'number' && autoDisposeMs > 0) {
					const t = setTimeout(() => {
						try { if ((cube as any)._physicsAgg) { try { (cube as any)._physicsAgg.dispose(); } catch {} } } catch {}
						try { cube.dispose(); } catch (e) { /* ignore */ }
						try { this.instances = this.instances.filter(i => i !== cube); } catch (e) {}
					}, autoDisposeMs);
					// ensure timeout is cleared if manager cleanup runs earlier
					this.cleanupRegistry.push(() => { try { clearTimeout(t); } catch {} });
				}
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
	 * Place 3D model(s) along the path
	 */
	private async placeModel(options: ModelOptions): Promise<void> {
		const {
			modelNames,
			count = 1,
			randomPositions = false,
			indices,
			scaleRange = [1.0, 1.0],
			physics = true,
			targetSize = 2.0,
			offsetY
		} = options;

		// Allow callers to pass `index`, `indices`, `progress`, or `degree`.
		const positionIndices = this.resolveIndices(options as any, count);
		console.log(`🔍 ObstacleManager.placeModel: resolved positionIndices=${positionIndices}, pathPoints.length=${this.pathPoints?.length}, pathPoints[30]=`, this.pathPoints?.[30]);

		// Normalize modelNames to array (allow passing a single id via randomFrom)
		const namesArray = Array.isArray(modelNames) ? modelNames : [modelNames as string];

		await ModelPlacer.placeModels(
			this.scene,
			this.pathPoints,
			namesArray,
			{
				countPerModel: count,
				randomPositions,
				positionIndices: typeof (options as any).indices !== 'undefined' ? (options as any).indices : positionIndices,
				scaleRange,
				physics: typeof physics === 'boolean' ? physics : true,
				targetSize,
				offsetY
			},
			this.modelCache,
			this.cleanupRegistry
		);
	}

	/**
	 * Place a portal along the path
	 */
	private placePortal(options: PortalOptions): Portal {
		const {
			index = 0,
			posterTextureId,
			width = 3,
			height = 4,
			offsetY = 0,
			count = 1,
			onTrigger
		} = options as any;

		const indices = this.resolveIndices(options, count);
		const createPortalAt = (idx: number) => {
			const actualIndex = this.normalizeIndex(idx);
			const pos = this.pathPoints[actualIndex].clone();
			pos.y += offsetY;

			// allow posterTextureId to be an array (pick randomly) or a single id/url
			let posterArg: string | undefined = undefined;
			try {
				if (Array.isArray(posterTextureId)) {
					if (posterTextureId.length > 0) posterArg = posterTextureId[Math.floor(Math.random() * posterTextureId.length)];
				} else if (typeof posterTextureId === 'string') {
					posterArg = posterTextureId;
				}
			} catch {}

			const portal = new Portal(
				posterArg,
				pos,
				{ x: width, y: height, z: 0.5 },
				this.scene,
				{ width, height },
				typeof onTrigger === 'function' ? onTrigger : undefined
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
			textureId,
			width,
			height
		} = options;

		const bmOptions: any = { count, textureUrl, textureId };
		if (typeof width !== 'undefined' || typeof height !== 'undefined') bmOptions.size = { width, height };

		const billboardManager = new BillboardManager(this.scene, bmOptions);

		await billboardManager.createAlongPath(this.pathPoints);
		return billboardManager;
	}

	/**
	 * Place floating cubes along the path
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
		}, this.cleanupRegistry);

		this.cleanupRegistry.push(() => {
			try { result.dispose(); } catch (e) { /* ignore */ }
		});

		return result;
	}

	/**
	 * Place particle system at a path index
	 */
	private placeParticles(options: any): any {
		const { index = 0, count = 800, size = 1.0, maxDistance = 220, offsetY = 1.2, autoDispose } = options || {};
		const actualIndex = this.normalizeIndex(index);
		const parent = this.scene.getMeshByName('torus') || this.scene.getTransformNodeByName('torus') || this.scene;
		const result = createParticles(this.scene, this.pathPoints, actualIndex, parent as any, {
			count,
			size,
			maxDistance,
			offsetY,
			autoDispose
		});

		this.cleanupRegistry.push(() => {
			try { if (result && typeof result.dispose === 'function') result.dispose(); } catch {}
		});

		return result;
	}

	/**
	 * Place glowing orb(s) along the path
	 */
	private placeOrb(options: OrbOptions): OrbResult | OrbResult[] {
		const {
			count = 1,
			height = 5.0,
			diameter = 1.5,
			glowIntensity = 2,
			lightIntensity = 5,
			lightRange = 15,
			color = new BABYLON.Color3(1, 0.9, 0.6),
			physics = false,
			offsetY = 0,
			areaLight = false,
			areaLightSize,
			areaLightIntensity,
			areaLightOffset
		} = options;

		console.log(`🔮 placeOrb called, pathPoints length: ${this.pathPoints?.length}, options:`, options);
		console.log(`🔮 DEBUG: Scene exists:`, !!this.scene, 'PathPoints array exists:', !!this.pathPoints);
		
		if (!this.pathPoints || this.pathPoints.length === 0) {
			console.error('❌ No pathPoints available for orb placement!');
			console.error('❌ DEBUG: pathPoints:', this.pathPoints);
			return [] as OrbResult[];
		}

		const indices = this.resolveIndices(options, count);
		console.log(`🔮 Resolved indices:`, indices);
		
		const createAt = (idx: number) => {
			const actualIndex = this.normalizeIndex(idx);
			const pos = this.pathPoints[actualIndex].clone();
			pos.y += offsetY;
			
			console.log(`🔮 Creating orb at index ${actualIndex}, pos: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`);
			console.log(`🔍 ObstacleManager.placeOrb: pathPoints.length=${this.pathPoints?.length}, pathPoints[${actualIndex}]=`, this.pathPoints?.[actualIndex]);

			const orbResult = createOrb(this.scene, pos, {
				height,
				diameter,
				glowIntensity,
				lightIntensity,
				lightRange,
				areaLight,
				areaLightSize,
				areaLightIntensity,
				areaLightOffset,
				color,
				physics: typeof physics === 'boolean' ? physics : false,
				localRange: (options as any).localRange,
				glow: (options as any).glow
			});

			this.cleanupRegistry.push(() => orbResult.dispose());
			this.instances.push(orbResult.mesh);
			return orbResult;
		};

		if (Array.isArray(indices)) {
			return indices.map((i) => createAt(i));
		} else {
			return createAt(indices as number);
		}
	}

	// ===================================================================
	// HELPERS
	// ===================================================================

	/**
	 * Resolve index or indices from options
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
	 * Normalize index to valid path range
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
			try {
				// dispose any physics aggregate attached
				if ((instance as any)._physicsAgg) {
					try { (instance as any)._physicsAgg.dispose(); } catch (e) {}
				}
				try { instance.dispose(); } catch (e) { /* ignore */ }
			} catch (e) { /* ignore */ }
		}
		this.instances = [];
	}
}

// ===================================================================
// BACKWARDS COMPATIBILITY - Export standalone functions
// ===================================================================

// Backwards-compat helper functions removed. Use the instance API `obstacles.place(...)`
// or the static helpers `ObstacleManager.cubeInFrontOfDrone` / `ObstacleManager.floatingCubesInFrontOfDrone`.
