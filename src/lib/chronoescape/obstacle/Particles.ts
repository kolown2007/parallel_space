import * as BABYLON from '@babylonjs/core';
import { createSolidParticleSystem } from '../../particles/solidParticleSystem';

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
  const spsFx = createSolidParticleSystem(scene, {
    particleNb: options.count ?? 800,
    particleSize: options.size ?? 1.0,
    maxDistance: options.maxDistance ?? 220
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
