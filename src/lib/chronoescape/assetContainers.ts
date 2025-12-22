import { AssetsManager, Scene, AssetContainer, TransformNode, Mesh, AbstractMesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { getAssetList } from '../assetsConfig';

export type AssetItem = {
  id: string;
  rootUrl: string; // folder or base URL ending with '/'
  filename: string; // filename including extension
};

/**
 * Preload a set of AssetContainers using a single AssetsManager run.
 * Returns a map of id -> AssetContainer (or null on error for that id).
 *
 * Example usage:
 * const assets = [
 *   { id: 'jollibee', rootUrl: '/glb/', filename: 'jollibee.glb' },
 *   { id: 'drone',    rootUrl: '/glb/', filename: 'drone.glb' }
 * ];
 * const containers = await preloadContainers(scene, assets, (loaded, total, last) => {
 *   // update loading UI
 * });
 */
export type PreloadResult = Record<
  string,
  { container: AssetContainer | null; template: TransformNode | Mesh | null; resource?: any }
>;

export function preloadContainers(
  scene: Scene,
  assets: AssetItem[],
  onProgress?: (loaded: number, total: number, lastTaskName?: string) => void
): Promise<PreloadResult> {
  if (!Array.isArray(assets) || assets.length === 0) return Promise.resolve({});
  return new Promise((resolve) => {
    const mgr = new AssetsManager(scene);
    const results: PreloadResult = {} as PreloadResult;

    const getExt = (fn: string) => (fn.split('.').pop() || '').toLowerCase();

    for (const a of assets) {
      const ext = getExt(a.filename);

      // helper to compute full URL for texture tasks when needed
      const fullUrl = (() => {
        if (/^https?:\/\//i.test(a.filename)) return a.filename;
        if (/^https?:\/\//i.test(a.rootUrl)) return (a.rootUrl || '') + a.filename;
        return (a.rootUrl || '') + a.filename;
      })();

      if (['glb', 'gltf', 'babylon', 'obj', 'stl'].includes(ext)) {
        // Use addMeshTask which provides loadedMeshes; avoids cross-origin/container URL issues.
        const meshTask = (mgr as any).addMeshTask(`${a.id}_meshTask`, '', a.rootUrl, a.filename);
        (meshTask as any).onSuccess = (t: any) => {
          try {
            const loadedMeshes: AbstractMesh[] = (t.loadedMeshes || []) as AbstractMesh[];
            // Build a hidden template node from the loaded meshes so callers can instantiate easily.
            let template: TransformNode | Mesh | null = null;

            const topMeshes = loadedMeshes.filter(m => m.parent == null);
            if (topMeshes.length === 1 && topMeshes[0] instanceof Mesh) {
              template = topMeshes[0] as Mesh;
              try { (template as any).isVisible = false; } catch {}
            } else if (topMeshes.length > 0) {
              const root = new TransformNode(`${a.id}_template`, scene);
              for (const m of topMeshes) {
                try { if (m.parent == null) m.parent = root; } catch {}
                try { (m as any).isVisible = false; } catch {}
              }
              try { (root as any).isVisible = false; } catch {}
              template = root;
            }

            results[a.id] = { container: null, template, resource: { meshes: loadedMeshes, skeletons: t.loadedSkeletons, particleSystems: t.loadedParticleSystems } };
          } catch (e) {
            console.warn('preloadContainers: meshTask onSuccess failed for', a.id, e);
            results[a.id] = { container: null, template: null, resource: null };
          }
        };
        (meshTask as any).onError = (t: any, message: any, exception: any) => {
          console.warn('preloadContainers: failed to load mesh', a.id, message, exception);
          results[a.id] = { container: null, template: null, resource: null };
        };
      } else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
        // texture task for images / heightmaps
        const texTask = mgr.addTextureTask(`${a.id}_texTask`, fullUrl);
        texTask.onSuccess = (t: any) => {
          try { results[a.id] = { container: null, template: null, resource: (t as any).texture ?? t }; } catch (e) { results[a.id] = { container: null, template: null, resource: null }; }
        };
        texTask.onError = (t: any, message: any, exception: any) => {
          console.warn('preloadContainers: failed to load texture', a.id, message, exception);
          results[a.id] = { container: null, template: null, resource: null };
        };
      } else {
        // fallback: try a texture task
        const texTask = mgr.addTextureTask(`${a.id}_fallbackTex`, fullUrl);
        texTask.onSuccess = (t: any) => {
          try { results[a.id] = { container: null, template: null, resource: (t as any).texture ?? t }; } catch (e) { results[a.id] = { container: null, template: null, resource: null }; }
        };
        texTask.onError = (t: any, message: any, exception: any) => {
          console.warn('preloadContainers: failed to load (fallback)', a.id, message, exception);
          results[a.id] = { container: null, template: null, resource: null };
        };
      }
    }

    mgr.onProgress = (remainingCount, totalCount, lastFinishedTask) => {
      const loaded = totalCount - remainingCount;
      try { onProgress?.(loaded, totalCount, lastFinishedTask?.name); } catch {}
    };

    mgr.onFinish = () => {
      resolve(results);
    };

    mgr.load();
  });
}

/**
 * Default asset list (placeholders). Update paths/filenames to match your repo or CDN.
 */
export const defaultAssetList: AssetItem[] = [
    // common textures in static root
  { id: 'metal', rootUrl: '/', filename: 'metal.jpg' },
  { id: 'tribal', rootUrl: '/', filename: 'tribal.png' },
  // Jollibee is hosted on the CDN used elsewhere in the project
  { id: 'jollibee', rootUrl: 'https://kolown.net/assets/p1sonet/', filename: 'jollibee.glb' },
  // local drone GLB shipped in the static assets
  { id: 'drone', rootUrl: '/', filename: 'glb/usb.glb' },
  // heightmap(s) from static folder
  { id: 'heightmap', rootUrl: '/heightmaps/', filename: 'heightmap.png' },

];

/**
 * Load assets from JSON config
 */
export async function getDefaultAssetList(): Promise<AssetItem[]> {
  try {
    return await getAssetList();
  } catch (error) {
    console.warn('Failed to load assets from config, using hardcoded defaults:', error);
    return defaultAssetList;
  }
}

export default preloadContainers;
