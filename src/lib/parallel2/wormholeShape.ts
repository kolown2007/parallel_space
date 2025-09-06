import * as BABYLON from '@babylonjs/core';
import { Scene, Vector3, Mesh, StandardMaterial, Color3 } from '@babylonjs/core';

// Import shader sources as raw text (Vite will inline these during dev/build)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Vite raw imports
import vertexSrc from './shaders/universe.vert?raw';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Vite raw imports
import fragmentSrc from './shaders/universe.frag?raw';

export interface WormholeShapeOptions {
  diameter?: number;
  thickness?: number;
  tessellation?: number;
  position?: Vector3;
  useCustomShader?: boolean;
  // Torus knot parameters
  p?: number; // How many times the knot winds around the major axis
  q?: number; // How many times the knot winds around the minor axis  
  // Path offset: 0 = center, 1 = offset by full tube radius inward
  pathOffset?: number;
  material?: {
    diffuseColor?: Color3;
    emissiveColor?: Color3;
    wireframe?: boolean;
    alpha?: number;
  };
}

export class WormholeShape {
  private scene: Scene;
  private torusMesh?: Mesh;
  private currentMaterial?: BABYLON.Material;
  private options: {
    diameter: number;
    thickness: number;
    tessellation: number;
    position: Vector3;
    useCustomShader: boolean;
    p: number; // Torus knot p parameter
    q: number; // Torus knot q parameter
  pathOffset: number; // 0=center, >0 offset inward
    material: {
      diffuseColor: Color3;
      emissiveColor: Color3;
      wireframe: boolean;
      alpha: number;
    };
  };

  constructor(scene: Scene, options: WormholeShapeOptions = {}) {
    this.scene = scene;
    this.options = {
      diameter: options.diameter ?? 20,
      thickness: options.thickness ?? 5,
      tessellation: options.tessellation ?? 64, // Increased for smoother knot
      position: options.position ?? Vector3.Zero(),
      useCustomShader: options.useCustomShader ?? true,
  p: options.p ?? 2, // Default: winds around major axis 2 times
  q: options.q ?? 3, // Default: winds around minor axis 3 times
  pathOffset: options.pathOffset ?? 0.0,
      material: {
        diffuseColor: options.material?.diffuseColor ?? new Color3(0.2, 0.6, 1.0),
        emissiveColor: options.material?.emissiveColor ?? new Color3(0.1, 0.3, 0.5),
        wireframe: options.material?.wireframe ?? false,
        alpha: options.material?.alpha ?? 0.8
      }
    };
  }

  public async initialize(): Promise<void> {
    try {
      // Create a simple torus mesh (standard donut) for the tunnel
      this.torusMesh = BABYLON.MeshBuilder.CreateTorus("wormholeTorus", {
        diameter: this.options.diameter,
        thickness: this.options.thickness,
        tessellation: this.options.tessellation
      }, this.scene);

      // Set position
      this.torusMesh.position = this.options.position.clone();

      // Diagnostic: log vertex/normal counts and small samples to help debug shading/centerline
      try {
        const posData = this.torusMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const normData = this.torusMesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
        const vCount = posData ? posData.length / 3 : 0;
        const nCount = normData ? normData.length / 3 : 0;
        console.log(`torusMesh: vertices=${vCount}, normals=${nCount}, sideOrientation=${this.torusMesh.sideOrientation}`);
        if (posData && posData.length > 0) console.log('torusMesh sample positions (first 3 verts):', posData.slice(0, 9));
        if (normData && normData.length > 0) console.log('torusMesh sample normals (first 3 verts):', normData.slice(0, 9));
      } catch (e) {
        console.warn('Could not read torus mesh vertex/normal data for diagnostics:', e);
      }

      // Configure the mesh for interior navigation
      this.torusMesh.sideOrientation = BABYLON.Mesh.BACKSIDE;
      this.torusMesh.isPickable = false;
      this.torusMesh.checkCollisions = true; // allow physics collisions
      this.torusMesh.receiveShadows = false;

      // Create material (shader or standard)
      await this.createMaterial();

      // Setup physics impostor for collision detection
      this.setupPhysics();

      console.log("WormholeShape initialized with diameter:", this.options.diameter, "thickness:", this.options.thickness);
    } catch (error) {
      console.error("Failed to initialize WormholeShape:", error);
      throw error;
    }
  }

  private async createMaterial(): Promise<void> {
    if (!this.torusMesh) return;

    if (this.options.useCustomShader) {
      await this.createShaderMaterial();
    } else {
      this.createStandardMaterial();
    }
  }

  private async createShaderMaterial(): Promise<void> {
    if (!this.torusMesh) return;

    try {
      // Register imported shader strings (Vite inlines them via ?raw)
      (BABYLON as any).Effect.ShadersStore = (BABYLON as any).Effect.ShadersStore || {};
      (BABYLON as any).Effect.ShadersStore["torusVertexShader"] = vertexSrc as unknown as string;
      (BABYLON as any).Effect.ShadersStore["torusFragmentShader"] = fragmentSrc as unknown as string;

      const shaderMat = new (BABYLON as any).ShaderMaterial("wormholeShaderMat", this.scene, {
        vertex: "torus",
        fragment: "torus"
      }, {
        attributes: ["position", "normal", "uv"],
        uniforms: ["worldViewProjection", "world", "cameraPosition", "iTime", "iResolution"],
        samplers: ["uTexture"]
      });
      
      shaderMat.backFaceCulling = false;
      shaderMat.wireframe = this.options.material.wireframe;
      
      // Debug: log snippets of shader sources
      console.log('wormhole vertex snippet:', (vertexSrc as string).slice(0, 300));
      console.log('wormhole fragment snippet:', (fragmentSrc as string).slice(0, 300));

      // Set initial resolution and camera position
      const w = this.scene.getEngine().getRenderWidth();
      const h = this.scene.getEngine().getRenderHeight();
      const camera = this.scene.activeCamera;
      
      try {
        const eff = (shaderMat as any).getEffect ? (shaderMat as any).getEffect() : null;
        if (eff && eff.setFloat2) {
          eff.setFloat2('iResolution', w, h);
        } else if ((shaderMat as any).setVector2) {
          (shaderMat as any).setVector2('iResolution', new (BABYLON as any).Vector2(w, h));
        } else if ((shaderMat as any).setFloat) {
          (shaderMat as any).setFloat('iResolution.x', w);
          (shaderMat as any).setFloat('iResolution.y', h);
        }
        
        // Set initial camera position
        if (camera) {
          (shaderMat as any).setVector3('cameraPosition', camera.position);
        }
        
        // Set initial world matrix
        if (this.torusMesh) {
          (shaderMat as any).setMatrix('world', this.torusMesh.getWorldMatrix());
        }
      } catch (e) {
        // ignore initial uniform set failures
      }

      // Setup shader observables
      if ((shaderMat as any).onCompiledObservable) {
        (shaderMat as any).onCompiledObservable.add(() => console.log('wormhole shader compiled'));
      }
      if ((shaderMat as any).onCompilationErrorObservable) {
        (shaderMat as any).onCompilationErrorObservable.add((err: any) => console.error('wormhole shader compile error', err));
      }

      // Update time uniform every frame for subtle animation
      this.scene.onBeforeRenderObservable.add(() => {
        try {
          const t = performance.now() / 1000;
          shaderMat.setFloat('iTime', t);
          
          // Update camera position for fresnel calculations
          const camera = this.scene.activeCamera;
          if (camera) {
            shaderMat.setVector3('cameraPosition', camera.position);
          }
          
          // Update world matrix
          if (this.torusMesh) {
            shaderMat.setMatrix('world', this.torusMesh.getWorldMatrix());
          }
        } catch (e) {
          // ignore shader update failures
        }
      });

      // Handle resolution updates
      const setResolution = () => {
        try {
          const w = this.scene.getEngine().getRenderWidth();
          const h = this.scene.getEngine().getRenderHeight();
          if ((shaderMat as any).setVector2) {
            (shaderMat as any).setVector2('iResolution', new (BABYLON as any).Vector2(w, h));
          } else if ((shaderMat as any).setFloat) {
            (shaderMat as any).setFloat('iResolution.x', w);
            (shaderMat as any).setFloat('iResolution.y', h);
          }
        } catch (e) {
          // ignore
        }
      };

      if ((shaderMat as any).onCompiledObservable) {
        (shaderMat as any).onCompiledObservable.add(() => setResolution());
      } else {
        setResolution();
      }

      window.addEventListener('resize', setResolution);

      // Load metal texture for sectional details
      const metalTexture = new BABYLON.Texture('/metal.jpg', this.scene);
      metalTexture.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
      metalTexture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
      shaderMat.setTexture('uTexture', metalTexture);

      this.currentMaterial = shaderMat;
      this.torusMesh.material = shaderMat;

    } catch (e) {
      console.warn("Failed to create shader material, falling back to standard material:", e);
      this.createStandardMaterial();
    }
  }

  private createStandardMaterial(): void {
    if (!this.torusMesh) return;

    const material = new StandardMaterial("wormholeStandardMat", this.scene);
    material.diffuseColor = this.options.material.diffuseColor;
    material.emissiveColor = this.options.material.emissiveColor;
    material.wireframe = this.options.material.wireframe;
    material.alpha = this.options.material.alpha;
    material.specularColor = new Color3(0.5, 0.8, 1.0);
    material.specularPower = 16;

    this.currentMaterial = material;
    this.torusMesh.material = material;
  }

  private createNoiseTexture(): BABYLON.Texture | null {
    try {
      // Create a procedural noise texture
      const size = 256;
      const data = new Uint8Array(size * size * 4);
      
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const index = (y * size + x) * 4;
          
          // Create noise pattern
          const noise1 = Math.sin(x * 0.1) * Math.sin(y * 0.1);
          const noise2 = Math.sin(x * 0.05 + y * 0.05) * 0.5;
          const noise3 = Math.sin(x * 0.02) * Math.sin(y * 0.02) * 0.3;
          
          const value = (noise1 + noise2 + noise3 + 1.0) * 0.5;
          const color = Math.floor(value * 255);
          
          data[index] = color;     // R
          data[index + 1] = color; // G  
          data[index + 2] = color; // B
          data[index + 3] = 255;   // A
        }
      }
      
      const texture = BABYLON.RawTexture.CreateRGBATexture(
        data, size, size, this.scene, false, false, 
        BABYLON.Texture.BILINEAR_SAMPLINGMODE
      );
      
      texture.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
      texture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
      
      return texture;
    } catch (e) {
      console.warn("Failed to create noise texture:", e);
      return null;
    }
  }

  private setupPhysics(): void {
    if (!this.torusMesh) return;

    const createImpostor = () => {
      try {
        // Use a MESH shape for accurate interior collisions on the hollow torus
        new BABYLON.PhysicsAggregate(
          this.torusMesh!,
          BABYLON.PhysicsShapeType.MESH,
          { mass: 0, restitution: 0.9, friction: 0.2 },
          this.scene
        );
        return true;
      } catch (e) {
        console.warn("Could not create physics impostor for wormhole yet:", e);
        return false;
      }
    };

    if (!createImpostor()) {
      // If physics isn't ready yet, wait until it's available and try once more
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        if (this.scene.getPhysicsEngine()) {
          if (createImpostor()) {
            this.scene.onBeforeRenderObservable.remove(obs);
          }
        }
      });
    }
  }

  public getMesh(): Mesh | undefined {
    return this.torusMesh;
  }

  public getDiameter(): number {
    return this.options.diameter;
  }

  public getThickness(): number {
    return this.options.thickness;
  }

  public getPosition(): Vector3 {
    return this.options.position;
  }

  public setPosition(position: Vector3): void {
    this.options.position = position;
    if (this.torusMesh) {
      this.torusMesh.position = position.clone();
    }
  }

  public setWireframe(wireframe: boolean): void {
    this.options.material.wireframe = wireframe;
    if (this.currentMaterial) {
      this.currentMaterial.wireframe = wireframe;
    }
  }

  public toggleWireframe(): void {
    this.setWireframe(!this.options.material.wireframe);
  }

  public isWireframe(): boolean {
    return this.options.material.wireframe;
  }

  public setAlpha(alpha: number): void {
    this.options.material.alpha = alpha;
    if (this.currentMaterial instanceof StandardMaterial) {
      this.currentMaterial.alpha = alpha;
    }
  }

    // Generate path points along the center of the simple torus for navigation
  public getPathPoints(numPoints: number = 128): BABYLON.Vector3[] {
    const pathPoints: BABYLON.Vector3[] = [];
    const R = this.options.diameter / 2; // major radius of torus

    for (let i = 0; i <= numPoints; i++) {
      const u = (i / numPoints) * Math.PI * 2;
      const cx = R * Math.cos(u);
      const cy = 0;
      const cz = R * Math.sin(u);

      const local = new BABYLON.Vector3(cx, cy, cz);
      if (this.torusMesh) {
        const worldPos = BABYLON.Vector3.TransformCoordinates(local, this.torusMesh.getWorldMatrix());
        pathPoints.push(worldPos);
      } else {
        pathPoints.push(local.add(this.options.position));
      }
    }

    return pathPoints;
  }

  public dispose(): void {
    if (this.torusMesh) {
      this.torusMesh.dispose();
      this.torusMesh = undefined;
    }
  }
}
