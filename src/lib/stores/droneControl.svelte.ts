// Drone control state using Svelte stores for universal reactivity
// Units:
//   speed: progress-fraction per frame (0.00007 ≈ 0.7 display units, completes ~14285 frames per loop)
//   lateralForce: Babylon.js physics impulse magnitude (arbitrary units)
//   progress: normalized path position [0,1) where 0=start, 1 wraps to 0

import { writable, derived } from 'svelte/store';

export interface DroneControlState {
  speed: number;        // progress-fraction per frame
  lateralForce: number; // Babylon physics impulse magnitude
  progress: number;     // normalized path position [0,1)
}

// Tunable constants
export const DEFAULT_SPEED = 0.00007;           // progress per frame
export const DEFAULT_LATERAL_FORCE = 0.2;          // Babylon impulse magnitude
export const MAX_DISPLAY_SPEED = 2;              // max speed in human-friendly units
export const MAX_PROGRESS_SPEED = MAX_DISPLAY_SPEED / 10000; // internal speed cap
export const COLLISION_SPEED_REDUCTION = 0.01;    // 10% speed loss per hit (configurable)

const initialState: DroneControlState = {
  speed: DEFAULT_SPEED,
  lateralForce: DEFAULT_LATERAL_FORCE,
  progress: 0
};

// Create reactive state using writable store (works everywhere, not just Svelte)
export const droneControl = writable<DroneControlState>({ ...initialState });

// Event stream for analytics, feedback, debugging
export const droneEvents = writable<{type: string; data?: any} | null>(null);

// Derived display speed for UI (human-friendly units)
export const displaySpeed = derived(droneControl, $d => $d.speed * 10000);

// Helper functions - use store update pattern
export function setDroneSpeed(speed: number) {
  // clamp to [0, MAX_PROGRESS_SPEED]
  droneControl.update(d => ({ ...d, speed: Math.max(0, Math.min(MAX_PROGRESS_SPEED, speed)) }));
}

export function adjustDroneSpeed(delta: number) {
  droneControl.update(d => ({
    ...d,
    speed: Math.max(0, Math.min(MAX_PROGRESS_SPEED, d.speed + delta))
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

/**
 * Quick burst acceleration - speeds up then returns to normal speed
 * @param boostMultiplier - How much faster (default 5x)
 * @param duration - How long the boost lasts in ms (default 500ms)
 */
export function burstAccelerate(boostMultiplier = 5, duration = 500) {
  // Cancel any previous burst
  clearTimeout(burstTimeout);
  
  let originalSpeed: number;
  droneControl.update(d => {
    originalSpeed = d.speed;
    const boosted = Math.min(MAX_PROGRESS_SPEED, originalSpeed * boostMultiplier);
    droneEvents.set({ type: 'burstStart', data: { boost: boostMultiplier, duration } });
    return { ...d, speed: boosted };
  });

  burstTimeout = setTimeout(() => {
    droneControl.update(d => ({ ...d, speed: originalSpeed }));
    droneEvents.set({ type: 'burstEnd' });
    burstTimeout = null;
  }, duration);
}

/**
 * Cancel an active burst acceleration
 */
export function cancelBurst() {
  if (burstTimeout !== null) {
    clearTimeout(burstTimeout);
    burstTimeout = null;
    droneEvents.set({ type: 'burstCancelled' });
  }
}

/**
 * Complete cleanup - cancel timers and optionally reset state
 */
export function cleanupDroneControl(resetState = false) {
  cancelBurst();
  if (resetState) {
    droneControl.set({ ...initialState });
  }
}

/**
 * Call when the drone collides/hits something.
 * Defaults to reduce speed by 10% (COLLISION_SPEED_REDUCTION) if amount is not provided.
 * Options:
 *  - percent: fractional reduction (0.1 = 10%)
 *  - amount: absolute speed decrement (overrides percent if provided)
 *  - minSpeed: minimum allowed speed after hit (default 0)
 */
export function hitCollision(opts: { percent?: number; amount?: number; minSpeed?: number } = {}) {
  const { percent = COLLISION_SPEED_REDUCTION, amount, minSpeed = 0 } = opts;
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
