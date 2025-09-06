// Replaced with a clean, minimal static-only obstacle implementation.
import * as BABYLON from '@babylonjs/core';
import { torusSignedDistance, torusClosestPointAndNormal, torusUV } from './torusUtils';

function torusToWorld(u: number, v: number, rho: number, R: number, r: number) {
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const cv = Math.cos(v);
  const sv = Math.sin(v);
  return new BABYLON.Vector3((R + rho * cv) * cu, rho * sv, (R + rho * cv) * su);
}

export function addStaticCube(scene: BABYLON.Scene, position: BABYLON.Vector3, size = 0.25) {
  const id = `cube_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  // Create a rectangular box that's taller than it is wide so obstacles are more visible
  const height = Math.max(size * 2.0, 0.5);
  const box = BABYLON.MeshBuilder.CreateBox(id, { width: size, depth: size, height }, scene);

  // Make obstacle very visible - bright red/orange cube
  const mat = new BABYLON.StandardMaterial(`${id}_mat`, scene);
  mat.emissiveColor = new BABYLON.Color3(1.0, 0.3, 0.0); // bright orange-red
  mat.diffuseColor = new BABYLON.Color3(0.8, 0.2, 0.0);
  mat.specularColor = BABYLON.Color3.Black();
  mat.disableLighting = true; // always visible regardless of lighting
  mat.backFaceCulling = false; // visible from all angles
  box.material = mat;

  box.isPickable = false;
  box.isVisible = true;
  box.metadata = { obstacle: true, spawnTime: Date.now() };

  try { box.setAbsolutePosition(position); } catch { box.position.copyFrom(position); }
  // Do not freeze the world matrix so we can reposition/reuse/dispose reliably later
  // try { box.freezeWorldMatrix(); } catch { /* ignore */ }

  console.log('[Obstacle] created visible cube', id, 'at pos', [position.x.toFixed(2), position.y.toFixed(2), position.z.toFixed(2)], 'size', size);
  return box;
}

function spawnDebugMarker(scene: BABYLON.Scene, position: BABYLON.Vector3, size = 0.6) {
  const id = `dbg_marker_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const sph = BABYLON.MeshBuilder.CreateSphere(id, { diameter: size, segments: 12 }, scene);
  let mat = scene.getMaterialByName('obstacle_debug_mat') as BABYLON.StandardMaterial | null;
  if (!mat) {
    mat = new BABYLON.StandardMaterial('obstacle_debug_mat', scene);
    mat.emissiveColor = new BABYLON.Color3(0.2, 0.9, 1.0);
    mat.diffuseColor = new BABYLON.Color3(0.02, 0.02, 0.02);
    mat.specularColor = BABYLON.Color3.Black();
    try { (mat as any).disableLighting = true; } catch { /* ignore */ }
    try { mat.backFaceCulling = false; } catch { /* ignore */ }
  }
  sph.material = mat;
  sph.isPickable = false;
  try { sph.setAbsolutePosition(position); } catch { sph.position.copyFrom(position); }
  try { sph.freezeWorldMatrix(); } catch { /* ignore */ }
  // auto-dispose debug marker after a short time so scene doesn't clutter
  setTimeout(() => { try { sph.dispose(); } catch {} }, 8000);
  return sph;
}

export type SpawnInFrontOptions = {
  size?: number;
  distance?: number;
  withPhysics?: boolean; // accepted but ignored for static-only implementation
  debug?: boolean; // when true create a visible debug marker
};

export type ObstacleManagerOptions = {
  R?: number;
  r?: number;
  // legacy/compat options that were used earlier; they're optional and ignored here
  initialCapacity?: number;
  maxCapacity?: number;
  spawnRateLimit?: number;
  maxActive?: number;
  usePhysics?: boolean;
  enableDebug?: boolean;
};

export function spawnStaticInFrontOf(camera: BABYLON.Camera, scene: BABYLON.Scene, distance = 2, size = 0.25, opts?: { R?: number; r?: number; debug?: boolean }) {
  // Temple Run style: spawn directly in the camera's forward direction, then adjust to stay inside torus
  const forward = camera.getForwardRay(1).direction.normalize();
  let pos = camera.position.add(forward.scale(distance));
  
  const R = opts?.R ?? 100;
  const r = opts?.r ?? 23;
  
  // Check if the forward position is outside the torus tube
  const sdf = torusSignedDistance(pos, R, r);
  if (sdf > 0) {
    // Project to closest point on torus surface and move slightly inside
    const { pos: proj, normal } = torusClosestPointAndNormal(pos, R, r);
    pos = proj.add(normal.scale(-0.1)); // move 0.1 units inside the tube
  } else {
    // Already inside, but clamp to ensure we're not too close to the walls
    const { u, v } = torusUV(pos, R, r);
    const cx = R * Math.cos(u);
    const cz = R * Math.sin(u);
    const dx = pos.x - cx;
    const dy = pos.y;
    const dz = pos.z - cz;
    const erx = Math.cos(u);
    const erz = Math.sin(u);
    const dr = dx * erx + dz * erz;
    const currentRho = Math.hypot(dr, dy);
    
    // Keep obstacle away from tube walls
    const maxRho = r - 0.5; // stay 0.5 units from wall
    if (currentRho > maxRho) {
      const clampedRho = maxRho;
      pos = torusToWorld(u, v, clampedRho, R, r);
    }
  }

  console.log('[Obstacle] spawnStaticInFrontOf', { 
    camera: [camera.position.x, camera.position.y, camera.position.z],
    forward: [forward.x, forward.y, forward.z],
    pos: [pos.x, pos.y, pos.z], 
    size, distance, sdf: torusSignedDistance(pos, R, r)
  });
  
  const cube = addStaticCube(scene, pos, size);
  if (opts?.debug) spawnDebugMarker(scene, pos, Math.max(0.5, size * 4));
  return cube;
}

export function spawnStaticAtTorus(scene: BABYLON.Scene, u: number, v: number, rho: number, opts?: { R?: number; r?: number; size?: number }) {
  const R = opts?.R ?? 100;
  const r = opts?.r ?? 23;
  const size = opts?.size ?? 0.25;
  const clampedRho = Math.min(Math.max(0, rho), Math.max(0, r - 1e-2));
  const pos = torusToWorld(u, v, clampedRho, R, r);
  return addStaticCube(scene, pos, size);
}

export class ObstacleManager {
  private scene: BABYLON.Scene;
  private created: BABYLON.Mesh[] = [];
  private R: number;
  private r: number;
  private maxActive: number;

  constructor(scene: BABYLON.Scene, opts?: ObstacleManagerOptions) {
    this.scene = scene;
    this.R = opts?.R ?? 100;
    this.r = opts?.r ?? 23;
    this.maxActive = opts?.maxActive ?? 60; // reuse pool size, Subway-Surfers style
    // legacy options are accepted but this simple manager ignores them
  }

  public spawnInFrontOf(camera: BABYLON.Camera, opts?: SpawnInFrontOptions) {
    const size = opts?.size ?? 0.25;
    const distance = opts?.distance ?? 2;
    // withPhysics is accepted for compatibility but ignored
    // If we reached pool capacity, reuse the oldest obstacle instead of creating a new one
    if (this.created.length >= this.maxActive) {
      const oldest = this.created.shift();
      if (oldest) {
        try {
          // reposition and refresh metadata
          try { oldest.setAbsolutePosition(camera.position.add(camera.getForwardRay(1).direction.normalize().scale(distance))); } catch { /* ignore */ }
          oldest.metadata = { obstacle: true, spawnTime: Date.now() };
          oldest.isVisible = true;
          // If caller asked for debug, create a temporary debug marker but don't create another obstacle
          if (opts?.debug) spawnDebugMarker(this.scene, oldest.position, Math.max(0.5, size * 4));
        } catch (e) { /* ignore reposition errors */ }
        this.created.push(oldest);
        return oldest;
      }
    }

    const m = spawnStaticInFrontOf(camera, this.scene, distance, size, { R: this.R, r: this.r, debug: opts?.debug });
    this.created.push(m);
    return m;
  }

  public spawnAtUVR(u: number, v: number, rho: number, opts?: { size?: number }) {
    const size = opts?.size ?? 0.25;
    const m = spawnStaticAtTorus(this.scene, u, v, rho, { R: this.R, r: this.r, size });
    this.created.push(m);
    return m;
  }

  /** Reposition a mesh to a torus UVR safely (used for pooling/reuse) */
  public repositionToUVR(mesh: BABYLON.Mesh, u: number, v: number, rho: number) {
    try {
      const pos = torusToWorld(u, v, rho, this.R, this.r);
      try { mesh.setAbsolutePosition(pos); } catch { mesh.position.copyFrom(pos); }
      mesh.metadata = { obstacle: true, spawnTime: Date.now() };
      mesh.isVisible = true;
    } catch (e) { /* ignore reposition errors */ }
  }

  private ensureRemovedFromScene(mesh: BABYLON.Mesh) {
    try {
      const sc = mesh.getScene ? mesh.getScene() : this.scene;
      if (sc && sc.removeMesh) {
        try { sc.removeMesh(mesh, true); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  public disposeAll() {
    for (const m of this.created) {
      try { m.dispose(); } catch { /* ignore */ }
    }
    this.created = [];
  }

  /**
   * Dispose obstacles that have passed behind the given camera.
   * An obstacle is considered "passed" when it's behind the camera (dot < 0)
   * and at least `minDistance` away from the camera to avoid disposing very near objects.
   */
  /**
   * Prune obstacles that have passed the camera, are too old, or too far away.
   * - camera: active camera used to determine "behind"
   * - minDistance: ignore disposal if very close to camera
   * - maxAgeSec: dispose obstacles older than this (seconds)
   * - maxDistance: dispose obstacles farther than this from camera
   */
  public prunePassed(camera: BABYLON.Camera, minDistance = 0.5, maxAgeSec = 12, maxDistance = 200) {
    try {
      if (!camera) return;
      const forward = camera.getForwardRay(1).direction.clone();
      try { forward.normalize(); } catch (e) { /* ignore */ }
      const camPos = camera.position;
      const survivors: BABYLON.Mesh[] = [];

      for (const m of this.created) {
        try {
          if (!m) continue;
          // if mesh disposed already skip it
          // @ts-ignore some versions have isDisposed
          if ((m as any).isDisposed && (m as any).isDisposed()) continue;

          const toObs = m.position.subtract(camPos);
          const dist = toObs.length();
          const dirTo = toObs.normalize();
          const dot = BABYLON.Vector3.Dot(forward, dirTo);

          // Age-based pruning (if metadata.spawnTime exists)
          const spawnTime = m.metadata?.spawnTime as number | undefined;
          const ageMs = spawnTime ? (Date.now() - spawnTime) : 0;
          const tooOld = spawnTime ? (ageMs > (maxAgeSec * 1000)) : false;
          const tooFar = dist > maxDistance;

          // dispose if it's behind the camera (and not extremely close), or it's too old, or too far
          if ((dot < 0 && dist > minDistance) || tooOld || tooFar) {
            try {
              // Ensure mesh is removed from the scene collection first
              try { if (m.getScene) { const sc = m.getScene(); if (sc && sc.removeMesh) try { sc.removeMesh(m, true); } catch {} } } catch (e) {}
              m.dispose();
              // console.log('[Obstacle] disposed mesh', m.name || m.id);
            } catch (e) { /* ignore */ }
          } else {
            survivors.push(m);
          }
        } catch (e) {
          // on error keep the mesh to avoid accidental disposals
          survivors.push(m);
        }
      }

      this.created = survivors;
    } catch (e) {
      // swallow errors to keep runtime stable
    }
  }
}

