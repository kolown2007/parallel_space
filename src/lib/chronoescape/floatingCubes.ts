import * as BABYLON from '@babylonjs/core';

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
  } = {}
): FloatingCubesResult {
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

  for (let i = 0; i < count; i++) {
    const idx = (i * step) % Math.max(1, pts.length);
    const base = pts.length ? pts[idx].clone() : new BABYLON.Vector3((Math.random() - 0.5) * 10, 4, (Math.random() - 0.5) * 10);

    const px = base.x + (Math.random() * 2 - 1) * jitter;
    const py = base.y + verticalOffset + (Math.random() * 2 - 1) * jitter;
    const pz = base.z + (Math.random() * 2 - 1) * jitter;

    const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
    const box = BABYLON.MeshBuilder.CreateBox(`hoverBox_${i}`, { size }, scene);
    box.position.set(px, py, pz);
    box.parent = root;

    const mat = new BABYLON.StandardMaterial(`hoverMat_${i}`, scene);
    mat.diffuseColor = new BABYLON.Color3(0.6, 0.35, 0.9);
    box.material = mat;

    const mass = massRange[0] + Math.random() * (massRange[1] - massRange[0]);
    const agg = new BABYLON.PhysicsAggregate(box, BABYLON.PhysicsShapeType.BOX, {
      mass,
      restitution: 0.12,
      friction: 0.4
    }, scene);

    agg.body.setLinearVelocity(new BABYLON.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.2));

    items.push({ mesh: box, agg, mass, home: box.position.clone() });
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
