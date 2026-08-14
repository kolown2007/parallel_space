import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';
import { installKeyboardControls } from './keyboardControls';
import { createDroneInputState, inputFromKeys } from './inputTypes';
import { burstAccelerate, droneControl, DEFAULT_SPEED } from '../stores/droneControl.svelte';

const installWindowStub = () => {
  const listeners = new Map<string, Set<(event: KeyboardEvent) => void>>();

  const win = {
    addEventListener: vi.fn((type: string, handler: (event: KeyboardEvent) => void) => {
      const bucket = listeners.get(type) ?? new Set();
      bucket.add(handler);
      listeners.set(type, bucket);
    }),
    removeEventListener: vi.fn((type: string, handler: (event: KeyboardEvent) => void) => {
      listeners.get(type)?.delete(handler);
    }),
    dispatchEvent: vi.fn((event: KeyboardEvent) => {
      for (const handler of listeners.get(event.type) ?? []) {
        handler(event);
      }
      return true;
    })
  } as any;

  Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true });
  return win;
};

describe('keyboard control mapping', () => {
  it('ignores W as a continuous throttle input', () => {
    const keysPressed = { w: true, a: false, s: false, d: false };
    const result = inputFromKeys(keysPressed, createDroneInputState());

    expect(result.throttle).toBe(0);
    expect(result.brake).toBe(0);
    expect(result.yaw).toBe(0);
  });

  it('uses W for burst and B for constant speed increase', () => {
    const burst = vi.fn();
    const speedUp = vi.fn();
    const keysPressed = { w: false, a: false, s: false, d: false };

    installWindowStub();

    const cleanup = installKeyboardControls({
      keysPressed,
      onBurst: burst,
      onSpeedUp: speedUp,
    });

    window.dispatchEvent({ type: 'keydown', key: 'w' } as KeyboardEvent);
    window.dispatchEvent({ type: 'keydown', key: 'b' } as KeyboardEvent);

    expect(burst).toHaveBeenCalledTimes(1);
    expect(speedUp).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('applies a 10-unit burst and restores the previous speed after 500ms', () => {
    vi.useFakeTimers();
    droneControl.set({ speed: DEFAULT_SPEED, lateralForce: 10, progress: 0 });

    burstAccelerate();
    expect(get(droneControl).speed).toBeCloseTo(DEFAULT_SPEED + 10 / 21600, 8);

    vi.advanceTimersByTime(500);
    expect(get(droneControl).speed).toBeCloseTo(DEFAULT_SPEED, 8);

    vi.useRealTimers();
  });
});
