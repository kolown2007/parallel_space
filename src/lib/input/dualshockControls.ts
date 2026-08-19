import * as BABYLON from '@babylonjs/core';
import type { KeyboardCallbacks } from './keyboardControls';

const TRIGGER_FIRE_THRESHOLD = 0.4;

export function triggerDualShockRumble(duration = 200, strongMagnitude = 0.5, weakMagnitude = 0.5) {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return;
  }

  const gamepads = navigator.getGamepads();
  if (!gamepads) return;

  for (const pad of gamepads) {
    if (!pad) continue;
    const actuator = (pad as any).vibrationActuator || (pad as any).hapticActuators?.[0];
    if (!actuator || typeof actuator.playEffect !== 'function') continue;

    try {
      actuator.playEffect('dual-rumble', {
        duration,
        strongMagnitude,
        weakMagnitude
      });
    } catch (e) {
      console.warn('DualShock rumble failed:', e);
    }
  }
}

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
