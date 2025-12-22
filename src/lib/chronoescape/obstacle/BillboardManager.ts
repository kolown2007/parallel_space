import * as BABYLON from '@babylonjs/core';
import { getTextureUrl } from '../../assetsConfig';

export interface BillboardOptions {
  count?: number;
  size?: { width: number; height: number };
  textureUrl?: string;
  parent?: BABYLON.AbstractMesh | null;
}

export class BillboardManager {
  scene: BABYLON.Scene;
  planes: BABYLON.AbstractMesh[] = [];
  texture?: BABYLON.Texture | null;
  options: BillboardOptions;

  constructor(scene: BABYLON.Scene, options: BillboardOptions = {}) {
    this.scene = scene;
    // keep options.textureUrl optional; resolve at creation time from assets.json when missing
    this.options = Object.assign({ count: 8, size: { width: 4, height: 4 }, textureUrl: undefined as any, parent: null }, options);
  }

  async createAlongPath(pathPoints: BABYLON.Vector3[]) {
    try {
      const count = this.options.count ?? 8;
      let texUrl = this.options.textureUrl;
      if (!texUrl) {
        try {
          texUrl = await getTextureUrl('malunggay');
        } catch (e) {
          texUrl = '/malunggay.png';
        }
      }
      this.texture = new BABYLON.Texture(texUrl as string, this.scene);
      try { this.texture.updateSamplingMode(BABYLON.Texture.TRILINEAR_SAMPLINGMODE); } catch {}
      try { (this.texture as any).hasAlpha = true; } catch {}

      for (let i = 0; i < count; i++) {
        const idx = Math.floor((i / count) * pathPoints.length);
        const p = pathPoints[idx] ? pathPoints[idx].clone() : new BABYLON.Vector3(0, 1, 0);
        const plane = BABYLON.MeshBuilder.CreatePlane(`billboard_plane_${i}`, { width: this.options.size!.width, height: this.options.size!.height }, this.scene);
        plane.position.copyFrom(p);
        plane.position.y += 1.5;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        try { (plane as any).preserveParentRotationForBillboard = false; } catch {}
        if (this.options.parent) try { plane.parent = this.options.parent; } catch {}

        const mat = new BABYLON.StandardMaterial(`billboard_mat_${i}`, this.scene);
        try { (mat as any).sideOrientation = BABYLON.Mesh.DOUBLESIDE; } catch {}
        mat.backFaceCulling = false;
        mat.diffuseTexture = this.texture as BABYLON.Texture;
        plane.material = mat;

        this.planes.push(plane);
      }
    } catch (e) {
      console.warn('BillboardManager.createAlongPath failed', e);
    }
  }

  dispose() {
    try {
      for (const p of this.planes) {
        try { p.dispose(); } catch {}
      }
      this.planes = [];
      try { if (this.texture && (this.texture as any).dispose) (this.texture as any).dispose(); } catch {}
      this.texture = null;
    } catch (e) {
      console.warn('BillboardManager.dispose error', e);
    }
  }
}
