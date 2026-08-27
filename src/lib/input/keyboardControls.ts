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
 * - Arrow Up: Increase speed
 * - Arrow Down: Decrease speed
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
    onSpeedUp?: () => void;          // Arrow Up
    onSpeedDown?: () => void;        // Arrow Down
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
export function installKeyboardControls(callbacks: KeyboardCallbacks) {
    const { keysPressed } = callbacks;
    const isProd = import.meta.env.PROD;

    const keydown = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();

        if (key === 'w') {
            keysPressed.w = true;
            if (!event.repeat) {
                callbacks.onBurst?.();
            }
            return;
        }

        // Held movement keys
        if (['a', 's', 'd'].includes(key)) {
            keysPressed[key] = true;
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
            case 'arrowup':
                callbacks.onSpeedUp?.();
                break;
            case 'arrowdown':
                callbacks.onSpeedDown?.();
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
        if (['a', 's', 'd', 'w'].includes(key)) {
            keysPressed[key] = false;
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
