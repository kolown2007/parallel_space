import * as BABYLON from '@babylonjs/core';

export type KeysPressed = { [key: string]: boolean };

export function installKeyboardControls(params: {
    keysPressed: KeysPressed;
    onToggleWireframe: () => void;
    onReset: () => void;
    onSwitchCamera: () => void;
    onSpeedUp?: () => void;
    onSpeedDown?: () => void;
    onSpawn?: () => void;
    onPlaceModel?: () => void;
}) {
    const { keysPressed, onToggleWireframe, onReset, onSwitchCamera, onSpeedUp, onSpeedDown, onSpawn, onPlaceModel } = params;

    const keydown = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if (key === 'q') {
            onToggleWireframe();
        } else if (key === 'r') {
            onReset();
        } else if (['w', 'a', 's', 'd'].includes(key)) {
            keysPressed[key] = true;
        } else if (key === 'c') {
            onSwitchCamera();
        } else if (key === 'arrowup' && onSpeedUp) {
            onSpeedUp();
        } else if (key === 'arrowdown' && onSpeedDown) {
            onSpeedDown();
        } else if (key === 'p' && onSpawn) {
            onSpawn();
        } else if (key === 'f' && onPlaceModel) {
            onPlaceModel();
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

    // return uninstall function
    return () => {
        window.removeEventListener('keydown', keydown);
        window.removeEventListener('keyup', keyup);
    };
}
