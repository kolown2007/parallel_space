import * as BABYLON from "@babylonjs/core";
import { SkyMaterial } from "@babylonjs/materials/sky";

export class World {
    private skyBox!: BABYLON.Mesh;
    private ground!: BABYLON.Mesh;
    private skyMaterial!: SkyMaterial;
    private fogMode: number = BABYLON.Scene.FOGMODE_EXP;
    private shadowGenerator!: BABYLON.ShadowGenerator;

    constructor(private scene: BABYLON.Scene) {
    }

    async initialize(): Promise<void> {
        await Promise.all([
            this.createSkybox(),
            this.createGround()
        ]);
        this.setupFog();
        // Initialize shadow generator with a default light
        const shadowLight = new BABYLON.DirectionalLight("shadowLight", new BABYLON.Vector3(-1, -2, -1), this.scene);
        shadowLight.intensity = 0.3;
        this.shadowGenerator = new BABYLON.ShadowGenerator(2048, shadowLight);
        this.shadowGenerator.useBlurExponentialShadowMap = true;
        this.shadowGenerator.blurKernel = 32;
        this.ground.receiveShadows = true;
    }

    private createSkybox(): void {
        this.skyBox = BABYLON.Mesh.CreateBox(
            'SkyBox',
            1000,
            this.scene,
            false,
            BABYLON.Mesh.BACKSIDE
        );
        
        this.skyMaterial = new SkyMaterial('sky', this.scene);
        this.skyMaterial.inclination = -0.35;
        this.skyMaterial.luminance = 0.1;
        this.skyMaterial.turbidity = 10;
        this.skyBox.material = this.skyMaterial;
    }

    private createGround(): void {
        this.ground = BABYLON.MeshBuilder.CreateGround("ground", {
            width: 500,
            height: 500
        }, this.scene);
        this.ground.position.y = -5.0;

        // Add physics to ground
        new BABYLON.PhysicsAggregate(
            this.ground,
            BABYLON.PhysicsShapeType.BOX,
            { mass: 0 },
            this.scene
        );
    }

    private setupFog(): void {
        this.scene.fogMode = this.fogMode;
        this.scene.fogColor = new BABYLON.Color3(0.9, 0.9, 0.85);
        this.scene.fogDensity = 0.005;
        this.scene.fogStart = 20.0;
        
        // Adjust skybox and ground materials for fog
        this.skyMaterial.fogEnabled = true;
        this.ground.material = new BABYLON.StandardMaterial("groundMat", this.scene);
        (this.ground.material as BABYLON.StandardMaterial).fogEnabled = true;
    }

    private setupShadows(light: BABYLON.DirectionalLight): void {
        this.shadowGenerator = new BABYLON.ShadowGenerator(1024, light);
        this.shadowGenerator.useBlurExponentialShadowMap = true;
        this.shadowGenerator.blurKernel = 32;
        this.ground.receiveShadows = true;
    }

    public getShadowGenerator(): BABYLON.ShadowGenerator {
        return this.shadowGenerator;
    }

    // Add method to add shadow casters
    public addShadowCaster(mesh: BABYLON.AbstractMesh | BABYLON.AbstractMesh[]): void {
        if (Array.isArray(mesh)) {
            mesh.forEach(m => this.shadowGenerator.addShadowCaster(m));
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

    public setShadowReceiver(): void {
        this.ground.receiveShadows = true;
    }

    public getGround(): BABYLON.Mesh {
        return this.ground;
    }

    public dispose(): void {
        this.skyBox.dispose();
        this.ground.dispose();
        this.skyMaterial.dispose();
        if (this.ground.material) {
            this.ground.material.dispose();
        }
    }
}