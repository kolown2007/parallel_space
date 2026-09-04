export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return hasCoarsePointer || (navigator.maxTouchPoints ?? 0) > 0;
}

export function dispatchControlKey(key: string, isPressed: boolean) {
  if (typeof window === 'undefined') return;

  const event = typeof KeyboardEvent === 'function'
    ? new KeyboardEvent(isPressed ? 'keydown' : 'keyup', {
        key,
        bubbles: true,
        cancelable: true,
      })
    : ({
        type: isPressed ? 'keydown' : 'keyup',
        key,
        bubbles: true,
        cancelable: true,
      } as KeyboardEvent);

  window.dispatchEvent(event);
}

export function triggerTouchBurst() {
  dispatchControlKey('w', true);

  window.setTimeout(() => {
    dispatchControlKey('w', false);
  }, 120);
}

export function triggerTouchFire() {
  dispatchControlKey('l', true);

  window.setTimeout(() => {
    dispatchControlKey('l', false);
  }, 80);
}

export function setTouchStabilize(isPressed: boolean) {
  dispatchControlKey('s', isPressed);
}
