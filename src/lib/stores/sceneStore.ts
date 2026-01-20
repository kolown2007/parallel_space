import { writable } from 'svelte/store';
import type * as BABYLON from '@babylonjs/core';

/**
 * Store references to scene and drone for use in +layout.svelte
 * Only store references, not live position data
 */
export const sceneStore = writable<{
	scene: BABYLON.Scene | null;
	droneMesh: BABYLON.AbstractMesh | null;
	pathPoints: BABYLON.Vector3[] | null;
}>({
	scene: null,
	droneMesh: null,
	pathPoints: null
});
