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
	let rightTriggerActive = false;
	let lastStickBurst = false;
	let dpadA = false;
	let dpadD = false;
	let dpadS = false;
	let stickObserver: BABYLON.Observer<BABYLON.Scene> | null = null;

	const updateSticks = (gamepad: BABYLON.Gamepad) => {
		if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
			return;
		}

		const rawPads = navigator.getGamepads();
		const raw = rawPads?.[gamepad.index] || null;
		if (!raw || !raw.axes) {
			const burstPressed = dpadS === false && false;
			keysPressed.a = dpadA;
			keysPressed.d = dpadD;
			keysPressed.s = dpadS;
			lastStickBurst = burstPressed;
			return;
		}

		const threshold = 0.35;
		const leftX = raw.axes[0] ?? 0;
		const leftY = raw.axes[1] ?? 0;
		const rightX = raw.axes[2] ?? 0;
		const rightY = raw.axes[3] ?? 0;

		const leftA = leftX <= -threshold;
		const leftD = leftX >= threshold;
		const leftS = leftY >= threshold;
		const leftBurst = leftY <= -threshold;

		const rightA = rightX <= -threshold;
		const rightD = rightX >= threshold;
		const rightS = rightY >= threshold;
		const rightBurst = rightY <= -threshold;

		const newA = leftA || rightA || dpadA;
		const newD = leftD || rightD || dpadD;
		const newS = leftS || rightS || dpadS;
		const burstPressed = leftBurst || rightBurst;

		keysPressed.a = newA;
		keysPressed.d = newD;
		keysPressed.s = newS;

		if (burstPressed && !lastStickBurst) {
			callbacks.onBurst?.();
		}
		lastStickBurst = burstPressed;
	};

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

		dualShock.onrighttriggerchanged((value) => {
			const pressed = value >= TRIGGER_FIRE_THRESHOLD;
			if (!rightTriggerActive && pressed) {
				callbacks.onFire?.();
			}
			rightTriggerActive = pressed;
		});

		stickObserver = scene.onBeforeRenderObservable.add(() => updateSticks(gamepad));

		dualShock.ondpaddown((dpad) => {
			switch (dpad) {
				case BABYLON.DualShockDpad.Up:
					callbacks.onBurst?.();
					break;
				case BABYLON.DualShockDpad.Down:
					keysPressed.s = true;
					dpadS = true;
					break;
				case BABYLON.DualShockDpad.Left:
					keysPressed.a = true;
					dpadA = true;
					break;
				case BABYLON.DualShockDpad.Right:
					keysPressed.d = true;
					dpadD = true;
					break;
			}
		});

		dualShock.ondpadup((dpad) => {
			switch (dpad) {
				case BABYLON.DualShockDpad.Down:
					keysPressed.s = false;
					dpadS = false;
					break;
				case BABYLON.DualShockDpad.Left:
					keysPressed.a = false;
					dpadA = false;
					break;
				case BABYLON.DualShockDpad.Right:
					keysPressed.d = false;
					dpadD = false;
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
