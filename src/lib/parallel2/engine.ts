import * as BABYLON from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";

export class BabylonEngine {
    private canvas: HTMLCanvasElement;
    private preferWebGL: boolean = true;
    private engine!: BABYLON.Engine | BABYLON.WebGPUEngine;
    private scene!: BABYLON.Scene;
    private havokPlugin!: BABYLON.HavokPlugin;
    private lastFrameTime: number = 0;
    private fpsOverlay?: HTMLDivElement;
    private fpsVisible: boolean = false;
    private fpsHistory: number[] = [];
    private lastAdaptiveCheck: number = 0;
    private hardwareScaling: number = 1;
    private resizeHandler?: () => void;
    private fpsToggleHandler?: (ev: KeyboardEvent) => void;
    private profilerEnabled: boolean = false;
    private profilerHandler?: (ev: KeyboardEvent) => void;
    private profilerInterval?: number;

    // options.preferWebGL = true will force WebGL mode even if WebGPU is available
    constructor(canvas: HTMLCanvasElement, options?: { preferWebGL?: boolean }) {
        this.canvas = canvas;
        if (options && typeof options.preferWebGL === 'boolean') this.preferWebGL = options.preferWebGL;
    }

    
    public stopRenderLoop(): void {
        this.engine?.stopRenderLoop();
    }

    async initialize(): Promise<BABYLON.Scene> {
        try {
            // Prefer WebGL by default for stability and wider compatibility.
            // If preferWebGL is false, try WebGPU first (except on Windows where it is avoided).
            const isWindows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent || '');
            if (!this.preferWebGL) {
                if (!isWindows && await BABYLON.WebGPUEngine.IsSupportedAsync) {
                    try {
                        this.engine = new BABYLON.WebGPUEngine(this.canvas);
                        await (this.engine as BABYLON.WebGPUEngine).initAsync();
                    } catch (e) {
                        console.warn('WebGPU initialization failed, falling back to WebGL:', e);
                        this.engine = new BABYLON.Engine(this.canvas, true);
                    }
                } else {
                    // Fallback to WebGL (or prefer on Windows)
                    this.engine = new BABYLON.Engine(this.canvas, true);
                }
            } else {
                // Force WebGL mode
                this.engine = new BABYLON.Engine(this.canvas, true);
            }

            this.scene = new BABYLON.Scene(this.engine);
            await this.initializePhysics();
            // create FPS overlay but keep it hidden; toggle with plain 'f'
            this.createFpsOverlay();
            // Toggle FPS overlay on plain 'f' (no modifier). Keep handler lightweight.
            this.fpsToggleHandler = (ev: KeyboardEvent) => {
                try {
                    if ((ev.key || '').toLowerCase() === 'f') {
                        this.toggleFpsOverlay();
                    }
                } catch (e) { /* ignore */ }
            };
            window.addEventListener('keydown', this.fpsToggleHandler);
            // profiler toggle (press 'p')
            this.profilerHandler = (ev: KeyboardEvent) => {
                if (ev.key === 'p') this.toggleProfiler();
            };
            window.addEventListener('keydown', this.profilerHandler);
            // force lower rendering resolution to improve FPS on slower GPUs
            try {
                const dpr = window.devicePixelRatio || 1;
                // Use full-resolution rendering by default to avoid pixelation.
                // Increase hardware scaling only on very high-DPR devices to limit VRAM usage.
                this.hardwareScaling = 1; // 1 = full resolution
                if (dpr >= 3) {
                    // on extremely high DPR devices, scale down modestly
                    this.hardwareScaling = Math.min(2, Math.round(dpr / 2));
                }
                this.engine.setHardwareScalingLevel(this.hardwareScaling);
                console.info(`Hardware scaling=${this.hardwareScaling} (devicePixelRatio=${dpr})`);
            } catch (e) {
                // ignore if engine doesn't implement setHardwareScalingLevel
            }
            
            this.resizeHandler = this.onResize.bind(this);
            window.addEventListener("resize", this.resizeHandler);
            
            return this.scene;
        } catch (error) {
            console.error("Engine initialization failed:", error);
            throw error;
        }
    }

    private async initializePhysics(): Promise<void> {
        try {
            const havokInstance = await HavokPhysics({
                locateFile: () => "/HavokPhysics.wasm"
            });
            this.havokPlugin = new BABYLON.HavokPlugin(true, havokInstance);
            this.scene.enablePhysics(new BABYLON.Vector3(0, 0, 0), this.havokPlugin);
        } catch (error) {
            console.error("Physics initialization failed:", error);
            throw error;
        }
    }

    public startRenderLoop(): void {
        this.engine.runRenderLoop(() => {
            const currentTime = performance.now();
            const deltaTime = currentTime - this.lastFrameTime;
            this.lastFrameTime = currentTime;

            this.scene.render();
            // update FPS overlay if visible
            if (this.fpsVisible && this.fpsOverlay) {
                const fps = this.getCurrentFPS();
                this.fpsOverlay.textContent = `${fps.toFixed(1)} fps`;
            }

            // collect fps history for adaptive scaling (~1s window)
            const fpsNow = this.getCurrentFPS();
            this.fpsHistory.push(fpsNow);
            const t = performance.now();
            if (t - this.lastAdaptiveCheck > 1000) {
                this.lastAdaptiveCheck = t;
                // compute average fps
                const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
                const avg = this.fpsHistory.length ? sum / this.fpsHistory.length : fpsNow;
                this.fpsHistory.length = 0;
                // simple adaptive rules
                try {
                    if (avg < 25 && (this.hardwareScaling < 4)) {
                        this.hardwareScaling = Math.min(4, this.hardwareScaling + 0.5);
                        this.engine.setHardwareScalingLevel(this.hardwareScaling);
                        console.info(`Adaptive scaling increased to ${this.hardwareScaling} (avg fps ${avg.toFixed(1)})`);
                    } else if (avg > 50 && this.hardwareScaling > 1) {
                        this.hardwareScaling = Math.max(1, this.hardwareScaling - 0.5);
                        this.engine.setHardwareScalingLevel(this.hardwareScaling);
                        console.info(`Adaptive scaling decreased to ${this.hardwareScaling} (avg fps ${avg.toFixed(1)})`);
                    }
                } catch (e) {
                    // ignore if not supported
                }
            }
        });
    }

    private onResize(): void {
        this.engine.resize();
    }

    dispose(): void {
        // stop rendering and remove global listeners
        this.stopRenderLoop();
        if (this.resizeHandler) window.removeEventListener("resize", this.resizeHandler);
        if (this.fpsToggleHandler) window.removeEventListener('keydown', this.fpsToggleHandler);
    if (this.profilerHandler) window.removeEventListener('keydown', this.profilerHandler);
        // remove FPS overlay from DOM
        if (this.fpsOverlay && this.fpsOverlay.parentElement) {
            this.fpsOverlay.parentElement.removeChild(this.fpsOverlay);
            this.fpsOverlay = undefined;
        }
        this.scene?.dispose();
        this.engine?.dispose();
    }

    private toggleProfiler(): void {
        this.profilerEnabled = !this.profilerEnabled;
        console.log(`Profiler ${this.profilerEnabled ? 'enabled' : 'disabled'}`);
        if (this.profilerEnabled) {
            // poll every 2s
            this.profilerInterval = window.setInterval(() => {
                try {
                    const activeMeshes = this.scene.getActiveMeshes().length;
                    const totalMeshes = this.scene.meshes.length;
                    // estimate vertices
                    let totalVertices = 0;
                    for (const m of this.scene.meshes) {
                        const geom: any = (m as any).geometry;
                        if (geom && geom.getTotalVertices) {
                            totalVertices += geom.getTotalVertices();
                        } else if ((m as any).getTotalVertices) {
                            totalVertices += (m as any).getTotalVertices();
                        }
                    }
                    const drawCalls = (this.engine as any).drawCalls || (this.engine as any).getDrawCalls?.() || 0;
                    console.log(`Profiler: activeMeshes=${activeMeshes}, totalMeshes=${totalMeshes}, totalVertices≈${totalVertices}, drawCalls≈${drawCalls}, physicsBodies=${this.scene.getPhysicsEngine() ? (this.scene.getPhysicsEngine() as any)._numActiveBodies || 'unknown' : 'n/a'}`);
                } catch (e) {
                    console.warn('Profiler read failed', e);
                }
            }, 2000) as unknown as number;
        } else {
            if (this.profilerInterval) {
                clearInterval(this.profilerInterval);
                this.profilerInterval = undefined;
            }
        }
    }

    getScene(): BABYLON.Scene {
        return this.scene;
    }

    getHavokPlugin(): BABYLON.HavokPlugin {
        return this.havokPlugin;
    }

    public getCurrentFPS(): number {
        return this.engine.getFps();
    }

    private createFpsOverlay(): void {
        try {
            this.fpsOverlay = document.createElement('div');
            Object.assign(this.fpsOverlay.style, {
                position: 'fixed',
                right: '10px',
                top: '10px',
                padding: '6px 8px',
                background: 'rgba(0,0,0,0.6)',
                color: '#0f0',
                fontFamily: 'monospace',
                fontSize: '13px',
                zIndex: '9999',
                borderRadius: '4px',
                pointerEvents: 'none'
            });
            this.fpsOverlay.textContent = '';
            document.body.appendChild(this.fpsOverlay);
            this.fpsOverlay.style.display = 'none';
            this.fpsVisible = false;
        } catch (e) {
            // ignore DOM errors (e.g., not running in browser)
            this.fpsOverlay = undefined;
            this.fpsVisible = false;
        }
    }

    public toggleFpsOverlay(): void {
        if (!this.fpsOverlay) return;
        this.fpsVisible = !this.fpsVisible;
        this.fpsOverlay.style.display = this.fpsVisible ? 'block' : 'none';
        console.log(`FPS overlay ${this.fpsVisible ? 'shown' : 'hidden'}`);
    }
}