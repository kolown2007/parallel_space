import { KolownScene } from '@kolown/scene-manager';
import * as BABYLON from '@babylonjs/core';
import { Scene, Vector3 } from '@babylonjs/core';
import { BabylonEngine } from './engine';
import { SceneCamera } from './camera';
import { World } from './world';
import { SceneLighting } from './lights';
import { AssetManager} from './assets';
import { BallShooter } from './shooter';
import { ObstacleManager } from './obstacle';
import { Drone } from './drone';
import { computeThirdPersonCamera } from './droneHelpers';
import { Inspector } from '@babylonjs/inspector';
import { installKeyboardDebug } from './keyboardDebug';
import { setupDebugUI } from './debugHelpers';
import { createCameras } from './cameraHelpers';
import { subscribeCameraMode, setCameraMode } from '../stores/camera';
import { subscribeDroneSpeed, setDroneSpeed, getDroneSpeed } from '../stores/drone';

export class WormholeScene extends KolownScene {
  private babylonEngine: BabylonEngine;
  private sceneCamera!: SceneCamera;
  private scene!: Scene;
  private world!: World;
  private assetManager!: AssetManager;
  private lighting!: SceneLighting;
  private ballShooter!: BallShooter;
  private canvas: HTMLCanvasElement;
  private keyboardDebugDisposable?: { dispose: () => void };
  private debugUiDisposable?: { dispose: () => void };
  private debugCamera?: BABYLON.FreeCamera;
  private droneCamera?: BABYLON.FlyCamera | BABYLON.FreeCamera;
  private tempLight?: BABYLON.PointLight;
  private clearSceneHandler?: (ev: KeyboardEvent) => void;
  private obstacleManager?: ObstacleManager;
  private obstacleIntervalId?: number;
  private drone?: Drone;
  private cameraModeIndex: number = 0; // 0 = drone visible, 1 = drone invisible, 2 = arcCam
  private droneInputDisposable?: { dispose: () => void };
  private cameraCoverDiv?: HTMLDivElement;
  private cameraModeUnsub?: () => void;
  private droneSpeedUnsub?: () => void;


  constructor(name: string, canvas: HTMLCanvasElement) {
    super(name);
    this.canvas = canvas;
    this.babylonEngine = new BabylonEngine(canvas);
    
  // handlers bound via keyboardDebug helper
  }

  // no-arg helpers for keyboardDebug
  private toggleInspector(): void {
    this.handleInspector({ key: 'i' } as KeyboardEvent);
  }

  private toggleExit(): void {
    this.handleExitToggle({ key: 'o' } as KeyboardEvent);
  }

  private toggleDebugCamera(): void {
    this.handleDebugToggle({ key: 'v' } as KeyboardEvent);
  }

  // Switch to a dedicated flight camera (FlyCamera) and attach controls
  private toggleFlightCamera(): void {
    try {
      // Prefer scene.metadata.universalCamera if present; otherwise create a FlyCamera on the fly
      let flightCam: BABYLON.Camera | undefined = this.scene.metadata?.universalCamera as BABYLON.Camera | undefined;
      if (!flightCam) {
        flightCam = new BABYLON.FlyCamera('flightCam', new BABYLON.Vector3(0, 5, -15), this.scene);
        (flightCam as any).speed = 10;
        (flightCam as any).inertia = 0.9;
      }

      // Detach any active camera and set this as active
      try { if (this.scene.activeCamera) (this.scene.activeCamera as any).detachControl(this.canvas); } catch (e) { /* ignore */ }
      this.scene.activeCamera = flightCam;
      try { (this.scene.activeCamera as any).attachControl(this.canvas, true); } catch (e) { /* ignore */ }

      // Ensure focus on canvas so keyboard works
      try { this.canvas.focus(); } catch (e) { /* ignore */ }

      // Update HUD
      try { const hud = document.getElementById('camera-hud'); if (hud) hud.innerText = `Active camera: ${(this.scene.activeCamera as any)?.name ?? 'none'}`; } catch (e) { /* ignore */ }

      console.log('Switched to flight camera:', (this.scene.activeCamera as any).name);
    } catch (e) {
      console.warn('toggleFlightCamera failed', e);
    }
  }

  private adjustDroneSpeed(): void {
    if (this.drone) {
      const currentSpeed = this.drone.getSpeed();
      // Cycle through slower speeds: 0.005 → 0.01 → 0.015 → 0.02 → back to 0.005
      let newSpeed: number;
      if (currentSpeed <= 0.005) newSpeed = 0.01;
      else if (currentSpeed <= 0.01) newSpeed = 0.015;
      else if (currentSpeed <= 0.015) newSpeed = 0.02;
      else newSpeed = 0.005;
      
  this.drone.setSpeed(newSpeed);
  try { setDroneSpeed(newSpeed); } catch (e) { /* ignore */ }
      console.log(`Drone speed: ${newSpeed.toFixed(3)} (${newSpeed < 0.01 ? 'very slow' : newSpeed < 0.015 ? 'slow' : newSpeed < 0.02 ? 'medium' : 'fast'})`);
    }
  }

  public async initialize(): Promise<void> {
    try {
      // Initialize engine and wait for ready
      await this.babylonEngine.initialize();
      this.scene = this.babylonEngine.getScene();
      console.log("Babylon engine and scene initialized", this.scene);

      // Initialize camera
      this.sceneCamera = new SceneCamera(this.scene, this.canvas);
      // DON'T enable torus mode - we want a free camera that will be controlled by the drone
      console.log("SceneCamera initialized", this.sceneCamera);

      // Setup debug UI (inspector + HUD) - returns a disposable
      try {
        this.debugUiDisposable = setupDebugUI(this.scene, this.canvas) as any;
      } catch (e) { /* ignore */ }

      // Make sure the canvas can receive keyboard focus so WASD works reliably
      try {
        if (this.canvas && typeof this.canvas.tabIndex !== 'number') {
          (this.canvas as HTMLCanvasElement).tabIndex = 0;
        } else if (this.canvas) {
          this.canvas.tabIndex = 0;
        }
        // remove focus outline and focus immediately so keyboard events route to the canvas
        try { this.canvas.style.outline = 'none'; } catch (e) { /* ignore */ }
        try { this.canvas.focus(); } catch (e) { /* ignore */ }
      } catch (e) { /* ignore if DOM not available */ }

  // debug UI (HUD) created by setupDebugUI above

  // Drone will be created after world is initialized so it can read torus params

      // Don't set initial camera position - let drone control it immediately

      // Temporary camera-mounted light to help visibility during debugging
      try {
        const cam = this.sceneCamera.getCamera();
  this.tempLight = new BABYLON.PointLight('tempCameraLight', cam.position.add(new Vector3(0, 1.5, 2)), this.scene);
  this.tempLight.parent = cam;
  // Lowered intensity and range to reduce scene wash and backlighting
  this.tempLight.intensity = 0.5;
  this.tempLight.range = 20;
  this.tempLight.diffuse = new BABYLON.Color3(1, 1, 1);
      } catch (e) {
        console.warn('Failed to create temporary camera light:', e);
      }
      // Create cameras (debug, arc, universal, droneCam). cameraHelpers wires metadata.
      try {
        const cams = createCameras(this.scene);
        this.debugCamera = cams.debugCamera;
        this.droneCamera = cams.droneCam as any;
      } catch (e) { /* ignore camera creation failures */ }
    
      // Initialize world and verify (disable shadows for performance)
      this.world = new World(this.scene, { 
        disableShadows: true,
        wormhole: {
          diameter: 100,
          thickness: 8, // Slightly thinner for better knot visibility
          tessellation: 80, // Higher tessellation for smoother knot
          useCustomShader: true,
          p: 2, // Winds around major axis 2 times
          q: 3, // Winds around minor axis 3 times - creates a trefoil knot
          material: {
            diffuseColor: new BABYLON.Color3(0.02, 0.02, 0.04),
            emissiveColor: new BABYLON.Color3(0.01, 0.01, 0.03),
            wireframe: false,
            alpha: 1.0
          }
        }
      });
      await this.world.initialize();
      console.log("wormhole World initialized", this.world);  // Now that the world (torus) exists, create the drone and let it reference the world
  this.drone = new Drone(this.scene, this.sceneCamera.getCamera(), this.world);
  console.log("Drone initialized (attached to World parameters)");

      

      // Initialize asset manager
      this.assetManager = new AssetManager(this.scene);
      await this.assetManager.initialize();
      console.log("AssetManager initialized", this.assetManager);

  // Initialize lighting and ball shooter (disable shadows for performance)
  this.lighting = new SceneLighting(this.scene, { disableShadows: true });
      console.log("SceneLighting initialized", this.lighting);
      
      // DISABLED: Ball shooter disabled for drone testing
      // this.ballShooter = new BallShooter(this.scene, this.sceneCamera.getCamera(), this.lighting);
      // console.log("BallShooter initialized", this.ballShooter);
      console.log("Ball shooting disabled for drone focus");

  
      console.log("Scene initialization completed");
        // DISABLED: obstacle manager removed for drone testing
        console.log('Obstacle spawning disabled for testing');

        // Enable obstacle spawning: create manager and spawn periodically
  try {
    // Use the world's torus parameters so spawned obstacles are placed inside the wormhole
    const majorR = this.world?.getMajorRadius?.() ?? 100;
    const tubeR = this.world?.getTubeRadius?.() ?? 23;
    this.obstacleManager = new ObstacleManager(this.scene, { R: majorR, r: tubeR });
          // spawn every 5 seconds
          if (!this.obstacleIntervalId) {
            this.obstacleIntervalId = window.setInterval(() => {
              try {
                // prefer spawning relative to the drone if available
                if (this.drone && this.obstacleManager) {
                  // temporary camera-like object that points along drone forward vector
                  const dronePos = this.drone.getDronePosition();
                  const forward = this.drone.getForwardVector();
                  const tempCam = {
                    position: dronePos,
                    getForwardRay: () => ({ direction: forward })
                  } as any;
      this.obstacleManager.spawnInFrontOf(tempCam, { size: 0.5, distance: 2.0, withPhysics: false, debug: false });
                } else if (this.scene.activeCamera && this.obstacleManager) {
                  // fallback to active camera
      this.obstacleManager.spawnInFrontOf(this.scene.activeCamera, { size: 0.5, distance: 2.0, withPhysics: false, debug: false });
                }
              } catch (e) {
                // swallow spawn errors so interval keeps running
              }
            }, 5000) as unknown as number;
          }
        } catch (e) {
          // ignore if obstacle manager cannot be created
        }
      // Auto-start the drone movement instead of camera travel
      try {
        if (this.drone) {
          this.drone.start();
          console.log('Drone started orbiting torus');
        }
      } catch (e) {
        console.warn('Failed to start drone:', e);
      }

      // Update droneCamera each frame so it stays just ahead of the drone
      if (this.drone && this.droneCamera) {
        this.scene.registerBeforeRender(() => {
          try {
            // compute third-person camera using helper (sample path ahead of drone)
            const tNorm = (this.drone!.getSpeed() /* not used for position; reuse angle from drone */ , 0.0);
            // fallback: sample path around current drone angle
            const dronePos = this.drone!.getDronePosition();
            const forward = this.drone!.getForwardVector();
            const sampleCam = computeThirdPersonCamera(dronePos, forward, new BABYLON.Vector3(0,1,0), 0.4);
            this.droneCamera!.position.copyFrom(sampleCam.position);
            (this.droneCamera as BABYLON.FreeCamera).setTarget(sampleCam.target);
          } catch (e) { /* ignore frame errors */ }
        });
      }

      // Subscribe to Svelte camera store so UI can control camera mode
      try {
        if (typeof window !== 'undefined') {
          this.cameraModeUnsub = subscribeCameraMode((mode) => {
            try {
              if (this.cameraModeIndex === mode) return;
              this.cameraModeIndex = mode;
              this.applyCameraMode(mode);
            } catch (e) { /* ignore */ }
          });
        }
      } catch (e) { /* ignore */ }

      // Subscribe to drone speed store so UI can control drone speed
      try {
        if (typeof window !== 'undefined') {
          this.droneSpeedUnsub = subscribeDroneSpeed((s) => {
            try {
              if (this.drone) this.drone.setSpeed(s);
            } catch (e) { /* ignore */ }
          });
          // initialize store value from current drone speed
          try { setDroneSpeed(this.drone?.getSpeed() ?? 0.01); } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }

      // Create camera cover overlay (hidden by default); used when camera is 'covered' by obstacle
      try {
        let cover = document.getElementById('camera-cover') as HTMLDivElement | null;
        if (!cover) {
          cover = document.createElement('div');
          cover.id = 'camera-cover';
          Object.assign(cover.style, {
            position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
            background: 'black', opacity: '0.95', zIndex: '10000', display: 'none', pointerEvents: 'none'
          } as any);
          document.body.appendChild(cover);
        }
        this.cameraCoverDiv = cover;
      } catch (e) { /* ignore if no DOM */ }

      // Per-frame: detect if camera is inside any obstacle when in cameraModeIndex === 1 and show cover
      this.scene.registerBeforeRender(() => {
        try {
          if (!this.cameraCoverDiv) return;
          // only active in mode 1 (drone invisible)
          if (this.cameraModeIndex !== 1) {
            if (this.cameraCoverDiv.style.display !== 'none') this.cameraCoverDiv.style.display = 'none';
            return;
          }

          const cam = this.scene.activeCamera;
          if (!cam) { this.cameraCoverDiv.style.display = 'none'; return; }

          const camPos = cam.position;
          let covered = false;
          for (const m of this.scene.meshes) {
            try {
              if (!m.metadata || !m.metadata.obstacle) continue;
              const bb = m.getBoundingInfo().boundingBox;
              const min = bb.minimumWorld;
              const max = bb.maximumWorld;
              if (camPos.x >= min.x && camPos.x <= max.x && camPos.y >= min.y && camPos.y <= max.y && camPos.z >= min.z && camPos.z <= max.z) {
                covered = true;
                break;
              }
            } catch (e) { /* ignore mesh without bounds */ }
          }

          this.cameraCoverDiv.style.display = covered ? 'block' : 'none';
        } catch (e) { /* ignore frame errors */ }
      });
    } catch (error) {
      console.error("Scene initialization error:", error);
      throw error;
    }
  }

  public onEnter(): void {
    // Install keyboard debug shortcuts (i, o, v, x, b, s for drone speed)
    this.keyboardDebugDisposable = installKeyboardDebug({
      toggleInspector: this.toggleInspector.bind(this),
      toggleExit: this.toggleExit.bind(this),
      toggleDebugCamera: this.toggleDebugCamera.bind(this),
  toggleFlightCamera: this.toggleFlightCamera.bind(this),
    // clearScene and jollibee/glow handling removed
      spawnTransient: this.adjustDroneSpeed.bind(this) // 's' key adjusts drone speed
    });

    // Install drone WASD nudges through helper (keeps mainScene small)
    try {
      import('./droneInput').then(mod => {
        try { this.droneInputDisposable = mod.installDroneInput(() => this.drone); } catch (e) { /* ignore */ }
      }).catch(() => { /* ignore */ });
    } catch (e) { /* ignore dynamic import failures */ }

    // Start render loop when scene is ready
    this.scene.executeWhenReady(() => {
  this.babylonEngine.startRenderLoop();
  console.log("World initialized:", !!this.world);
    });
  }

  public onExit(): void {
    this.babylonEngine.stopRenderLoop();
    // Remove keyboard debug handlers
    if (this.keyboardDebugDisposable) {
      try { this.keyboardDebugDisposable.dispose(); } catch (e) { /* ignore */ }
      this.keyboardDebugDisposable = undefined;
    }
    if (this.debugUiDisposable) {
      try { this.debugUiDisposable.dispose(); } catch (e) { /* ignore */ }
      this.debugUiDisposable = undefined;
    }
    if (this.droneInputDisposable) {
      try { this.droneInputDisposable.dispose(); } catch (e) { /* ignore */ }
      this.droneInputDisposable = undefined;
    }
    if (this.cameraModeUnsub) {
      try { this.cameraModeUnsub(); } catch (e) { /* ignore */ }
      this.cameraModeUnsub = undefined;
    }
    if (this.droneSpeedUnsub) {
      try { this.droneSpeedUnsub(); } catch (e) { /* ignore */ }
      this.droneSpeedUnsub = undefined;
    }
  // stop obstacle spawning interval
  try { if (this.obstacleIntervalId) { clearInterval(this.obstacleIntervalId); this.obstacleIntervalId = undefined; } } catch (e) { /* ignore */ }
  }

  public onPause(): void {
    this.babylonEngine.stopRenderLoop();
    console.log(`${this.name} paused`);
  }

 

  public dispose(): void {
    // Dispose keyboard debug handlers if installed
    try {
  if (this.keyboardDebugDisposable) { this.keyboardDebugDisposable.dispose(); this.keyboardDebugDisposable = undefined; }
  if (this.debugUiDisposable) { this.debugUiDisposable.dispose(); this.debugUiDisposable = undefined; }
    if (this.droneInputDisposable) { this.droneInputDisposable.dispose(); this.droneInputDisposable = undefined; }
  if (this.cameraModeUnsub) { try { this.cameraModeUnsub(); } catch {} this.cameraModeUnsub = undefined; }
  if (this.droneSpeedUnsub) { try { this.droneSpeedUnsub(); } catch {} this.droneSpeedUnsub = undefined; }
    } catch (e) { /* ignore */ }
    
    // Dispose of all components
  this.lighting?.dispose();
    this.ballShooter?.dispose();
    this.world?.dispose();
    this.assetManager?.cleanup();
    this.sceneCamera?.dispose();
    this.tempLight?.dispose();
    this.drone?.dispose();
    this.babylonEngine?.dispose();
    try { if (this.obstacleIntervalId) { clearInterval(this.obstacleIntervalId); this.obstacleIntervalId = undefined; } } catch (e) { /* ignore */ }
    try { this.obstacleManager?.disposeAll(); this.obstacleManager = undefined; } catch (e) { /* ignore */ }
  }

  // Remove Jollibee meshes, debug markers, glow orb/light, travel markers, and glow layer
  public clearJollibeesAndOrbs(): void {
    try {
      const toRemove: BABYLON.AbstractMesh[] = [];
      this.scene.meshes.forEach(m => {
        const n = m.name.toLowerCase();
        if (n.includes('jollibee') || n.startsWith('dbgjoll') || n.startsWith('dbg') || n === 'gloworb' || n.startsWith('travelmarker_') || n.startsWith('transientcube_')) {
          toRemove.push(m);
        }
      });

      toRemove.forEach(m => {
        try { m.dispose(); } catch (e) { /* ignore */ }
      });

      // remove glow light(s)
      this.scene.lights.slice().forEach(l => {
        try {
          const ln = l.name.toLowerCase();
          if (ln === 'glowlight' || ln === 'gihemi') {
            l.dispose();
          }
        } catch (e) { /* ignore */ }
      });

      // dispose GlowLayer if present
      try {
        const glow = (BABYLON as any).GlowLayer?.GetFromScene?.(this.scene);
        if (glow) {
          glow.dispose();
          if (this.scene.metadata) this.scene.metadata.hasGlow = false;
        }
      } catch (e) {
        // ignore
      }

      console.log(`Cleared ${toRemove.length} scene meshes and removed glow elements`);
    } catch (e) {
      console.warn('clearJollibeesAndOrbs error', e);
    }
  }

  private handleInspector(ev: KeyboardEvent): void {
    if (ev.key === 'i' && this.scene) {
      try {
        // Prefer the built-in debugLayer (scene explorer) for a reliable right-hand panel
        if (this.scene.debugLayer && this.scene.debugLayer.isVisible && this.scene.debugLayer.show) {
          if (this.scene.debugLayer.isVisible()) {
            try { this.scene.debugLayer.hide(); } catch (e) { /* ignore */ }
          } else {
            try {
              this.scene.debugLayer.show();
            } catch (e) {
              // If debugLayer.show fails for some reason, try Inspector.Show as a fallback
              try { (Inspector as any)?.Show?.(this.scene, { embedMode: false }); } catch (e2) { /* ignore */ }
            }
          }
        } else {
          // If debugLayer not available, attempt Inspector.Show
          try { (Inspector as any)?.Show?.(this.scene, { embedMode: false }); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        console.warn('handleInspector toggle failed:', e);
      }
    }
  }

  private handleExitToggle(ev: KeyboardEvent): void {
    if (ev.key !== 'o' || !this.sceneCamera) return;
    const current = this.sceneCamera.getAllowExitTunnel();
    this.sceneCamera.setAllowExitTunnel(!current);
    console.log(`Camera allowExitTunnel = ${!current}`);
  }

  private handleDebugToggle(ev: KeyboardEvent): void {
    if (ev.key !== 'v' || !this.scene) return;

    const droneCam = this.droneCamera as unknown as BABYLON.Camera | undefined;
    const arcCam = this.scene.metadata?.arcCamera as unknown as BABYLON.ArcRotateCamera | undefined;

    // advance the explicit mode index
    this.cameraModeIndex = (this.cameraModeIndex + 1) % 3;
    const nextState = this.cameraModeIndex;

    try {
      // apply camera mode and sync store
  this.applyCameraMode(nextState);
  try { setCameraMode(nextState as import('../stores/camera').CameraMode); } catch (e) { /* ignore */ }
    } catch (e) {
      console.warn('Failed to switch camera mode:', e);
    }
  }

  // Centralized logic to apply a camera mode (keeps UI-driven updates simple)
  private applyCameraMode(mode: number) {
    const droneCam = this.droneCamera as unknown as BABYLON.Camera | undefined;
    const arcCam = this.scene.metadata?.arcCamera as unknown as BABYLON.ArcRotateCamera | undefined;
    try { if (this.scene.activeCamera) (this.scene.activeCamera as any).detachControl(this.canvas); } catch (e) { /* ignore */ }

    if (mode === 0 || mode === 1) {
      if (!droneCam) return;
      this.scene.activeCamera = droneCam;
      try { if (this.drone) this.drone.setVisible(mode === 0); } catch (e) { /* ignore */ }
      console.log(`Mode: Drone POV - visible=${mode === 0}`);
    } else if (mode === 2) {
      if (!arcCam) return;
      this.scene.activeCamera = arcCam;
      try { (arcCam as any).attachControl(this.canvas, true); } catch (e) { /* ignore */ }
      console.log('Mode: ArcRotate (scrollwheel view)');
    }

    try { const hud = document.getElementById('camera-hud'); if (hud) hud.innerText = `Active camera: ${(this.scene.activeCamera as any)?.name ?? 'none'}`; } catch (e) { /* ignore */ }
  }

  public getScene(): Scene {
    return this.scene;
  }

  public isReady(): boolean {
    // Ball shooter is now optional since it's disabled
  return !!(this.scene && this.world && this.assetManager && this.lighting);
  }
}
