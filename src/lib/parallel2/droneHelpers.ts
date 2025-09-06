import * as BABYLON from '@babylonjs/core';
import { World } from './world';

// Create a compact extruded triangular mesh for the drone
export function createDroneMesh(scene: BABYLON.Scene): BABYLON.Mesh {
  const halfWing = 0.6;
  const nose = 1.0;
  const tailZ = -0.9;

  const triShape: BABYLON.Vector3[] = [
    new BABYLON.Vector3(-halfWing, 0, tailZ),
    new BABYLON.Vector3(0, 0, nose),
    new BABYLON.Vector3(halfWing, 0, tailZ)
  ];

  const depth = 0.35;
  const mesh = BABYLON.MeshBuilder.ExtrudePolygon('drone', {
    shape: triShape,
    depth: depth,
    sideOrientation: BABYLON.Mesh.DOUBLESIDE,
    updatable: false
  }, scene) as BABYLON.Mesh;

  mesh.bakeCurrentTransformIntoVertices();
  mesh.scaling = new BABYLON.Vector3(0.9, 0.9, 0.9);
  mesh.renderingGroupId = 1;

  const mat = new BABYLON.PBRMaterial('droneMat', scene);
  mat.albedoColor = new BABYLON.Color3(0.15, 0.15, 0.2);
  mat.emissiveColor = new BABYLON.Color3(0.25, 0.05, 0.05);
  mat.metallic = 0.6;
  mat.roughness = 0.35;
  mesh.material = mat;

  return mesh;
}

// Sample path at normalized t (0..1) using Path3D when available, otherwise sampled points
export function samplePathAt(world: World, tNorm: number): { pos: BABYLON.Vector3; forward: BABYLON.Vector3; up: BABYLON.Vector3 } {
  try {
    const path3D = world.getPath3D();
    if (path3D) {
      const points = path3D.getPoints();
      const tangents = path3D.getTangents();
      const normals = path3D.getNormals();
      if (points.length === 0) return { pos: BABYLON.Vector3.Zero(), forward: BABYLON.Vector3.Forward(), up: BABYLON.Vector3.Up() };

      const floatIndex = tNorm * (points.length - 1);
      const i0 = Math.floor(floatIndex);
      const i1 = (i0 + 1) % points.length;
      const localT = floatIndex - i0;

      const p0 = points[i0];
      const p1 = points[i1];
      const pos = BABYLON.Vector3.Lerp(p0, p1, localT);

      let forward = BABYLON.Vector3.Forward();
      if (tangents && tangents.length > 0) {
        const t0 = tangents[i0] || BABYLON.Vector3.Zero();
        const t1 = tangents[i1] || BABYLON.Vector3.Zero();
        forward = BABYLON.Vector3.Lerp(t0, t1, localT).normalize();
      }

      let up = BABYLON.Vector3.Up();
      if (normals && normals.length > 0) {
        const n0 = normals[i0] || BABYLON.Vector3.Up();
        const n1 = normals[i1] || BABYLON.Vector3.Up();
        up = BABYLON.Vector3.Lerp(n0, n1, localT).normalize();
      }

      return { pos, forward, up };
    }
  } catch (e) {
    // fall through to fallback
  }

  try {
    const pathPoints = world.getSampledPathPoints();
    if (pathPoints.length === 0) return { pos: BABYLON.Vector3.Zero(), forward: BABYLON.Vector3.Forward(), up: BABYLON.Vector3.Up() };
    const floatIndex = tNorm * (pathPoints.length - 1);
    const i0 = Math.floor(floatIndex);
    const i1 = (i0 + 1) % pathPoints.length;
    const localT = floatIndex - i0;
    const p0 = pathPoints[i0];
    const p1 = pathPoints[i1];
    const pos = BABYLON.Vector3.Lerp(p0, p1, localT);
    const forward = p1.subtract(p0).normalize();
    return { pos, forward, up: BABYLON.Vector3.Up() };
  } catch (e) {
    return { pos: BABYLON.Vector3.Zero(), forward: BABYLON.Vector3.Forward(), up: BABYLON.Vector3.Up() };
  }
}

// Compute a third-person camera position and target given drone position and frame
export function computeThirdPersonCamera(dronePos: BABYLON.Vector3, forward: BABYLON.Vector3, up: BABYLON.Vector3, shoulderOffset: number = 0.4): { position: BABYLON.Vector3; target: BABYLON.Vector3 } {
  const right = BABYLON.Vector3.Cross(forward, up).normalize();
  const realUp = BABYLON.Vector3.Cross(right, forward).normalize();

  const cameraDistance = 2;
  const cameraHeight = 1.2;

  const camPos = dronePos
    .add(forward.scale(cameraDistance))
    .add(realUp.scale(cameraHeight))
    .add(right.scale(shoulderOffset));

  const lookTarget = dronePos.add(forward.scale(10));
  return { position: camPos, target: lookTarget };
}
