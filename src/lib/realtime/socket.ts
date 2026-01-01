
import * as Ably from 'ably';

// Default auth URL used when none is provided to createAblyClient.
// You can change it at runtime by calling `setDefaultAuthUrl(url)`.
export let DEFAULT_AUTH_URL: string | null = 'https://kolown.net/api/ghost_auth';

export function setDefaultAuthUrl(url: string | null) {
    DEFAULT_AUTH_URL = url;
}

export interface CreateAblyOptions {
    authUrl: string; // required URL that returns an Ably token request JSON
    clientId?: string;
    realtimeOptions?: any;
}

/**
 * Create an Ably Realtime client using an auth URL.
 * The auth URL is fetched with credentials included and should return a tokenRequest JSON.
 */
export function createAblyClient(opts?: CreateAblyOptions): Ably.Realtime {
    const authUrl = opts?.authUrl ?? DEFAULT_AUTH_URL;
    const clientId = opts?.clientId;
    const realtimeOptions = opts?.realtimeOptions;
    if (!authUrl) throw new Error('createAblyClient: authUrl is required (pass it or set DEFAULT_AUTH_URL)');

    const clientOptions: any = {
        ...(realtimeOptions || {}),
        authCallback: async (tokenParams: any, callback: any) => {
            try {
                const res = await fetch(authUrl, { method: 'GET', credentials: 'include' });
                if (!res.ok) return callback(new Error('auth failed: ' + res.status));
                const tokenRequest = await res.json();
                callback(null, tokenRequest);
            } catch (err) {
                callback(err);
            }
        }
    };

    // Ably expects clientId to be a string or null (not undefined)
    clientOptions.clientId = typeof clientId === 'string' ? clientId : null;

    const client = new Ably.Realtime(clientOptions);

    return client;
}

export function getChannel(realtime: Ably.Realtime, channelName: string) {
    return realtime.channels.get(channelName);
}

export function closeAblyClient(realtime: Ably.Realtime) {
    try {
        realtime.close();
    } catch (e) {
        // ignore
    }
}

export default createAblyClient;