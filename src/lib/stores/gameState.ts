import { writable, derived } from 'svelte/store';

export type GameMode = 'loading' | 'intro' | 'wormhole' | 'ocean' | 'video';

const _gameMode = writable<GameMode>('loading');

export const gameMode = {
	subscribe: _gameMode.subscribe,
	set: (mode: GameMode) => _gameMode.set(mode)
};

export const isWormhole = derived(_gameMode, ($m) => $m === 'wormhole');
export const isOcean    = derived(_gameMode, ($m) => $m === 'ocean');
