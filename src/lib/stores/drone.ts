import { writable, get, type Unsubscriber } from 'svelte/store';

// Drone speed store: keep a small number (world units per tick basis used by Drone)
export const droneSpeed = writable<number>(0.01);

export const setDroneSpeed = (s: number) => droneSpeed.set(s);
export const getDroneSpeed = () => get(droneSpeed);
export const toggleDroneSpeed = () => droneSpeed.update(s => {
  // cycle typical values
  if (s <= 0.005) return 0.01;
  if (s <= 0.01) return 0.015;
  if (s <= 0.015) return 0.02;
  return 0.005;
});

export function subscribeDroneSpeed(cb: (s: number) => void): Unsubscriber {
  if (typeof window === 'undefined') return () => {};
  return droneSpeed.subscribe(cb);
}
