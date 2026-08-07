import * as BABYLON from '@babylonjs/core';

/**
 * Return an interpolated position along a polyline `points` at normalized `progress` [0..1].
 * Safe for empty or short arrays (returns Vector3.Zero when no points).
 */
export function getPositionOnPath(points: BABYLON.Vector3[] | undefined, progress: number): BABYLON.Vector3 {
  if (!points || points.length === 0) return BABYLON.Vector3.Zero();
  const clamped = Math.max(0, Math.min(1, progress));
  const maxIndex = points.length - 1;
  const rawIndex = clamped * maxIndex;
  const lowerIndex = Math.floor(rawIndex);
  const upperIndex = Math.min(lowerIndex + 1, maxIndex);
  const t = rawIndex - lowerIndex;

  const lower = points[lowerIndex] || points[0];
  const upper = points[upperIndex] || lower;

  return BABYLON.Vector3.Lerp(lower, upper, t);
}

/**
 * Return a normalized direction vector along the path at `progress`.
 * Uses a small forward epsilon to compute the tangent; epsilon defaults relative to points length.
 */
export function getDirectionOnPath(points: BABYLON.Vector3[] | undefined, progress: number, epsilon?: number): BABYLON.Vector3 {
  if (!points || points.length < 2) return new BABYLON.Vector3(0, 0, 1);
  const defaultEps = 1 / Math.max(8, points.length);
  const eps = Math.max(0.0001, epsilon ?? defaultEps);
  const p0 = getPositionOnPath(points, progress);
  const p1 = getPositionOnPath(points, Math.min(1, progress + eps));
  const dir = p1.subtract(p0);
  const len = dir.length();
  return len === 0 ? new BABYLON.Vector3(0, 0, 1) : dir.scale(1 / len);
}
