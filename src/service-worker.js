/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

// Create a unique cache name for this deployment
const CACHE = `cache-${version}`;

const ASSETS = [
	...build, // the app itself
	...files  // everything in `static`
];

// External assets to cache (optional - only if you want offline support for these)
const EXTERNAL_ASSETS = [
	// kept for explicit list fallback; main install step will fetch assets.json
];

self.addEventListener('install', (event) => {
	// Create a new cache and add all files to it
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		
		// Cache local assets first
		await cache.addAll(ASSETS);
		
		// Try to cache external assets (fail silently if CORS or network issues)
		// Also fetch asset list from /assets.json and cache those URLs
		try {
			const res = await fetch('/assets.json', { cache: 'no-store' });
			if (res && res.ok) {
				const json = await res.json();
				const urls = new Set();
				const add = (u) => { if (u) urls.add(u); };
				if (json.models) for (const a of Object.values(json.models)) add((/^https?:\/\//i.test(a.rootUrl) ? a.rootUrl : '') + (a.filename || ''));
				if (json.textures) for (const a of Object.values(json.textures)) add((/^https?:\/\//i.test(a.rootUrl) ? a.rootUrl : '') + (a.filename || ''));
				if (json.shaders) for (const s of Object.values(json.shaders)) { if (s.vertex) add((/^https?:\/\//i.test(s.vertex) ? s.vertex : s.vertex)); if (s.fragment) add((/^https?:\/\//i.test(s.fragment) ? s.fragment : s.fragment)); }
				if (json.videos) for (const v of Object.values(json.videos)) add(v.url);
				if (json.loading && json.loading.backgroundImage) add(json.loading.backgroundImage);
				if (json.physics && json.physics.havokWasm) add(json.physics.havokWasm);
				let added = 0;
				for (const url of Array.from(urls)) {
					try {
						const existing = await cache.match(url);
						if (existing) continue; // already cached
						const r = await fetch(url, { mode: 'cors' });
						if (r && r.ok) {
							await cache.put(url, r.clone());
							added += 1;
						}
					} catch (e) {
						console.warn('SW: failed to cache asset during refresh', url, e);
					}
				}

				// notify clients that refresh succeeded and report how many were added
				const clients = await self.clients.matchAll();
				for (const c of clients) c.postMessage({ type: 'refreshedAssets', ok: true, added, total: urls.size });
			}
		} catch (e) {
			console.warn('SW: failed to load /assets.json', e);
		}
	}

	event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event) => {
	// Remove previous cached data from disk
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
	}

	event.waitUntil(deleteOldCaches());
});

self.addEventListener('fetch', (event) => {
	// ignore POST requests etc
	if (event.request.method !== 'GET') return;

	async function respond() {
		const url = new URL(event.request.url);
		const cache = await caches.open(CACHE);

		// `build`/`files` can always be served from the cache
		if (ASSETS.includes(url.pathname)) {
			const response = await cache.match(url.pathname);

			if (response) {
				return response;
			}
		}

		// for everything else, try the network first, but
		// fall back to the cache if we're offline
		try {
			const response = await fetch(event.request);

			// if we're offline, fetch can return a value that is not a Response
			// instead of throwing - and we can't pass this non-Response to respondWith
			if (!(response instanceof Response)) {
				throw new Error('invalid response from fetch');
			}

			// Only cache successful HTTP/HTTPS requests
			// Skip very large files (>50MB) to avoid quota issues
			const contentLength = response.headers.get('content-length');
			const sizeMB = contentLength ? parseInt(contentLength) / (1024 * 1024) : 0;
			
			if (response.status === 200 && url.protocol.startsWith('http')) {
				if (sizeMB === 0 || sizeMB < 50) {
					cache.put(event.request, response.clone());
				} else {
					console.log(`Skipping cache for large file (${sizeMB.toFixed(2)}MB): ${url.pathname}`);
				}
			}

			return response;
		} catch (err) {
			const response = await cache.match(event.request);

			if (response) {
				return response;
			}

			// if there's no cache, then just error out
			// as there is nothing we can do to respond to this request
			throw err;
		}
	}

	event.respondWith(respond());
});

// Listen for client messages to trigger asset refresh
self.addEventListener('message', (event) => {
	try {
		const data = event.data || {};
		if (data && data.type === 'refreshAssets') {
			// Re-fetch assets.json and cache listed assets
			(async () => {
				try {
					const cache = await caches.open(CACHE);
					const cacheBuster = `?t=${Date.now()}`;
					const res = await fetch('/assets.json' + cacheBuster, { cache: 'no-store' });
					if (!res || !res.ok) {
						// notify clients that refresh failed
						const clients = await self.clients.matchAll();
						for (const c of clients) c.postMessage({ type: 'refreshedAssets', ok: false });
						return;
					}
					const json = await res.json();
					const urls = new Set();
					const add = (u) => { if (u) urls.add(u); };
					if (json.models) for (const a of Object.values(json.models)) add((/^https?:\/\//i.test(a.rootUrl) ? a.rootUrl : '') + (a.filename || ''));
					if (json.textures) for (const a of Object.values(json.textures)) add((/^https?:\/\//i.test(a.rootUrl) ? a.rootUrl : '') + (a.filename || ''));
					if (json.shaders) for (const s of Object.values(json.shaders)) { if (s.vertex) add((/^https?:\/\//i.test(s.vertex) ? s.vertex : s.vertex)); if (s.fragment) add((/^https?:\/\//i.test(s.fragment) ? s.fragment : s.fragment)); }
					if (json.videos) for (const v of Object.values(json.videos)) add(v.url);
					if (json.loading && json.loading.backgroundImage) add(json.loading.backgroundImage);
					if (json.physics && json.physics.havokWasm) add(json.physics.havokWasm);

					for (const url of Array.from(urls)) {
						try {
							const r = await fetch(url, { mode: 'cors' });
							if (r && r.ok) await cache.put(url, r.clone());
						} catch (e) {
							console.warn('SW: failed to cache asset during refresh', url, e);
						}
					}

					// notify clients that refresh succeeded
					const clients = await self.clients.matchAll();
					for (const c of clients) c.postMessage({ type: 'refreshedAssets', ok: true });
				} catch (e) {
					console.warn('SW: refreshAssets failed', e);
					const clients = await self.clients.matchAll();
					for (const c of clients) c.postMessage({ type: 'refreshedAssets', ok: false });
				}
			})();
		}
	} catch (e) {
		// ignore
	}
});


