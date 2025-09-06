import { writable, get, type Unsubscriber } from 'svelte/store';

export type CameraMode = 0 | 1 | 2; // 0 = drone visible, 1 = drone invisible, 2 = arcCam

// single source-of-truth for camera mode
export const cameraMode = writable<CameraMode>(0);

export const setCameraMode = (m: CameraMode) => cameraMode.set(m);
export const toggleCameraMode = () => cameraMode.update(n => ((n + 1) % 3) as CameraMode);
export const getCameraMode = () => get(cameraMode);

// safe subscribe helper that no-ops during SSR and returns an Unsubscriber
export function subscribeCameraMode(cb: (m: CameraMode) => void): Unsubscriber {
  if (typeof window === 'undefined') return () => {};
  return cameraMode.subscribe(cb);
}
