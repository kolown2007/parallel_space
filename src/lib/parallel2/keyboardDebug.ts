import * as BABYLON from '@babylonjs/core';

export interface KeyboardDebugOptions {
  toggleInspector?: () => void;
  toggleExit?: () => void;
  toggleDebugCamera?: () => void;
  toggleFlightCamera?: () => void;
  clearScene?: () => void;
  spawnTransient?: () => void;
  toggleHud?: () => void;
}

export function installKeyboardDebug(opts: KeyboardDebugOptions) {
  const handler = (ev: KeyboardEvent) => {
    try {
      const k = ev.key;
      if (k === 'i') {
        opts.toggleInspector?.();
      } else if (k === 'h') {
        opts.toggleHud?.();
      } else if (k === 'o') {
        opts.toggleExit?.();
      } else if (k === 'v') {
        opts.toggleDebugCamera?.();
      } else if (k === 'g') {
        // 'g' used for flight camera toggle to avoid colliding with engine 'f' FPS toggle
        opts.toggleFlightCamera?.();
      } else if (k === 'x') {
        opts.clearScene?.();
      } else if (k === 'b') {
        opts.spawnTransient?.();
      }
    } catch (e) {
      // swallow errors from user callbacks
      // eslint-disable-next-line no-console
      console.warn('keyboardDebug handler error', e);
    }
  };

  window.addEventListener('keydown', handler);

  return {
    dispose: () => window.removeEventListener('keydown', handler)
  };
}
