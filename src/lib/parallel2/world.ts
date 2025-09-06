import * as BABYLON from "@babylonjs/core";
import { WormholeShape } from './wormholeShape';
import type { WormholeShapeOptions } from './wormholeShape';

export interface WorldOptions {
  disableShadows?: boolean;
  wormhole?: WormholeShapeOptions;
}

export class World {
    private fogMode: number = BABYLON.Scene.FOGMODE_EXP;
    private shadowGenerator?: BABYLON.ShadowGenerator;
    private shadowsDisabled: boolean = false;
    private wormholeShape?: WormholeShape;
    private pathLine?: BABYLON.Mesh;
    private path3D?: BABYLON.Path3D;
    private sampledPathPoints?: BABYLON.Vector3[];

    constructor(private scene: BABYLON.Scene, options?: WorldOptions) {
        this.shadowsDisabled = !!options?.disableShadows;
        
        // Initialize wormhole shape with provided options or defaults
        this.wormholeShape = new WormholeShape(this.scene, {
            diameter: 100,
            thickness: 10,
            tessellation: 64,
            position: new BABYLON.Vector3(0, 0, 0),
            material: {
                diffuseColor: new BABYLON.Color3(0.02, 0.02, 0.04),
                emissiveColor: new BABYLON.Color3(0.01, 0.01, 0.03),
                wireframe: false,
                alpha: 1.0
            },
            ...options?.wormhole
        });
    }

    async initialize(): Promise<void> {
        // Initialize the wormhole shape first
        if (this.wormholeShape) {
            await this.wormholeShape.initialize();
            console.log("WormholeShape initialized");
        }

        // Setup additional features
        this.createPathLine();
        this.setupWireframeToggle();
        this.setupFog();
        // Initialize shadow generator with a default light unless disabled
        if (!this.shadowsDisabled) {
            const shadowLight = new BABYLON.DirectionalLight("shadowLight", new BABYLON.Vector3(-1, -2, -1), this.scene);
            shadowLight.intensity = 0.3;
            this.shadowGenerator = new BABYLON.ShadowGenerator(2048, shadowLight);
            this.shadowGenerator.useBlurExponentialShadowMap = true;
            this.shadowGenerator.blurKernel = 32;
        }
    }

    // Setup wireframe toggle (Q key to avoid conflict with WASD)
    private setupWireframeToggle(): void {
        this.scene.onKeyboardObservable.add((kb) => {
            if (kb.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
                const ev = kb.event as KeyboardEvent;
                if (ev.key.toLowerCase() === 'q' && this.wormholeShape) {
                    this.wormholeShape.toggleWireframe();
                    console.log('World: wormhole wireframe =', this.wormholeShape.isWireframe());
                }
            }
        });
    }

    // Create centerline path for drone navigation
    private createPathLine(): void {
        try {
            if (!this.wormholeShape) {
                console.warn("Cannot create path line: WormholeShape not initialized");
                return;
            }

            // Determine a sensible sampling resolution: match tubularSegments from the wormhole tessellation
            const tubularSegments = (this.wormholeShape?.getMesh() && this.wormholeShape?.getThickness()) ? (this.wormholeShape?.getMesh()!.getTotalVertices() / ((this.wormholeShape?.getThickness() ?? 1) * 1) | 0) : 256;
            const sampleCount = 256; // default fallback
            // Request path points from wormhole shape
            const pathPoints = this.wormholeShape.getPathPoints(sampleCount);

            // Create a Path3D for robust sampling (tangents, normals)
            this.path3D = new BABYLON.Path3D(pathPoints);

            // Use the world-space points returned by WormholeShape directly for sampling and visualization
            this.sampledPathPoints = pathPoints;
            this.pathLine = BABYLON.MeshBuilder.CreateLines('wormholePath', { points: this.sampledPathPoints, updatable: false }, this.scene) as unknown as BABYLON.Mesh;
            if (this.pathLine) {
                (this.pathLine as any).color = new BABYLON.Color3(0, 1, 0);
                this.pathLine.isPickable = false;
                this.pathLine.renderingGroupId = 1;
                this.pathLine.isVisible = false; // Start hidden
            }
            
            // Keyboard toggle (P) for convenience
            this.scene.onKeyboardObservable.add((kb) => {
                if (kb.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
                    const ev = kb.event as KeyboardEvent;
                    if (ev.key.toLowerCase() === 'p' && this.pathLine) {
                        this.pathLine.isVisible = !this.pathLine.isVisible;
                        console.log('World: wormhole path visibility =', this.pathLine.isVisible);
                    }
                }
            });
        } catch (e) {
            console.warn("Failed to create path line:", e);
        }
    }

    private setupFog(): void {
        this.scene.fogMode = this.fogMode;
        this.scene.fogColor = new BABYLON.Color3(0.9, 0.9, 0.85);
        this.scene.fogDensity = 0.0005;
        this.scene.fogStart = 20.0;
    }

    public getShadowGenerator(): BABYLON.ShadowGenerator | undefined {
        return this.shadowGenerator;
    }

    // Add method to add shadow casters
    public addShadowCaster(mesh: BABYLON.AbstractMesh | BABYLON.AbstractMesh[]): void {
        if (this.shadowsDisabled || !this.shadowGenerator) return;
        if (Array.isArray(mesh)) {
            mesh.forEach(m => this.shadowGenerator!.addShadowCaster(m));
        } else {
            this.shadowGenerator.addShadowCaster(mesh);
        }
    }

    public setFogDensity(density: number): void {
        this.scene.fogDensity = density;
    }

    public setFogColor(color: BABYLON.Color3): void {
        this.scene.fogColor = color;
    }

    // Expose torus geometry parameters for other systems
    public getMajorRadius(): number {
        return (this.wormholeShape?.getDiameter() ?? 100) / 2;
    }

    public getTubeRadius(): number {
        return (this.wormholeShape?.getThickness() ?? 10) / 2;
    }

    // Expose wormhole shape for direct access
    public getWormholeShape(): WormholeShape | undefined {
        return this.wormholeShape;
    }

    // Get the path points for drone navigation
    public getPathPoints(): BABYLON.Vector3[] {
        return this.wormholeShape?.getPathPoints(128) ?? [];
    }

    public getTorusMesh(): BABYLON.Mesh | undefined {
        return this.wormholeShape?.getMesh();
    }

    // Return the sampled (possibly offset) path points for agents like the Drone
    public getSampledPathPoints(): BABYLON.Vector3[] {
        return this.sampledPathPoints ?? this.getPathPoints();
    }

    // Expose Path3D for camera/drone sampling
    public getPath3D(): BABYLON.Path3D | undefined {
        return this.path3D;
    }

    // Allow toggling the centerline path from external code
    public togglePathVisibility(): void {
        if (this.pathLine) {
            this.pathLine.isVisible = !this.pathLine.isVisible;
        }
    }

    // Allow toggling wireframe from external code
    public toggleWireframe(): void {
        this.wormholeShape?.toggleWireframe();
    }

    public setWireframe(wireframe: boolean): void {
        this.wormholeShape?.setWireframe(wireframe);
    }

    public isWireframe(): boolean {
        return this.wormholeShape?.isWireframe() ?? false;
    }

    public dispose(): void {
        // Dispose the wormhole shape
        this.wormholeShape?.dispose();
        this.wormholeShape = undefined;
        
        // Dispose the path line
        if (this.pathLine) {
            this.pathLine.dispose();
            this.pathLine = undefined;
        }
    }
}