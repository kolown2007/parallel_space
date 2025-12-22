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
	'https://kolown.net/storage/library/chronoescape/parallel3.jpg',
	// Add other critical external assets here
	// Note: Large files like videos may hit cache limits
];

self.addEventListener('install', (event) => {
	// Create a new cache and add all files to it
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		
		// Cache local assets first
		await cache.addAll(ASSETS);
		
		// Try to cache external assets (fail silently if CORS or network issues)
		for (const url of EXTERNAL_ASSETS) {
			try {
				const response = await fetch(url, { mode: 'cors' });
				if (response.ok) {
					await cache.put(url, response);
				}
			} catch (err) {
				console.warn(`Failed to cache external asset: ${url}`, err);
			}
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


