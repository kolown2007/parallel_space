import * as BABYLON from '@babylonjs/core';
import { createShaderMaterial, createStandardMaterial, createPBRMaterial } from './factories';

export type MaterialType = 'shader' | 'standard' | 'pbr';

export interface MaterialRequestOpts {
  // for shader materials
  shaderSources?: { vertex: string; fragment: string };
  mesh?: BABYLON.Mesh;
  wireframe?: boolean;
  // standard / pbr options
  diffuse?: BABYLON.Color3;
  emissive?: BABYLON.Color3;
  alpha?: number;
}

interface CacheEntry {
  promise: Promise<{ material: BABYLON.Material; dispose?: () => void }>;
  material?: BABYLON.Material;
  dispose?: () => void;
  refCount: number;
}

class MaterialManager {
  private cache = new Map<string, CacheEntry>();

  private keyFrom(key: string) {
    return key;
  }

  /**
   * Acquire a material handle for a given key and type. Caller MUST provide a scene.
   * Usage: acquire(scene, 'wormhole/pbr/v1', 'pbr', { diffuse, emissive })
   */
  public async acquire(scene: BABYLON.Scene, key: string, type: MaterialType, opts?: MaterialRequestOpts) {
    const k = this.keyFrom((key || '') + '|' + type);
    let entry = this.cache.get(k);
    if (entry) {
      entry.refCount++;
      // if material already created, return it immediately
      if (entry.material) {
        return { material: entry.material, release: () => this.release(k) };
      }
      const res = await entry.promise;
      entry.material = res.material;
      entry.dispose = res.dispose;
      return { material: entry.material!, release: () => this.release(k) };
    }

    // create and cache the promise immediately to dedupe concurrent requests
    const createPromise = this.createMaterial(scene, type, opts);
    entry = { promise: createPromise, refCount: 1 } as CacheEntry;
    this.cache.set(k, entry);
    const res = await createPromise;
    entry.material = res.material;
    entry.dispose = res.dispose;
    return { material: entry.material, release: () => this.release(k) };
  }

  private async createMaterial(scene: BABYLON.Scene, type: MaterialType, opts?: MaterialRequestOpts): Promise<{ material: BABYLON.Material; dispose?: () => void }> {
    switch (type) {
      case 'shader':
        if (!opts?.shaderSources) throw new Error('shaderSources required for shader material');
        if (!opts?.mesh) throw new Error('mesh required for shader material');
        return createShaderMaterial(scene, opts.mesh, opts.shaderSources as any, { wireframe: !!opts.wireframe });
      case 'pbr':
        return createPBRMaterial(scene, { albedo: opts?.diffuse, emissive: opts?.emissive, alpha: opts?.alpha });
      default:
        return createStandardMaterial(scene, { diffuse: opts?.diffuse, emissive: opts?.emissive, wireframe: !!opts?.wireframe, alpha: opts?.alpha });
    }
  }

  private release(k: string) {
    const entry = this.cache.get(k);
    if (!entry) return;
    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount === 0) {
      try { entry.dispose?.(); } catch (e) { /* ignore */ }
      try { entry.material?.dispose(); } catch (e) { /* ignore */ }
      this.cache.delete(k);
    }
  }
}

// Export a singleton instance
export const materialManager = new MaterialManager();

export default materialManager;
