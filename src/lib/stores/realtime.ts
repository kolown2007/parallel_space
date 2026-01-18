import { writable } from 'svelte/store';
import type * as Ably from 'ably';
import type { RealtimeChannel } from '$lib/realtime/socket';

export const realtime = writable<Ably.Realtime | null>(null);
export const channel = writable<RealtimeChannel | null>(null);
