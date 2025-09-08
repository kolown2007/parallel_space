import { writable, get, type Unsubscriber } from 'svelte/store';

// Drone speed store: three-step cycle (0 = stopped, very slow, faster)
// Default is 0 (stopped)
export const droneSpeed = writable<number>(0);

export const setDroneSpeed = (s: number) => droneSpeed.set(s);
export const getDroneSpeed = () => get(droneSpeed);
export const toggleDroneSpeed = () => droneSpeed.update(s => {
  // 3-step cycle: 0 (stopped) -> very slow -> medium slow -> back to 0
  const verySlow = 0.00001; // matches Drone instance very slow default
  const mediumSlow = 0.0005; // medium-slow speed
  if (s === 0) return verySlow;
  if (Math.abs(s - verySlow) < 1e-12) return mediumSlow;
  return 0;
});

export function subscribeDroneSpeed(cb: (s: number) => void): Unsubscriber {
  if (typeof window === 'undefined') return () => {};
  return droneSpeed.subscribe(cb);
}
