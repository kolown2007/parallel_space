import * as BABYLON from '@babylonjs/core';
import { getVideoUrl, getTextureUrl, getLoadingImageUrl } from '../../assetsConfig';
import { playVideoScene } from '../../scenes/videoscene';

export interface Vec3 { x: number; y: number; z: number; }
export interface AABB { min: Vec3; max: Vec3 }

/**
 * Portal: shows a poster texture in-world and when collided with switches to the video scene.
 * Constructor accepts either direct URLs or asset ids (if not starting with http it will try to resolve via `getVideoUrl`).
 */
export class Portal {
    posterRef: string; // poster url or id
    videoRef: string; // video url or id
    aabb: AABB;
    triggered = false;
    cleanupOnClose?: () => void;
    mesh?: BABYLON.Mesh;
    material?: BABYLON.StandardMaterial;
    _prefetchVideo?: HTMLVideoElement;

    constructor(posterRef: string, videoRef: string, center: Vec3, size: Vec3, scene?: BABYLON.Scene, opts?: { width?: number; height?: number }) {
        this.posterRef = posterRef;
        this.videoRef = videoRef;
        const half = { x: size.x / 2, y: size.y / 2, z: size.z / 2 };
        this.aabb = {
            min: { x: center.x - half.x, y: center.y - half.y, z: center.z - half.z },
            max: { x: center.x + half.x, y: center.y + half.y, z: center.z + half.z }
        };
        if (scene) {
            // create visual representation immediately (fire-and-forget)
            this.createVisual(scene, { x: center.x, y: center.y, z: center.z }, opts).catch(() => {});
            // start prefetching the video to warm network / decoder
            this.prefetchVideo().catch(() => {});
        }
    }

    async createVisual(scene: BABYLON.Scene, center: Vec3, opts?: { width?: number; height?: number }) {
        const width = opts?.width ?? 3;
        const height = opts?.height ?? 4;
        let posterUrl: string | undefined;
        try {
            if (/^https?:\/\//i.test(this.posterRef)) {
                posterUrl = this.posterRef;
            } else {
                try {
                    const resolved = await getTextureUrl(this.posterRef);
                    if (resolved) {
                        posterUrl = resolved;
                    } else {
                        // fallback to the configured loading image when texture id missing
                        try { posterUrl = await getLoadingImageUrl(); } catch {}
                    }
                } catch {
                    try { posterUrl = await getLoadingImageUrl(); } catch {}
                }
            }
        } catch {}

        try {
            this.mesh = BABYLON.MeshBuilder.CreatePlane('portal_plane', { width, height }, scene);
            this.mesh.position = new BABYLON.Vector3(center.x, center.y, center.z);
            this.mesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
            this.material = new BABYLON.StandardMaterial('portalMat', scene);
            this.material.backFaceCulling = false;
            if (posterUrl) {
                this.material.diffuseTexture = new BABYLON.Texture(posterUrl, scene);
            } else {
                this.material.emissiveColor = new BABYLON.Color3(1, 1, 1);
            }
            this.mesh.material = this.material;
        } catch (e) {
            // ignore visual creation failures
        }
    }

    async prefetchVideo() {
        try {
            let videoUrl = this.videoRef;
            if (!/^https?:\/\//i.test(String(this.videoRef))) {
                try {
                    const u = await getVideoUrl(this.videoRef);
                    if (u) videoUrl = u;
                } catch {}
            }
            if (!videoUrl) return;
            const v = document.createElement('video');
            v.preload = 'auto';
            v.muted = true;
            v.playsInline = true;
            v.crossOrigin = 'anonymous';
            v.style.display = 'none';
            v.src = videoUrl;
            document.body.appendChild(v);
            this._prefetchVideo = v;
            // attempt to load resource
            try { v.load(); } catch {}
        } catch {}
    }

    intersects(other: AABB) {
        return !(
            other.max.x < this.aabb.min.x ||
            other.min.x > this.aabb.max.x ||
            other.max.y < this.aabb.min.y ||
            other.min.y > this.aabb.max.y ||
            other.max.z < this.aabb.min.z ||
            other.min.z > this.aabb.max.z
        );
    }

    // Call from your update loop with the USB/world AABB. Returns true if collision handled.
    async checkCollisionAndHandle(usbAabb: AABB) : Promise<boolean> {
        if (this.triggered) return false;
        if (!this.intersects(usbAabb)) return false;
        this.triggered = true;

        // Resolve videoRef to URL if it's an id
        let videoUrl = this.videoRef;
        try {
            if (!/^https?:\/\//i.test(this.videoRef)) {
                const u = await getVideoUrl(this.videoRef);
                if (u) videoUrl = u;
            }
        } catch {}

        // Resolve poster if it's an id (best-effort, but poster can remain an id for renderer to use)
        let posterUrl = this.posterRef;
        try {
            if (!/^https?:\/\//i.test(this.posterRef)) {
                // we don't have a getTextureUrl helper here; leave as-is so renderer can resolve, or use as-is
            }
        } catch {}

        try {
            // if we prefetched a hidden video element, try to reuse it by passing its src quickly
            const mount = await playVideoScene(videoUrl, () => {
                // when video ends, allow retriggering
                this.triggered = false;
                if (this.cleanupOnClose) {
                    try { this.cleanupOnClose(); } catch {}
                    this.cleanupOnClose = undefined;
                }
            }, posterUrl);
            this.cleanupOnClose = mount.cleanup;
            // remove prefetch video element now that scene-mounted video is playing
            try {
                if (this._prefetchVideo && this._prefetchVideo.parentElement) {
                    this._prefetchVideo.remove();
                }
                this._prefetchVideo = undefined;
            } catch {}
        } catch (e) {
            // failed to play; reset trigger so can be retried
            this.triggered = false;
        }

        return true;
    }

    reset() {
        this.triggered = false;
        if (this.cleanupOnClose) {
            try { this.cleanupOnClose(); } catch {}
            this.cleanupOnClose = undefined;
        }
        try {
            if (this.mesh) {
                try { this.mesh.dispose(); } catch {}
                this.mesh = undefined;
            }
            if (this.material) {
                try { this.material.dispose(); } catch {}
                this.material = undefined;
            }
            if (this._prefetchVideo) {
                try { this._prefetchVideo.remove(); } catch {}
                this._prefetchVideo = undefined;
            }
        } catch {}
    }
}
