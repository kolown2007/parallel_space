import * as BABYLON from '@babylonjs/core';
import { getTextureUrl } from '../../assetsConfig';

export type FloatingCube = {
  mesh: BABYLON.Mesh;
  agg: BABYLON.PhysicsAggregate;
  mass: number;
  home: BABYLON.Vector3;
};

export type FloatingCubesResult = {
  root: BABYLON.TransformNode;
  items: FloatingCube[];
  update: (dtSec: number) => void;
  dispose: () => void;
};

export function createFloatingCubes(
  scene: BABYLON.Scene,
  pathPoints: BABYLON.Vector3[],
  options: {
    count?: number;
    jitter?: number;
    verticalOffset?: number;
    sizeRange?: [number, number];
    massRange?: [number, number];
    antiGravityFactor?: number;
    linearDamping?: number;
    autoDisposeMs?: number;
    textureUrls?: string[];
    faceUVTextureUrl?: string;
    faceUVTextureId?: string;
    faceUVLayout?: 'vertical' | 'horizontal' | 'grid';
  } = {}
): FloatingCubesResult {
  const {
    count = 10,
    jitter = 0.3,
    verticalOffset = 0.5,
    sizeRange = [0.8, 2.0],
    massRange = [0.6, 1.8],
    antiGravityFactor = 0.95,
    linearDamping = 0.985,
    autoDisposeMs = 10000,
    textureUrls = [],
    faceUVTextureUrl,
    faceUVTextureId,
    faceUVLayout = 'grid'
  } = options;

  const root = new BABYLON.TransformNode('floatingCubesRoot', scene);
  const items: FloatingCube[] = [];
  const materialPool: BABYLON.StandardMaterial[] = [];

  // Resolve faceUV texture URL (direct URL takes priority over ID)
  let resolvedFaceUVUrl = faceUVTextureUrl;
  if (!resolvedFaceUVUrl && faceUVTextureId) {
    getTextureUrl(faceUVTextureId).then(url => {
      if (url) resolvedFaceUVUrl = url;
    }).catch(() => {});
  }

  // Create material with faceUV texture or fallback
  const createFaceUVMaterial = (textureUrl: string) => {
    const mat = new BABYLON.StandardMaterial('cubeFaceUVMat', scene);
    const tex = new BABYLON.Texture(textureUrl, scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
    mat.backFaceCulling = false;
    return mat;
  };

  if (faceUVTextureUrl) {
    materialPool.push(createFaceUVMaterial(faceUVTextureUrl));
  } else if (faceUVTextureId) {
    // Async resolve - create placeholder, update when ready
    const mat = new BABYLON.StandardMaterial('cubeFaceUVMat', scene);
    mat.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    mat.backFaceCulling = false;
    materialPool.push(mat);
    getTextureUrl(faceUVTextureId).then(url => {
      if (url) {
        const tex = new BABYLON.Texture(url, scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        mat.diffuseTexture = tex;
        mat.emissiveTexture = tex;
        mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
      }
    }).catch(() => {});
  } else if (textureUrls.length > 0) {
    // textureUrls: random textures
    textureUrls.forEach((url, idx) => {
      const mat = new BABYLON.StandardMaterial(`cubeMat_${idx}`, scene);
      mat.diffuseTexture = new BABYLON.Texture(url, scene);
      mat.diffuseColor = new BABYLON.Color3(0.6, 0.35, 0.9);
      materialPool.push(mat);
    });
  } else {
    // Fallback: colored materials
    const colors = [
      new BABYLON.Color3(0.6, 0.35, 0.9),
      new BABYLON.Color3(0.4, 0.7, 0.8),
      new BABYLON.Color3(0.9, 0.5, 0.3),
      new BABYLON.Color3(0.3, 0.8, 0.4),
      new BABYLON.Color3(0.8, 0.3, 0.6)
    ];
    colors.forEach((color, idx) => {
      const mat = new BABYLON.StandardMaterial(`cubeMat_${idx}`, scene);
      mat.diffuseColor = color;
      materialPool.push(mat);
    });
  }

  // Generate faceUV mapping when using faceUV textures
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

  const pts = pathPoints && pathPoints.length ? pathPoints : [];
  const step = Math.max(1, Math.floor(pts.length / count));

  for (let i = 0; i < count; i++) {
    const idx = (i * step) % Math.max(1, pts.length);
    const base = pts.length ? pts[idx].clone() : new BABYLON.Vector3((Math.random() - 0.5) * 10, 4, (Math.random() - 0.5) * 10);

    const px = base.x + (Math.random() * 2 - 1) * jitter;
    const py = base.y + verticalOffset + (Math.random() * 2 - 1) * jitter;
    const pz = base.z + (Math.random() * 2 - 1) * jitter;

    const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
    
    // Create box with optional faceUV
    const boxOptions: any = { size };
    if (faceUV) {
      boxOptions.faceUV = faceUV;
    }
    
    const box = BABYLON.MeshBuilder.CreateBox(`hoverBox_${i}`, boxOptions, scene);
    box.position.set(px, py, pz);
    box.parent = root;

    // Randomly pick a material from the pool
    const randomMat = materialPool[Math.floor(Math.random() * materialPool.length)];
    box.material = randomMat;

    const mass = massRange[0] + Math.random() * (massRange[1] - massRange[0]);
    const agg = new BABYLON.PhysicsAggregate(box, BABYLON.PhysicsShapeType.BOX, {
      mass,
      restitution: 0.12,
      friction: 0.4
    }, scene);

    agg.body.setLinearVelocity(new BABYLON.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.2));

    items.push({ mesh: box, agg, mass, home: box.position.clone() });
  }

  let isDisposed = false;

  function update(dtSec: number) {
    if (isDisposed) return;
    
    const gravity = 9.81;
    for (const it of items) {
      const pos = it.mesh.getAbsolutePosition();
      
      // Apply anti-gravity
      const antiGravity = new BABYLON.Vector3(0, it.mass * gravity * antiGravityFactor, 0);
      it.agg.body.applyForce(antiGravity, pos);

      // Gentle centering toward home
      const toHome = it.home.subtract(pos);
      const distance = toHome.length();
      if (distance > 0.15) {
        const pull = toHome.normalize().scale(Math.min(15, distance * 2.0));
        it.agg.body.applyForce(pull, pos);
      }

      // Apply damping
      const lv = it.agg.body.getLinearVelocity();
      if (lv) it.agg.body.setLinearVelocity(lv.scale(linearDamping));
    }
  }

  function dispose() {
    if (isDisposed) return;
    isDisposed = true;
    clearTimeout(timer);
    
    for (const it of items) {
      try { it.agg.dispose(); } catch (e) {}
      try { it.mesh.dispose(); } catch (e) {}
    }
    
    // Dispose materials from pool
    for (const mat of materialPool) {
      try { mat.dispose(); } catch (e) {}
    }
    materialPool.length = 0;
    
    try { root.dispose(); } catch (e) {}
    items.length = 0;
  }

  const timer = setTimeout(() => {
    if (!isDisposed) dispose();
  }, autoDisposeMs);

  return { root, items, update, dispose };
}
