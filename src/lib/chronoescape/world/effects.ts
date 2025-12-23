import * as BABYLON from '@babylonjs/core';
import { BillboardManager } from '../obstacle/BillboardManager';
import { Portal } from '../obstacle/Portal';
import { createSolidParticleSystem } from '../../particles/solidParticleSystem';
import { getTextureUrl } from '../../assetsConfig';

/**
 * Create billboards along path
 */
export async function createBillboards(
	scene: BABYLON.Scene,
	pathPoints: BABYLON.Vector3[],
	parent: BABYLON.Mesh,
	options: { count?: number; size?: { width: number; height: number }; texture?: string } = {}
): Promise<BillboardManager> {
	const textureUrl = options.texture ? await getTextureUrl(options.texture) : await getTextureUrl('tribal');
	
	const bm = new BillboardManager(scene, {
		count: options.count ?? 3,
		size: options.size ?? { width: 30, height: 30 },
		textureUrl: textureUrl || '/tribal.png',
		parent
	});
	
	await bm.createAlongPath(pathPoints);
	return bm;
}

/**
 * Create portal at path position
 */
export async function createPortal(
	scene: BABYLON.Scene,
	pathPoints: BABYLON.Vector3[],
	index: number,
	options: { offsetY?: number; size?: { x: number; y: number; z: number }; displaySize?: { width: number; height: number } } = {}
): Promise<Portal | undefined> {
	try {
		const pos = pathPoints[index].clone();
		pos.y += options.offsetY ?? 0.5;

		const posterUrl = await getTextureUrl('metal');
		return new Portal(
			posterUrl,
			'plant2',
			{ x: pos.x, y: pos.y, z: pos.z },
			options.size ?? { x: 3, y: 4, z: 0.5 },
			scene,
			options.displaySize ?? { width: 9, height: 12 }
		);
	} catch (e) {
		console.warn('Portal creation failed', e);
		return undefined;
	}
}

/**
 * Create particle effect at path position
 */
export function createParticles(
	scene: BABYLON.Scene,
	pathPoints: BABYLON.Vector3[],
	index: number,
	parent: BABYLON.Mesh,
	options: { count?: number; size?: number; maxDistance?: number; offsetY?: number; autoDispose?: number } = {}
): any {
	const spsFx = createSolidParticleSystem(scene, {
		particleNb: options.count ?? 800,
		particleSize: options.size ?? 1.0,
		maxDistance: options.maxDistance ?? 220
	});

	const pos = pathPoints[index]?.clone() || new BABYLON.Vector3(0, 0, 0);
	pos.y += options.offsetY ?? 1.2;

	spsFx.mesh.position.copyFrom(pos);
	spsFx.attachTo(parent);
	spsFx.start();

	if (options.autoDispose) {
		window.setTimeout(() => {
			try {
				spsFx.stop();
				spsFx.dispose();
			} catch {}
		}, options.autoDispose);
	}

	return spsFx;
}
