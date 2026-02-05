import * as BABYLON from '@babylonjs/core';
import { createKeysPressed } from '../../chronoescape/drone/droneControllers';
import { adjustDroneSpeed, burstAccelerate, SPEED_INCREMENT } from '../../stores/droneControl.svelte';
import { revolutionStore } from '../../stores/droneRevolution';
import { get } from 'svelte/store';
import { droneControl } from '../../stores/droneControl.svelte';
import { randomFrom } from '../../assetsConfig';
import type { ObstacleManager } from '../../chronoescape/obstacle/ObstacleManager';
import { WORMHOLE2_CONFIG } from './wormhole2.config';

export interface KeyboardHandlerDeps {
	drone: BABYLON.AbstractMesh;
	droneAggregate: any;
	torusMaterial: BABYLON.StandardMaterial;
	obstacles: ObstacleManager;
	getDronePathIndex: () => number;
	switchCamera: () => void;
	onPortalTrigger?: () => void;
	setPortal: (portal: any) => void;
	pathPoints: BABYLON.Vector3[];
}

export function createKeyboardHandlers(deps: KeyboardHandlerDeps) {
	const {
		drone,
		droneAggregate,
		torusMaterial,
		obstacles,
		getDronePathIndex,
		switchCamera,
		onPortalTrigger,
		setPortal,
		pathPoints
	} = deps;

	const keysPressed = createKeysPressed();

	return {
		keysPressed,
		
		onToggleWireframe: () => {
			torusMaterial.wireframe = !torusMaterial.wireframe;
			console.log('Wireframe:', torusMaterial.wireframe);
		},

		onReset: () => {
			drone.position = new BABYLON.Vector3(40, 1, 0);
			try {
				droneAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
				droneAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
			} catch (e) {
				/* ignore if aggregate missing */
			}
			try {
				revolutionStore.reset();
			} catch (e) {}
			console.log('Drone reset');
		},

		onSwitchCamera: switchCamera,

		onSpeedUp: () => {
			adjustDroneSpeed(SPEED_INCREMENT);
			const newSpeed = get(droneControl).speed;
			const displaySpeed = Math.round(newSpeed * 21600); // points/sec (360 points × 60fps)
			console.log(`Speed: ${displaySpeed} points/sec`);
		},

		onSpeedDown: () => {
			adjustDroneSpeed(-SPEED_INCREMENT);
			const newSpeed = get(droneControl).speed;
			const displaySpeed = Math.round(newSpeed * 21600); // points/sec (360 points × 60fps)
			console.log(`Speed: ${displaySpeed} points/sec`);
		},

		onBurst: () => {
			burstAccelerate();
			console.log('🚀 Burst acceleration activated!');
		},

		onPlaceCube: async () => {
			try {
				const idx = getDronePathIndex();
				const targetIdx = (idx + WORMHOLE2_CONFIG.obstacles.cubeAheadOffset) % pathPoints.length;
				
				obstacles.place('cube', {
					index: targetIdx,
					size: WORMHOLE2_CONFIG.obstacles.cubeSize,
					physics: true,
					thrustMs: WORMHOLE2_CONFIG.obstacles.cubeThrustMs,
					thrustSpeed: WORMHOLE2_CONFIG.obstacles.cubeThrustSpeed,
					autoDisposeMs: WORMHOLE2_CONFIG.obstacles.cubeAutoDispose,
					faceUVTextureId: randomFrom('metal', 'cube3', 'cube4', 'cube5','collage1'),
					faceUVLayout: 'grid'
				});
				
				console.log('📦 Placed cube at path index', targetIdx);
			} catch (e) {
				console.warn('Failed to place cube:', e);
			}
		},

		onPlacePortal: async () => {
			try {
				const idx = getDronePathIndex();
				const targetIdx = (idx + WORMHOLE2_CONFIG.obstacles.portalAheadOffset) % pathPoints.length;
				
				const portal = await obstacles.place('portal', {
					index: targetIdx,
					posterTextureId: randomFrom('portal1','portal2'),
					width: WORMHOLE2_CONFIG.obstacles.portalWidth,
					height: WORMHOLE2_CONFIG.obstacles.portalHeight,
					offsetY: 0,
					onTrigger: () => {
						try {
							onPortalTrigger?.();
						} catch (e) {}
					}
				}) as any;
				
				setPortal(portal);
				console.log('🌀 Portal placed at index', targetIdx);
			} catch (e) {
				console.warn('Failed to place portal:', e);
			}
		}
	};
}
