import { Vector3 } from "@babylonjs/core";

const EPS = 1e-6;

/**
 * Signed distance from point p to a torus centered at origin with major radius R and minor radius r.
 * Torus major circle lies on the XZ plane (Y is up).
 */
export function torusSignedDistance(p: Vector3, R: number, r: number): number {
  const lenXZ = Math.hypot(p.x, p.z);
  return Math.hypot(lenXZ - R, p.y) - r;
}

/**
 * Compute the closest point on the torus surface and the surface normal at that point.
 * Returns objects reusing outPos/outNormal if provided to avoid allocations.
 */
export function torusClosestPointAndNormal(
  p: Vector3,
  R: number,
  r: number,
  outPos?: Vector3,
  outNormal?: Vector3
): { pos: Vector3; normal: Vector3 } {
  const pos = outPos ?? new Vector3();
  const normal = outNormal ?? new Vector3();

  const lenXZ = Math.hypot(p.x, p.z);
  const u = lenXZ > EPS ? Math.atan2(p.z, p.x) : 0;
  const cx = R * Math.cos(u);
  const cz = R * Math.sin(u);

  const dx = p.x - cx;
  const dy = p.y;
  const dz = p.z - cz;
  const dlen = Math.hypot(dx, dy, dz);

  if (dlen <= EPS) {
    // Degenerate: point is exactly at tube center. Pick +Y as normal.
    normal.set(0, 1, 0);
    pos.set(cx, 0, cz).addInPlace(normal.scaleInPlace(r));
    return { pos, normal };
  }

  normal.set(dx / dlen, dy / dlen, dz / dlen);
  pos.set(cx, 0, cz).addInPlace(normal.scaleInPlace(r));
  return { pos, normal };
}

/**
 * Move point p along its local torus normal by delta but clamp so the resulting point stays inside the torus tube.
 * Positive delta moves outward (toward the surface); negative delta moves inward.
 */
export function moveAlongNormalClamped(
  p: Vector3,
  R: number,
  r: number,
  delta: number,
  out?: Vector3
): Vector3 {
  const result = out ?? new Vector3();
  const s = torusSignedDistance(p, R, r);

  if (s < 0 && delta > 0) {
    // max outward move to remain inside (leave small epsilon)
    const maxDelta = Math.max(0, -s - 1e-4);
    delta = Math.min(delta, maxDelta);
  }

  const { normal } = torusClosestPointAndNormal(p, R, r, undefined, undefined);
  result.copyFrom(p).addInPlace(normal.scaleInPlace(delta));

  // Safety: if numeric error pushes outside, pull back slightly along -normal
  const s2 = torusSignedDistance(result, R, r);
  if (s2 > 0) {
    result.addInPlace(normal.scaleInPlace(-(s2 + 1e-6)));
  }

  return result;
}

/**
 * Compute toroidal coordinates (u: angle around major ring, v: angle around tube cross-section).
 * u in [-PI,PI], v in [-PI,PI]
 */
export function torusUV(p: Vector3, R: number, r: number): { u: number; v: number } {
  const lenXZ = Math.hypot(p.x, p.z);
  const u = lenXZ > EPS ? Math.atan2(p.z, p.x) : 0;
  const cx = R * Math.cos(u);
  const cz = R * Math.sin(u);
  const dx = p.x - cx;
  const dy = p.y;
  const dz = p.z - cz;
  const v = Math.atan2(dy, Math.hypot(dx, dz));
  return { u, v };
}

// End of torusUtils.ts
