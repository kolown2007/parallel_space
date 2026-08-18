import * as BABYLON from '@babylonjs/core';
import type { KeyboardCallbacks } from './keyboardControls';

const TRIGGER_FIRE_THRESHOLD = 0.4;

export function installDualShockControls(scene: BABYLON.Scene, callbacks: KeyboardCallbacks) {
	const { keysPressed } = callbacks;
	const manager = new BABYLON.GamepadManager(scene);

	let leftTriggerActive = false;

	const onGamepadConnected = (gamepad: BABYLON.Gamepad) => {
		if (gamepad.type !== BABYLON.Gamepad.DUALSHOCK) {
			return;
		}

		const dualShock = gamepad as BABYLON.DualShockPad;

		dualShock.onbuttondown((button) => {
			if (button === BABYLON.DualShockButton.L1) {
				callbacks.onFire?.();
			}
		});

		dualShock.onlefttriggerchanged((value) => {
			const pressed = value >= TRIGGER_FIRE_THRESHOLD;
			if (!leftTriggerActive && pressed) {
				callbacks.onFire?.();
			}
			leftTriggerActive = pressed;
		});

		dualShock.ondpaddown((dpad) => {
			switch (dpad) {
				case BABYLON.DualShockDpad.Up:
					callbacks.onBurst?.();
					break;
				case BABYLON.DualShockDpad.Down:
					keysPressed.s = true;
					break;
				case BABYLON.DualShockDpad.Left:
					keysPressed.a = true;
					break;
				case BABYLON.DualShockDpad.Right:
					keysPressed.d = true;
					break;
			}
		});

		dualShock.ondpadup((dpad) => {
			switch (dpad) {
				case BABYLON.DualShockDpad.Down:
					keysPressed.s = false;
					break;
				case BABYLON.DualShockDpad.Left:
					keysPressed.a = false;
					break;
				case BABYLON.DualShockDpad.Right:
					keysPressed.d = false;
					break;
				case BABYLON.DualShockDpad.Up:
					break;
			}
		});
	};

	const connectedObserver = manager.onGamepadConnectedObservable.add(onGamepadConnected);

	return () => {
		manager.onGamepadConnectedObservable.remove(connectedObserver);
		manager.dispose();
	};
}
