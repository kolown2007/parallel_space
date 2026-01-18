<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import Ably from 'ably';
import { realtime, channel } from '$lib/stores/realtime';
import { burstAccelerate } from '$lib/stores/droneControl';

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
