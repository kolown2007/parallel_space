import { writable } from 'svelte/store';

export const completedStations = writable(0);
export const totalStations = writable(888);

export function setCompletedStations(count: number) {
  completedStations.set(count);
}

export function setTotalStations(count: number) {
  totalStations.set(count);
}
