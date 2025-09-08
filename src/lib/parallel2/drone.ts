import * as BABYLON from '@babylonjs/core';
import { World } from './world';
import { createDroneMesh, samplePathAt as helperSamplePathAt, computeThirdPersonCamera } from './droneHelpers';

export class Drone {
  private scene: BABYLON.Scene;
  private sphere!: BABYLON.Mesh;
  private camera: BABYLON.Camera;
  private world: World;
  private torusR: number; // major radius (derived from world)
  private torusr: number; // tube radius (derived from world)
  
  // Drone orbit parameters
  private angle: number = 0; // current angle around torus major circle
  private height: number = 0; // height within tube (v parameter)
  private radius: number = 0; // distance from tube center (rho parameter)
  private speed: number = 0.00001; // very slow rotation speed around torus (reduced)
  private isActive: boolean = false;
  private pathLine?: BABYLON.Mesh; // reference to the green path visualization
  // manual offset applied by brief user input (WASD nudges)
  private manualOffset: BABYLON.Vector3 = BABYLON.Vector3.Zero();
  private manualOffsetTimer: number = 0; // ms remaining for hold

  constructor(scene: BABYLON.Scene, camera: BABYLON.Camera, world: World) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    // derive radii from world
    this.torusR = this.world.getMajorRadius();
    this.torusr = this.world.getTubeRadius();
    
    console.log('Drone constructor - Torus Major R:', this.torusR, 'Tube r:', this.torusr);
    try {
      this.createDroneSphere();
    } catch (e) {
      console.error('Drone.createDroneSphere failed, falling back to sphere:', e);
      // try fallback creation to avoid breaking scene init
      try {
        // Create a safer fallback small sphere
        this.sphere = BABYLON.MeshBuilder.CreateSphere('drone_fallback', { diameter: 1.0, segments: 8 }, this.scene);
        const fallbackMat = new BABYLON.StandardMaterial('droneFallbackMat', this.scene);
        fallbackMat.emissiveColor = new BABYLON.Color3(1, 0, 0);
        this.sphere.material = fallbackMat;
      } catch (e2) {
        console.error('Fallback sphere creation also failed:', e2);
      }
    }
  this.setupCameraAttachment();
  this.setupAnimation();
  }
  private createDroneSphere(): void {
  // Use helper to create compact drone mesh
  this.sphere = createDroneMesh(this.scene);
  this.angle = 0;
  this.updateDronePosition();
  console.log('Drone mesh created (helper) and positioned on path');
  }

  

  // (detail rings and flashlight were removed to simplify the Drone visual)

  private setupCameraAttachment(): void {
    // Third-person camera: prefer using Path3D tangent & normal frames when available
    this.scene.registerBeforeRender(() => {
      if (this.isActive && this.sphere) {
        const dronePos = this.sphere.position;
      const tNorm = (this.angle % (Math.PI * 2)) / (Math.PI * 2);
      const sample = helperSamplePathAt(this.world, tNorm);

        // Compute right vector and refined up for camera framing
        const forward = sample.forward;
        const up = sample.up;
        const right = BABYLON.Vector3.Cross(forward, up).normalize();
        const realUp = BABYLON.Vector3.Cross(right, forward).normalize();

        // Position camera behind and above the drone (video game style)
        const cameraDistance = 5; // distance behind drone
        const cameraHeight = -1;   // height above drone

        const cameraPos = dronePos
          .subtract(forward.scale(cameraDistance))  // behind the drone
          .add(realUp.scale(cameraHeight));         // above the drone

        // Only update the attached camera if it is the same instance passed to this Drone.
        // This prevents overwriting user input when a different camera is active.
        try {
          if (this.camera && this.scene.activeCamera === this.camera) {
            // debug log occasionally to verify we are driving camera here
            if (Math.floor(this.angle * 20) % 200 === 0) {
              console.log('Drone driving attached camera position');
            }
            this.camera.position.copyFrom(cameraPos);
          }
        } catch (e) { /* ignore frame errors */ }

        // Look ahead along forward direction
        const lookAheadDistance = 8;
        const lookTarget = dronePos.add(forward.scale(lookAheadDistance));
        if (this.camera && this.scene.activeCamera === this.camera) {
          if ((this.camera as BABYLON.FreeCamera).setTarget) {
            (this.camera as BABYLON.FreeCamera).setTarget(lookTarget);
          }
        }

        // Update flashlight direction so it always points forward from the drone
        try {
          const flashLight = (this as any)._flashlight as BABYLON.SpotLight | undefined;
          if (flashLight) {
            flashLight.direction.copyFrom(forward);
            flashLight.position.copyFrom(this.sphere.position.add(forward.scale(0.6)));
          }
        } catch (e) { /* ignore */ }
      }
    });
  }

  // Expose simple flashlight controls
  public enableFlashlight(enabled: boolean): void {
    const flash = (this as any)._flashlight as BABYLON.SpotLight | undefined;
    if (!flash) return;
    flash.setEnabled(enabled);
    // reduce ambient leak when disabled
  flash.intensity = enabled ? 0.6 : 0.0;
  }

  private updateDronePosition(): void {
    // Prefer Path3D for smooth sampling (position + tangent)
  const tNorm = (this.angle % (Math.PI * 2)) / (Math.PI * 2);
  const sample = helperSamplePathAt(this.world, tNorm);
  // Apply any temporary manual offset (nudges) before setting world position
  const posWithOffset = sample.pos.add(this.manualOffset);
  this.sphere.position.copyFrom(posWithOffset);
  if (sample.forward.length() > 0) this.sphere.lookAt(this.sphere.position.add(sample.forward));
  }

  private setupAnimation(): void {
    // ENABLED - drone will move along the green path line
    this.scene.registerBeforeRender(() => {
      if (this.isActive) {
        // Move drone around the circular path at the same radius as green line
        this.angle += this.speed;
        if (this.angle > Math.PI * 2) {
          this.angle -= Math.PI * 2;
        }
        
        // Update manual offset timer and decay when expired
        try {
          const dt = this.scene.getEngine().getDeltaTime(); // ms
          if (this.manualOffsetTimer > 0) {
            this.manualOffsetTimer = Math.max(0, this.manualOffsetTimer - dt);
          } else {
            // decay the manualOffset smoothly back to zero
            // lerp factor based on dt (fade out over ~400ms)
            const fadeMs = 400;
            const t = Math.min(1, dt / Math.max(1, fadeMs));
            this.manualOffset = BABYLON.Vector3.Lerp(this.manualOffset, BABYLON.Vector3.Zero(), t);
            // tiny snap to zero to avoid lingering float noise
            if (this.manualOffset.lengthSquared() < 1e-4) this.manualOffset.set(0,0,0);
          }

        } catch (e) { /* ignore */ }

        this.updateDronePosition();
        
        // Log position every few seconds for debugging
        if (Math.floor(this.angle * 20) % 100 === 0) {
          const pos = this.sphere.position;
          const distFromOrigin = Math.sqrt(pos.x*pos.x + pos.z*pos.z);
          console.log(`Drone moving: distance from origin=${distFromOrigin.toFixed(1)} (should be ~${this.torusR})`);
          console.log('Drone should be following the green path line');
        }
      }
    });
    console.log('Animation enabled - drone will orbit along green path');
  }

  /**
   * Apply a brief manual nudge offset to the drone's position. The offset is applied
   * immediately and held for durationMs milliseconds, then decays smoothly back to the path.
   */
  public nudge(offset: BABYLON.Vector3, durationMs: number = 400): void {
    try {
      this.manualOffset = offset.clone();
      this.manualOffsetTimer = Math.max(0, durationMs);
    } catch (e) { /* ignore */ }
  }

  public start(): void {
    this.isActive = true;
    console.log('Drone started orbiting torus');
  }

  public stop(): void {
    this.isActive = false;
    console.log('Drone stopped');
  }

  public setSpeed(speed: number): void {
    this.speed = speed;
  }

  public getSpeed(): number {
    return this.speed;
  }

  public getDronePosition(): BABYLON.Vector3 {
    return this.sphere.position.clone();
  }

  // Return the forward (tangent) vector based on current angle along the major circle
  public getForwardVector(): BABYLON.Vector3 {
    // Prefer path-derived tangents when available so camera and drone use the same frame
    try {
      const path3D = this.world.getPath3D();
      if (path3D) {
        const points = path3D.getPoints();
        const tangents = path3D.getTangents();
        if (points.length > 0 && tangents && tangents.length > 0) {
          const tNorm = (this.angle % (Math.PI * 2)) / (Math.PI * 2);
          const floatIndex = tNorm * (points.length - 1);
          const i0 = Math.floor(floatIndex);
          const i1 = (i0 + 1) % points.length;
          const localT = floatIndex - i0;
          const t0 = tangents[i0] || BABYLON.Vector3.Forward();
          const t1 = tangents[i1] || BABYLON.Vector3.Forward();
          return BABYLON.Vector3.Lerp(t0, t1, localT).normalize();
        }
      }
    } catch (e) {
      // fall back to parametric forward if path sampling fails
    }

    // Fallback: approximate forward using major-circle parametric derivative
    const x = this.torusR * Math.cos(this.angle);
    const z = this.torusR * Math.sin(this.angle);
    const nextAngle = this.angle + 0.01;
    const nextX = this.torusR * Math.cos(nextAngle);
    const nextZ = this.torusR * Math.sin(nextAngle);
    const forward = new BABYLON.Vector3(nextX - x, 0, nextZ - z).normalize();
    return forward;
  }

  /**
   * Compute a third-person camera transform (position + look target) relative to the drone.
   * shoulderOffset: lateral offset to the right (positive) or left (negative).
   */
  public getThirdPersonCamera(shoulderOffset: number = 0.4): { position: BABYLON.Vector3; target: BABYLON.Vector3 } {
    const dronePos = this.getDronePosition();

    // forward direction from drone
    const forward = this.getForwardVector();

    // Try to get a sensible up vector from the world Path3D normals if available
    let up = new BABYLON.Vector3(0, 1, 0);
    try {
      const path3D = this.world.getPath3D();
      if (path3D) {
        const points = path3D.getPoints();
        const normals = path3D.getNormals();
        if (points.length > 0 && normals && normals.length > 0) {
          const tNorm = (this.angle % (Math.PI * 2)) / (Math.PI * 2);
          const floatIndex = tNorm * (points.length - 1);
          const i0 = Math.floor(floatIndex);
          const i1 = (i0 + 1) % points.length;
          const localT = floatIndex - i0;
          const n0 = normals[i0] || BABYLON.Vector3.Up();
          const n1 = normals[i1] || BABYLON.Vector3.Up();
          up = BABYLON.Vector3.Lerp(n0, n1, localT).normalize();
        }
      }
    } catch (e) {
      // fallback to world up
      up = new BABYLON.Vector3(0, 1, 0);
    }

    // Compute right and a refined up to keep camera stable
    const right = BABYLON.Vector3.Cross(forward, up).normalize();
    const realUp = BABYLON.Vector3.Cross(right, forward).normalize();

    const cameraDistance = 2; // behind/ahead distance
    const cameraHeight = 1.2;

    // position slightly ahead of drone (so camera is in front) then move up and to the right
    const camPos = dronePos
      .add(forward.scale(cameraDistance))
      .add(realUp.scale(cameraHeight))
      .add(right.scale(shoulderOffset));

    const lookTarget = dronePos.add(forward.scale(10));

    return { position: camPos, target: lookTarget };
  }

  // Sample path position, forward tangent and up-normal at normalized t (0..1)
  private samplePathAt(tNorm: number): { pos: BABYLON.Vector3; forward: BABYLON.Vector3; up: BABYLON.Vector3 } {
    // Prefer Path3D sampling
    try {
      const path3D = this.world.getPath3D();
      if (path3D) {
        const points = path3D.getPoints();
        const tangents = path3D.getTangents();
        const normals = path3D.getNormals();
        if (points.length === 0) return { pos: BABYLON.Vector3.Zero(), forward: BABYLON.Vector3.Forward(), up: BABYLON.Vector3.Up() };

        const floatIndex = tNorm * (points.length - 1);
        const i0 = Math.floor(floatIndex);
        const i1 = (i0 + 1) % points.length;
        const localT = floatIndex - i0;

        const p0 = points[i0];
        const p1 = points[i1];
        const pos = BABYLON.Vector3.Lerp(p0, p1, localT);

        let forward = BABYLON.Vector3.Forward();
        if (tangents && tangents.length > 0) {
          const t0 = tangents[i0] || BABYLON.Vector3.Zero();
          const t1 = tangents[i1] || BABYLON.Vector3.Zero();
          forward = BABYLON.Vector3.Lerp(t0, t1, localT).normalize();
        }

        let up = BABYLON.Vector3.Up();
        if (normals && normals.length > 0) {
          const n0 = normals[i0] || BABYLON.Vector3.Up();
          const n1 = normals[i1] || BABYLON.Vector3.Up();
          up = BABYLON.Vector3.Lerp(n0, n1, localT).normalize();
        }

        return { pos, forward, up };
      }
    } catch (e) {
      // fall through to sampled points fallback
    }

    // Fallback to sampledPathPoints
    try {
      const pathPoints = this.world.getSampledPathPoints();
      if (pathPoints.length === 0) return { pos: BABYLON.Vector3.Zero(), forward: BABYLON.Vector3.Forward(), up: BABYLON.Vector3.Up() };
      const floatIndex = tNorm * (pathPoints.length - 1);
      const i0 = Math.floor(floatIndex);
      const i1 = (i0 + 1) % pathPoints.length;
      const localT = floatIndex - i0;
      const p0 = pathPoints[i0];
      const p1 = pathPoints[i1];
      const pos = BABYLON.Vector3.Lerp(p0, p1, localT);
      const forward = p1.subtract(p0).normalize();
      return { pos, forward, up: BABYLON.Vector3.Up() };
    } catch (e) {
      return { pos: BABYLON.Vector3.Zero(), forward: BABYLON.Vector3.Forward(), up: BABYLON.Vector3.Up() };
    }
  }

  public dispose(): void {
    this.stop();
    if (this.sphere) {
      this.sphere.dispose();
    }
    // Reset camera to free movement
    if (this.camera.parent) {
      this.camera.parent = null;
    }
    // Reset camera position and controls
    this.camera.position = new BABYLON.Vector3(0, 5, -10);
    if ((this.camera as BABYLON.FreeCamera).setTarget) {
      (this.camera as BABYLON.FreeCamera).setTarget(new BABYLON.Vector3(0, 0, 0));
    }
  }

  // Allow external code to show/hide the visual drone mesh (useful for drone POV modes)
  public setVisible(visible: boolean): void {
    try {
      if (this.sphere) {
        this.sphere.isVisible = !!visible;
      }
    } catch (e) { /* ignore */ }
  }

  public isVisible(): boolean {
    try {
      return !!(this.sphere && this.sphere.isVisible);
    } catch (e) { return false; }
  }
}
