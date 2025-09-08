import * as BABYLON from '@babylonjs/core';

export interface MaterialResult {
  material: BABYLON.Material;
  dispose?: () => void;
}

export async function createStandardMaterial(scene: BABYLON.Scene, opts?: { diffuse?: BABYLON.Color3, emissive?: BABYLON.Color3, wireframe?: boolean, alpha?: number }): Promise<MaterialResult> {
  const mat = new BABYLON.StandardMaterial('wormholeStandardMat', scene);
  if (opts?.diffuse) mat.diffuseColor = opts.diffuse;
  if (opts?.emissive) mat.emissiveColor = opts.emissive;
  mat.wireframe = !!opts?.wireframe;
  mat.alpha = typeof opts?.alpha === 'number' ? opts!.alpha : 1.0;
  mat.specularColor = new BABYLON.Color3(0.5, 0.8, 1.0);
  mat.specularPower = 16;
  return { material: mat, dispose: () => { try { mat.dispose(); } catch (e) { /* ignore */ } } };
}

export async function createPBRMaterial(scene: BABYLON.Scene, opts?: { albedo?: BABYLON.Color3, emissive?: BABYLON.Color3, alpha?: number }): Promise<MaterialResult> {
  try {
    const PBR = (BABYLON as any).PBRMaterial as typeof BABYLON.PBRMaterial | undefined;
    if (!PBR) throw new Error('PBRMaterial not available');
    const pbr = new PBR('wormholePBR', scene) as BABYLON.PBRMaterial;
    if (opts?.albedo) pbr.albedoColor = opts.albedo;
    if (opts?.emissive) pbr.emissiveColor = opts.emissive;
    (pbr as any).metallic = 0.2;
    (pbr as any).roughness = 0.6;
    pbr.alpha = typeof opts?.alpha === 'number' ? opts!.alpha : 1.0;
    pbr.backFaceCulling = false;
    return { material: pbr, dispose: () => { try { pbr.dispose(); } catch (e) { /* ignore */ } } };
  } catch (e) {
    console.warn('createPBRMaterial failed, falling back to standard', e);
    return createStandardMaterial(scene, { diffuse: opts?.albedo, emissive: opts?.emissive, alpha: opts?.alpha });
  }
}

/**
 * Create and return a texture with a dispose helper. Returned texture is a Babylon Texture compatible with material slots.
 */
export async function createTexture(scene: BABYLON.Scene, url: string, opts?: { uScale?: number; vScale?: number; wrap?: boolean }): Promise<{ texture: BABYLON.BaseTexture; dispose?: () => void }> {
  try {
    const tex = new BABYLON.Texture(url, scene);
    if (typeof opts?.uScale === 'number') (tex as any).uScale = opts.uScale;
    if (typeof opts?.vScale === 'number') (tex as any).vScale = opts.vScale;
    if (opts?.wrap === false) {
      try { tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE; tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; } catch (e) { /* ignore */ }
    } else {
      try { tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE; tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; } catch (e) { /* ignore */ }
    }
    return { texture: tex, dispose: () => { try { tex.dispose(); } catch (e) { /* ignore */ } } };
  } catch (e) {
    console.warn('createTexture failed for', url, e);
    // create a very small 1x1 white texture fallback
    const data = new Uint8Array([255, 255, 255, 255]);
    const fallback = BABYLON.RawTexture.CreateRGBATexture(data, 1, 1, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
    return { texture: fallback, dispose: () => { try { fallback.dispose(); } catch (e) { /* ignore */ } } };
  }
}

// createPBRMaterial is already exported by its function declaration above

export async function createShaderMaterial(scene: BABYLON.Scene, mesh: BABYLON.Mesh, shaderSources: { vertex: string, fragment: string }, opts?: { wireframe?: boolean }): Promise<MaterialResult> {
  const ShaderMaterial = (BABYLON as any).ShaderMaterial as any;
  if (!ShaderMaterial) {
    throw new Error('ShaderMaterial not available in this build of Babylon');
  }

  const vertName = 'wormhole_vert_' + Math.random().toString(36).slice(2, 8);
  const fragName = 'wormhole_frag_' + Math.random().toString(36).slice(2, 8);
  (BABYLON as any).Effect.ShadersStore = (BABYLON as any).Effect.ShadersStore || {};
  (BABYLON as any).Effect.ShadersStore[vertName] = shaderSources.vertex;
  (BABYLON as any).Effect.ShadersStore[fragName] = shaderSources.fragment;

  const shaderMat = new ShaderMaterial('wormholeShaderMat', scene, { vertex: vertName, fragment: fragName }, {
    attributes: ['position', 'normal', 'uv'],
    uniforms: ['worldViewProjection', 'world', 'cameraPosition', 'iTime', 'iResolution'],
    samplers: ['uTexture']
  });

  shaderMat.backFaceCulling = false;
  shaderMat.wireframe = !!opts?.wireframe;

  try {
    const w = scene.getEngine().getRenderWidth();
    const h = scene.getEngine().getRenderHeight();
    if ((shaderMat as any).setVector2) {
      (shaderMat as any).setVector2('iResolution', new (BABYLON as any).Vector2(w, h));
    } else if ((shaderMat as any).setFloat) {
      (shaderMat as any).setFloat('iResolution.x', w);
      (shaderMat as any).setFloat('iResolution.y', h);
    }
    if (scene.activeCamera && (shaderMat as any).setVector3) {
      (shaderMat as any).setVector3('cameraPosition', scene.activeCamera.position);
    }
  } catch (e) { /* ignore */ }

  const metalTexture = new BABYLON.Texture('/metal.jpg', scene);
  metalTexture.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
  metalTexture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
  try { shaderMat.setTexture('uTexture', metalTexture); } catch (e) { /* ignore */ }

  const onBefore = () => {
    try {
      const t = performance.now() / 1000;
      shaderMat.setFloat('iTime', t);
      if (scene.activeCamera && (shaderMat as any).setVector3) (shaderMat as any).setVector3('cameraPosition', scene.activeCamera.position);
      if (mesh) (shaderMat as any).setMatrix('world', mesh.getWorldMatrix());
    } catch (e) { /* ignore */ }
  };
  scene.onBeforeRenderObservable.add(onBefore);

  const onResize = () => {
    try {
      const w = scene.getEngine().getRenderWidth();
      const h = scene.getEngine().getRenderHeight();
      if ((shaderMat as any).setVector2) {
        (shaderMat as any).setVector2('iResolution', new (BABYLON as any).Vector2(w, h));
      }
    } catch (e) { /* ignore */ }
  };
  window.addEventListener('resize', onResize);

  const dispose = () => {
    try { scene.onBeforeRenderObservable.removeCallback(onBefore); } catch (e) { /* ignore */ }
    try { window.removeEventListener('resize', onResize); } catch (e) { /* ignore */ }
    try { metalTexture.dispose(); } catch (e) { /* ignore */ }
    try { shaderMat.dispose(); } catch (e) { /* ignore */ }
  };

  return { material: shaderMat, dispose };
}
