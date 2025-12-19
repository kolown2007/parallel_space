import * as BABYLON from '@babylonjs/core';

export type KeysPressed = { [key: string]: boolean };

export function installKeyboardControls(params: {
    keysPressed: KeysPressed;
    onToggleWireframe: () => void;
    onReset: () => void;
    onSwitchCamera: () => void;
}) {
    const { keysPressed, onToggleWireframe, onReset, onSwitchCamera } = params;

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
