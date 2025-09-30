import * as BABYLON from '@babylonjs/core';

// Orbital + motion constants centralised here for reuse
export const ORBIT = {
  // Primary orbital behavior distances
  MAX_RANGE: 12.0,          // preferred roaming radius before gentle return
  FAR_MAX: 24.0,            // hard cap; beyond this a strong inward pull engages
  // Attraction and motion shaping
  MIN_RANGE: 0.4,
  GRAVITY: 0.018,
  GRAVITY_FAR_MULT: 3.2,
  TANGENTIAL_FORCE: 0.012,
  INWARD_DRIFT: 0.003,
  RANDOM_JITTER: 0.002,
  PLANE_ALIGN: 0.0025,      // reduced so they can climb out of central plane more
  // Bounce / slingshot behavior near hoe
  BOUNCE_RADIUS: 1.0,        // when inside this, apply outward + strong tangential deflection
  BOUNCE_OUTWARD: 0.06,      // outward impulse magnitude
  BOUNCE_TANGENTIAL_MULT: 4.0, // tangential multiplier during bounce
  // Far-wander tuning
  OUTWARD_WANDER_CHANCE: 0.003, // probability each frame to push outward when between MAX_RANGE and FAR_MAX
  OUTWARD_WANDER_FORCE: 0.01,   // outward force scale when wandering
  BALL_DAMPING: 0.988,
  MAX_SPEED: 4.0
} as const;

export interface FloatingBall {
  mesh: BABYLON.Mesh;
  agg?: BABYLON.PhysicsAggregate;
  orbitAxis: BABYLON.Vector3;
}
