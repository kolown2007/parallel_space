/**
 * Centralized keyboard controller for the game
 * All keyboard input handling is consolidated here for maintainability
 * 
 * Key Mappings:
 * - W/A/S/D: Movement (continuous input via keysPressed state)
 * - Q: Toggle wireframe
 * - R: Reset drone position
 * - C: Switch camera
 * - Arrow Up: Increase speed
 * - Arrow Down: Decrease speed
 * - B: Burst acceleration (5x speed for 500ms)
 * - Space: Place cube obstacle ahead
 * - F: Place model
 * - P: Spawn obstacle
 */

export type KeysPressed = { [key: string]: boolean };

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
    // Portal obstacle
    onPlacePortal?: () => void;      // O - place portal obstacle
}

/**
 * Install keyboard controls with centralized handlers
 * Returns cleanup function to remove listeners
 */
export function installKeyboardControls(callbacks: KeyboardCallbacks) {
    const { keysPressed } = callbacks;

    const keydown = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        
        // Movement keys (continuous input)
        if (['w', 'a', 's', 'd'].includes(key)) {
            keysPressed[key] = true;
            return;
        }
        
        // Action keys (single press)
        switch (key) {
            case 'q':
                callbacks.onToggleWireframe?.();
                break;
            case 'r':
                callbacks.onReset?.();
                break;
            case 'c':
                callbacks.onSwitchCamera?.();
                break;
            case 'arrowup':
                callbacks.onSpeedUp?.();
                break;
            case 'arrowdown':
                callbacks.onSpeedDown?.();
                break;
            case 'b':
                callbacks.onBurst?.();
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
        }
    };

    const keyup = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if (['w', 'a', 's', 'd'].includes(key)) {
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
