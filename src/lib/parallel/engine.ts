import * as BABYLON from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";

export class BabylonEngine {
    private canvas: HTMLCanvasElement;
    private engine!: BABYLON.Engine | BABYLON.WebGPUEngine;
    private scene!: BABYLON.Scene;
    private havokPlugin!: BABYLON.HavokPlugin;
    private lastFrameTime: number = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    async initialize(): Promise<BABYLON.Scene> {
        try {
            // Try WebGPU first
            if (await BABYLON.WebGPUEngine.IsSupportedAsync) {
                this.engine = new BABYLON.WebGPUEngine(this.canvas);
                await (this.engine as BABYLON.WebGPUEngine).initAsync();
            } else {
                // Fallback to WebGL
                this.engine = new BABYLON.Engine(this.canvas, true);
            }

            this.scene = new BABYLON.Scene(this.engine);
            await this.initializePhysics();
            
            window.addEventListener("resize", this.onResize.bind(this));
            
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
            this.scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), this.havokPlugin);
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
            
            if (deltaTime > 16.7) { // More than 60 FPS
                // console.warn(`Frame time: ${deltaTime.toFixed(2)}ms`);
            }
        });
    }

    private onResize(): void {
        this.engine.resize();
    }

    dispose(): void {
        window.removeEventListener("resize", this.onResize.bind(this));
        this.scene?.dispose();
        this.engine?.dispose();
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
}