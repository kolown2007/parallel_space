export type VideoMount = {
    root: HTMLElement;
    video: HTMLVideoElement;
    cleanup: () => void;
};

/**
 * Mount an optimized full-page HTML5 video that plays once.
 * - Uses native browser hardware decoding
 * - Auto-pauses when tab hidden (saves battery/CPU)
 * - Muted autoplay for instant playback
 * - Calls onEnd when video finishes
 */
import { randomVideoUrl, getVideoUrl } from '../assetsConfig';

export function mountVideoScene(
    container?: HTMLElement,
    src?: string,
    onEnd?: () => void,
    poster?: string
): VideoMount {
    const parent = container ?? document.body;

    // Full-screen container
    const root = document.createElement('div');
    Object.assign(root.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '9999',
        background: 'black',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
    });
    parent.appendChild(root);

    // Optional poster image shown while video loads/before play
    let posterImg: HTMLImageElement | undefined;
    const showPoster = (url: string) => {
        posterImg = document.createElement('img');
        posterImg.src = url;
        Object.assign(posterImg.style, {
            position: 'absolute',
            inset: '0',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: '10001',
            background: 'black'
        });
        root.appendChild(posterImg!);
    };

    // Video element - muted for instant autoplay
    const video = document.createElement('video');
    if (poster) {
        try { video.poster = poster; showPoster(poster); } catch {};
    }

    // If caller didn't pass a src, or the src errors, try to load from centralized assets.json
    // We'll attempt a few fallbacks (random videos) before giving up.
    const tried = new Set<string>();
    let attempts = 0;
    const MAX_ATTEMPTS = 5;

    const loadAndPlay = async (candidate?: string) => {
        attempts++;
        try {
            let url = candidate || '';
            if (!url) {
                url = await randomVideoUrl();
            }
            if (!url) return false;
            // avoid retrying the same URL
            if (tried.has(url) && attempts <= MAX_ATTEMPTS) {
                // try another random one
                return loadAndPlay();
            }
            tried.add(url);
            video.src = url;
            // try to autoplay once src arrives
            setTimeout(() => video.play().catch(() => {}), 100);
            return true;
        } catch (e) {
            return false;
        }
    };

    // initial attempt: prefer provided `src`, otherwise pick random
    if (src) {
        // try provided source first; if it fails an 'error' handler will trigger fallback
        video.src = src;
    } else {
        // no src provided, try to load a random video
        video.src = '';
        void loadAndPlay();
    }
    video.loop = false; // Play once, then call onEnd
    video.playsInline = true;
    video.muted = true; // Required for autoplay
    video.autoplay = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    
    Object.assign(video.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        zIndex: '10000'
    });

    root.appendChild(video);

    // Force play after a brief delay
        setTimeout(() => video.play().catch(() => {}), 100);

    // Hide poster once video starts playing
    const handlePlaying = () => {
        if (posterImg && posterImg.parentElement) posterImg.remove();
    };
    video.addEventListener('playing', handlePlaying);

    // If the video element reports an error, attempt fallbacks (random videos)
    const handleError = async () => {
        // If we've exhausted attempts, just call onEnd and stop
        if (attempts >= MAX_ATTEMPTS) {
            if (onEnd) onEnd();
            return;
        }

        // Try to load another random video
        const ok = await loadAndPlay();
        if (!ok && attempts >= MAX_ATTEMPTS) {
            if (onEnd) onEnd();
        }
    };
    video.addEventListener('error', handleError);

    // Call onEnd callback when video finishes
    const handleEnded = () => {
        if (onEnd) {
            onEnd();
        }
    };
    video.addEventListener('ended', handleEnded);

    // OPTIMIZATION: Pause when tab hidden (saves CPU/battery)
    let wasPlaying = false;
    const handleVisibility = () => {
        if (document.hidden) {
            wasPlaying = !video.paused;
            video.pause();
        } else if (wasPlaying) {
            video.play().catch(() => {});
        }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Cleanup function
    const cleanup = () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        video.removeEventListener('ended', handleEnded);
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('error', handleError);
        video.pause();
        video.src = '';
        video.load(); // Release resources
        if (posterImg && posterImg.parentElement) posterImg.remove();
        root.remove();
    };

    return { root, video, cleanup };
}

export default mountVideoScene;

/**
 * Play a video by switching to the full-screen video scene.
 * `videoRef` may be a direct URL or an asset id resolvable by `getVideoUrl`.
 * Returns the mounted VideoMount (resolved promise) so caller can cleanup if needed.
 */
export async function playVideoScene(videoRef: string, onEnd?: () => void, poster?: string): Promise<VideoMount> {
    let src = videoRef;
    try {
        if (!/^https?:\/\//i.test(videoRef)) {
            const u = await getVideoUrl(videoRef);
            if (u) src = u;
        }
    } catch {}

    const mount = mountVideoScene(undefined, src, onEnd, poster);
    setTimeout(() => mount.video.play().catch(() => {}), 50);
    return mount;
}