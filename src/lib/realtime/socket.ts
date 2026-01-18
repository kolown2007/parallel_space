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

export type RealtimeClient = Ably.Realtime;
export type RealtimeChannel = ReturnType<Ably.Realtime['channels']['get']>;

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

/**
 * Ensure the channel is attached and return it.
 * Resolves when the channel reaches the `attached` state or rejects on error/timeout.
 */
export async function getAttachedChannel(realtime: Ably.Realtime, channelName: string, attachTimeoutMs = 5000) {
    const ch = realtime.channels.get(channelName);
    if (ch.state === 'attached') return ch;

    return new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('channel attach timeout'));
        }, attachTimeoutMs);

        ch.attach()
            .then(() => {
                clearTimeout(timer);
                resolve(ch);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

/**
 * Convenience: create a client (using `createAblyClient`) and return an attached channel.
 * Caller should close the returned client with `closeAblyClient` when done.
 */
export async function connectToChannel(channelName: string, opts?: CreateAblyOptions) {
    return connect(channelName, opts);
}

/**
 * Simple helper: create an Ably client, wait for connection, attach the channel, and return both.
 * Resolves with `{ client, channel }`. Caller should call `closeAblyClient(client)` when finished.
 */
export async function connect(channelName: string, opts?: Partial<CreateAblyOptions>, connectTimeoutMs = 5000) {
    const authUrl = opts?.authUrl ?? DEFAULT_AUTH_URL;
    const clientId = opts?.clientId;
    const realtimeOptions = opts?.realtimeOptions;

    if (!authUrl) throw new Error('connect: authUrl required (pass opts.authUrl or set DEFAULT_AUTH_URL)');

    const client = createAblyClient({ authUrl, clientId, realtimeOptions });

    // wait for connection
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('connection timeout')), connectTimeoutMs);
        const onConnect = () => { clearTimeout(timer); client.connection.off('connected', onConnect); resolve(); };
        client.connection.on('connected', onConnect);
        client.connection.on('failed', (err: any) => { clearTimeout(timer); reject(err || new Error('connection failed')); });
    });

    const channel = await getAttachedChannel(client, channelName);
    return { client, channel } as { client: RealtimeClient; channel: RealtimeChannel };
}

/**
 * Convenience: connect to the project's default channel `chronoescape`.
 */
export async function connectChronoescape(opts?: Partial<CreateAblyOptions>, connectTimeoutMs = 5000) {
    return connect('chronoescape', opts, connectTimeoutMs);
}

export default createAblyClient;