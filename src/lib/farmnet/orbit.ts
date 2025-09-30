import * as BABYLON from '@babylonjs/core';
import { ORBIT } from './config';
import type { FloatingBall } from './config';

// Applies orbital / planet-like behaviour each frame to the collection of balls around the hoe mesh.
export function updateOrbits(balls: FloatingBall[], hoe: BABYLON.Mesh | null) {
  if (!hoe) return;
  const hoePos = hoe.getAbsolutePosition();
  for (const b of balls) {
    const m = b.mesh;
    const pos = m.getAbsolutePosition();
    const toHoe = hoePos.subtract(pos);
    let dist = toHoe.length();
    if (dist < 0.0001) dist = 0.0001;
    const dir = toHoe.scale(1 / dist);

  // Radial attraction with inverse square falloff (clamped)
  let grav = ORBIT.GRAVITY;
  if (dist > ORBIT.MAX_RANGE) grav *= ORBIT.GRAVITY_FAR_MULT;
  const invSq = 1 / Math.max(0.4, dist * dist);
  let radial = dir.scale(grav * invSq * (dist > ORBIT.MAX_RANGE ? 2 : 1));

    // Tangential component using stored orbit axis
    let tangent = BABYLON.Vector3.Cross(b.orbitAxis, dir);
    if (tangent.lengthSquared() < 0.00001) {
      tangent = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), dir);
    }
    tangent.normalize();
    const tangential = tangent.scale(ORBIT.TANGENTIAL_FORCE);

  // Inward drift bias (disabled when far roaming so they can explore)
  const inward = dist > ORBIT.MAX_RANGE * 0.9 ? BABYLON.Vector3.Zero() : dir.scale(ORBIT.INWARD_DRIFT);

    // Soft outward correction if too close
    let proximity = BABYLON.Vector3.Zero();
    if (dist < ORBIT.MIN_RANGE) {
      proximity = dir.scale(-0.01 * (ORBIT.MIN_RANGE - dist));
    }

    // Random jitter
    const jitter = new BABYLON.Vector3(Math.random()-0.5, (Math.random()-0.5)*0.4, Math.random()-0.5).scale(ORBIT.RANDOM_JITTER);

    // Plane alignment (push toward x = 0 plane)
    const planeErr = pos.x; // hoe centered at x=0
    const planeAlign = Math.abs(planeErr) > 0.0005 ? new BABYLON.Vector3(-planeErr * ORBIT.PLANE_ALIGN, 0, 0) : BABYLON.Vector3.Zero();

    // Combine forces / impulses
    let impulse = radial.add(tangential).add(inward).add(proximity).add(jitter).add(planeAlign);

    // Bounce / slingshot region near hoe (asteroid deflection feel)
    if (dist < ORBIT.BOUNCE_RADIUS) {
      // outward push + strong tangential spin to keep them moving
      const outward = dir.scale(-ORBIT.BOUNCE_OUTWARD); // opposite of dir for outward
      impulse = impulse.add(outward).add(tangential.scale(ORBIT.BOUNCE_TANGENTIAL_MULT));
    }

    // Encourage outward wandering between MAX_RANGE and FAR_MAX
    if (dist > ORBIT.MAX_RANGE && dist < ORBIT.FAR_MAX) {
      if (Math.random() < ORBIT.OUTWARD_WANDER_CHANCE) {
        // Remove or reduce radial inward component temporarily and push outward
        const outwardDir = dir.scale(-1);
        impulse.addInPlace(outwardDir.scale(ORBIT.OUTWARD_WANDER_FORCE));
        // Slight speed-up tangential for variety
        impulse.addInPlace(tangential.scale(0.5 * ORBIT.TANGENTIAL_FORCE));
      }
    }

    // Hard cap recovery: if beyond FAR_MAX, strong pull back
    if (dist > ORBIT.FAR_MAX) {
      impulse = dir.scale(ORBIT.GRAVITY * ORBIT.GRAVITY_FAR_MULT * 6.0);
    }

    if (b.agg) {
      try { b.agg.body.applyImpulse(impulse, pos); } catch {}
      try {
        const lv = b.agg.body.getLinearVelocity();
        if (lv) {
          if (lv.length() > ORBIT.MAX_SPEED) {
            b.agg.body.setLinearVelocity(lv.normalize().scale(ORBIT.MAX_SPEED));
          } else {
            b.agg.body.setLinearVelocity(lv.scale(ORBIT.BALL_DAMPING));
          }
        }
      } catch {}
    } else {
      m.position.addInPlace(impulse.scale(0.6));
    }
  }
}
