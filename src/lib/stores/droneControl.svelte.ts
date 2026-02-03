
import { writable, derived } from 'svelte/store';

export interface DroneControlState {
  speed: number;        // progress per frame [0, 1]
  lateralForce: number; // Babylon physics impulse magnitude
  progress: number;     // normalized path position [0,1)
}

// Speed constants (path-point based at 360 points, 60fps)
export const PATH_POINTS_TOTAL = 360;                     // Total points in path
export const FPS = 60;                                     // Assumed frame rate
export const DEFAULT_SPEED = 2 / (FPS * PATH_POINTS_TOTAL); // 2 points/sec
export const DEFAULT_LATERAL_FORCE = 10;                   // Babylon impulse magnitude
export const MAX_SPEED = 20/ (FPS * PATH_POINTS_TOTAL); // 5 points/sec max
export const SPEED_INCREMENT = .5 / (FPS * PATH_POINTS_TOTAL); // 0.5 points/sec per adjustment
export const COLLISION_SPEED_PERCENT = 0.1;               // 20% speed reduction on hit

// Display conversion factor (internal to points/sec at 60fps × 360 points)
const DISPLAY_FACTOR = FPS * PATH_POINTS_TOTAL; // 21600

const initialState: DroneControlState = {
  speed: DEFAULT_SPEED,
  lateralForce: DEFAULT_LATERAL_FORCE,
  progress: 0
};

// Create reactive state using writable store (works everywhere, not just Svelte)
export const droneControl = writable<DroneControlState>({ ...initialState });

// Event stream for analytics, feedback, debugging
export const droneEvents = writable<{type: string; data?: any} | null>(null);

// Derived display speed for UI (points per second)
export const displaySpeed = derived(droneControl, $d => Math.round($d.speed * DISPLAY_FACTOR));

// Helper functions - use store update pattern
export function setDroneSpeed(speed: number) {
  // clamp to [0, MAX_SPEED]
  droneControl.update(d => ({ ...d, speed: Math.max(0, Math.min(MAX_SPEED, speed)) }));
}

export function adjustDroneSpeed(delta: number) {
  droneControl.update(d => ({
    ...d,
    speed: Math.max(0, Math.min(MAX_SPEED, d.speed + delta))
  }));
}

export function setLateralForce(force: number) {
  droneControl.update(d => ({ ...d, lateralForce: force }));
}

export function updateProgress(progress: number) {
  // Clamp to [0, 1] to prevent invalid path positions
  droneControl.update(d => ({ ...d, progress: Math.max(0, Math.min(1, progress)) }));
}

export function resetDrone() {
  droneControl.set({ ...initialState });
  droneEvents.set({ type: 'reset' });
}

let burstTimeout: any = null;
let burstOriginalSpeed: number | null = null;

/**
 * Burst accelerate: each call increases the base speed by +1 point/sec.
 * This converts the +1 display-point into internal units and clamps to MAX_SPEED.
 */
export function burstAccelerate() {
  const deltaInternal = 1 / DISPLAY_FACTOR; // 1 point/sec -> internal
  droneControl.update(d => {
    const newSpeed = Math.max(0, Math.min(MAX_SPEED, d.speed + deltaInternal));
    droneEvents.set({ type: 'burstAdd', data: { deltaInternal, newSpeed } });
    return { ...d, speed: newSpeed };
  });
}

/**
 * Cancel an active burst (keeps behavior simple since bursts are now permanent increments).
 */
export function cancelBurst() {
  if (burstTimeout !== null) {
    clearTimeout(burstTimeout);
    burstTimeout = null;
  }
  burstOriginalSpeed = null;
  droneEvents.set({ type: 'burstCancelled' });
}

/**
 * Complete cleanup - cancel timers and optionally reset state
 */
export function cleanupDroneControl(resetState = false) {
  cancelBurst();
  burstOriginalSpeed = null;
  if (resetState) {
    droneControl.set({ ...initialState });
  }
}

/**
 * Call when the drone collides/hits something.
 * Reduces speed by 20% (COLLISION_SPEED_PERCENT) by default.
 * Options:
 *  - percent: fractional reduction (0.2 = 20%)
 *  - amount: absolute speed decrement (overrides percent if provided)
 *  - minSpeed: minimum allowed speed after hit (default 0)
 */
export function hitCollision(opts: { percent?: number; amount?: number; minSpeed?: number } = {}) {
  const { percent = COLLISION_SPEED_PERCENT, amount, minSpeed = 0 } = opts;
  droneControl.update(d => {
    const speedBefore = d.speed;
    let newSpeed: number;
    if (typeof amount === 'number') {
      newSpeed = Math.max(minSpeed, d.speed - amount);
    } else {
      const factor = Math.max(0, 1 - percent);
      newSpeed = Math.max(minSpeed, d.speed * factor);
    }
    droneEvents.set({ type: 'collision', data: { speedBefore, speedAfter: newSpeed, reduction: percent } });
    return { ...d, speed: newSpeed };
  });
}

/**
 * Call when the drone enters a portal — set speed to zero.
 */
export function enterPortal() {
  droneControl.update(d => {
    droneEvents.set({ type: 'portal', data: { speedBefore: d.speed } });
    return { ...d, speed: 0 };
  });
}
