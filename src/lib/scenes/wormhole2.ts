import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

import { setupSceneDrone } from '../drone/setupDrone';
import { getPositionOnPath } from '../wormhole/PathUtils';
import { createTorus } from '../wormhole/Torus';
import { setupPhysics, setupLighting, setupCameras } from '../wormhole/sceneUtils';
import { visualizePathDebug } from '../wormhole/debugPath';
import { ObstacleManager } from '../obstacle/ObstacleManager';
import { installKeyboardControls } from '../input/keyboardControls';
import { randomFrom, getTextureUrl } from '../assets/assetsConfig';
import { updateProgress, cleanupDroneControl, droneControl, displaySpeed, droneEvents } from '../stores/droneControl.svelte.js';
import { sceneRefStore } from '../stores/sceneRefStore';
import { registerScene, unregisterScene } from '../scenemanager/SceneRegistry';
import { initRealtimeControl } from '../services/RealtimeControl';
import { setOnRevolutionComplete } from '../stores/droneRevolution';
import { startAmbient, resumeAudioOnGesture, stopAmbient } from '$lib/scores/ambient';
import { WORMHOLE2_CONFIG } from './wormhole2/wormhole2.config';
import { getDronePathIndexFactory } from './wormhole2/wormhole2.helpers';
import { createKeyboardHandlers } from './wormhole2/wormhole2.keyboard';
import { setupDroneCollision } from './wormhole2/wormhole2.collision';
import { createRenderLoop } from './wormhole2/wormhole2.render';

export class WormHoleScene2 {
public pathPoints: BABYLON.Vector3[] = [];
private cleanupRegistry: Array<() => void> = [];
private modelCache: Map<string, BABYLON.AssetContainer> = new Map();
private scene?: BABYLON.Scene;

constructor(
private engine: any,
private canvas: HTMLCanvasElement,
private onPortalTrigger?: () => void,
private onNextMission?: () => void
) {}

private registerCleanup(cleanup: () => void): void {
this.cleanupRegistry.push(cleanup);
}

private disposeAll(): void {
for (const cleanup of this.cleanupRegistry) {
try { cleanup(); } catch (e) { console.warn('Cleanup error:', e); }
}
this.cleanupRegistry = [];
for (const container of this.modelCache.values()) {
try { container.dispose(); } catch (e) { console.warn('Model cache disposal error:', e); }
}
this.modelCache.clear();
try { stopAmbient(); } catch (e) { console.warn('stopAmbient error:', e); }
}

private async init(): Promise<BABYLON.Scene> {
const cfg = WORMHOLE2_CONFIG;
const scene = new BABYLON.Scene(this.engine);
this.scene = scene;

await setupPhysics(scene);

const { followCamera, switchCamera } = setupCameras(scene, this.canvas, 'follow');
setupLighting(scene);

resumeAudioOnGesture(document);

// Torus track
const { torus, torusMainRadius, torusTubeRadius, pathPoints } = await createTorus(scene, {
...cfg.torus,
materialTextureId: randomFrom('loading3', 'rag', 'mat', 'cube3', 'collage1', 'wood')
});
this.pathPoints = pathPoints;
const torusCenter = torus.getAbsolutePosition();
const torusMaterial = torus.material as BABYLON.StandardMaterial;

// Texture pool for revolution changes
const textureIds = ['loading3', 'rag', 'mat', 'cube3', 'collage1', 'wood'];
const texturePool = new Map<string, BABYLON.Texture>();
await Promise.all(textureIds.map(async id => {
try {
const url = await getTextureUrl(id);
if (url) texturePool.set(id, new BABYLON.Texture(url, scene, false));
} catch { /* skip failed textures */ }
}));

setOnRevolutionComplete(() => {
const tex = texturePool.get(randomFrom(...textureIds));
if (torusMaterial && tex) torusMaterial.diffuseTexture = tex;
});
this.registerCleanup(() => {
texturePool.forEach(t => { try { t.dispose(); } catch {} });
texturePool.clear();
});

visualizePathDebug(scene, pathPoints, {
...cfg.debug.pathVisualization,
torusCenter,
torusMainRadius,
torusTubeRadius
});

scene.onDisposeObservable.add(() => this.disposeAll());

const onPortalTrigger = this.onPortalTrigger;
const onNextMission = this.onNextMission;

let portals: any[] = [];
const getPortal = () => portals;
const setPortal = (p: any, remove = false) => {
if (remove && p) { portals = portals.filter(x => x !== p); return; }
if (!p) { portals = []; return; }
portals.push(...(Array.isArray(p) ? p : [p]));
};

const obstacles = new ObstacleManager(scene, pathPoints, this.modelCache, this.cleanupRegistry);
let getDronePathIndex: () => number = () => 0;

for (const index of [0, 80, 100, 150, 200]) {
try {
await obstacles.place('model', {
modelNames: [randomFrom('jollibee', 'rabbit', 'mario', 'army', 'armycatbike', 'manikineko')],
count: 1,
index,
offsetY: -20,
scaleRange: [10, 15],
physics: false
});
} catch (e) {
console.warn('Failed to place model at index', index, e);
}
}
try {
await obstacles.place('model', {
modelNames: ['jollibee'],
count: 1,
index: 25,
offsetY: -1,
scaleRange: [5, 7],
physics: true
});
} catch (e) {
console.warn('Failed to place physics Jollibee:', e);
}

try {
const bbIndices = [10, 20, 60, 80, 110, 160, 210, 260, 280, 310];
const bbManager = await obstacles.place('billboard', {
count: bbIndices.length,
height: 35,
textureId: [
'tribal',
'billboard1',
'billboard2',
'billboard3',
'billboard4',
'billboard5',
'billboard6'
]
}) as any;
for (let i = 0; i < bbIndices.length; i++) {
const idx = ((bbIndices[i] % pathPoints.length) + pathPoints.length) % pathPoints.length;
const pos = pathPoints[idx].clone();
pos.y += 1.5;
if (bbManager?.planes?.[i]) bbManager.planes[i].position.copyFrom(pos);
}
} catch (e) {
console.warn('Billboard placement failed:', e);
}

let drone: any, droneAggregate: any;
const droneStartPos = getPositionOnPath(this.pathPoints, cfg.drone.startPathPoint);

try {
const res = await setupSceneDrone(scene, {
assetId: 'drone2',
initialPosition: droneStartPos,
initialRotation: new BABYLON.Vector3(
cfg.drone.initialRotation.x,
cfg.drone.initialRotation.y,
cfg.drone.initialRotation.z
),
mass: cfg.drone.mass,
restitution: cfg.drone.restitution,
friction: cfg.drone.friction,
enableDebug: cfg.debug.enableDroneDebug,
scale: 1
});
drone = res.drone;
droneAggregate = res.droneAggregate;

if (drone.material instanceof BABYLON.StandardMaterial) {
const mat = drone.material as BABYLON.StandardMaterial;
mat.emissiveColor = new BABYLON.Color3(
cfg.drone.emissiveColor.r,
cfg.drone.emissiveColor.g,
cfg.drone.emissiveColor.b
);
mat.diffuseColor = new BABYLON.Color3(
cfg.drone.diffuseColor.r,
cfg.drone.diffuseColor.g,
cfg.drone.diffuseColor.b
);
}

updateProgress(0);
drone.position.copyFrom(droneStartPos);
if (droneAggregate?.body) {
try {
droneAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
droneAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
(droneAggregate.body as any).setPosition?.({
x: droneStartPos.x,
y: droneStartPos.y,
z: droneStartPos.z
});
} catch {
/* ignore transient physics positioning errors */
}
}

this.registerCleanup(setupDroneCollision(droneAggregate));

try {
const sceneId = registerScene(scene, drone, this.pathPoints);
sceneRefStore.set({ sceneId, droneId: sceneId });
this.registerCleanup(() => {
sceneRefStore.set({ sceneId: null, droneId: null });
unregisterScene(sceneId);
});
} catch (e) {
console.warn('Failed to set sceneRefStore:', e);
}

getDronePathIndex = getDronePathIndexFactory(drone, pathPoints);

followCamera.position = drone.position.add(
new BABYLON.Vector3(0, cfg.camera.initialOffsetY, cfg.camera.initialOffsetZ)
);
const gimbal = {
followDistance: cfg.camera.followDistance,
followHeight: cfg.camera.followHeight,
positionSmooth: cfg.camera.positionSmooth,
rotationSmooth: cfg.camera.rotationSmooth,
lookAheadDistance: cfg.camera.lookAheadDistance
};

const keyboardHandlers = createKeyboardHandlers({
drone,
droneAggregate,
torusMaterial,
obstacles,
getDronePathIndex,
switchCamera,
onPortalTrigger,
setPortal,
pathPoints
});
this.registerCleanup(installKeyboardControls(keyboardHandlers));
this.registerCleanup(() => cleanupDroneControl(false));

const autoCubeInterval = setInterval(() => {
keyboardHandlers.onPlaceCube?.();
}, 3000);
this.registerCleanup(() => clearInterval(autoCubeInterval));

const onTap = (e: TouchEvent) => {
e.preventDefault();
keyboardHandlers.onBurst?.();
};
this.canvas.addEventListener('touchstart', onTap, { passive: false });
this.registerCleanup(() => this.canvas.removeEventListener('touchstart', onTap));

const dronePosLogger = setInterval(() => {
// getDronePathIndex(); // Uncomment to enable debug position logging
}, cfg.debug.droneLogIntervalMs);
this.registerCleanup(() => clearInterval(dronePosLogger));

const renderLoop = createRenderLoop({
engine: this.engine,
scene,
drone,
droneAggregate,
followCamera,
pathPoints,
obstacles,
getPortal,
setPortal,
onPortalTrigger,
getDronePathIndex,
keysPressed: keyboardHandlers.keysPressed,
gimbal,
torusGeometry: { torusCenter, torusMainRadius, torusTubeRadius }
});
scene.registerBeforeRender(renderLoop);
this.registerCleanup(() => { try { scene.unregisterBeforeRender(renderLoop); } catch {} });

} catch (e) {
console.warn('Drone setup failed:', e);
}

try {
(this.engine as any)?.loadingScreen?.notifyAssetsReady?.();
} catch (e) {
console.warn('Failed to notify loading screen:', e);
}

try {
const realtimeConnection = await initRealtimeControl({
scene,
droneMesh: drone,
pathPoints: this.pathPoints,
onPortalTrigger,
setPortal,
onNextMission
});
this.registerCleanup(() => {
try { realtimeConnection.disconnect(); } catch (e) { console.warn('Realtime disconnect error:', e); }
});
} catch (e) {
console.warn('Failed to initialize realtime control:', e);
}

return scene;
}

static async CreateScene(
engine: any,
canvas: HTMLCanvasElement,
onPortalTrigger?: () => void,
onNextMission?: () => void
): Promise<BABYLON.Scene> {
const sceneInstance = new WormHoleScene2(engine, canvas, onPortalTrigger, onNextMission);
return sceneInstance.init();
}
}
