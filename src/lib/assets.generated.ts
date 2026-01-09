// This file is generated from static/assets.json — DO NOT EDIT
export const ASSETS_JSON = {
  "models": {
    "jollibee": {
      "rootUrl": "https://kolown.net/storage/library/chronoescape/",
      "filename": "glb/jollibee.glb",
      "type": "mesh"
    },
    "drone": {
      "rootUrl": "https://kolown.net/storage/library/chronoescape/",
      "filename": "glb/usb.glb",
      "type": "mesh"
    },
    "rabbit": {
      "rootUrl": "https://kolown.net/storage/library/chronoescape/",
      "filename": "glb/rabbit.glb",
      "type": "mesh"
    },
    "mario": {
      "rootUrl": "https://kolown.net/storage/library/chronoescape/",
      "filename": "glb/mario.glb",
      "type": "mesh"
    },
    "manikineko": {
      "rootUrl": "https://kolown.net/storage/library/chronoescape/",
      "filename": "glb/manikineko.glb",
      "type": "mesh"
    },
    "armycatbike": {
      "rootUrl": "https://kolown.net/storage/library/chronoescape/",
      "filename": "glb/armycatbike.glb",
      "type": "mesh"
    },
    "army": {
      "rootUrl": "https://kolown.net/storage/library/chronoescape/",
      "filename": "glb/army.glb",
      "type": "mesh"
    }
  },
  "textures": {
    "metal": {
      "rootUrl": "https://kolown.net/storage/library/chronoescape/",
      "filename": "metal.jpg",
      "type": "texture"
    },
    "tribal": {
      "rootUrl": "https://kolown.net/storage/library/chronoescape/",
      "filename": "tribal.png",
      "type": "texture"
    },
    "heightmap": {
      "rootUrl": "https://kolown.net/storage/library/chronoescape/",
      "filename": "heightmaps/heightmap.png",
      "type": "texture"
    },
    "malunggay": {
      "rootUrl": "https://kolown.net/storage/library/chronoescape/",
      "filename": "malunggay.png",
      "type": "texture"
    }
  },
  "shaders": {
    "universe": {
      "vertex": "https://kolown.net/storage/library/chronoescape/shaders/universe.vert.glsl",
      "fragment": "https://kolown.net/storage/library/chronoescape/shaders/universe.frag.glsl"
    }
  },
  "videos": {
    "plant1": {
      "url": "https://kolown.net/storage/library/chronoescape/videos/plant1.mp4"
    },
    "plant2": {
      "url": "https://kolown.net/storage/library/chronoescape/videos/plant2.mp4"
    }
  },
  "loading": {
    "backgroundImage": "https://kolown.net/storage/library/chronoescape/loading/parallelspace.png"
  },
  "physics": {
    "havokWasm": "https://kolown.net/storage/library/chronoescape/HavokPhysics.wasm"
  }
} as const;

export function getAssetList() {
  const items = [] as Array<{id:string, rootUrl:string, filename:string}>;
  if ((ASSETS_JSON as any).models) {
    for (const k of Object.keys((ASSETS_JSON as any).models)) {
      const v:any = (ASSETS_JSON as any).models[k];
      items.push({ id: k, rootUrl: v.rootUrl || '', filename: v.filename || '' });
    }
  }
  if ((ASSETS_JSON as any).textures) {
    for (const k of Object.keys((ASSETS_JSON as any).textures)) {
      const v:any = (ASSETS_JSON as any).textures[k];
      items.push({ id: k, rootUrl: v.rootUrl || '', filename: v.filename || '' });
    }
  }
  return items;
}

export function getModelUrl(id: string) {
  const v = (ASSETS_JSON as any).models?.[id];
  return v ? (v.rootUrl || '') + (v.filename || '') : '';
}

export function getTextureUrl(id: string) {
  const v = (ASSETS_JSON as any).textures?.[id];
  return v ? (v.rootUrl || '') + (v.filename || '') : '';
}

export function getVideoUrl(id: string) {
  return (ASSETS_JSON as any).videos?.[id]?.url || '';
}

export function getPhysicsWasmUrl() {
  return (ASSETS_JSON as any).physics?.havokWasm || '';
}

export function getLoadingImageUrl() {
  return (ASSETS_JSON as any).loading?.backgroundImage || '';
}
