import { writable } from 'svelte/store';
import type * as BABYLON from '@babylonjs/core';

export const sceneRefStore = writable<{
  sceneId: string | null;
  droneId: string | null;
  pathPoints: BABYLON.Vector3[] | null;
}>({ sceneId: null, droneId: null, pathPoints: null });
