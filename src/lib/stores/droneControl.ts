import { writable } from 'svelte/store';

// Simple drone control state
export interface DroneControlState {
  speed: number;
  lateralForce: number;
  progress: number;
}

const initialState: DroneControlState = {
  speed: 0.000007,
  lateralForce: 8,
  progress: 0
};

// Create the store
export const droneControl = writable<DroneControlState>(initialState);

// Helper functions to update specific values
export function setDroneSpeed(speed: number) {
  droneControl.update(state => ({ ...state, speed: Math.max(0, speed) }));
}

export function adjustDroneSpeed(delta: number) {
  droneControl.update(state => ({ ...state, speed: Math.max(0, state.speed + delta) }));
}

export function setLateralForce(force: number) {
  droneControl.update(state => ({ ...state, lateralForce: force }));
}

export function updateProgress(progress: number) {
  droneControl.update(state => ({ ...state, progress }));
}

export function resetDrone() {
  droneControl.set(initialState);
}

/**
 * Quick burst acceleration - speeds up then returns to normal speed
 * @param boostMultiplier - How much faster (default 5x)
 * @param duration - How long the boost lasts in ms (default 500ms)
 */
export function burstAccelerate(boostMultiplier = 5, duration = 500) {
  let originalSpeed = 0;
  
  droneControl.update(state => {
    originalSpeed = state.speed;
    return { ...state, speed: state.speed * boostMultiplier };
  });
  
  setTimeout(() => {
    droneControl.update(state => ({ ...state, speed: originalSpeed }));
  }, duration);
}
