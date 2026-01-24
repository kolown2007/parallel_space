/**
 * Realtime Control Service
 * Manages Ably websocket connection and command execution for a specific scene
 */

import Ably from 'ably';
import { burstAccelerate, adjustDroneSpeed } from '$lib/stores/droneControl.svelte';
import { ObstacleManager } from '$lib/chronoescape/obstacle/ObstacleManager';
import type * as BABYLON from '@babylonjs/core';

export interface RealtimeControlConfig {
	scene: BABYLON.Scene;
	droneMesh: BABYLON.AbstractMesh;
	authUrl?: string;
	channelName?: string;
}

export interface RealtimeConnection {
	isConnected: () => boolean;
	disconnect: () => void;
}

/**
 * Initialize realtime control for a scene
 * Returns cleanup function to disconnect
 */
export async function initRealtimeControl(config: RealtimeControlConfig): Promise<RealtimeConnection> {
	const {
		scene,
		droneMesh,
		authUrl = 'https://kolown.net/api/ghost_auth',
		channelName = 'chronoescape'
	} = config;

	let client: Ably.Realtime | null = null;
	let channel: any = null;
	let connected = false;

	// Safe command execution with scene validation
	function executeCommand(action: string, data?: any) {
		try {
			// Validate scene not disposed
			if (scene.isDisposed) {
				console.warn('Scene disposed, ignoring command:', action);
				return;
			}

			switch (action) {
				case 'move':
					burstAccelerate(5, 1000);
					console.log('🚀 Burst acceleration via Ably');
					break;

				case 'obstruct':
					if (droneMesh && !scene.isDisposed) {
						ObstacleManager.cubeInFrontOfDrone(scene, droneMesh, {
							distance: 10,
							size: 6,
							thrustMs: 2000,
							thrustSpeed: 30,
							autoDisposeMs: 60000,
							textureId: 'metal'
						});
						console.log('📦 Placed obstacle via Ably');
					}
					break;

				case 'speedup':
					adjustDroneSpeed(0.00002);
					console.log('⬆️ Speed increased via Ably');
					break;

				case 'speeddown':
					adjustDroneSpeed(-0.00002);
					console.log('⬇️ Speed decreased via Ably');
					break;

				default:
					console.warn('Unknown action:', action);
			}
		} catch (err) {
			console.error('Command execution error:', action, err);
		}
	}

	try {
		// Initialize Ably client
		client = new Ably.Realtime({
			authCallback: async (tokenParams: any, callback: any) => {
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
			// Auto-reconnection settings
			disconnectedRetryTimeout: 15000,
			suspendedRetryTimeout: 30000
		});

		// Connection state listeners
		client.connection.on('connected', () => {
			connected = true;
			console.log('✅ Ably connected to', channelName);
		});

		client.connection.on('disconnected', () => {
			connected = false;
			console.warn('⚠️ Ably disconnected - auto-retry enabled');
		});

		client.connection.on('suspended', () => {
			connected = false;
			console.warn('⏸️ Ably suspended - auto-retry enabled');
		});

		client.connection.on('failed', (err: any) => {
			connected = false;
			console.error('❌ Ably connection failed:', err);
		});

		// Subscribe to channel
		channel = client.channels.get(channelName);
		channel.subscribe((msg: any) => {
			try {
				console.log('📨 Ably message:', msg.name, msg.data);
				if (msg.name === 'action') {
					executeCommand(msg.data, msg);
				}
			} catch (err) {
				console.error('Message handler error:', err);
			}
		});

		console.log('🔌 Realtime control initialized for', channelName);
	} catch (err) {
		console.error('Failed to initialize realtime control:', err);
		throw err;
	}

	// Return connection interface
	return {
		isConnected: () => connected,
		disconnect: () => {
			if (channel) {
				try {
					channel.unsubscribe();
					console.log('Unsubscribed from', channelName);
				} catch (e) {
					console.warn('Channel unsubscribe error:', e);
				}
			}

			if (client) {
				try {
					client.close();
					console.log('Ably client closed');
				} catch (e) {
					console.warn('Client close error:', e);
				}
			}

			client = null;
			channel = null;
			connected = false;
		}
	};
}
