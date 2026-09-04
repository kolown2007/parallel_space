import type { KeysPressed } from './inputTypes';

/**
 * Centralized keyboard controller for the game
 * All keyboard input handling is consolidated here for maintainability
 * 
 * Key Mappings:
 * - A/S/D: Held movement inputs
 * - W: One-shot burst and stop (burst acceleration)
 * - Q: Toggle wireframe
 * - R: Reset drone position
 * - C: Switch camera
 * - Arrow Keys: Mirror W/A/S/D movement behavior
 * - B: Constant speed addition
 * - Space: Place cube obstacle ahead
 * - F: Place model
 * - P: Spawn obstacle
 */

export interface KeyboardCallbacks {
    // Movement keys (W/A/S/D) - handled via keysPressed state
    keysPressed: KeysPressed;
    
    // Toggle/UI actions
    onToggleWireframe?: () => void;  // Q
    onSwitchCamera?: () => void;     // C
    
    // Drone control
    onReset?: () => void;            // R
    onSpeedUp?: () => void;          // B / optional speed controls
    onSpeedDown?: () => void;        // optional speed controls
    onBurst?: () => void;            // B - burst acceleration
    
    // Obstacle placement
    onPlaceCube?: () => void;        // Space - place cube ahead
    onPlaceModel?: () => void;       // F - place model
    onSpawn?: () => void;            // P - spawn obstacle
    onFire?: () => void;             // L - fire projectile from drone
    // Portal obstacle
    onPlacePortal?: () => void;      // O - place portal obstacle
}

/**
 * Install keyboard controls with centralized handlers
 * Returns cleanup function to remove listeners
 */
export function triggerMomentaryBurst(
    keysPressed: KeysPressed,
    onBurst?: () => void,
    durationMs = 120
) {
    if (!keysPressed.w) {
        keysPressed.w = true;
    }
    onBurst?.();

    if (typeof window !== 'undefined') {
        const release = () => {
            keysPressed.w = false;
        };
        if ((release as any).__burstTimer) {
            clearTimeout((release as any).__burstTimer);
        }
        (release as any).__burstTimer = setTimeout(release, durationMs);
    }
}

export function installKeyboardControls(callbacks: KeyboardCallbacks) {
    const { keysPressed } = callbacks;
    const isProd = import.meta.env.PROD;

    const keydown = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();

        if (key === 'w' || key === 'arrowup') {
            keysPressed.w = true;
            if (!event.repeat) {
                callbacks.onBurst?.();
            }
            return;
        }

        // Held movement keys
        if (key === 'a' || key === 'arrowleft') {
            keysPressed.a = true;
            return;
        }

        if (key === 'd' || key === 'arrowright') {
            keysPressed.d = true;
            return;
        }

        if (key === 's' || key === 'arrowdown') {
            keysPressed.s = true;
            return;
        }

        // Action keys (single press)
        switch (key) {
            case 'q':
                if (!isProd) callbacks.onToggleWireframe?.();
                break;
            case 'r':
                callbacks.onReset?.();
                break;
            case 'c':
                if (!isProd) callbacks.onSwitchCamera?.();
                break;
            case 'b':
                callbacks.onSpeedUp?.();
                break;
            case 'o':
                callbacks.onPlacePortal?.();
                break;
            case ' ':
                event.preventDefault(); // prevent page scroll
                callbacks.onPlaceCube?.();
                break;
            case 'f':
                callbacks.onPlaceModel?.();
                break;
            case 'p':
                callbacks.onSpawn?.();
                break;
            case 'l':
                callbacks.onFire?.();
                break;
        }
    };

    const keyup = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if (key === 'w' || key === 'arrowup') {
            keysPressed.w = false;
            return;
        }

        if (key === 'a' || key === 'arrowleft') {
            keysPressed.a = false;
            return;
        }

        if (key === 'd' || key === 'arrowright') {
            keysPressed.d = false;
            return;
        }

        if (key === 's' || key === 'arrowdown') {
            keysPressed.s = false;
        }
    };

    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);

    // Return uninstall function
    return () => {
        window.removeEventListener('keydown', keydown);
        window.removeEventListener('keyup', keyup);
    };
}
