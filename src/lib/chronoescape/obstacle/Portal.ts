import * as BABYLON from '@babylonjs/core';
import { getTextureUrl, getLoadingImageUrl } from '../../assetsConfig';

export interface Vec3 { x: number; y: number; z: number; }
export interface AABB { min: Vec3; max: Vec3 }

/**
 * Portal: shows a poster texture in-world and when collided with switches to the video scene.
 * Constructor accepts either direct URLs or asset ids (if not starting with http it will try to resolve via `getVideoUrl`).
 */
export class Portal {
    posterRef?: string; // poster url or id
    aabb: AABB;
    triggered = false;
    cleanupOnClose?: () => void;
    mesh?: BABYLON.Mesh;
    material?: BABYLON.StandardMaterial;
    private _onTrigger?: () => void;
    private _scene?: BABYLON.Scene;
    private _rotationObserver?: BABYLON.Observer<BABYLON.Scene> | undefined;
    private _rotationSpeed = 0.18; // radians per second (slow spin)
    private _root?: BABYLON.TransformNode;
    private _billboard?: BABYLON.Mesh;
    constructor(posterRef: string | undefined, center: Vec3, size: Vec3, scene?: BABYLON.Scene, opts?: { width?: number; height?: number }, onTrigger?: () => void) {
        this.posterRef = posterRef;
        this._onTrigger = onTrigger;
        const half = { x: size.x / 2, y: size.y / 2, z: size.z / 2 };
        this.aabb = {
            min: { x: center.x - half.x, y: center.y - half.y, z: center.z - half.z },
            max: { x: center.x + half.x, y: center.y + half.y, z: center.z + half.z }
        };
        if (scene) {
            // create visual representation immediately (fire-and-forget)
            this.createVisual(scene, { x: center.x, y: center.y, z: center.z }, opts).catch(() => {});
        }
    }

    async createVisual(scene: BABYLON.Scene, center: Vec3, opts?: { width?: number; height?: number }) {
        const width = opts?.width ?? 3;
        const height = opts?.height ?? 4;
        let posterUrl: string | undefined;
        try {
            if (this.posterRef && /^https?:\/\//i.test(this.posterRef)) {
                posterUrl = this.posterRef;
            } else if (this.posterRef) {
                try {
                    const resolved = await getTextureUrl(this.posterRef);
                    if (resolved) {
                        posterUrl = resolved;
                    } else {
                        try { posterUrl = await getLoadingImageUrl(); } catch {}
                    }
                } catch {
                    try { posterUrl = await getLoadingImageUrl(); } catch {}
                }
            } else {
                try { posterUrl = await getLoadingImageUrl(); } catch {}
            }
        } catch {}

        try {
            // create root at portal position
            this._root = new BABYLON.TransformNode('portal_root', scene);
            this._root.position = new BABYLON.Vector3(center.x, center.y, center.z);

            // create a tiny billboard mesh as a parent so it always faces the camera
            try {
                this._billboard = BABYLON.MeshBuilder.CreatePlane('portal_billboard', { width: 0.01, height: 0.01 }, scene);
                this._billboard.isVisible = false;
                this._billboard.parent = this._root;
                this._billboard.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
            } catch (e) {
                // fallback: null billboard
                this._billboard = undefined;
            }

            // create visible poster plane as child of billboard (so it faces camera via parent)
            this.mesh = BABYLON.MeshBuilder.CreatePlane('portal_plane', { width, height }, scene);
            this.mesh.parent = this._billboard ?? this._root;
            this.mesh.position = new BABYLON.Vector3(0, 0, 0);
            this.material = new BABYLON.StandardMaterial('portalMat', scene);
            this.material.backFaceCulling = false;
            if (posterUrl) {
                const tex = new BABYLON.Texture(posterUrl, scene);
                tex.hasAlpha = true;
                this.material.diffuseTexture = tex;
                this.material.useAlphaFromDiffuseTexture = true;
            } else {
                this.material.emissiveColor = new BABYLON.Color3(0.12, 0.12, 0.12);
            }
            this.mesh.material = this.material;
            // always add a subtle emissive tint so the portal is visible from a distance
            try { this.material.emissiveColor = new BABYLON.Color3(0.06, 0.06, 0.07); } catch {}
            // store scene reference and add a slow rotation effect (billboard parent faces camera; poster rotates locally)
            try {
                this._scene = scene;
                this._rotationObserver = scene.onBeforeRenderObservable.add(() => {
                    try {
                        if (!this._scene) return;
                        // poster is parented to billboard which faces the camera; rotate poster around its local Z axis
                        const dt = this._scene.getEngine().getDeltaTime();
                        const angle = this._rotationSpeed * (dt / 1000);
                        if (this.mesh) {
                            this.mesh.rotate(BABYLON.Axis.Z, angle, BABYLON.Space.LOCAL);
                        }
                    } catch (e) { /* ignore per-frame errors */ }
                });
            } catch (e) { /* ignore rotation setup errors */ }
        } catch (e) {
            // ignore visual creation failures
        }
    }

    // no-op: portals now trigger the central video scene which handles its own random selection

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


        // Resolve poster if it's an id (best-effort)
        let posterUrl: string | undefined = undefined;
        try {
            if (this.posterRef && /^https?:\/\//i.test(this.posterRef)) {
                posterUrl = this.posterRef;
            } else if (this.posterRef) {
                try {
                    const resolved = await getTextureUrl(this.posterRef);
                    if (resolved) posterUrl = resolved;
                    else posterUrl = await getLoadingImageUrl();
                } catch {
                    try { posterUrl = await getLoadingImageUrl(); } catch {}
                }
            } else {
                try { posterUrl = await getLoadingImageUrl(); } catch {}
            }
        } catch {}

        try {
            // Call optional trigger callback (scene owner can handle video switching)
            try { this._onTrigger?.(); } catch (e) { /* ignore handler errors */ }
        } catch (e) {
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
            if (this._rotationObserver && this._scene) {
                try { this._scene.onBeforeRenderObservable.remove(this._rotationObserver); } catch (e) {}
                this._rotationObserver = undefined;
                this._scene = undefined;
            }
            if (this.mesh) {
                try { this.mesh.dispose(); } catch {}
                this.mesh = undefined;
            }
            if (this._root) {
                try { this._root.dispose(); } catch {}
                this._root = undefined;
            }
            if (this.material) {
                try { this.material.dispose(); } catch {}
                this.material = undefined;
            }
        } catch {}
    }
}
