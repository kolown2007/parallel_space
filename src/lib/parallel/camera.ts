import * as BABYLON from "@babylonjs/core";

export class SceneCamera {
    private camera!: BABYLON.ArcRotateCamera;
    private scene: BABYLON.Scene;
    private canvas: HTMLCanvasElement;
    private readonly GROUND_SIZE = 50;

    constructor(scene: BABYLON.Scene, canvas: HTMLCanvasElement) {
        this.scene = scene;
        this.canvas = canvas;
        this.initializeCamera();
    }

    private initializeCamera(): void {
        this.camera = new BABYLON.ArcRotateCamera(
            "Camera",
            Math.PI / 2,
            Math.PI / 2,
            2,
            new BABYLON.Vector3(24, 2, 12),
            this.scene
        );

        this.camera.setTarget(BABYLON.Vector3.Zero());
        this.camera.attachControl(this.canvas, true);

        this.setCameraConstraints();
        this.setupCameraBounds();
    }

    private setCameraConstraints(): void {
        this.camera.lowerBetaLimit = 0.1;
        this.camera.upperBetaLimit = Math.PI / 2;
        this.camera.lowerRadiusLimit = 5;
        this.camera.upperRadiusLimit = 50;
        this.camera.panningSensibility = 50;
        this.camera.allowUpsideDown = false;
    }

    private setupCameraBounds(): void {
        this.scene.registerBeforeRender(() => {
            const maxBounds = this.GROUND_SIZE - 5;
            if (this.camera.target.x > maxBounds) this.camera.target.x = maxBounds;
            if (this.camera.target.x < -maxBounds) this.camera.target.x = -maxBounds;
            if (this.camera.target.z > maxBounds) this.camera.target.z = maxBounds;
            if (this.camera.target.z < -maxBounds) this.camera.target.z = -maxBounds;
        });
    }

    public getCamera(): BABYLON.ArcRotateCamera {
        return this.camera;
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