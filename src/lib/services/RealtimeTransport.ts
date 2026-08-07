import type { GameMode } from '$lib/stores/gameState';

export interface RealtimeTransportConfig {
	authUrl?: string;
	channelName?: string;
	getGameMode?: () => GameMode;
}

export interface RealtimeTransportMessage {
	name: string;
	data: any;
}

export interface RealtimeTransport {
	connect: () => Promise<void>;
	disconnect: () => void;
	send: (name: string, data: any) => void;
	subscribe: (name: string, handler: (msg: RealtimeTransportMessage) => void) => void;
	unsubscribe: (name: string) => void;
	isConnected: () => boolean;
}

export async function createAblyTransport(config: RealtimeTransportConfig): Promise<RealtimeTransport> {
	const { authUrl = 'https://kolown.net/api/ghost_auth', channelName = 'chronoescape' } = config;

	let client: any = null;
	let channel: any = null;
	let connected = false;
	const subscriptions = new Map<string, (msg: RealtimeTransportMessage) => void>();

	return {
		connect: async () => {
			const Ably = (await import('ably')).default;
			client = new Ably.Realtime({
				authCallback: async (_tokenParams: any, callback: any) => {
					try {
						const res = await fetch(authUrl, { credentials: 'include' });
						if (!res.ok) throw new Error('Auth failed: ' + res.status);
						const tokenRequest = await res.json();
						callback(null, tokenRequest);
					} catch (err: any) {
						console.error('Ably auth error:', err);
						callback(err);
					}
				},
				disconnectedRetryTimeout: 15000,
				suspendedRetryTimeout: 30000
			});

			client.connection.on('connected', () => { connected = true; console.log('✅ Ably connected to', channelName); });
			client.connection.on('disconnected', () => { connected = false; console.warn('⚠️ Ably disconnected'); });
			client.connection.on('suspended', () => { connected = false; console.warn('⏸️ Ably suspended'); });
			client.connection.on('failed', (err: any) => { connected = false; console.error('❌ Ably connection failed:', err); });

			channel = client.channels.get(channelName);
		},

		disconnect: () => {
			try { channel?.unsubscribe(); } catch (err) { console.warn('Channel unsubscribe error:', err); }
			try { client?.close(); } catch (err) { console.warn('Client close error:', err); }
			client = null;
			channel = null;
			connected = false;
			subscriptions.clear();
		},

		send: (name: string, data: any) => {
			if (!connected || !channel) return;
			try { channel.publish(name, data); } catch (err) { console.warn('Failed to publish', name, err); }
		},

		subscribe: (name: string, handler: (msg: RealtimeTransportMessage) => void) => {
			subscriptions.set(name, handler);
			channel?.subscribe(name, (msg: any) => {
				handler({ name: msg.name, data: msg.data });
			});
		},

		unsubscribe: (name: string) => {
			subscriptions.delete(name);
			try { channel?.unsubscribe(name); } catch (err) { console.warn('Channel unsubscribe error:', err); }
		},

		isConnected: () => connected
	};
}
