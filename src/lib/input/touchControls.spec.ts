import { describe, it, expect, vi } from 'vitest';
import { dispatchControlKey } from './touchControls';

describe('touch control dispatch', () => {
  it('dispatches the matching keydown and keyup events for touch actions', () => {
    const dispatchEvent = vi.fn();

    Object.defineProperty(globalThis, 'window', {
      value: { dispatchEvent },
      configurable: true,
      writable: true,
    });

    dispatchControlKey('w', true);
    dispatchControlKey('s', false);

    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    expect(dispatchEvent.mock.calls[0][0].type).toBe('keydown');
    expect(dispatchEvent.mock.calls[0][0].key).toBe('w');
    expect(dispatchEvent.mock.calls[1][0].type).toBe('keyup');
    expect(dispatchEvent.mock.calls[1][0].key).toBe('s');
  });
});
