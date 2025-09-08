import { writable } from 'svelte/store';
export type MaterialMode = 'shader' | 'standard' | 'pbr';
export const materialMode = writable<MaterialMode>('shader');

export function subscribeMaterialMode(cb: (m: MaterialMode) => void) {
  return materialMode.subscribe(cb);
}

export function setMaterialMode(m: MaterialMode) {
  materialMode.set(m);
}
