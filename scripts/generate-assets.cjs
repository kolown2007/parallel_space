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

const content = `// This file is generated from static/assets.json — DO NOT EDIT\nexport const ASSETS_JSON = ${safeStringify(data)} as const;\n\nexport function getAssetList() {\n  const items = [] as Array<{id:string, rootUrl:string, filename:string}>;\n  if ((ASSETS_JSON as any).models) {\n    for (const k of Object.keys((ASSETS_JSON as any).models)) {\n      const v:any = (ASSETS_JSON as any).models[k];\n      items.push({ id: k, rootUrl: v.rootUrl || '', filename: v.filename || '' });\n    }\n  }\n  if ((ASSETS_JSON as any).textures) {\n    for (const k of Object.keys((ASSETS_JSON as any).textures)) {\n      const v:any = (ASSETS_JSON as any).textures[k];\n      items.push({ id: k, rootUrl: v.rootUrl || '', filename: v.filename || '' });\n    }\n  }\n  return items;\n}\n\nexport function getModelUrl(id: string) {\n  const v = (ASSETS_JSON as any).models?.[id];\n  return v ? (v.rootUrl || '') + (v.filename || '') : '';\n}\n\nexport function getTextureUrl(id: string) {\n  const v = (ASSETS_JSON as any).textures?.[id];\n  return v ? (v.rootUrl || '') + (v.filename || '') : '';\n}\n\nexport function getVideoUrl(id: string) {\n  return (ASSETS_JSON as any).videos?.[id]?.url || '';\n}\n\nexport function getPhysicsWasmUrl() {\n  return (ASSETS_JSON as any).physics?.havokWasm || '';\n}\n\nexport function getLoadingImageUrl() {\n  return (ASSETS_JSON as any).loading?.backgroundImage || '';\n}\n`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, content, 'utf8');
console.log('Generated', outPath);
