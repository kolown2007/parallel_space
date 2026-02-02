import * as BABYLON from '@babylonjs/core';

export interface OrbOptions {
	/** Orb height (cylinder length) */
	height?: number;
	/** Orb diameter (cylinder diameter) */
	diameter?: number;
	/** Glow intensity */
	glowIntensity?: number;
	/** Point light intensity */
	lightIntensity?: number;
	/** Light range */
	lightRange?: number;
	/** Orb color (used for material emissive and light color) */
	color?: BABYLON.Color3;
	/** Enable physics (static by default) */
	physics?: boolean;
}

export interface OrbResult {
	mesh: BABYLON.Mesh;
	light: BABYLON.PointLight;
	material: BABYLON.StandardMaterial;
	dispose: () => void;
}

/**
 * Create a glowing fluorescent lamp-like cylinder at a given position
 */
export function createOrb(
	scene: BABYLON.Scene,
	position: BABYLON.Vector3,
	options: OrbOptions = {}
): OrbResult {
	const {
		height = 3.0,
		diameter = 0.8,
		glowIntensity = 2,
		lightIntensity = 5,
		lightRange = 15,
		color = new BABYLON.Color3(1, 0.9, 0.6), // warm white-yellow
		physics = false
	} = options;

	// Create cylinder mesh (fluorescent lamp)
	const orb = BABYLON.MeshBuilder.CreateCylinder(
		`orb_${Date.now()}`,
		{ 
			height, 
			diameter, 
			tessellation: 16 
		},
		scene
	);
	orb.position = position.clone();
	console.log(`✨ FLUORESCENT ORB CREATED!`);
	console.log(`✨ Position: x=${position.x.toFixed(2)}, y=${position.y.toFixed(2)}, z=${position.z.toFixed(2)}`);
	console.log(`✨ Options: height=${height}, diameter=${diameter}, glowIntensity=${glowIntensity}`);
	console.log(`✨ Color: r=${color.r.toFixed(2)}, g=${color.g.toFixed(2)}, b=${color.b.toFixed(2)}`);

	// Create glowing material
	const mat = new BABYLON.StandardMaterial(`orbMaterial_${Date.now()}`, scene);
	mat.emissiveColor = color;
	mat.diffuseColor = color.scale(0.3);
	mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
	mat.backFaceCulling = false; // Ensure visible from all angles
	orb.material = mat;

	// Add point light
	const light = new BABYLON.PointLight(`orbLight_${Date.now()}`, position.clone(), scene);
	light.diffuse = color;
	light.specular = color.scale(0.3);
	light.intensity = lightIntensity;
	light.range = lightRange;
	light.parent = orb;

	// Optional physics (static obstacle)
	let aggregate: BABYLON.PhysicsAggregate | undefined;
	if (physics) {
		aggregate = new BABYLON.PhysicsAggregate(
			orb,
			BABYLON.PhysicsShapeType.CYLINDER,
			{ mass: 0, restitution: 0.5 },
			scene
		);
	}

	// Add to glow layer if available (include both glow and standard rendering)
	try {
		const glowLayer = scene.getGlowLayerByName('defaultGlowLayer');
		if (glowLayer) {
			const layerLegacy = glowLayer as BABYLON.GlowLayer & Record<string, unknown>;
			if (typeof layerLegacy.addIncludedMesh === 'function') {
				(layerLegacy.addIncludedMesh as (mesh: BABYLON.Mesh) => void)(orb);
				console.log('✅ Added orb to glow layer via addIncludedMesh');
			} else if (typeof layerLegacy.addIncludedOnlyMesh === 'function') {
				(layerLegacy.addIncludedOnlyMesh as (mesh: BABYLON.Mesh) => void)(orb);
				console.log('✅ Added orb to glow layer via addIncludedOnlyMesh');
			} else {
				console.warn('⚠️ GlowLayer does not expose include helpers');
			}
		} else {
			console.warn('⚠️ GlowLayer not found in scene');
		}
	} catch (e) {
		console.warn('GlowLayer error:', e);
	}

	const dispose = () => {
		try { aggregate?.dispose(); } catch {}
		try { light.dispose(); } catch {}
		try { mat.dispose(); } catch {}
		try { orb.dispose(); } catch {}
	};

	return { mesh: orb, light, material: mat, dispose };
}
