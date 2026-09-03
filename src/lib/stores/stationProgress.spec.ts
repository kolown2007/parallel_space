import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { pickRandomStationName, setStationName, stationName } from './stationProgress';

describe('station progress store', () => {
  it('stores a selected station name in uppercase', () => {
    setStationName('Recto');
    expect(get(stationName)).toBe('RECTO');
  });

  it('returns a valid station name from the route list', () => {
    const picked = pickRandomStationName();
    expect(picked.length).toBeGreaterThan(0);
    expect(picked).toBe(picked.toUpperCase());
  });
});
