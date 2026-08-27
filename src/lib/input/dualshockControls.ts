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
	let dpadW = false;
	let stickGamepadA = false;
	let stickGamepadD = false;
	let stickGamepadS = false;
	let stickGamepadW = false;
	let stickObserver: BABYLON.Observer<BABYLON.Scene> | null = null;

	const updateSticks = (gamepad: BABYLON.Gamepad) => {
		if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
			return;
		}

		const rawPads = navigator.getGamepads();
		const raw = rawPads?.[gamepad.index] || null;
		if (!raw || !raw.axes) {
			// only assert gamepad keys; don't clear keyboard state
			if (dpadA) keysPressed.a = true;
			if (dpadD) keysPressed.d = true;
			if (dpadS) keysPressed.s = true;
			if (dpadW) keysPressed.w = true;
			if (stickGamepadA && !dpadA) keysPressed.a = false;
			if (stickGamepadD && !dpadD) keysPressed.d = false;
			if (stickGamepadS && !dpadS) keysPressed.s = false;
			if (stickGamepadW && !dpadW) keysPressed.w = false;
			stickGamepadA = false;
			stickGamepadD = false;
			stickGamepadS = false;
			stickGamepadW = false;
			lastStickBurst = false;
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
		const leftW = leftY <= -threshold;
		const rightA = rightX <= -threshold;
		const rightD = rightX >= threshold;
		const rightS = rightY >= threshold;
		const rightW = rightY <= -threshold;

		const newA = leftA || rightA || dpadA;
		const newD = leftD || rightD || dpadD;
		const newS = leftS || rightS || dpadS;
		const newW = leftW || rightW || dpadW;

		// stick-only contribution has no release event, so undo last frame's
		// value before recombining, otherwise it latches true forever once pressed
		if (stickGamepadA && !newA) keysPressed.a = false;
		if (stickGamepadD && !newD) keysPressed.d = false;
		if (stickGamepadS && !newS) keysPressed.s = false;
		if (stickGamepadW && !newW) keysPressed.w = false;

		keysPressed.a = keysPressed.a || newA;
		keysPressed.d = keysPressed.d || newD;
		keysPressed.s = keysPressed.s || newS;
		keysPressed.w = keysPressed.w || newW;

		stickGamepadA = newA;
		stickGamepadD = newD;
		stickGamepadS = newS;
		stickGamepadW = newW;

		const stickBurstPressed = leftW || rightW;
		if (stickBurstPressed && !lastStickBurst) {
			callbacks.onBurst?.();
		}
		lastStickBurst = stickBurstPressed;
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
					dpadW = true;
					keysPressed.w = true;
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
					dpadW = false;
					keysPressed.w = false;
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
