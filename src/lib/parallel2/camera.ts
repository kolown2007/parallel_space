import * as BABYLON from "@babylonjs/core";

export class SceneCamera {
    private camera!: BABYLON.FlyCamera | BABYLON.FreeCamera;
    private scene: BABYLON.Scene;
    private canvas: HTMLCanvasElement;
    // Tunnel constraints (can be supplied to match World)
    private readonly TUNNEL_RADIUS: number;
    private readonly TUNNEL_HALF_LENGTH: number;
    private readonly TUNNEL_CENTER = new BABYLON.Vector3(0, 1.5, 0);
    private allowExitTunnel: boolean = false;

    private travelObserver?: BABYLON.Observer<BABYLON.Scene>;
    private traveling: boolean = false;
    // Torus mode
    private useTorus: boolean = false;
    private torusMajor: number = 0; // major radius
    private torusTube: number = 0; // tube radius

    constructor(scene: BABYLON.Scene, canvas: HTMLCanvasElement, tunnelLength: number = 100, tunnelRadius: number = 25) {
        this.scene = scene;
        this.canvas = canvas;
        this.TUNNEL_HALF_LENGTH = tunnelLength / 2;
        this.TUNNEL_RADIUS = tunnelRadius;
        this.initializeCamera();
    }

    // Enable torus mode and specify torus radii (majorRadius, tubeRadius)
    public setTorusMode(majorRadius: number, tubeRadius: number): void {
        this.useTorus = true;
        this.torusMajor = majorRadius;
        this.torusTube = tubeRadius;
        // adjust some constraints for torus if needed
        this.setCameraConstraints();
    }

    private initializeCamera(): void {
        // Use a FlyCamera for smooth flying controls inside the torus by default
        const startPos = this.TUNNEL_CENTER.add(new BABYLON.Vector3(0, 0, 10));
        this.camera = new BABYLON.FlyCamera("Camera", startPos, this.scene);
        // FlyCamera inherits FreeCamera-like APIs; set a default target for orientation
                try { (this.camera as any).setTarget(this.TUNNEL_CENTER); } catch (e) { /* ignore if not available */ }
                (this.camera as any).speed = 4;
                (this.camera as any).inertia = 0.9;
                // WASD keys (W=87, S=83, A=65, D=68)
                try {
                        (this.camera as any).keysUp = [87];
                        (this.camera as any).keysDown = [83];
                        (this.camera as any).keysLeft = [65];
                        (this.camera as any).keysRight = [68];
                        // E (69) up, Q (81) down for vertical movement
                        (this.camera as any).keysUpward = [69];
                        (this.camera as any).keysDownward = [81];
                } catch (e) { /* ignore */ }

                // FlyCamera: configure roll correction and banked-turns for smoother flying
                try {
                    (this.camera as any).rollCorrect = 10; // faster roll correction (smaller = faster)
                    (this.camera as any).bankedTurn = true;
                    (this.camera as any).bankedTurnLimit = Math.PI / 2;
                    (this.camera as any).bankedTurnMultiplier = 1;
                } catch (e) { /* ignore if properties not present */ }

                // don't use gravity for the fly camera inside the tunnel
                (this.camera as any).applyGravity = false;
                (this.camera as any).checkCollisions = false;

                        // Attach control with any-cast to avoid typing mismatch
                        (this.camera as any).attachControl(this.canvas, true);

                        // Make this camera the active camera so input and controls route to it
                        try {
                            this.scene.activeCamera = this.camera as unknown as BABYLON.Camera;
                            (this.scene.activeCamera as any).attachControl(this.canvas, true);
                        } catch (e) { /* ignore if not available */ }

                this.setCameraConstraints();
    this.setupCameraBounds();
    }

    private setCameraConstraints(): void {
    // For FreeCamera, use speed and basic limits only
    this.camera.minZ = 0.1;
    this.camera.speed = 4;
    }

    private setupCameraBounds(): void {
        this.scene.registerBeforeRender(() => {
            if (!this.allowExitTunnel) {
                // Clamp camera.position inside cylinder tunnel bounds
                const pos = this.camera.position;
                const rel = pos.subtract(this.TUNNEL_CENTER);
                // clamp longitudinal (along Z)
                if (rel.z > this.TUNNEL_HALF_LENGTH - 1) rel.z = this.TUNNEL_HALF_LENGTH - 1;
                if (rel.z < -this.TUNNEL_HALF_LENGTH + 1) rel.z = -this.TUNNEL_HALF_LENGTH + 1;
                // clamp radial distance in X/Y plane (X is horizontal, Y is vertical)
                const radialLen = Math.sqrt(rel.x * rel.x + rel.y * rel.y);
                const maxRad = this.TUNNEL_RADIUS - 1;
                if (radialLen > maxRad) {
                    const scale = maxRad / radialLen;
                    rel.x *= scale;
                    rel.y *= scale;
                }
                const clampedPos = this.TUNNEL_CENTER.add(new BABYLON.Vector3(rel.x, rel.y, rel.z));
                this.camera.position.copyFrom(clampedPos);
            }
        });
    }

    // Start an automatic linear travel from one end of the tunnel to the other.
    // durationSeconds: how long the travel takes. detachControls: whether to disable user input while traveling.
    public startAutoTravel(durationSeconds: number = 20, detachControls: boolean = true): void {
        if (this.traveling) return;
        this.traveling = true;

        if (this.useTorus) {
            // Torus travel: animate normalized parameter u from 0..1
            let u = 0;
            const startTime = performance.now();
            const durationMs = Math.max(100, durationSeconds * 1000);

            if (detachControls) {
                try { this.camera.detachControl(); } catch (e) { /* ignore */ }
            }

            this.travelObserver = this.scene.onBeforeRenderObservable.add(() => {
                const now = performance.now();
                const t = Math.min(1, (now - startTime) / durationMs);
                u = t % 1;

                // compute torus centerline point (theta = u*2PI)
                const theta = u * Math.PI * 2;
                const R = this.torusMajor; // major radius
                const r = this.torusTube; // tube radius

                // centerline point (on circle in XZ plane)
                const cx = R * Math.cos(theta);
                const cz = R * Math.sin(theta);
                const centerline = new BABYLON.Vector3(cx, 0, cz);

                // tangent along centerline (derivative wrt theta)
                const tx = -R * Math.sin(theta);
                const tz = R * Math.cos(theta);
                const tangent = new BABYLON.Vector3(tx, 0, tz).normalize();

                // normal pointing outward from torus center
                const normal = new BABYLON.Vector3(Math.cos(theta), 0, Math.sin(theta)).normalize();

                // place camera deeper inside the tube toward inner wall so it reads as inside tunnel
                // increase offset so the camera sits well inside the opening
                const inwardOffset = normal.scale(-Math.max(0.1, r * 0.45));
                const camPos = centerline.add(inwardOffset);

                // compute a simple Frenet-like frame so the camera 'rolls' correctly along the curve
                // radial vector from centerline to camera (points inward)
                const radial = camPos.subtract(centerline).normalize();
                // binormal = tangent x radial (this will be roughly the local 'up' for the camera)
                const binormal = BABYLON.Vector3.Cross(tangent, radial).normalize();

                this.camera.upVector.copyFrom(binormal);
                this.camera.position.copyFrom(camPos);
                // aim forward from the camera position along the torus tangent so the view goes through the tube
                const lookAhead = Math.max(1.0, r * 0.6);
                this.camera.setTarget(camPos.add(tangent.scale(lookAhead)));

                if (t >= 1) {
                    this.stopAutoTravel(detachControls);
                }
            });
        } else {
            const fromZ = this.TUNNEL_CENTER.z - this.TUNNEL_HALF_LENGTH;
            const toZ = this.TUNNEL_CENTER.z + this.TUNNEL_HALF_LENGTH;

            // place camera at start
            this.camera.position.copyFrom(this.TUNNEL_CENTER);
            this.camera.position.z = fromZ;
            this.camera.setTarget(this.TUNNEL_CENTER);

            if (detachControls) {
                try { this.camera.detachControl(); } catch (e) { /* ignore */ }
            }

            const startTime = performance.now();
            const durationMs = Math.max(100, durationSeconds * 1000);

            this.travelObserver = this.scene.onBeforeRenderObservable.add(() => {
                const now = performance.now();
                const t = Math.min(1, (now - startTime) / durationMs);
                const z = fromZ + (toZ - fromZ) * t;
                this.camera.position.z = z;
                // keep aimed down tunnel center
                this.camera.setTarget(this.TUNNEL_CENTER);

                if (t >= 1) {
                    this.stopAutoTravel(detachControls);
                }
            });
        }
    }

    public stopAutoTravel(reattachControls: boolean = true): void {
        if (this.travelObserver) {
            this.scene.onBeforeRenderObservable.remove(this.travelObserver);
            this.travelObserver = undefined;
        }
        this.traveling = false;
        if (reattachControls) {
            try { this.camera.attachControl(); } catch (e) { /* ignore */ }
        }
    }

    // Allow or prevent the camera from moving out of the tunnel bounds
    public setAllowExitTunnel(enabled: boolean): void {
        this.allowExitTunnel = !!enabled;
    }

    public getAllowExitTunnel(): boolean {
        return this.allowExitTunnel;
    }

    public getCamera(): BABYLON.Camera {
    return this.camera as BABYLON.Camera;
    }

    public dispose(): void {
        this.camera.dispose();
    }

    public setTarget(target: BABYLON.Vector3): void {
        this.camera.setTarget(target);
    }

    public getPosition(): BABYLON.Vector3 {
        return this.camera.position;
    }
}