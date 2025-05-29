import * as BABYLON from "@babylonjs/core";

export class SceneLighting {
    private scene: BABYLON.Scene;
    private hemisphericLight!: BABYLON.HemisphericLight;
    private directionalLight!: BABYLON.DirectionalLight;
    private shadowGenerator!: BABYLON.ShadowGenerator;

    constructor(scene: BABYLON.Scene) {
        this.scene = scene;
        this.initializeLights();
        this.setupShadows();
    }

    private initializeLights(): void {
        // Hemispheric light
        this.hemisphericLight = new BABYLON.HemisphericLight(
            "hemispheric",
            new BABYLON.Vector3(0, 1, 0),
            this.scene
        );
        this.hemisphericLight.intensity = 0.5;

        // Directional light
        this.directionalLight = new BABYLON.DirectionalLight(
            "directional",
            new BABYLON.Vector3(-0.5, -0.2, -0.5),
            this.scene
        );
        this.directionalLight.intensity = 0.2;
        this.directionalLight.position = new BABYLON.Vector3(3, 6, 4);
    }

    private setupShadows(): void {
        this.shadowGenerator = new BABYLON.ShadowGenerator(1024, this.directionalLight);
        this.shadowGenerator.useBlurExponentialShadowMap = true;
        this.shadowGenerator.blurKernel = 32;
    }

    public getShadowGenerator(): BABYLON.ShadowGenerator {
        return this.shadowGenerator;
    }

    public addShadowCaster(mesh: BABYLON.AbstractMesh): void {
        this.shadowGenerator.addShadowCaster(mesh);
    }

    public dispose(): void {
        this.hemisphericLight.dispose();
        this.directionalLight.dispose();
        this.shadowGenerator.dispose();
    }
}