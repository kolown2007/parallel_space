import type { AssetItem } from './chronoescape/assetContainers';

// Configurable URL for the assets config JSON
export let ASSETS_CONFIG_URL = '/assets.json';
export function setAssetsConfigUrl(url: string) {
  ASSETS_CONFIG_URL = url;
}

export interface AssetsConfig {
  models: Record<string, {
    rootUrl: string;
    filename: string;
    type: 'mesh';
  }>;
  textures: Record<string, {
    rootUrl: string;
    filename: string;
    type: 'texture';
  }>;
  shaders?: Record<string, {
    vertex: string;
    fragment: string;
  }>;
  videos?: Record<string, {
    url: string;
  }>;
  loading?: {
    backgroundImage: string;
  };
  physics?: {
    havokWasm: string;
  };
}

let cachedConfig: AssetsConfig | null = null;

/**
 * Load the assets configuration from the JSON file
 */
export async function loadAssetsConfig(): Promise<AssetsConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    // Add cache-busting parameter in development
    const cacheBuster = import.meta.env.DEV ? `?t=${Date.now()}` : '';
    const response = await fetch(ASSETS_CONFIG_URL + cacheBuster);
    if (!response.ok) {
      throw new Error(`Failed to load assets.json: ${response.status}`);
    }
    cachedConfig = await response.json();
    return cachedConfig!;
  } catch (error) {
    console.error('Failed to load assets config:', error);
    // Return empty config as fallback
    return {
      models: {},
      textures: {},
      shaders: {},
      videos: {},
      loading: { backgroundImage: '' },
      physics: { havokWasm: '/HavokPhysics.wasm' }
    };
  }
}

/**
 * Get asset list for preloading (converts config to AssetItem array)
 */
export async function getAssetList(): Promise<AssetItem[]> {
  const config = await loadAssetsConfig();
  const items: AssetItem[] = [];
  
  // Add models
  for (const [id, asset] of Object.entries(config.models)) {
    items.push({
      id,
      rootUrl: asset.rootUrl,
      filename: asset.filename
    });
  }
  
  // Add textures
  for (const [id, asset] of Object.entries(config.textures)) {
    items.push({
      id,
      rootUrl: asset.rootUrl,
      filename: asset.filename
    });
  }
  
  return items;
}

/**
 * Helper functions to get specific asset URLs
 */
export async function getAssetUrl(category: 'models' | 'textures', id: string): Promise<string> {
  const config = await loadAssetsConfig();
  const asset = config[category]?.[id];
  if (!asset) {
    console.warn(`Asset not found: ${category}/${id}`);
    return '';
  }
  
  // Handle absolute URLs
  if (/^https?:\/\//i.test(asset.filename)) {
    return asset.filename;
  }
  
  return asset.rootUrl + asset.filename;
}

export async function getModelUrl(id: string): Promise<string> {
  return getAssetUrl('models', id);
}

export async function getTextureUrl(id: string): Promise<string> {
  return getAssetUrl('textures', id);
}

export async function getVideoUrl(id: string): Promise<string> {
  const config = await loadAssetsConfig();
  return config.videos?.[id]?.url || '';
}

export async function getPhysicsWasmUrl(): Promise<string> {
  const config = await loadAssetsConfig();
  const wasmUrl = config.physics?.havokWasm || '/HavokPhysics.wasm';

  // Try to fetch the wasm and ensure it's served with the correct MIME type.
  // If the server responds without 'application/wasm', create a blob URL
  // with the proper MIME so `WebAssembly.compileStreaming` succeeds.
  try {
    const resp = await fetch(wasmUrl, { cache: 'no-cache' });
    if (!resp.ok) return wasmUrl;
    const ctype = resp.headers.get('content-type') || '';
    if (ctype.includes('application/wasm')) {
      return wasmUrl;
    }

    // Server didn't provide correct content-type — create blob URL
    const ab = await resp.arrayBuffer();
    const blob = new Blob([ab], { type: 'application/wasm' });
    const objUrl = URL.createObjectURL(blob);
    return objUrl;
  } catch (e) {
    // If fetch fails for any reason, fall back to returning original URL
    return wasmUrl;
  }
}

export async function getLoadingImageUrl(): Promise<string> {
  const config = await loadAssetsConfig();
  return config.loading?.backgroundImage || '';
}

/**
 * Pick a random ID from a list of provided IDs
 * @example randomFrom('metal', 'cube1', 'cube2') // returns one of these randomly
 */
export function randomFrom<T>(...ids: T[]): T {
  return ids[Math.floor(Math.random() * ids.length)];
}

/**
 * Pick a random asset ID from a specific group in assets.json
 * @param group - 'models' | 'textures' | 'shaders' | 'videos'
 * @returns Promise<string> - random asset ID from that group, or empty string if none
 * @example const textureId = await randomFromGroup('textures') // e.g. 'metal', 'cube1', etc.
 */
export async function randomFromGroup(group: 'models' | 'textures' | 'shaders' | 'videos'): Promise<string> {
  const config = await loadAssetsConfig();
  const groupData = config[group];
  if (!groupData || typeof groupData !== 'object') return '';
  const ids = Object.keys(groupData);
  if (ids.length === 0) return '';
  return ids[Math.floor(Math.random() * ids.length)];
}

/**
 * Pick a random texture ID from assets.json
 * @returns Promise<string> - random texture ID
 */
export async function randomTextureId(): Promise<string> {
  return randomFromGroup('textures');
}

/**
 * Pick a random model ID from assets.json
 * @returns Promise<string> - random model ID
 */
export async function randomModelId(): Promise<string> {
  return randomFromGroup('models');
}

/**
 * Pick a random video ID from assets.json
 * @returns Promise<string> - random video ID
 */
export async function randomVideoId(): Promise<string> {
  return randomFromGroup('videos');
}

/**
 * Resolve a random video URL from assets.json
 * @returns Promise<string> - random video URL
 */
export async function randomVideoUrl(): Promise<string> {
  const id = await randomVideoId();
  if (!id) return '';
  return getVideoUrl(id);
}

/**
 * Get all asset IDs from a specific group
 * @param group - 'models' | 'textures' | 'shaders' | 'videos'
 * @returns Promise<string[]> - array of all asset IDs in that group
 */
export async function getAssetIds(group: 'models' | 'textures' | 'shaders' | 'videos'): Promise<string[]> {
  const config = await loadAssetsConfig();
  const groupData = config[group];
  if (!groupData || typeof groupData !== 'object') return [];
  return Object.keys(groupData);
}

/**
 * Ask the service worker to refresh and re-cache assets from `/assets.json`.
 * Returns `true` if a refresh was requested or attempted, `false` otherwise.
 */
export async function refreshAssetsCache(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const controller: any = navigator.serviceWorker.controller || (reg && reg.active) || (reg && reg.waiting);
    if (controller && typeof controller.postMessage === 'function') {
      (controller as any).postMessage({ type: 'refreshAssets' });
      return true;
    }

    // Fallback: attempt to fetch assets.json and touch each asset (best-effort)
    const cacheBuster = import.meta.env.DEV ? `?t=${Date.now()}` : '';
    const res = await fetch(ASSETS_CONFIG_URL + cacheBuster);
    if (!res.ok) return false;
    const json = await res.json() as AssetsConfig;
    const urls: string[] = [];
    const add = (u?: string) => { if (u) urls.push(u); };
    if (json.models) for (const a of Object.values(json.models)) add((/^https?:\/\//i.test(a.rootUrl) ? a.rootUrl : '') + (a.filename || ''));
    if (json.textures) for (const a of Object.values(json.textures)) add((/^https?:\/\//i.test(a.rootUrl) ? a.rootUrl : '') + (a.filename || ''));
    if (json.shaders) for (const s of Object.values(json.shaders)) { if (s.vertex) add((/^https?:\/\//i.test(s.vertex) ? s.vertex : s.vertex)); if (s.fragment) add((/^https?:\/\//i.test(s.fragment) ? s.fragment : s.fragment)); }
    if (json.videos) for (const v of Object.values(json.videos)) add(v.url);
    if (json.loading && json.loading.backgroundImage) add(json.loading.backgroundImage);
    if (json.physics && json.physics.havokWasm) add(json.physics.havokWasm);

    for (const url of urls) {
      try { await fetch(url, { mode: 'cors' }); } catch (e) { /* ignore */ }
    }

    return true;
  } catch (e) {
    console.warn('refreshAssetsCache failed', e);
    return false;
  }
}

/**
 * Clear the in-memory cached assets config so next `loadAssetsConfig` will refetch.
 */
export function clearAssetsConfigCache() {
  cachedConfig = null;
}

/**
 * Force reload of the assets config and return the new config.
 */
export async function reloadAssetsConfig(): Promise<AssetsConfig> {
  clearAssetsConfigCache();
  const cfg = await loadAssetsConfig();
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('assets:updated', { detail: cfg }));
    }
  } catch (e) {}
  return cfg;
}

// Listen for service worker messages that indicate the service worker refreshed assets.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    navigator.serviceWorker.addEventListener('message', (ev: any) => {
      try {
        const data = ev?.data || {};
        if (data && data.type === 'refreshedAssets') {
          // Only reload the in-memory manifest when new assets were actually cached.
          // If added === 0, keep the existing cachedConfig to avoid unnecessary reloads.
          if (data.ok) {
            const added = typeof data.added === 'number' ? data.added : 0;
            if (added > 0) {
              reloadAssetsConfig().catch(() => {});
            }
          } else {
            // If SW failed, clear cache so next load will fetch fresh manifest
            clearAssetsConfigCache();
          }
        }
      } catch (e) {}
    });
  } catch (e) {}
}

// --- Polling / automatic refresh utilities ---
let _assetsPollingId: number | null = null;
let _assetsPollingBoundFocus: (() => void) | null = null;
let _assetsPollingBoundVisibility: (() => void) | null = null;
let _lastManifestRaw: string | null = null;

async function checkForAssetManifestChange(): Promise<boolean> {
  try {
    const cacheBuster = `?t=${Date.now()}`;
    const res = await fetch(ASSETS_CONFIG_URL + cacheBuster, { cache: 'no-store' });
    if (!res || !res.ok) return false;
    const raw = await res.text();

    // If we haven't initialized baseline, set it but don't trigger update
    if (_lastManifestRaw === null) {
      // prefer current in-memory cachedConfig as baseline when available
      if (cachedConfig) _lastManifestRaw = JSON.stringify(cachedConfig);
      else _lastManifestRaw = raw;
      return false;
    }

    if (raw !== _lastManifestRaw) {
      _lastManifestRaw = raw;
      // reload in-memory config and ask SW to refresh cached assets
      try {
        await reloadAssetsConfig();
      } catch (e) {}
      try {
        await refreshAssetsCache();
      } catch (e) {}
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/** Start periodic polling to detect changes to `/assets.json`. */
export function startAssetsPolling(intervalMs = 300000) {
  if (typeof window === 'undefined') return;
  stopAssetsPolling();

  // initialize baseline immediately
  (async () => {
    try { _lastManifestRaw = cachedConfig ? JSON.stringify(cachedConfig) : null; } catch (e) { _lastManifestRaw = null; }
    await checkForAssetManifestChange();
  })();

  _assetsPollingId = window.setInterval(() => { checkForAssetManifestChange().catch(() => {}); }, intervalMs) as unknown as number;

  // also trigger a quick check when page becomes visible or when window regains focus
  _assetsPollingBoundFocus = () => { checkForAssetManifestChange().catch(() => {}); };
  _assetsPollingBoundVisibility = () => { if (!document.hidden) checkForAssetManifestChange().catch(() => {}); };
  window.addEventListener('focus', _assetsPollingBoundFocus);
  document.addEventListener('visibilitychange', _assetsPollingBoundVisibility);
}

/** Stop the periodic polling. */
export function stopAssetsPolling() {
  if (typeof window === 'undefined') return;
  if (_assetsPollingId !== null) {
    clearInterval(_assetsPollingId as unknown as number);
    _assetsPollingId = null;
  }
  if (_assetsPollingBoundFocus) {
    window.removeEventListener('focus', _assetsPollingBoundFocus);
    _assetsPollingBoundFocus = null;
  }
  if (_assetsPollingBoundVisibility) {
    document.removeEventListener('visibilitychange', _assetsPollingBoundVisibility);
    _assetsPollingBoundVisibility = null;
  }
}

// Auto-start polling in the browser so production clients will detect new assets
// without manual console interaction. Interval defaults to 5 minutes.
if (typeof window !== 'undefined') {
  try { startAssetsPolling(300000); } catch (e) {}
}
