import * as BABYLON from '@babylonjs/core';
import { Scene, Vector3, Mesh, StandardMaterial, Color3 } from '@babylonjs/core';
import { createShaderMaterial, createStandardMaterial, createPBRMaterial, createTexture } from './materials/factories';
import type { MaterialResult } from './materials/factories';

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
  private currentMaterialDispose?: (() => void) | undefined;
  // track currently-applied texture and its dispose callback
  private currentTexture?: BABYLON.BaseTexture | undefined;
  private currentTextureDispose?: (() => void) | undefined;
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

  // Create material (shader or standard) only if none supplied externally
  if (!this.currentMaterial) await this.createMaterial();

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

    // Dispose previous material if any
    try { if (this.currentMaterialDispose) { this.currentMaterialDispose(); this.currentMaterialDispose = undefined; } } catch (e) { /* ignore */ }

    try {
      if (this.options.useCustomShader) {
        const res = await createShaderMaterial(this.scene, this.torusMesh, { vertex: vertexSrc as string, fragment: fragmentSrc as string }, { wireframe: this.options.material.wireframe });
        this.currentMaterial = res.material;
        this.currentMaterialDispose = res.dispose;
      } else {
        const res = await createStandardMaterial(this.scene, { diffuse: this.options.material.diffuseColor, emissive: this.options.material.emissiveColor, wireframe: this.options.material.wireframe, alpha: this.options.material.alpha });
        this.currentMaterial = res.material;
        this.currentMaterialDispose = res.dispose;
      }
      if (this.torusMesh && this.currentMaterial) this.torusMesh.material = this.currentMaterial;
    } catch (e) {
      console.warn('Failed to create material, falling back to a basic StandardMaterial', e);
      const res = await createStandardMaterial(this.scene, { diffuse: this.options.material.diffuseColor, emissive: this.options.material.emissiveColor, wireframe: this.options.material.wireframe, alpha: this.options.material.alpha });
      this.currentMaterial = res.material;
      this.currentMaterialDispose = res.dispose;
      if (this.torusMesh && this.currentMaterial) this.torusMesh.material = this.currentMaterial;
    }
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

  /** Apply an externally created material to the mesh. Dispose callback will be stored and called when replaced. */
  public applyMaterial(material: BABYLON.Material, disposeCallback?: () => void, takeOwnership: boolean = true): void {
    try {
      // If same material, noop
      if (this.currentMaterial === material) return;
      // dispose previous
      try { if (this.currentMaterialDispose) { this.currentMaterialDispose(); this.currentMaterialDispose = undefined; } } catch (e) { /* ignore */ }
      this.currentMaterial = material;
      if (takeOwnership && disposeCallback) this.currentMaterialDispose = disposeCallback;
      if (this.torusMesh) this.torusMesh.material = material;
    } catch (e) {
      console.warn('applyMaterial failed', e);
    }
  }

  /**
   * Layer a texture onto the currently applied material. Works with PBRMaterial, StandardMaterial and ShaderMaterial.
   * - url: path to the texture (can be relative to /static)
   * - options: asEmissive will set the texture as emissiveTexture instead of albedo/diffuse
   */
  public async applyTexture(url: string, options?: { asEmissive?: boolean; uScale?: number; vScale?: number; wrap?: boolean; forcePBR?: boolean }): Promise<void> {
    try {
      if (!this.torusMesh) return;
      // ensure a material exists; await creation if necessary so we can reliably set textures
      if (!this.currentMaterial) {
        await this.createMaterial();
      }

      // dispose previous texture if any
      try { if (this.currentTextureDispose) { this.currentTextureDispose(); this.currentTextureDispose = undefined; } } catch (e) { /* ignore */ }

  console.log('WormholeShape: loading texture via factory', url);
  const res = await createTexture(this.scene, url, { uScale: options?.uScale, vScale: options?.vScale, wrap: options?.wrap });
  const tex = res.texture as BABYLON.BaseTexture;
  // attach factory-provided dispose
  const texDispose = res.dispose;
      if (typeof options?.uScale === 'number') (tex as any).uScale = options!.uScale;
      if (typeof options?.vScale === 'number') (tex as any).vScale = options!.vScale;
      if (options?.wrap === false) {
        try { tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE; tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; } catch (e) { /* ignore */ }
      } else {
        try { tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE; tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; } catch (e) { /* ignore */ }
      }

      // Apply depending on material type
      try {
        const PBR = (BABYLON as any).PBRMaterial as typeof BABYLON.PBRMaterial | undefined;
        const ShaderMaterial = (BABYLON as any).ShaderMaterial as any;
        // If shader material is active and caller requested forcePBR, create and switch to PBR first
        if (options?.forcePBR && ShaderMaterial && this.currentMaterial instanceof ShaderMaterial) {
          console.log('WormholeShape: forcing PBR material because shader may not show texture');
          try {
            const res = await createPBRMaterial(this.scene, { albedo: new BABYLON.Color3(0.1,0.1,0.1) });
            this.applyMaterial(res.material, res.dispose, true);
          } catch (e) { console.warn('WormholeShape: failed to create fallback PBR', e); }
        }
        if (PBR && this.currentMaterial instanceof PBR) {
          const pbr = this.currentMaterial as unknown as any;
          if (options?.asEmissive) pbr.emissiveTexture = tex; else pbr.albedoTexture = tex;
        } else if (this.currentMaterial instanceof BABYLON.StandardMaterial) {
          const std = this.currentMaterial as BABYLON.StandardMaterial;
          if (options?.asEmissive) (std as any).emissiveTexture = tex; else std.diffuseTexture = tex;
        } else if (ShaderMaterial && this.currentMaterial instanceof ShaderMaterial) {
          try { (this.currentMaterial as any).setTexture('uTexture', tex); } catch (e) { /* ignore */ }
        } else {
          // fallback: try to set a diffuse/albedo property if present
          try { (this.currentMaterial as any).albedoTexture = tex; } catch (e) { try { (this.currentMaterial as any).diffuseTexture = tex; } catch (e) { /* ignore */ } }
        }
      } catch (e) {
        console.warn('Failed to assign texture to material', e);
      }

  this.currentTexture = tex as any;
  this.currentTextureDispose = () => { try { texDispose && texDispose(); } catch (e) { /* ignore */ } };
    } catch (e) {
      console.warn('applyTexture failed', e);
    }
  }

  public removeTexture(): void {
    try {
      if (!this.currentMaterial) return;
      // clear texture references depending on material
      const PBR = (BABYLON as any).PBRMaterial as typeof BABYLON.PBRMaterial | undefined;
      const ShaderMaterial = (BABYLON as any).ShaderMaterial as any;
      try {
        if (PBR && this.currentMaterial instanceof PBR) {
          const pbr = this.currentMaterial as unknown as any;
          try { pbr.albedoTexture && pbr.albedoTexture.dispose(); } catch {}
          try { pbr.emissiveTexture && pbr.emissiveTexture.dispose(); } catch {}
          pbr.albedoTexture = null;
          pbr.emissiveTexture = null;
        } else if (this.currentMaterial instanceof BABYLON.StandardMaterial) {
          const std = this.currentMaterial as BABYLON.StandardMaterial;
          try { std.diffuseTexture && (std.diffuseTexture as any).dispose(); } catch {}
          try { (std as any).emissiveTexture && (std as any).emissiveTexture.dispose(); } catch {}
          std.diffuseTexture = null as any;
          (std as any).emissiveTexture = null;
        } else if (ShaderMaterial && this.currentMaterial instanceof ShaderMaterial) {
          try { (this.currentMaterial as any).setTexture('uTexture', null); } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }

      try { if (this.currentTextureDispose) { this.currentTextureDispose(); this.currentTextureDispose = undefined; } } catch (e) { /* ignore */ }
      this.currentTexture = undefined;
    } catch (e) {
      /* swallow */
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
  try { if (this.currentMaterialDispose) { this.currentMaterialDispose(); this.currentMaterialDispose = undefined; } } catch (e) { /* ignore */ }
  }
}
