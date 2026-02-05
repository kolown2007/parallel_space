import * as BABYLON from '@babylonjs/core';

export type SPSOptions = {
  particleNb?: number;
  particleSize?: number;
  particleSpeed?: number;
  maxDistance?: number; // distance from emitter before recycling
  /** optional base color applied to all particles (if provided) */
  baseColor?: BABYLON.Color3;
};

export function createSolidParticleSystem(scene: BABYLON.Scene, options: SPSOptions = {}) {
  const particleNb = options.particleNb ?? 400;
  const nb = Math.floor(particleNb / 3);
  const boxSize = options.particleSize ?? 0.18;

  const SPS = new BABYLON.SolidParticleSystem('SPS', scene, { particleIntersection: true, boundingSphereOnly: true });

  const box = BABYLON.MeshBuilder.CreateBox('sps_box', { size: boxSize }, scene);
  const poly = BABYLON.MeshBuilder.CreatePolyhedron('sps_poly', { size: boxSize, type: 4, flat: true }, scene);
  const tetra = BABYLON.MeshBuilder.CreatePolyhedron('sps_tetra', { size: boxSize / 2.0, flat: true }, scene);

  SPS.addShape(box, nb);
  SPS.addShape(poly, nb);
  SPS.addShape(tetra, nb);

  box.dispose();
  poly.dispose();
  tetra.dispose();

  const mesh = SPS.buildMesh();
  SPS.computeBoundingBox = true;
  SPS.computeParticleTexture = false;

  // behavior params
  const speed = options.particleSpeed ?? 0.01; // slower
  const cone = 0.4;
  const gravity = 0;
  const restitution = 0.97;
  const baseColor = options.baseColor;
  const maxDistance = options.maxDistance ?? 400;

  // helper temp vectors
  const tmpV = BABYLON.Vector3.Zero();

  SPS.recycleParticle = function (particle: BABYLON.SolidParticle): BABYLON.SolidParticle {
    particle.position.x = 0;
    particle.position.y = 0;
    particle.position.z = 0;
    // velocities centered around zero and scaled by speed so motion is slower
    particle.velocity.x = (Math.random() - 0.5) * speed;
    particle.velocity.y = (Math.random() - 0.5) * cone * speed;
    particle.velocity.z = (Math.random() - 0.5) * cone * speed;

    particle.rotation.x = Math.random() * Math.PI;
    particle.rotation.y = Math.random() * Math.PI;
    particle.rotation.z = Math.random() * Math.PI;

    // smaller more subtle scaling
    const s = Math.random() * 0.4 + 0.12; // ~0.12 - 0.52
    particle.scaling.x = s;
    particle.scaling.y = s;
    particle.scaling.z = s;

    // apply base color if provided (same color for all particles in this SPS)
    if (particle.color && baseColor) {
      particle.color.r = baseColor.r;
      particle.color.g = baseColor.g;
      particle.color.b = baseColor.b;
      particle.color.a = 1.0;
    }
    return particle;
  };

  SPS.updateParticle = function (particle: BABYLON.SolidParticle): BABYLON.SolidParticle {
    // apply gravity
    particle.velocity.y += gravity;
    particle.position.addInPlace(particle.velocity);

    const sign = (particle.idx % 2 === 0) ? 1 : -1;
    // slower rotation for a gentler motion
    particle.rotation.z += 0.04 * sign;
    particle.rotation.x += 0.02 * sign;
    particle.rotation.y += 0.003 * sign;

    // recycle when too far from origin (keeps particle count stable)
    const dist = particle.position.length();
    if (dist > maxDistance) {
      this.recycleParticle(particle);
    }
    return particle;
  };

  SPS.initParticles = function () {
    for (let p = 0; p < SPS.nbParticles; p++) {
      SPS.recycleParticle(SPS.particles[p]);
    }
  };

  SPS.afterUpdateParticles = function () { /* no-op for now */ };

  SPS.initParticles();
  SPS.setParticles();
  // Enable computing particle color so assigned `particle.color` is used
  SPS.computeParticleColor = true;

  let running = false;
  const beforeRender = () => {
    SPS.setParticles();
  };

  return {
    sps: SPS,
    mesh,
    start() {
      if (!running) {
        scene.registerBeforeRender(beforeRender);
        running = true;
      }
    },
    stop() {
      if (running) {
        scene.unregisterBeforeRender(beforeRender);
        running = false;
      }
    },
    attachTo(parent: BABYLON.Node | null) {
      mesh.parent = parent as any;
    },
    dispose() {
      if (running) scene.unregisterBeforeRender(beforeRender);
      try {
        SPS.dispose();
      } catch (e) { /* ignore */ }
      try { mesh.dispose(); } catch (e) { /* ignore */ }
    }
  };
}

export interface ParticleOptions {
  count?: number;
  size?: number;
  maxDistance?: number;
  offsetY?: number;
  autoDispose?: number;
}

export function createParticles(
  scene: BABYLON.Scene,
  pathPoints: BABYLON.Vector3[],
  index: number,
  parent: BABYLON.Mesh,
  options: ParticleOptions = {}
): any {
  // pick one random color per spawn from a small palette
  const palette = [
    new BABYLON.Color3(1, 0.2, 0.2),
    new BABYLON.Color3(1, 0.6, 0.2),
    new BABYLON.Color3(0.2, 0.6, 1),
    new BABYLON.Color3(0.6, 0.2, 1),
    new BABYLON.Color3(0.4, 1, 0.4),
    new BABYLON.Color3(1, 1, 0.6)
  ];
  const chosen = palette[Math.floor(Math.random() * palette.length)];

  const spsFx = createSolidParticleSystem(scene, {
    particleNb: options.count ?? 400,
    particleSize: options.size ?? 0.18,
    maxDistance: options.maxDistance ?? 220,
    baseColor: chosen
  });

  const pos = pathPoints[index]?.clone() || new BABYLON.Vector3(0, 0, 0);
  pos.y += options.offsetY ?? 1.2;

  spsFx.mesh.position.copyFrom(pos);
  spsFx.attachTo(parent);
  spsFx.start();

  if (options.autoDispose) {
    window.setTimeout(() => {
      try {
        spsFx.stop();
        spsFx.dispose();
      } catch {}
    }, options.autoDispose);
  }

  return spsFx;
}
