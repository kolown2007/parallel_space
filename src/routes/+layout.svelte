<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import Ably from 'ably';
import { realtime, channel } from '$lib/stores/realtime';
import { burstAccelerate } from '$lib/stores/droneControl.svelte.js';
import { sceneRefStore } from '$lib/stores/sceneRefStore';
import { getScene, getDroneMesh } from '$lib/core/SceneRegistry';
import { ObstacleManager } from '$lib/chronoescape/obstacle/ObstacleManager';


let client: any = null;
let connected = false;

async function connectAbly() {
	try {
		client = new Ably.Realtime({
			authCallback: async (tokenParams: any, callback: any) => {
				try {
					const res = await fetch('https://kolown.net/api/ghost_auth', { credentials: 'include' });
					if (!res.ok) throw new Error('token request failed: ' + res.status);
					const tokenRequest = await res.json();
					callback(null, tokenRequest);
				} catch (err: any) {
					callback(err);
				}
			}
		});

		client.connection.on('connected', () => {
			connected = true;
			console.log('chronoescape connected');
		});

		const ch = client.channels.get('chronoescape');
		
		ch.subscribe((msg: any) => {
			console.log('chronoescape message:', msg.name, msg.data);
			if (msg.name === 'action' && msg.data === 'move') {
				burstAccelerate(5,1000);
			}

			if (msg.name === 'action' && msg.data === 'obstruct') {
				const { sceneId, droneId } = $sceneRefStore;
				const scene = sceneId ? getScene(sceneId) : null;
				const droneMesh = droneId ? getDroneMesh(droneId) : null;
				if (scene && droneMesh) {
					ObstacleManager.cubeInFrontOfDrone(scene, droneMesh, { 
						distance: 10, 
						size: 6,
						thrustMs: 2000,
						thrustSpeed: 5
					});
					console.log('📦 Placed obstacle cube in front of drone');
				} else {
					console.warn('Cannot place cube: scene or drone not available');
				}
			}

			// if (msg.name === 'action' && msg.data === 'move') {
			// 	  placeCube();
			// }

		});
		
		realtime.set(client);
		channel.set(ch);
	} catch (e: any) {
		console.error('connection error:', e.message);
	}
}

onMount(() => {
	connectAbly();
});

onDestroy(() => {
	realtime.set(null);
	channel.set(null);
	if (client) {
		try { client.close(); } catch (e) {}
	}
});
</script>

<slot />
