/**
 * Realtime Control Service
 * Manages Ably websocket connection and command execution for a specific scene
 */

import Ably from 'ably';
import { burstAccelerate, adjustDroneSpeed, SPEED_INCREMENT } from '$lib/stores/droneControl.svelte';
import { ObstacleManager } from '$lib/chronoescape/obstacle/ObstacleManager';
import { WormHoleScene2 } from '$lib/scenes/wormhole2';
import type * as BABYLON from '@babylonjs/core';
import { randomFrom } from '$lib/assetsConfig';

export interface RealtimeControlConfig {
	scene: BABYLON.Scene;
	droneMesh: BABYLON.AbstractMesh;
	authUrl?: string;
	channelName?: string;
	onPortalTrigger?: () => void;
	setPortal?: (portal: any, remove?: boolean) => void;
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
		channelName = 'chronoescape',
		onPortalTrigger,
		setPortal
	} = config;

	let client: Ably.Realtime | null = null;
	let channel: any = null;
	let connected = false;

	// Shared obstacle manager — created once, reused for all commands
	const realtimeModelCache = new Map<string, any>();
	const realtimeCleanupRegistry: Array<() => void> = [];
	const obstacles = new ObstacleManager(scene, WormHoleScene2.pathPoints, realtimeModelCache, realtimeCleanupRegistry);

	function getNearestPathIndex(): number {
		const pathPoints = WormHoleScene2.pathPoints;
		if (!pathPoints?.length) return 0;
		const dronePos = (droneMesh as any).position ?? droneMesh.getAbsolutePosition?.();
		let minDistSq = Number.POSITIVE_INFINITY;
		let nearest = 0;
		for (let i = 0; i < pathPoints.length; i++) {
			const d = pathPoints[i].subtract(dronePos).lengthSquared();
			if (d < minDistSq) { minDistSq = d; nearest = i; }
		}
		return nearest;
	}

	// Safe command execution with scene validation
	async function executeCommand(action: string, _data?: any) {
		if (scene.isDisposed) return;
		try {
			const pathPoints = WormHoleScene2.pathPoints;

			switch (action) {
				case 'move':
					burstAccelerate();
					break;

				case 'obstruct': {
					if (!pathPoints?.length) { console.warn('No pathPoints for obstruct'); break; }
					const targetIdx = ((getNearestPathIndex() + 10) % pathPoints.length + pathPoints.length) % pathPoints.length;
					await obstacles.place('cube', {
						index: targetIdx,
						size: 5.5, physics: true, thrustMs: 3000, thrustSpeed: -30, autoDisposeMs: 60000,
						faceUVTextureId: randomFrom('metal', 'cube3', 'cube4', 'cube5', 'collage1', 'cube6'),
						faceUVLayout: 'grid'
					});
					break;
				}

				case 'portal': {
					if (!pathPoints?.length) { console.warn('No pathPoints for portal'); break; }
					const targetIdx = ((getNearestPathIndex() + 10) % pathPoints.length + pathPoints.length) % pathPoints.length;
					const portal = await obstacles.place('portal', {
						index: targetIdx,
						posterTextureId: randomFrom('portal1', 'portal2'),
						width: 20, height: 20, offsetY: 0,
						onTrigger: () => { try { onPortalTrigger?.(); } catch {} }
					}) as any;
					if (setPortal && portal) setPortal(portal);
					break;
				}

				case 'speedup':
					adjustDroneSpeed(SPEED_INCREMENT);
					break;

				case 'speeddown':
					adjustDroneSpeed(-SPEED_INCREMENT);
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
			try { channel?.unsubscribe(); } catch (e) { console.warn('Channel unsubscribe error:', e); }
			try { client?.close(); } catch (e) { console.warn('Client close error:', e); }
			for (const fn of realtimeCleanupRegistry) { try { fn(); } catch {} }
			realtimeCleanupRegistry.length = 0;
			client = null;
			channel = null;
			connected = false;
		}
	};
}
