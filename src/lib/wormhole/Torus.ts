import * as BABYLON from '@babylonjs/core';
import { WaterMaterial } from '@babylonjs/materials/water';
import { getTextureUrl } from '../assets/assetsConfig';

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
  torusPlane: BABYLON.Mesh;
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

  const planeSize = diameter * 1.5;
  const torusPlane = BABYLON.MeshBuilder.CreatePlane('torusPlane', {
    width: planeSize,
    height: planeSize,
    sideOrientation: BABYLON.Mesh.DOUBLESIDE
  }, scene);
  torusPlane.rotation.x = Math.PI / 2;

  const planeMat = new WaterMaterial('materialTorusPlane', scene, new BABYLON.Vector2(256, 256));
  planeMat.backFaceCulling = false;
  const bumpTexture = new BABYLON.Texture('https://playground.babylonjs.com/textures/waterbump.png', scene);
  bumpTexture.uOffset = 0;
  bumpTexture.vOffset = 0;
  bumpTexture.coordinatesMode = BABYLON.Texture.INVCUBIC_MODE;
  planeMat.bumpTexture = bumpTexture;
  planeMat.windForce = 2;
  planeMat.waveHeight = 0.06;
  planeMat.bumpHeight = 0.12;
  planeMat.windDirection = new BABYLON.Vector2(1, 1);
  planeMat.waterColor = new BABYLON.Color3(0.06, 0.12, 0.22);
  planeMat.colorBlendFactor = 0.12;
  planeMat.alpha = 0.6;
  planeMat.specularColor = new BABYLON.Color3(0.85, 0.9, 1);
  planeMat.specularPower = 48;
  planeMat.addToRenderList(torus);
  torusPlane.material = planeMat;

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
  // Emissive color makes the torus self-lit and can prevent scene lights
  // (like orbs) from visibly affecting it. Default to a low emissive so
  // point/area lights contribute visibly. Clamp to [0,1].
  
  // const emissionLevelRaw = typeof opts.emissiveIntensity === 'number' ? opts.emissiveIntensity : 0.001;
  // const emissionLevel = Math.max(0, Math.min(1, emissionLevelRaw));
  // mat.emissiveColor = new BABYLON.Color3(emissionLevel, emissionLevel, emissionLevel);
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

  torusPlane.position = new BABYLON.Vector3(
    torus.position.x,
    torus.position.y - torusTubeRadiusActual + 2,
    torus.position.z
  );

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
    torusPlane,
    torusMainRadius,
    torusTubeRadius: torusTubeRadiusActual,
    pathPoints: points
  };
}
