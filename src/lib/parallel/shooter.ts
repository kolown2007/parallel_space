import * as BABYLON from "@babylonjs/core";
import { SceneLighting } from "./lights";

export class BallShooter {
    private scene: BABYLON.Scene;
    private camera: BABYLON.Camera;
    private lighting: SceneLighting;
    private balls: BABYLON.AbstractMesh[] = [];
    private static MAX_DISTANCE = 10;

    constructor(scene: BABYLON.Scene, camera: BABYLON.Camera, lighting: SceneLighting) {
        this.scene = scene;
        this.camera = camera;
        this.lighting = lighting;
        this.initializeShooter();
    }

    private initializeShooter(): void {
        this.scene.onPointerDown = (evt) => this.shootBall();
    }

    private shootBall(): void {
        // Create a ball at camera position
        const ball = BABYLON.MeshBuilder.CreateSphere(
            "shootingBall", 
            { diameter: 0.5 }, 
            this.scene
        );
        ball.position = this.camera.position.clone();

        // Get picking ray from camera to pointer position
        const ray = this.scene.createPickingRay(
            this.scene.pointerX,
            this.scene.pointerY,
            BABYLON.Matrix.Identity(),
            this.camera
        );

        // Calculate direction and normalize
        const direction = ray.direction.normalize();
        
        // Add physics to the ball
        const ballPhysics = new BABYLON.PhysicsAggregate(
            ball, 
            BABYLON.PhysicsShapeType.SPHERE, 
            { 
                mass: 0.9, 
                restitution: 0.5, 
                friction: 1 
            }, 
            this.scene
        );

        // Apply shooting force
        ballPhysics.body.applyImpulse(
            direction.scale(50), 
            ball.getAbsolutePosition()
        );

        // Add shadow casting
        this.lighting.addShadowCaster(ball);

        // shadowGenerator.addShadowCaster(ball);
    }

    public dispose(): void {
        // Remove event listener
        this.scene.onPointerDown = undefined;

        // Dispose all balls and their physics
        this.balls.forEach(ball => {
            if (ball.physicsImpostor) {
                ball.physicsImpostor.dispose();
            }
            ball.dispose();
        });
        
        // Clear array
        this.balls = [];
    }

   
}