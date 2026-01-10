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
    const response = await fetch(ASSETS_CONFIG_URL);
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
