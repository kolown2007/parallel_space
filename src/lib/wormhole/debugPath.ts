import * as BABYLON from '@babylonjs/core';

export interface PathDebugOptions {
	showLine?: boolean;
	showLabels?: boolean;
	labelInterval?: number;
	lineColor?: BABYLON.Color3;
	labelSize?: number;
	labelOffsetY?: number;
	showStats?: boolean;
	torusCenter?: BABYLON.Vector3;
	torusMainRadius?: number;
	torusTubeRadius?: number;
}

/**
 * Visualize path points with optional line and numbered labels
 */
export function visualizePathDebug(
	scene: BABYLON.Scene,
	pathPoints: BABYLON.Vector3[],
	options: PathDebugOptions = {}
): void {
	const {
		showLine = true,
		showLabels = true,
		labelInterval = 10,
		lineColor = new BABYLON.Color3(0, 1, 1),
		labelSize = 2,
		labelOffsetY = 1,
		showStats = true,
		torusCenter,
		torusMainRadius,
		torusTubeRadius
	} = options;

	// Draw path line
	if (showLine) {
		const debugLine = BABYLON.MeshBuilder.CreateLines('pathDebug', { points: pathPoints }, scene);
		debugLine.color = lineColor;
	}

	// Add numbered labels at intervals
	if (showLabels) {
		for (let i = 0; i < pathPoints.length; i += labelInterval) {
			const pos = pathPoints[i];
			const plane = BABYLON.MeshBuilder.CreatePlane(`pathLabel_${i}`, { size: labelSize }, scene);
			plane.position.copyFrom(pos);
			plane.position.y += labelOffsetY;
			plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

			const texture = new BABYLON.DynamicTexture(`labelTexture_${i}`, { width: 256, height: 128 }, scene, false);
			texture.hasAlpha = true;
			const ctx = texture.getContext() as CanvasRenderingContext2D;
			ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
			ctx.fillRect(0, 0, 256, 128);
			ctx.font = 'bold 80px Arial';
			ctx.fillStyle = 'cyan';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(i.toString(), 128, 64);
			texture.update();

			const mat = new BABYLON.StandardMaterial(`labelMat_${i}`, scene);
			mat.diffuseTexture = texture;
			mat.emissiveTexture = texture;
			mat.opacityTexture = texture;
			mat.disableLighting = true;
			plane.material = mat;
		}
	}

	// Log path statistics
	if (showStats && torusCenter) {
		let minRad = Number.POSITIVE_INFINITY;
		let maxRad = 0;
		let minY = Number.POSITIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;

		for (let i = 0; i < pathPoints.length; i++) {
			const p = pathPoints[i];
			const dx = p.x - torusCenter.x;
			const dz = p.z - torusCenter.z;
			const radial = Math.sqrt(dx * dx + dz * dz);
			minRad = Math.min(minRad, radial);
			maxRad = Math.max(maxRad, radial);
			minY = Math.min(minY, p.y - torusCenter.y);
			maxY = Math.max(maxY, p.y - torusCenter.y);
		}

		console.log('Path debug — torus center:', torusCenter);
		if (torusMainRadius !== undefined) {
			console.log(
				`Path radial distance (min, max): ${minRad.toFixed(4)}, ${maxRad.toFixed(4)} (expected ~${torusMainRadius.toFixed(4)})`
			);
		}
		if (torusTubeRadius !== undefined) {
			console.log(
				`Path Y offset from torus center (min, max): ${minY.toFixed(4)}, ${maxY.toFixed(4)} (expected within +/-${torusTubeRadius.toFixed(4)})`
			);
		}
	}
}
