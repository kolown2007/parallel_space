import { writable } from 'svelte/store';

export const sceneRefStore = writable<{
  sceneId: string | null;
  droneId: string | null;
}>({ sceneId: null, droneId: null });
