import * as BABYLON from '@babylonjs/core';
import { Drone } from './drone';

export function installDroneInput(getDrone: () => Drone | undefined) {
  const handler = (ev: KeyboardEvent) => {
    try {
      const drone = getDrone();
      if (!drone) return;
      const key = ev.key.toLowerCase();
      let offset: BABYLON.Vector3 | null = null;
      const mag = 1.6;
      // remap: w = up, a = left, s = down, d = right
      if (key === 'w') offset = new BABYLON.Vector3(0, mag, 0);
      else if (key === 's') offset = new BABYLON.Vector3(0, -mag, 0);
      else if (key === 'a') offset = new BABYLON.Vector3(-mag, 0, 0);
      else if (key === 'd') offset = new BABYLON.Vector3(mag, 0, 0);

      if (offset) {
        try { drone.nudge(offset, 600); } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
  };

  window.addEventListener('keydown', handler);

  return {
    dispose: () => window.removeEventListener('keydown', handler)
  };
}
