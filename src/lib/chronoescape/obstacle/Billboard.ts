import * as BABYLON from '@babylonjs/core';
import { getTextureUrl } from '../../assetsConfig';

export interface BillboardOptions {
  count?: number;
  size?: { width: number; height: number };
  /** Direct URL override */
  textureUrl?: string;
  /** Asset id or array of ids to resolve via getTextureUrl() */
  textureId?: string | string[];
  parent?: BABYLON.AbstractMesh | null;
}

export class BillboardManager {
  scene: BABYLON.Scene;
  planes: BABYLON.AbstractMesh[] = [];
  /** Track textures created for planes (may be multiple when textureId is array) */
  texture?: BABYLON.Texture | null;
  private createdTextures: BABYLON.Texture[] = [];
  options: BillboardOptions;
  private textureObservers: BABYLON.Observer<BABYLON.Texture>[] = [];

  constructor(scene: BABYLON.Scene, options: BillboardOptions = {}) {
    this.scene = scene;
    // keep options.textureUrl optional; resolve at creation time from assets.json when missing
    // Do NOT force-default both width/height here so callers may provide only one dimension.
    this.options = Object.assign({ count: 8, size: undefined as any, textureUrl: undefined as any, textureId: undefined as any, parent: null }, options);
  }

  async createAlongPath(pathPoints: BABYLON.Vector3[]) {
    try {
      const count = this.options.count ?? 8;
      let texUrl = this.options.textureUrl as string | undefined;
      let resolvedUrls: string[] | undefined;

      // Allow callers to pass size with only width or only height. We'll compute the
      // missing dimension from the texture aspect ratio once the texture is ready.
      const requestedWidth = this.options.size?.width as number | undefined;
      const requestedHeight = this.options.size?.height as number | undefined;

      // If neither requested, fallback to sensible defaults later

      // If textureUrl not provided, try resolving textureId (supports array/random)
      if (!texUrl && this.options.textureId) {
        try {
          if (Array.isArray(this.options.textureId)) {
            // Resolve all provided ids up-front so we can pick per-plane
            resolvedUrls = await Promise.all(
              this.options.textureId.map((tid) => getTextureUrl(tid))
            );
            // leave texUrl undefined so per-plane textures are created
          } else {
            const tid = this.options.textureId as string;
            texUrl = await getTextureUrl(tid);
          }
        } catch (e) {
          texUrl = undefined;
          resolvedUrls = undefined;
        }
      }

      // Fallback to built-in default texture id
      if (!texUrl) {
        try {
          texUrl = await getTextureUrl('malunggay');
        } catch (e) {
          texUrl = '/malunggay.png';
        }
      }

      // If we have a single resolved texUrl (non-array case), create one texture
      if (texUrl) {
        this.texture = new BABYLON.Texture(texUrl as string, this.scene);
        this.createdTextures.push(this.texture);
        try { this.texture.updateSamplingMode(BABYLON.Texture.BILINEAR_SAMPLINGMODE); } catch {}
        try { this.texture.wrapU = this.texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; } catch {}
        try { (this.texture as any).hasAlpha = true; } catch {}
      }

      // Helper to set plane size based on requested dims and texture aspect ratio
      const applySizeToPlane = (plane: BABYLON.Mesh, texW?: number, texH?: number) => {
        // If both requested, apply directly. If one requested, compute the other
        // using texture aspect ratio. If texture size not available, fall back
        // to default 4 units for the unspecified dimension.
        let w = requestedWidth;
        let h = requestedHeight;
        if (w == null && h == null) {
          w = 4; h = 4;
        } else if (w != null && h == null) {
          if (texW && texH) h = w * (texH / texW);
          else h = 4;
        } else if (h != null && w == null) {
          if (texW && texH) w = h * (texW / texH);
          else w = 4;
        }
        try {
          plane.scaling.x = w as number;
          plane.scaling.y = h as number;
        } catch {}
      };

      for (let i = 0; i < count; i++) {
        const idx = Math.floor((i / count) * pathPoints.length);
        const p = pathPoints[idx] ? pathPoints[idx].clone() : new BABYLON.Vector3(0, 1, 0);
        const plane = BABYLON.MeshBuilder.CreatePlane(`billboard_plane_${i}`, { width: 1, height: 1 }, this.scene);
        plane.position.copyFrom(p);
        plane.position.y += 1.5;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        try { (plane as any).preserveParentRotationForBillboard = false; } catch {}
        if (this.options.parent) try { plane.parent = this.options.parent; } catch {}

        const mat = new BABYLON.StandardMaterial(`billboard_mat_${i}`, this.scene);
        try { (mat as any).sideOrientation = BABYLON.Mesh.DOUBLESIDE; } catch {}
        mat.backFaceCulling = false;
        // Decide which texture (url) to use for this plane
        let planeTexture: BABYLON.Texture | undefined;
        if (resolvedUrls && resolvedUrls.length > 0) {
          const chosen = resolvedUrls[Math.floor(Math.random() * resolvedUrls.length)];
          try {
            planeTexture = new BABYLON.Texture(chosen, this.scene);
            this.createdTextures.push(planeTexture);
            try { planeTexture.updateSamplingMode(BABYLON.Texture.BILINEAR_SAMPLINGMODE); } catch {}
            try { planeTexture.wrapU = planeTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; } catch {}
            try { (planeTexture as any).hasAlpha = true; } catch {}
          } catch (e) {
            planeTexture = undefined;
          }
        } else if (this.texture) {
          planeTexture = this.texture;
        }
        if (planeTexture) mat.diffuseTexture = planeTexture as BABYLON.Texture;
        plane.material = mat;

        // If texture already has size info, apply sizing immediately per-plane
        try {
          const texForSizing = planeTexture || this.texture;
          if (texForSizing && (texForSizing as any).isReady && (texForSizing as any).isReady()) {
            const s = (texForSizing as any).getSize?.() || { width: (texForSizing as any)._size?.width, height: (texForSizing as any)._size?.height };
            applySizeToPlane(plane, s?.width, s?.height);
          } else if (texForSizing && (texForSizing as any).onLoadObservable) {
            const observer = (texForSizing as any).onLoadObservable.add(() => {
              try {
                const s = (texForSizing as any).getSize?.();
                applySizeToPlane(plane, s?.width, s?.height);
              } catch (e) {}
            });
            if (observer) this.textureObservers.push(observer);
          } else {
            // fallback
            applySizeToPlane(plane);
          }
        } catch (e) {
          applySizeToPlane(plane);
        }

        this.planes.push(plane);
      }
    } catch (e) {
      console.warn('BillboardManager.createAlongPath failed', e);
    }
  }

  dispose() {
    try {
      // Remove texture observers to prevent leaks
      // Remove observers from any textures we created
      for (const t of this.createdTextures) {
        try {
          if ((t as any).onLoadObservable) {
            for (const observer of this.textureObservers) {
              try { (t as any).onLoadObservable.remove(observer); } catch {}
            }
          }
        } catch {}
      }
      this.textureObservers = [];

      for (const p of this.planes) {
        try { p.dispose(); } catch {}
      }
      this.planes = [];
      // Dispose any textures created per-plane
      for (const t of this.createdTextures) {
        try { if (t && (t as any).dispose) (t as any).dispose(); } catch {}
      }
      this.createdTextures = [];
      this.texture = null;
    } catch (e) {
      console.warn('BillboardManager.dispose error', e);
    }
  }
}
