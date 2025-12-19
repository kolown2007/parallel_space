import * as BABYLON from '@babylonjs/core';
// Avoid importing internal SceneLoader path; use `BABYLON.SceneLoader` when needed.
import { getPositionOnPath, getDirectionOnPath } from '../world/PathUtils';
import '@babylonjs/loaders/glTF';

type TemplateFactory = (scene: BABYLON.Scene) => Promise<BABYLON.Mesh | BABYLON.TransformNode | null>;

export interface PlaceOptions {
  index?: number;
  progress?: number; // 0..1
  degree?: number; // 0..360
  offsetY?: number;
  alignToPath?: boolean;
  instance?: boolean;
  physics?: { mass?: number; shape?: BABYLON.PhysicsShapeType };
  guid?: string;
  scale?: number | BABYLON.Vector3;
}

export interface RegisteredType {
  name: string;
  factory: TemplateFactory;
  template?: BABYLON.Mesh | BABYLON.TransformNode | null;
}

function newGuid(): string {
  if (typeof (crypto as any)?.randomUUID === 'function') return (crypto as any).randomUUID();
  return 'id-' + Math.random().toString(36).slice(2, 10);
}

export class ObstaclesManager {
  private scene: BABYLON.Scene;
  private points: BABYLON.Vector3[];
  private types = new Map<string, RegisteredType>();
  private registry: Record<string, { index: number; mesh: BABYLON.AbstractMesh | BABYLON.TransformNode }> = {};

  constructor(scene: BABYLON.Scene, points: BABYLON.Vector3[]) {
    this.scene = scene;
    this.points = points;
  }

  async registerType(name: string, factory: TemplateFactory) {
    const reg: RegisteredType = { name, factory, template: null };
    this.types.set(name, reg);
    try {
      reg.template = await factory(this.scene);
      if (reg.template && (reg.template as BABYLON.Mesh).getBoundingInfo) {
        (reg.template as BABYLON.Mesh).isVisible = false;
      }
    } catch (e) {
      console.warn('ObstaclesManager.registerType failed for', name, e);
      reg.template = null;
    }
    return reg;
  }

  private resolvePosition(opts: PlaceOptions): { pos: BABYLON.Vector3; dir: BABYLON.Vector3; index: number } {
    if (!this.points || this.points.length === 0) {
      return { pos: BABYLON.Vector3.Zero(), dir: BABYLON.Vector3.Forward(), index: 0 };
    }
    let progress = 0;
    if (typeof opts.progress === 'number') progress = opts.progress;
    else if (typeof opts.degree === 'number') progress = (((opts.degree % 360) + 360) % 360) / 360;
    else if (typeof opts.index === 'number') progress = opts.index / Math.max(1, this.points.length - 1);

    progress = Math.max(0, Math.min(1, progress));
    const idxF = progress * (this.points.length - 1);
    const idx = Math.round(idxF);
    const pos = getPositionOnPath(this.points, progress);
    const dir = getDirectionOnPath(this.points, progress);
    return { pos: pos.add(new BABYLON.Vector3(0, opts.offsetY ?? 0, 0)), dir, index: idx };
  }

  async place(typeName: string, opts: PlaceOptions = {}) {
    const reg = this.types.get(typeName);
    if (!reg) throw new Error(`Unknown obstacle type: ${typeName}`);
    if (!reg.template) {
      reg.template = await reg.factory(this.scene);
      if (!reg.template) throw new Error(`Failed to create template for type ${typeName}`);
    }
    const { pos, dir, index } = this.resolvePosition(opts);
    const guid = opts.guid ?? newGuid();

    let mesh: BABYLON.AbstractMesh | BABYLON.TransformNode;
    const tpl = reg.template as any;
    if (opts.instance !== false && tpl && typeof tpl.createInstance === 'function') {
      mesh = (tpl as BABYLON.Mesh).createInstance(`${typeName}_${guid}`);
      (mesh as BABYLON.Mesh).isVisible = true;
    } else if (tpl && typeof tpl.clone === 'function') {
      // preferred: use clone when available
      mesh = tpl.clone(`${typeName}_${guid}`) as BABYLON.AbstractMesh;
      if (!mesh) throw new Error(`Template clone failed for ${typeName}`);
      if ((mesh as BABYLON.AbstractMesh).setEnabled) (mesh as BABYLON.AbstractMesh).setEnabled(true);
    } else if (tpl && typeof tpl.getChildMeshes === 'function') {
      // fallback: assemble a new TransformNode and clone/instance its child meshes
      const root = new BABYLON.TransformNode(`${typeName}_${guid}_root`, this.scene);
      const children = tpl.getChildMeshes(true) as BABYLON.Mesh[];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        let childCopy: BABYLON.AbstractMesh | null = null;
        if (typeof (child as any).createInstance === 'function') {
          childCopy = (child as any).createInstance(`${child.name}_${guid}`);
          (childCopy as BABYLON.Mesh).isVisible = true;
        } else if (typeof (child as any).clone === 'function') {
          childCopy = (child as any).clone(`${child.name}_${guid}`) as BABYLON.AbstractMesh;
        }
        if (childCopy) {
          childCopy.parent = root;
        }
      }
      mesh = root;
    } else {
      throw new Error(`Template for ${typeName} cannot be cloned or instanced`);
    }

    mesh.position.copyFrom(pos);
    if (typeof opts.scale === 'number') mesh.scaling = new BABYLON.Vector3(opts.scale, opts.scale, opts.scale);
    else if (opts.scale instanceof BABYLON.Vector3) mesh.scaling = opts.scale.clone();

    if (opts.alignToPath) {
      const yaw = Math.atan2(dir.x, dir.z);
      mesh.rotation = new BABYLON.Vector3(mesh.rotation.x, yaw, mesh.rotation.z);
    }

    if (opts.physics) {
      new BABYLON.PhysicsAggregate(mesh, opts.physics.shape ?? BABYLON.PhysicsShapeType.BOX, {
        mass: opts.physics.mass ?? 0,
        restitution: 0.2,
        friction: 0.6
      }, this.scene);
    }

    this.registry[guid] = { index, mesh };
    (mesh as any).metadata = (mesh as any).metadata || {};
    (mesh as any).metadata.guid = guid;
    (mesh as any).metadata.pathIndex = index;

    return { guid, index, mesh } as { guid: string; index: number; mesh: BABYLON.AbstractMesh | BABYLON.TransformNode };
  }

  async generateAlongPath(typeName: string, count: number, opts: Partial<PlaceOptions> = {}) {
    const results: Array<{ guid: string; index: number; mesh: BABYLON.AbstractMesh | BABYLON.TransformNode }> = [];
    const step = Math.max(1, Math.floor(this.points.length / count));
    for (let i = 0; i < count; i++) {
      const index = Math.min(this.points.length - 1, i * step);
      const r = await this.place(typeName, { ...opts, index });
      results.push(r);
    }
    return results;
  }

  getIndexForGuid(guid: string) {
    return this.registry[guid]?.index;
  }
  getMeshForGuid(guid: string) {
    return this.registry[guid]?.mesh ?? null;
  }

  disposeAll() {
    for (const g in this.registry) {
      try { this.registry[g].mesh.dispose(); } catch (e) { /* ignore*/ }
    }
    (this.registry as any) = {};
  }
}
