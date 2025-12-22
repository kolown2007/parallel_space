#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const inPath = path.resolve(__dirname, '..', 'static', 'assets.json');
const outPath = path.resolve(__dirname, '..', 'src', 'lib', 'assets.generated.ts');

function safeStringify(obj) {
  return JSON.stringify(obj, null, 2);
}

if (!fs.existsSync(inPath)) {
  console.error('assets.json not found at', inPath);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));

const content = `// This file is generated from static/assets.json — DO NOT EDIT
export const ASSETS_JSON = ${safeStringify(data)} as const;

export function getAssetList() {
  const items: Array<{id:string, rootUrl:string, filename:string}> = [];
  if (ASSETS_JSON.models) {
    for (const k of Object.keys(ASSETS_JSON.models)) {
      const v:any = (ASSETS_JSON.models as any)[k];
      items.push({ id: k, rootUrl: v.rootUrl || '', filename: v.filename || '' });
    }
  }
  if (ASSETS_JSON.textures) {
    for (const k of Object.keys(ASSETS_JSON.textures)) {
      const v:any = (ASSETS_JSON.textures as any)[k];
      items.push({ id: k, rootUrl: v.rootUrl || '', filename: v.filename || '' });
    }
  }
  return items;
}

export function getModelUrl(id: string) {
  return (ASSETS_JSON.models as any)?.[id]?.rootUrl + (ASSETS_JSON.models as any)?.[id]?.filename || '';
}

export function getTextureUrl(id: string) {
  return (ASSETS_JSON.textures as any)?.[id]?.rootUrl + (ASSETS_JSON.textures as any)?.[id]?.filename || '';
}

export function getVideoUrl(id: string) {
  return (ASSETS_JSON.videos as any)?.[id]?.url || '';
}

export function getPhysicsWasmUrl() {
  return (ASSETS_JSON.physics as any)?.havokWasm || '';
}

export function getLoadingImageUrl() {
  return (ASSETS_JSON.loading as any)?.backgroundImage || '';
}
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, content, 'utf8');
console.log('Generated', outPath);
