import * as BABYLON from '@babylonjs/core';
import { getTextureUrl } from '../../assetsConfig';

export interface TorusOptions {
  diameter?: number;
  thickness?: number;
  tessellation?: number;
  sideOrientation?: number;
  positionY?: number;
  lineRadiusFactor?: number; // 0..1 (where 1 == full tube radius)
  turns?: number;
  spiralTurns?: number;
  segments?: number;
  /** Number of sampled points around the main circle (if provided, overrides `segments` sampling behaviour) */
  pointsPerCircle?: number;
  materialTextureUrl?: string;
  materialTextureId?: string;
  emissiveIntensity?: number; // 0..1 range for light emission strength
}

export interface TorusResult {
  torus: BABYLON.Mesh;
  torusAggregate: BABYLON.PhysicsAggregate;
  torusMainRadius: number;
  torusTubeRadius: number;
  pathPoints: BABYLON.Vector3[];
}

export async function createTorus(scene: BABYLON.Scene, opts: TorusOptions = {}): Promise<TorusResult> {
  const diameter = opts.diameter ?? 80;
  const thickness = opts.thickness ?? 30;
  const tessellation = opts.tessellation ?? 80;
  const sideOrientation = opts.sideOrientation ?? BABYLON.Mesh.DOUBLESIDE;
  const positionY = opts.positionY ?? 1;
  const lineRadiusFactor = opts.lineRadiusFactor ?? 0.0;
  const turns = opts.turns ?? 1;
  const spiralTurns = opts.spiralTurns ?? 3;
  const segments = opts.segments ?? 128;

  const torus = BABYLON.MeshBuilder.CreateTorus(
    'torus',
    { diameter, thickness, tessellation, sideOrientation },
    scene
  );
  torus.position.y = positionY;

  const torusAggregate = new BABYLON.PhysicsAggregate(
    torus,
    BABYLON.PhysicsShapeType.MESH,
    { mass: 0, restitution: 0.8, friction: 0.5 },
    scene
  );

  const mat = new BABYLON.StandardMaterial('materialTorus', scene);
  if (opts.materialTextureUrl) {
    mat.diffuseTexture = new BABYLON.Texture(opts.materialTextureUrl, scene);
  } else if (opts.materialTextureId) {
    try {
      const url = await getTextureUrl(opts.materialTextureId);
      if (url) {
        mat.diffuseTexture = new BABYLON.Texture(url, scene);
      }
    } catch (e) {
      console.warn('Failed to resolve materialTextureId', opts.materialTextureId, e);
    }
  }
  const emissionLevel = typeof opts.emissiveIntensity === 'number' ? opts.emissiveIntensity : 1.0;
  mat.emissiveColor = new BABYLON.Color3(emissionLevel, emissionLevel, emissionLevel);
  torus.material = mat;

  // Recompute radii from the actual mesh bounding box so the path aligns
  // with the rendered torus even if the geometry or transforms differ.
  const boundingInfo = torus.getBoundingInfo();
  const bbox = boundingInfo.boundingBox;
  const torusDiameter = bbox.maximumWorld.x - bbox.minimumWorld.x;
  const torusThickness = Math.abs(bbox.maximumWorld.y - bbox.minimumWorld.y);
  const torusOuterRadius = torusDiameter / 2;
  const torusTubeRadius = torusThickness / 2;
  const torusMainRadius = torusOuterRadius - torusTubeRadius;
  const torusTubeRadiusActual = torusTubeRadius;

  const lineRadius = torusTubeRadiusActual * lineRadiusFactor;
  const points: BABYLON.Vector3[] = [];
  const torusCenter = torus.getAbsolutePosition();

  // If the caller explicitly supplies `pointsPerCircle`, sample exactly that many
  // points (i = 0 .. pointsPerCircle-1). Otherwise preserve legacy behaviour
  // which sampled `segments + 1` points (i = 0 .. segments).
  if (typeof opts.pointsPerCircle === 'number') {
    const pointsCount = Math.max(1, Math.floor(opts.pointsPerCircle));
    for (let i = 0; i < pointsCount; i++) {
      const t = i / pointsCount;
      const mainAngle = t * Math.PI * 2 * turns;
      const tubeAngle = t * Math.PI * 2 * spiralTurns;

      const mainX = torusCenter.x + Math.cos(mainAngle) * torusMainRadius;
      const mainZ = torusCenter.z + Math.sin(mainAngle) * torusMainRadius;
      const mainY = torusCenter.y;

      const tubeX = Math.cos(tubeAngle) * lineRadius;
      const tubeY = Math.sin(tubeAngle) * lineRadius;

      const x = mainX + Math.cos(mainAngle) * tubeX;
      const z = mainZ + Math.sin(mainAngle) * tubeX;
      const y = mainY + tubeY;

      points.push(new BABYLON.Vector3(x, y, z));
    }
  } else {
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const mainAngle = t * Math.PI * 2 * turns;
      const tubeAngle = t * Math.PI * 2 * spiralTurns;

      const mainX = torusCenter.x + Math.cos(mainAngle) * torusMainRadius;
      const mainZ = torusCenter.z + Math.sin(mainAngle) * torusMainRadius;
      const mainY = torusCenter.y;

      const tubeX = Math.cos(tubeAngle) * lineRadius;
      const tubeY = Math.sin(tubeAngle) * lineRadius;

      const x = mainX + Math.cos(mainAngle) * tubeX;
      const z = mainZ + Math.sin(mainAngle) * tubeX;
      const y = mainY + tubeY;

      points.push(new BABYLON.Vector3(x, y, z));
    }
  }



  return {
    torus,
    torusAggregate,
    torusMainRadius,
    torusTubeRadius: torusTubeRadiusActual,
    pathPoints: points
  };
}
