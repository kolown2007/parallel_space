import * as BABYLON from '@babylonjs/core';
import { Scene, Vector3 } from '@babylonjs/core';

export function createCameras(scene: Scene) {
  // Debug free camera
  const debugCamera = new BABYLON.FreeCamera('debugCam', new Vector3(0, 10, -20), scene);
  (debugCamera as any).speed = 8;
  debugCamera.angularSensibility = 200;
  debugCamera.minZ = 0.1;
  debugCamera.maxZ = 1000;
  debugCamera.setTarget(new Vector3(0, 0, 0));

  // Arc rotate for overview
  const arcCam = new BABYLON.ArcRotateCamera('arcCam', 0, Math.PI / 3, 50, new Vector3(0, 0, 0), scene);
  arcCam.wheelPrecision = 20;
  arcCam.lowerRadiusLimit = 5;
  arcCam.upperRadiusLimit = 500;
  arcCam.minZ = 0.1;
  arcCam.maxZ = 1000;
  arcCam.panningAxis = new Vector3(1, 1, 0);
  arcCam.panningInertia = 0.9;
  arcCam.panningDistanceLimit = 200;

  // Universal camera for free navigation
  const universalCam = new BABYLON.UniversalCamera('universalCam', new Vector3(0, 20, -50), scene);
  (universalCam as any).speed = 15;
  universalCam.angularSensibility = 100;
  universalCam.minZ = 0.1;
  universalCam.maxZ = 2000;
  universalCam.setTarget(new Vector3(0, 0, 0));

  // Drone-follow FlyCamera reserved for runtime updates
  const droneCam = new BABYLON.FlyCamera('droneCam', new Vector3(9, 10, 0), scene) as BABYLON.FlyCamera;
  droneCam.minZ = 0.1;
  droneCam.maxZ = 2000;
  (droneCam as any).speed = 12;

  // Expose cameras and wire metadata for convenience
  scene.metadata = scene.metadata || {};
  scene.metadata.arcCamera = arcCam;
  scene.metadata.universalCamera = universalCam;

  return {
    debugCamera,
    arcCam,
    universalCam,
    droneCam
  };
}
