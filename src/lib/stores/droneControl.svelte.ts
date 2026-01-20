// Svelte 5 runes-based drone control state

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

// Create reactive state using $state rune
export const droneControl = $state<DroneControlState>({ ...initialState });

// Helper functions - now use direct property mutations
export function setDroneSpeed(speed: number) {
  droneControl.speed = Math.max(0, speed);
}

export function adjustDroneSpeed(delta: number) {
  droneControl.speed = Math.max(0, droneControl.speed + delta);
}

export function setLateralForce(force: number) {
  droneControl.lateralForce = force;
}

export function updateProgress(progress: number) {
  droneControl.progress = progress;
}

export function resetDrone() {
  droneControl.speed = initialState.speed;
  droneControl.lateralForce = initialState.lateralForce;
  droneControl.progress = initialState.progress;
}

/**
 * Quick burst acceleration - speeds up then returns to normal speed
 * @param boostMultiplier - How much faster (default 5x)
 * @param duration - How long the boost lasts in ms (default 500ms)
 */
export function burstAccelerate(boostMultiplier = 5, duration = 500) {
  const originalSpeed = droneControl.speed;
  droneControl.speed = originalSpeed * boostMultiplier;
  
  setTimeout(() => {
    droneControl.speed = originalSpeed;
  }, duration);
}
