import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';


export type FloatingCube = {
  mesh: BABYLON.AbstractMesh;
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

export async function createFloatingJ(
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
    modelUrl?: string; // optional glTF/glb URL to use as the visual
  } = {}
): Promise<FloatingCubesResult> {
  const {
    count = 10,
    jitter = 0.3,
    verticalOffset = 0.5,
    sizeRange = [0.8, 2.0],
    massRange = [0.6, 1.8],
    antiGravityFactor = 0.95,
    linearDamping = 0.985
  } = options;

  const root = new BABYLON.TransformNode('floatingCubesRoot', scene);
  const items: FloatingCube[] = [];

  const pts = pathPoints && pathPoints.length ? pathPoints : [];
  const step = Math.max(1, Math.floor(pts.length / count));

  // If a modelUrl is provided, try to load it once and use it as a template
  let templateMesh: BABYLON.AbstractMesh | null = null;
  if (options.modelUrl) {
    try {
      const url = options.modelUrl;
      // Try a HEAD request first so we can log content-type / CORS info (helps debugging)
      try {
        const head = await fetch(url, { method: 'HEAD' });
        console.log('floatingj: model HEAD', url, head.status, head.headers.get('content-type'), head.headers.get('access-control-allow-origin'));
      } catch (headErr) {
        // non-fatal - still attempt to load (some servers don't implement HEAD)
        console.warn('floatingj: HEAD check failed (continuing to load):', headErr);
      }

      const lastSlash = url.lastIndexOf('/');
      const rootUrl = lastSlash !== -1 ? url.substring(0, lastSlash + 1) : '';
      const fileName = lastSlash !== -1 ? url.substring(lastSlash + 1) : url;

      // Use LoadAssetContainerAsync so we control adding to scene and disposing the container if desired
      // Use module-level LoadAssetContainerAsync (modular API) to avoid deprecation warnings.
      // Cast `scene` to `any` to avoid TypeScript type mismatches between UMD and modular packages.
      // Attempt to use the module-level loader via dynamic import so we avoid
      // compile-time type mismatches between 'babylonjs' (UMD) and '@babylonjs/core' (modular).
      // If the modular loader isn't available at runtime we fall back to the UMD SceneLoader.
      let container: any;
      try {
        // Use the UMD SceneLoader from the same BABYLON import to avoid package/type mismatches.
        container = await (BABYLON as any).SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, scene);
      } catch (loadErr) {
        console.error('floatingj: failed to load GLB with BABYLON.SceneLoader.LoadAssetContainerAsync', loadErr);
        throw loadErr;
      }

      // add to scene (we keep container in memory until we dispose it manually)
      container.addAllToScene();

      // pick first mesh with geometry as template (safely)
      const maybe = container.meshes.find((m: any) => m && m.geometry !== undefined);
      templateMesh = (maybe ? (maybe as any) : null);
      if (templateMesh) {
        templateMesh.setEnabled(false);
      }
    } catch (e) {
      console.warn('Failed to load model for floating cubes (fallback to boxes):', options.modelUrl, e);
      templateMesh = null;
    }
  }

  // If a model URL was requested, ensure the template was loaded successfully. If not, fail fast.
  if (options.modelUrl && !templateMesh) {
    throw new Error(`createFloatingJ: required model failed to load: ${options.modelUrl}`);
  }

  for (let i = 0; i < count; i++) {
    const idx = (i * step) % Math.max(1, pts.length);
    const base = pts.length ? pts[idx].clone() : new BABYLON.Vector3((Math.random() - 0.5) * 10, 4, (Math.random() - 0.5) * 10);

    const px = base.x + (Math.random() * 2 - 1) * jitter;
    const py = base.y + verticalOffset + (Math.random() * 2 - 1) * jitter;
    const pz = base.z + (Math.random() * 2 - 1) * jitter;

    const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
    // clone the template mesh so we can attach physics to it
  const cloned = (templateMesh! as any).clone(`${templateMesh!.name}_clone_${i}`) as any;
    if (!cloned) {
      console.warn(`floatingj: clone failed for template ${templateMesh?.name}, skipping item ${i}`);
      continue; // skip this item instead of creating a box fallback
    }
    const mesh = cloned;
    mesh.parent = root;
    mesh.setEnabled(true);
    mesh.position.set(px, py, pz);
    mesh.scaling = new BABYLON.Vector3(size, size, size);

    const mass = massRange[0] + Math.random() * (massRange[1] - massRange[0]);
    const agg = new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.BOX, {
      mass,
      restitution: 0.12,
      friction: 0.4
    }, scene);

    agg.body.setLinearVelocity(new BABYLON.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.2));

    items.push({ mesh, agg, mass, home: mesh.position.clone() });
  }

  function update(dtSec: number) {
    const gravity = 9.81;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const pos = it.mesh.getAbsolutePosition();
      // small anti-gravity
      const antiGravity = new BABYLON.Vector3(0, it.mass * gravity * antiGravityFactor, 0);
      it.agg.body.applyForce(antiGravity, pos);

      // gentle centering toward home
      const toHome = it.home.subtract(pos);
      const d = toHome.length();
      if (d > 0.15) {
        const pull = toHome.normalize().scale(Math.min(15, d * 2.0));
        it.agg.body.applyForce(pull, pos);
      }

      // damping applied by resetting velocity once per-frame (cheap)
      const lv = it.agg.body.getLinearVelocity();
      if (lv) it.agg.body.setLinearVelocity(lv.scale(linearDamping));
    }
  }

  function dispose() {
    for (const it of items) {
      try { it.agg.dispose(); } catch (e) {}
      try { it.mesh.dispose(); } catch (e) {}
    }
    try { root.dispose(); } catch (e) {}
  }

  return { root, items, update, dispose };
}
