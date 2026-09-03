import * as BABYLON from '@babylonjs/core';
import { pickRandomStationName, setStationName } from '$lib/stores/stationProgress';

export class StationSigns {
	private readonly billboard: BABYLON.Mesh;
	private readonly texture: BABYLON.DynamicTexture;
	private readonly material: BABYLON.StandardMaterial;
	private readonly visibleAfterPathIndex: number;

	constructor(scene: BABYLON.Scene, pathPoints: BABYLON.Vector3[], pathIndex = 360, visibleAfterPathIndex = 50) {
		this.visibleAfterPathIndex = visibleAfterPathIndex;
		const index = pathIndex % Math.max(1, pathPoints.length);
		const position = pathPoints[index]?.clone() ?? new BABYLON.Vector3(0, 0, 0);
		position.y += 7;

		this.billboard = BABYLON.MeshBuilder.CreatePlane('recto_station_billboard', { width: 18, height: 5 }, scene);
		this.billboard.position.copyFrom(position);
		this.billboard.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
		this.billboard.isPickable = false;
		this.billboard.setEnabled(false);

		const selectedStationName = pickRandomStationName();
		setStationName(selectedStationName);
		this.texture = new BABYLON.DynamicTexture('recto_station_label', { width: 1024, height: 256 }, scene, true);
		const ctx = this.texture.getContext() as CanvasRenderingContext2D | null;
		if (ctx) {
			ctx.clearRect(0, 0, 1024, 256);
			ctx.fillStyle = 'rgba(10, 14, 24, 0.78)';
			ctx.fillRect(0, 0, 1024, 256);
			ctx.strokeStyle = 'rgba(194, 228, 255, 0.9)';
			ctx.lineWidth = 8;
			ctx.strokeRect(12, 12, 1000, 232);
			const textLength = selectedStationName.length;
			const fontSize = textLength > 18 ? 62 : textLength > 12 ? 82 : 112;
			ctx.font = `700 ${fontSize}px Arial`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = '#eaf4ff';
			ctx.fillText(selectedStationName, 512, 128);
			this.texture.update();
		}

		this.material = new BABYLON.StandardMaterial('recto_station_material', scene);
		this.material.diffuseTexture = this.texture;
		this.material.emissiveTexture = this.texture;
		this.material.opacityTexture = this.texture;
		this.material.disableLighting = true;
		this.material.backFaceCulling = false;
		this.billboard.material = this.material;
	}

	updateVisibility(pathIndex: number): void {
		const shouldShow = pathIndex >= this.visibleAfterPathIndex;
		this.billboard.setEnabled(shouldShow);
		this.billboard.isVisible = shouldShow;
	}

	dispose(): void {
		try { this.billboard.dispose(); } catch {}
		try { this.texture.dispose(); } catch {}
		try { this.material.dispose(); } catch {}
	}
}
