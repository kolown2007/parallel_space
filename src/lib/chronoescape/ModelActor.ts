import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
// Use the SceneLoader available on the BABYLON namespace to avoid importing
// from internal loader paths which may be considered non-public.

export interface ModelActorOptions {
  name?: string;
  position?: BABYLON.Vector3;
  rotation?: BABYLON.Vector3;
  scale?: BABYLON.Vector3 | number;
}

export class ModelActor {
  public scene: BABYLON.Scene;
  public name: string;
  public root?: BABYLON.AbstractMesh;
  public meshes: BABYLON.AbstractMesh[] = [];
  public aggregate?: BABYLON.PhysicsAggregate | null = null;

  constructor(scene: BABYLON.Scene, opts: ModelActorOptions = {}) {
    this.scene = scene;
    this.name = opts.name ?? 'modelActor';
    if (opts.position && opts.position instanceof BABYLON.Vector3) {
      // nothing yet - applied after load
    }
  }

  // Load a GLB/GLTF URL. Returns the root mesh of the imported model.
  async load(url: string, onProgress?: (evt: any) => void): Promise<BABYLON.AbstractMesh | null> {
    try {
      // Use the module-level ImportMeshAsync overload which expects
      // (meshNames, rootUrl, sceneFilename, scene, onProgress?).
      // Support callers passing a full URL (split into root + filename) or
      // passing a simple filename.
      let rootUrl = '';
      let fileName = url;
      if (url.includes('/')) {
        const idx = url.lastIndexOf('/');
        rootUrl = url.substring(0, idx + 1);
        fileName = url.substring(idx + 1);
      }
      // If caller passed a directory (ends with '/'), bail with a helpful message
      if (!fileName) {
        console.warn('ModelActor.load called with a directory URL (no filename):', url);
        return null;
      }

    // Load the model into an AssetContainer using the public API, then add to scene
    const container = await BABYLON.SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, this.scene);
    container.addAllToScene();
      // choose a sensible root: prefer a node named the same as file, else first mesh
      const meshes = container.meshes.filter(m => m instanceof BABYLON.AbstractMesh) as BABYLON.AbstractMesh[];
      if (meshes.length === 0) return null;
      // create a parent transform node so we can move/scale the whole model
      const root = new BABYLON.TransformNode(this.name + '_root', this.scene);
      for (const m of meshes) {
        if (m.parent == null) {
          m.parent = root;
        }
        this.meshes.push(m);
      }
      this.root = root as unknown as BABYLON.AbstractMesh;
      return this.root;
    } catch (e) {
      console.warn('ModelActor.load failed', e);
      return null;
    }
  }

  setPosition(pos: BABYLON.Vector3) {
    if (!this.root) return;
    (this.root as any).position = pos.clone();
  }

  setRotation(rot: BABYLON.Vector3) {
    if (!this.root) return;
    if ((this.root as any).rotation) (this.root as any).rotation = rot.clone();
  }

  setScale(s: BABYLON.Vector3 | number) {
    if (!this.root) return;
    if (typeof s === 'number') this.root.scaling = new BABYLON.Vector3(s, s, s);
    else this.root.scaling = s.clone();
  }

  // Add a physics aggregate to the root (useful for collisions)
  addPhysicsAggregate(shape: BABYLON.PhysicsShapeType = BABYLON.PhysicsShapeType.BOX, options: any = { mass: 0 }) {
    if (!this.root) return;
    try {
      this.aggregate = new BABYLON.PhysicsAggregate(this.root as any, shape, options, this.scene);
    } catch (e) {
      console.warn('addPhysicsAggregate failed', e);
    }
  }

  // Make all child meshes pickable/clickable
  makeClickable() {
    for (const m of this.meshes) m.isPickable = true;
  }

  // Set emissive color on all standard/PBR materials found in this model
  setEmissive(color: BABYLON.Color3) {
    for (const m of this.meshes) {
      try {
        const mat: any = (m as any).material;
        if (mat) {
          mat.emissiveColor = color;
        }
      } catch {}
    }
  }

  // Dispose resources
  dispose() {
    try {
      if (this.aggregate && (this.aggregate as any).dispose) (this.aggregate as any).dispose();
    } catch {}
    try {
      for (const m of this.meshes) { try { m.dispose(); } catch {} }
      this.meshes = [];
      if (this.root && (this.root as any).dispose) (this.root as any).dispose();
      this.root = undefined;
    } catch {}
  }
}

/* Usage example:
import { ModelActor } from '$lib/ModelActor';

const actor = new ModelActor(scene, { name: 'jollibee' });
await actor.load('/models/jollibee.glb');
actor.setPosition(new BABYLON.Vector3(0, 0, 0));
actor.setScale(1.0);
actor.addPhysicsAggregate(BABYLON.PhysicsShapeType.BOX, { mass: 0 });
actor.makeClickable();
actor.setEmissive(new BABYLON.Color3(1,0.6,0.2));
*/
