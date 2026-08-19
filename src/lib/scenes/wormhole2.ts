import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { WaterMaterial } from '@babylonjs/materials/water';

import { setupSceneDrone } from '../drone/setupDrone';
import { getPositionOnPath } from '../wormhole/PathUtils';
import { createTorus } from '../wormhole/Torus';
import { setupPhysics, setupLighting, setupCameras } from '../wormhole/sceneUtils';
import { visualizePathDebug } from '../wormhole/debugPath';
import { ObstacleManager } from '../obstacle/ObstacleManager';
import { installKeyboardControls } from '../input/keyboardControls';
import { installDualShockControls } from '../input/dualshockControls';
import { randomFrom, getTextureUrl } from '../assets/assetsConfig';
import { updateProgress, cleanupDroneControl, droneControl, displaySpeed, droneEvents, adjustDroneSpeed, burstAccelerate, SPEED_INCREMENT } from '../stores/droneControl.svelte.js';
import { initRealtimeControl } from '../services/RealtimeControl';
import { createDroneInputState, inputFromKeys } from '../input/inputTypes';
import { setOnRevolutionComplete } from '../stores/droneRevolution';
import { startAmbient, resumeAudioOnGesture, stopAmbient, playLaserFireSound } from '$lib/scores/ambient';
import { WORMHOLE2_CONFIG } from './wormhole2/wormhole2.config';
import { getDronePathIndexFactory } from './wormhole2/wormhole2.helpers';
import { createKeyboardHandlers } from './wormhole2/wormhole2.keyboard';
import { setupDroneCollision } from './wormhole2/wormhole2.collision';
import type { DronePhysicsState } from '../drone/droneControllers';
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
const { torus, torusPlane, torusMainRadius, torusTubeRadius, pathPoints } = await createTorus(scene, {
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
const physicsState: DronePhysicsState = { collisionStopUntil: 0 };
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

/* ignore transient physics positioning errors */

this.registerCleanup(setupDroneCollision(droneAggregate, physicsState));

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

const projectiles: Array<{ mesh: BABYLON.Mesh; aggregate: BABYLON.PhysicsAggregate | null; velocity: BABYLON.Vector3; expiry: number; light?: BABYLON.PointLight }> = [];
const fireProjectile = () => {
try {
const rotation = drone.absoluteRotationQuaternion ?? drone.rotationQuaternion ?? BABYLON.Quaternion.Identity();
const forward = new BABYLON.Vector3(-1, 0, 0).applyRotationQuaternion(rotation).normalize();

const bbox = drone.getBoundingInfo?.().boundingBox;
const boxCenter = bbox ? bbox.centerWorld.clone() : drone.position.clone();
const halfSize = bbox
? bbox.maximumWorld.subtract(bbox.minimumWorld).scale(0.5)
: new BABYLON.Vector3(1, 1, 1);

const origin = boxCenter.clone().add(forward.scale(Math.max(halfSize.x, halfSize.y, halfSize.z) * 0.9));

const muzzle = BABYLON.MeshBuilder.CreateSphere('droneMuzzleFlash', { diameter: 0.45, segments: 8 }, scene);
muzzle.position.copyFrom(origin);
muzzle.material = new BABYLON.StandardMaterial('droneMuzzleMat', scene);
const muzzleMat = muzzle.material as BABYLON.StandardMaterial;
muzzleMat.diffuseColor = new BABYLON.Color3(1, 0.9, 0.3);
muzzleMat.emissiveColor = new BABYLON.Color3(1, 0.8, 0.1);
muzzleMat.specularColor = new BABYLON.Color3(1, 1, 1);
muzzle.isPickable = false;

const projectileLight = new BABYLON.PointLight('droneProjectileLight', origin.clone(), scene);
projectileLight.diffuse = new BABYLON.Color3(1, 0.8, 0.2);
projectileLight.specular = new BABYLON.Color3(1, 0.7, 0.1);
projectileLight.intensity = 0.9;
projectileLight.range = 12;

const projectile = BABYLON.MeshBuilder.CreateSphere('droneProjectile', { diameter: 0.5, segments: 12 }, scene);
projectile.position.copyFrom(origin.clone());
projectile.material = new BABYLON.StandardMaterial('droneProjectileMat', scene);
const mat = projectile.material as BABYLON.StandardMaterial;
mat.diffuseColor = new BABYLON.Color3(1, 0.2, 0.2);
mat.emissiveColor = new BABYLON.Color3(1, 0.2, 0.2);
mat.specularColor = new BABYLON.Color3(1, 1, 1);
projectile.isPickable = false;

const aggregate = new BABYLON.PhysicsAggregate(
projectile,
BABYLON.PhysicsShapeType.SPHERE,
{ mass: 1, restitution: 0.7, friction: 0.2 },
scene
);
const velocity = forward.scale(45);
aggregate.body.setLinearVelocity(velocity);
aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());

projectiles.push({
mesh: projectile,
aggregate,
velocity,
expiry: performance.now() + 2000,
light: projectileLight
});

projectiles.push({
mesh: muzzle,
aggregate: null,
velocity: BABYLON.Vector3.Zero(),
expiry: performance.now() + 120,
light: projectileLight
});

try { playLaserFireSound(); } catch (e) { console.warn('Laser fire sound failed:', e); }
console.log('💥 Drone fired projectile along the real nose direction');
} catch (e) {
console.warn('Failed to fire projectile:', e);
}
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
pathPoints,
fireProjectile
});
const renderInput = createDroneInputState();
this.registerCleanup(installKeyboardControls(keyboardHandlers));
this.registerCleanup(installDualShockControls(scene, keyboardHandlers));
this.registerCleanup(() => cleanupDroneControl(true));

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
	getInput: () => inputFromKeys(keyboardHandlers.keysPressed, renderInput),
	physicsState,
gimbal,
torusGeometry: { torusCenter, torusMainRadius, torusTubeRadius }
});
const projectileUpdate = () => {
for (let i = projectiles.length - 1; i >= 0; i--) {
const projectile = projectiles[i];
try {
if (projectile.aggregate) {
projectile.aggregate.body.setLinearVelocity(projectile.velocity);
}
if (projectile.light) {
const elapsed = performance.now() - (projectile.expiry - 2000);
const fade = Math.max(0, 1 - elapsed / 2000);
projectile.light.intensity = 0.9 * fade;
projectile.light.range = 12 * fade;
projectile.light.position.copyFrom(projectile.mesh.position);
}
if (performance.now() > projectile.expiry) {
if (projectile.aggregate) {
try { projectile.aggregate.dispose(); } catch {}
}
if (projectile.light) {
try { projectile.light.dispose(); } catch {}
}
try { projectile.mesh.dispose(); } catch {}
projectiles.splice(i, 1);
}
} catch {
if (projectile.aggregate) {
try { projectile.aggregate.dispose(); } catch {}
}
if (projectile.light) {
try { projectile.light.dispose(); } catch {}
}
try { projectile.mesh.dispose(); } catch {}
projectiles.splice(i, 1);
}
}
};
scene.registerBeforeRender(renderLoop);
scene.registerBeforeRender(projectileUpdate);
this.registerCleanup(() => { try { scene.unregisterBeforeRender(renderLoop); } catch {} });
this.registerCleanup(() => { try { scene.unregisterBeforeRender(projectileUpdate); } catch {} });
this.registerCleanup(() => {
for (const projectile of [...projectiles]) {
if (projectile.aggregate) {
try { projectile.aggregate.dispose(); } catch {}
}
try { projectile.mesh.dispose(); } catch {}
}
projectiles.length = 0;
});

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
			authUrl: 'https://kolown.net/api/ghost_auth',
			channelName: 'chronoescape',
			onMove: () => burstAccelerate(),
			onSpeedUp: () => adjustDroneSpeed(SPEED_INCREMENT),
			onSpeedDown: () => adjustDroneSpeed(-SPEED_INCREMENT),
			onObstruct: async () => {
				const idx = getDronePathIndex();
				const targetIdx = ((idx + 10) % this.pathPoints.length + this.pathPoints.length) % this.pathPoints.length;
				await obstacles.place('cube', {
					index: targetIdx,
					size: 5.5,
					physics: true,
					thrustMs: 3000,
					thrustSpeed: -30,
					autoDisposeMs: 60000,
					faceUVTextureId: randomFrom('metal', 'cube3', 'cube4', 'cube5', 'collage1', 'cube6'),
					faceUVLayout: 'grid'
				});
			},
			onPortal: async () => {
				const idx = getDronePathIndex();
				const targetIdx = ((idx + 10) % this.pathPoints.length + this.pathPoints.length) % this.pathPoints.length;
				const portal = await obstacles.place('portal', {
					index: targetIdx,
					posterTextureId: randomFrom('portal1', 'portal2'),
					width: 20,
					height: 20,
					offsetY: 0,
					onTrigger: () => { try { onPortalTrigger?.(); } catch {} }
				}) as any;
				return portal;
			},
			onNextMission,
			setPortal,
			isSceneAlive: () => !!this.scene && !this.scene?.isDisposed
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
