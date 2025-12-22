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
import { getVideoUrl } from '../assetsConfig';

export function mountVideoScene(
    container?: HTMLElement,
    src?: string,
    onEnd?: () => void
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
        justifyContent: 'center'
    });
    parent.appendChild(root);

    // Video element - muted for instant autoplay
    const video = document.createElement('video');
    // If caller didn't pass a src, try to load from centralized assets.json
    if (src) {
        video.src = src;
    } else {
        video.src = '';
        try {
            getVideoUrl('intro').then(u => {
                if (u) {
                    video.src = u;
                    // try to autoplay once src arrives
                    setTimeout(() => video.play().catch(() => {}), 100);
                }
            }).catch(() => {});
        } catch (e) {}
    }
    video.loop = false; // Play once, then call onEnd
    video.playsInline = true;
    video.muted = true; // Required for autoplay
    video.autoplay = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    
    Object.assign(video.style, {
        width: '100%',
        height: '100%',
        objectFit: 'contain'
    });

    root.appendChild(video);

    // Force play after a brief delay
        setTimeout(() => video.play().catch(() => {}), 100);

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
        video.pause();
        video.src = '';
        video.load(); // Release resources
        root.remove();
    };

    return { root, video, cleanup };
}

export default mountVideoScene;