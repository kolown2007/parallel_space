import { writable } from 'svelte/store';

export const stationNames = [
  'Fernando Poe Jr.',
  'Balintawak',
  'Monumento',
  '5th Avenue',
  'R. Papa',
  'Abad Santos',
  'Blumentritt',
  'Tayuman',
  'Bambang',
  'Doroteo Jose',
  'Carriedo',
  'Central Terminal',
  'United Nations',
  'Pedro Gil',
  'Quirino',
  'Vito Cruz',
  'Gil Puyat',
  'Libertad',
  'EDSA',
  'Baclaran',
  'Redemptorist-Aseana',
  'MIA Road',
  'PITX',
  'Ninoy Aquino Avenue',
  'Dr. Santos',
  'Recto',
  'Legarda',
  'Pureza',
  'V. Mapa',
  'J. Ruiz',
  'Gilmore',
  'Betty Go-Belmonte',
  'Araneta Center-Cubao',
  'Anonas',
  'Katipunan',
  'Santolan',
  'Marikina-Pasig',
  'Antipolo',
  'North Avenue',
  'Quezon Avenue',
  'GMA-Kamuning',
  'Santolan-Annapolis',
  'Ortigas',
  'Shaw Boulevard',
  'Boni',
  'Guadalupe',
  'Buendia',
  'Ayala',
  'Magallanes',
  'Taft Avenue'
] as const;

export const completedStations = writable(0);
export const totalStations = writable(888);
export const stationName = writable('RECTO');

export function pickRandomStationName(): string {
  const name = stationNames[Math.floor(Math.random() * stationNames.length)] ?? 'Recto';
  return name.toUpperCase();
}

export function setStationName(name: string) {
  stationName.set((name || 'RECTO').toUpperCase());
}

export function resetStationName() {
  setStationName(pickRandomStationName());
}

export function setCompletedStations(count: number) {
  completedStations.set(count);
}

export function setTotalStations(count: number) {
  totalStations.set(count);
}
