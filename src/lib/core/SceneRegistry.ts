import type * as BABYLON from '@babylonjs/core';

/**
 * Central registry to hold heavy scene/mesh references out of Svelte stores.
 * Stores are kept in-memory here and referenced via short string IDs.
 */
const scenes = new Map<string, { scene: BABYLON.Scene; droneMesh: BABYLON.AbstractMesh | null; pathPoints?: BABYLON.Vector3[] }>();

function genId(prefix = 'scene') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function registerScene(scene: BABYLON.Scene, droneMesh: BABYLON.AbstractMesh | null, pathPoints?: BABYLON.Vector3[]) {
  const id = genId('scene');
  scenes.set(id, { scene, droneMesh, pathPoints });
  return id;
}

export function getScene(id: string) {
  return scenes.get(id)?.scene ?? null;
}

export function getDroneMesh(id: string) {
  return scenes.get(id)?.droneMesh ?? null;
}

export function getPathPoints(id: string) {
  return scenes.get(id)?.pathPoints ?? null;
}

export function updatePathPoints(id: string, pathPoints: BABYLON.Vector3[]) {
  const val = scenes.get(id);
  if (val) val.pathPoints = pathPoints;
}

export function unregisterScene(id: string) {
  scenes.delete(id);
}

export function listSceneIds() {
  return Array.from(scenes.keys());
}
