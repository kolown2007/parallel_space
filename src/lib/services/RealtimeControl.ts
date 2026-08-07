/**
 * Realtime Control Service
 * Manages websocket command execution for a specific scene
 */

import { createAblyTransport, type RealtimeTransport } from './RealtimeTransport';
import type { GameMode } from '$lib/stores/gameState';

export type RealtimeCommand =
	| { type: 'move' }
	| { type: 'obstruct'; targetIdx?: number }
	| { type: 'portal'; targetIdx?: number }
	| { type: 'speedup' }
	| { type: 'speeddown' }
	| { type: 'next_mission' };

export interface RealtimeControlConfig {
	authUrl?: string;
	channelName?: string;
	getGameMode?: () => GameMode;
	onMove?: () => void;
	onSpeedUp?: () => void;
	onSpeedDown?: () => void;
	onObstruct?: (payload: { targetIdx?: number }) => Promise<any>;
	onPortal?: (payload: { targetIdx?: number }) => Promise<any>;
	onNextMission?: () => void;
	setPortal?: (portal: any, remove?: boolean) => void;
	isSceneAlive?: () => boolean;
}

export interface RealtimeConnection {
isConnected: () => boolean;
disconnect: () => void;
}

export async function initRealtimeControl(config: RealtimeControlConfig): Promise<RealtimeConnection> {
const {
authUrl = 'https://kolown.net/api/ghost_auth',
channelName = 'chronoescape',
getGameMode,
onMove,
onSpeedUp,
onSpeedDown,
onObstruct,
onPortal,
onNextMission,
setPortal,
isSceneAlive
} = config;

let transport: RealtimeTransport | null = null;
let connected = false;
const cleanupFns: Array<() => void> = [];

const publishState = () => {
if (!connected || !transport) return;
const mode = getGameMode ? getGameMode() : ('loading' as GameMode);
const statePayload = {
gameMode: mode,
nextMissionEnabled: mode === 'ocean',
timestamp: Date.now()
};
try {
transport.send('state', statePayload);
} catch (err) {
console.warn('Failed to publish game state:', err);
}
};

function parseRealtimeCommand(data: any): RealtimeCommand | null {
	if (!data || typeof data !== 'object') return null;
	const type = data.type;
	if (type === 'move') return { type: 'move' };
	if (type === 'obstruct') {
		return {
			type: 'obstruct',
			targetIdx: typeof data.targetIdx === 'number' ? data.targetIdx : undefined
		};
	}
	if (type === 'portal') {
		return {
			type: 'portal',
			targetIdx: typeof data.targetIdx === 'number' ? data.targetIdx : undefined
		};
	}
	if (type === 'speedup') return { type: 'speedup' };
	if (type === 'speeddown') return { type: 'speeddown' };
	if (type === 'next_mission') return { type: 'next_mission' };
	return null;
}

async function executeCommand(command: RealtimeCommand) {
	if (isSceneAlive && !isSceneAlive()) return;
	try {
		switch (command.type) {
			case 'move':
				onMove?.();
				break;

			case 'obstruct':
				await onObstruct?.({ targetIdx: command.targetIdx });
				break;

			case 'portal': {
				const portalResult = await onPortal?.({ targetIdx: command.targetIdx });
				if (setPortal && portalResult) setPortal(portalResult);
				break;
			}

			case 'speedup':
				onSpeedUp?.();
				break;

			case 'speeddown':
				onSpeedDown?.();
				break;

			case 'next_mission': {
				const mode = getGameMode ? getGameMode() : ('loading' as GameMode);
				if (mode !== 'ocean') {
					console.warn('next_mission ignored: game is not in ocean state (current:', mode, ')');
					break;
				}
				try { onNextMission?.(); } catch (e) { console.warn('onNextMission error:', e); }
				break;
			}
		}
	} catch (err) {
		console.error('Command execution error:', command.type, err);
	}
}

try {
transport = await createAblyTransport({ authUrl, channelName });
await transport.connect();
transport.subscribe('action', (msg) => {
	console.log('📨 Realtime message:', msg.name, msg.data);
	const command = parseRealtimeCommand(msg.data);
	if (!command) {
		console.warn('Received invalid realtime command:', msg.data);
		return;
	}
	executeCommand(command).catch((err) => {
		console.error('Message handler error:', err);
	});
});

connected = transport.isConnected();
publishState();
cleanupFns.push(() => transport?.disconnect());
} catch (err) {
console.error('Failed to initialize realtime control:', err);
throw err;
}

return {
isConnected: () => connected,
disconnect: () => {
for (const fn of cleanupFns) { try { fn(); } catch {} }
cleanupFns.length = 0;
connected = false;
}
};
}
