import * as BABYLON from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';

/**
 * Minimal AssetManager for loading and instancing glTF/GLB assets.
 *
 * - Keeps a cache of hidden "template" nodes (TransformNode or Mesh).
 * - Tracks a simple reference count (1 = cached template, +1 per active instance).
 * - instantiate prefers createInstance, falls back to clone, then to assembling
 *   a TransformNode from children (similar to `Obstacles` fallback).
 */
export default class AssetManager {
  private scene: BABYLON.Scene;
  private templates = new Map<string, BABYLON.Mesh | BABYLON.TransformNode>();
  private refCounts = new Map<string, number>();
  private loadPromises = new Map<string, Promise<BABYLON.Mesh | BABYLON.TransformNode | null>>();

  constructor(scene: BABYLON.Scene) {
    this.scene = scene;
  }

  /**
   * Load a model and store a hidden template under `id`.
   * Returns the template (TransformNode or Mesh) or null on failure.
   */
  async loadModel(id: string, rootUrl: string, filename: string, onProgress?: (evt: any) => void): Promise<BABYLON.Mesh | BABYLON.TransformNode | null> {
    if (!id) throw new Error('AssetManager.loadModel: id required');
    if (this.templates.has(id)) {
      // already loaded: bump template refcount (ensure at least 1)
      this.refCounts.set(id, Math.max(1, (this.refCounts.get(id) ?? 0)));
      return this.templates.get(id) ?? null;
    }
    // Avoid concurrent duplicate loads
    if (this.loadPromises.has(id)) return this.loadPromises.get(id)!;

    const p = (async () => {
      try {
        const result = await SceneLoader.ImportMeshAsync('', rootUrl, filename, this.scene, undefined, onProgress as any);
        const meshes = result.meshes.filter(m => m instanceof BABYLON.AbstractMesh) as BABYLON.AbstractMesh[];
        if (meshes.length === 0) {
          console.warn('AssetManager.loadModel: no meshes in', filename);
          this.loadPromises.delete(id);
          return null;
        }

        // Create a parent TransformNode so whole model can be moved/scaled as one object.
        const root = new BABYLON.TransformNode(`${id}_template`, this.scene);
        for (const m of meshes) {
          // attach top-level meshes to root
          if (m.parent == null) m.parent = root;
          // hide individual meshes (template should be invisible)
          try { (m as any).isVisible = false; } catch {}
        }

        // Hide the root as a template
        try { (root as any).isVisible = false; } catch {}

        // If there's exactly one mesh and it's a mesh (not transform), prefer storing the mesh itself
        // (so createInstance/clone can be used directly). Otherwise store the root transform.
        let template: BABYLON.Mesh | BABYLON.TransformNode = root;
        if (meshes.length === 1 && meshes[0] instanceof BABYLON.Mesh) {
          template = meshes[0] as BABYLON.Mesh;
        }

        this.templates.set(id, template);
        // template kept alive: refcount starts at 1
        this.refCounts.set(id, 1);
        this.loadPromises.delete(id);
        return template;
      } catch (e) {
        console.warn('AssetManager.loadModel failed', e);
        this.loadPromises.delete(id);
        return null;
      }
    })();

    this.loadPromises.set(id, p);
    return p;
  }

  /**
   * Get the cached template for `id` or null.
   */
  getTemplate(id: string): BABYLON.Mesh | BABYLON.TransformNode | null {
    return this.templates.get(id) ?? null;
  }

  /**
   * Instantiate a template.
   * Options:
   *  - position?: Vector3
   *  - scale?: number | Vector3
   *  - instance?: boolean (allow instances when possible, default true)
   *
   * Returns the created AbstractMesh or TransformNode.
   */
  async instantiate(
    id: string,
    options: { position?: BABYLON.Vector3; scale?: number | BABYLON.Vector3; instance?: boolean } = {}
  ): Promise<BABYLON.AbstractMesh | BABYLON.TransformNode> {
    const tpl = this.templates.get(id);
    if (!tpl) throw new Error(`AssetManager.instantiate: template not found for id=${id}`);

    const allowInstance = options.instance !== false;
    let node: BABYLON.AbstractMesh | BABYLON.TransformNode;

    const tryCreateInstance = (m: any, name: string) => {
      try {
        if (typeof m.createInstance === 'function') {
          const inst = m.createInstance(name);
          if (inst) {
            (inst as any).isVisible = true;
            return inst as BABYLON.AbstractMesh;
          }
        }
      } catch {}
      return null;
    };

    const tryClone = (m: any, name: string) => {
      try {
        if (typeof m.clone === 'function') {
          const cloned = m.clone(name) as BABYLON.AbstractMesh;
          if (cloned) return cloned;
        }
      } catch {}
      return null;
    };

    const uid = `${id}_${Math.random().toString(36).slice(2, 8)}`;

    // If template is a Mesh, prefer createInstance/clone
    if (tpl instanceof BABYLON.Mesh) {
      const meshTpl = tpl as BABYLON.Mesh;
      if (allowInstance) {
        const inst = tryCreateInstance(meshTpl, `${meshTpl.name}_${uid}`);
        if (inst) {
          node = inst;
        } else {
          const cloned = tryClone(meshTpl, `${meshTpl.name}_${uid}`);
          if (!cloned) throw new Error(`AssetManager.instantiate: clone/instance failed for mesh template ${id}`);
          node = cloned;
        }
      } else {
        const cloned = tryClone(meshTpl, `${meshTpl.name}_${uid}`);
        if (!cloned) throw new Error(`AssetManager.instantiate: clone failed for mesh template ${id}`);
        node = cloned;
      }
    } else {
      // tpl is a TransformNode: try to clone the transform if possible, else assemble a new TransformNode
      const tplAny: any = tpl;
      if (typeof tplAny.clone === 'function') {
        // TransformNode.clone exists in Babylon and returns a node copy
        try {
          const cloned = tplAny.clone(`${tplAny.name}_${uid}`) as BABYLON.TransformNode;
          if (cloned) {
            // ensure child meshes are visible
            const childMeshes = (cloned as any).getChildMeshes ? (cloned as any).getChildMeshes(true) : [];
            for (const cm of childMeshes) try { (cm as any).isVisible = true; } catch {}
            node = cloned;
          } else {
            throw new Error('clone returned null');
          }
        } catch {
          // fallback to assembling children manually
          node = this.assembleFromChildren(tplAny, id, uid);
        }
      } else {
        node = this.assembleFromChildren(tplAny, id, uid);
      }
    }

    // Apply transform
    if (options.position) {
      try { (node as any).position = options.position.clone(); } catch {}
    }
    if (options.scale !== undefined) {
      try {
        if (typeof options.scale === 'number') (node as any).scaling = new BABYLON.Vector3(options.scale, options.scale, options.scale);
        else (node as any).scaling = (options.scale as BABYLON.Vector3).clone();
      } catch {}
    }

    // Increment refcount for the new instance
    this.refCounts.set(id, (this.refCounts.get(id) ?? 0) + 1);

    return node;
  }

  /**
   * Helper to assemble a TransformNode by cloning/instancing child meshes of a template.
   */
  private assembleFromChildren(tpl: any, id: string, uid: string): BABYLON.TransformNode {
    const root = new BABYLON.TransformNode(`${id}_${uid}_root`, this.scene);
    try {
      const children: BABYLON.AbstractMesh[] = typeof tpl.getChildMeshes === 'function' ? tpl.getChildMeshes(true) : [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        let childCopy: BABYLON.AbstractMesh | null = null;
        if (typeof (child as any).createInstance === 'function') {
          try { childCopy = (child as any).createInstance(`${child.name}_${uid}`); (childCopy as any).isVisible = true; } catch {}
        }
        if (!childCopy && typeof (child as any).clone === 'function') {
          try { childCopy = (child as any).clone(`${child.name}_${uid}`) as BABYLON.AbstractMesh; } catch {}
        }
        if (childCopy) childCopy.parent = root;
      }
    } catch (e) {
      console.warn('AssetManager.assembleFromChildren fallback failed', e);
    }
    return root;
  }

  /**
   * Preload a list of assets sequentially.
   * Each item may be: { id, rootUrl, filename }.
   * onProgress is optional and called with (loadedCount, total).
   */
  async preload(list: Array<{ id: string; rootUrl: string; filename: string }>, onProgress?: (loaded: number, total: number) => void) {
    if (!Array.isArray(list)) return;
    const total = list.length;
    let loaded = 0;
    for (const it of list) {
      try {
        await this.loadModel(it.id, it.rootUrl, it.filename);
      } catch (e) {
        console.warn('AssetManager.preload item failed', it, e);
      }
      loaded++;
      if (onProgress) onProgress(loaded, total);
    }
  }

  /**
   * Release one reference for `id`. When refcount reaches 0 dispose the template.
   */
  release(id: string) {
    if (!this.refCounts.has(id)) return;
    const next = (this.refCounts.get(id) ?? 0) - 1;
    if (next > 0) {
      this.refCounts.set(id, next);
      return;
    }
    // dispose template and remove entries
    const tpl = this.templates.get(id);
    if (tpl) {
      try {
        // dispose child meshes first
        try {
          const meshes = (tpl as any).getChildMeshes ? (tpl as any).getChildMeshes(true) : [];
          for (const m of meshes) try { m.dispose(); } catch {}
        } catch {}
        if ((tpl as any).dispose) (tpl as any).dispose();
      } catch (e) {
        console.warn('AssetManager.release dispose failed', e);
      }
    }
    this.templates.delete(id);
    this.refCounts.delete(id);
    this.loadPromises.delete(id);
  }

  /**
   * Dispose all templates and clear caches.
   */
  disposeAll() {
    for (const id of Array.from(this.templates.keys())) {
      try {
        const tpl = this.templates.get(id);
        if (!tpl) continue;
        try {
          const meshes = (tpl as any).getChildMeshes ? (tpl as any).getChildMeshes(true) : [];
          for (const m of meshes) try { m.dispose(); } catch {}
        } catch {}
        if ((tpl as any).dispose) (tpl as any).dispose();
      } catch (e) {
        console.warn('AssetManager.disposeAll item failed', e);
      }
    }
    this.templates.clear();
    this.refCounts.clear();
    this.loadPromises.clear();
  }
}
