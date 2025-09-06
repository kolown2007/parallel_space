import { Scene, Vector3, Color3, MeshBuilder, LinesMesh } from "@babylonjs/core";

export type TorusAxes = {
  radial: LinesMesh;
  tangent: LinesMesh;
  vertical: LinesMesh;
  dispose: () => void;
};

/**
 * Create three colored axis lines at the toroidal coordinate (u,v,rho).
 * - radial (red): outward from the ring center toward tube surface
 * - tangent (green): around the major ring (increasing u)
 * - vertical (blue): world Y (up)
 *
 * u,v in radians. rho is radial offset from tube center (use r for surface). Returns 3 lines and a dispose helper.
 */
export function createTorusAxes(
  scene: Scene,
  R: number,
  r: number,
  u: number,
  v: number,
  rho: number = r,
  size: number = 0.5,
  name = "torusAxes"
): TorusAxes {
  // parametric position
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const cv = Math.cos(v);
  const sv = Math.sin(v);

  const worldX = (R + rho * cv) * cu;
  const worldY = rho * sv;
  const worldZ = (R + rho * cv) * su;
  const origin = new Vector3(worldX, worldY, worldZ);

  // local basis
  const e_r = new Vector3(cu, 0, su).normalize(); // outward in XZ
  const e_u = new Vector3(-su, 0, cu).normalize(); // major-ring tangent
  const e_y = new Vector3(0, 1, 0);

  // radial normal approx at (u,v)
  const normal = e_r.scaleInPlace(cv).addInPlace(e_y.scaleInPlace(sv)).normalize();

  const radialEnd = origin.add(normal.scale(size));
  const tangentEnd = origin.add(e_u.scale(size));
  const verticalEnd = origin.add(e_y.scale(size));

  const radial = MeshBuilder.CreateLines(`${name}_radial`, { points: [origin, radialEnd] }, scene);
  radial.color = new Color3(1, 0, 0);

  const tangent = MeshBuilder.CreateLines(`${name}_tangent`, { points: [origin, tangentEnd] }, scene);
  tangent.color = new Color3(0, 1, 0);

  const vertical = MeshBuilder.CreateLines(`${name}_vertical`, { points: [origin, verticalEnd] }, scene);
  vertical.color = new Color3(0, 0, 1);

  const dispose = () => {
    radial.dispose();
    tangent.dispose();
    vertical.dispose();
  };

  return { radial, tangent, vertical, dispose };
}

// end
