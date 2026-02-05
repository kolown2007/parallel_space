import * as BABYLON from '@babylonjs/core';

export interface OrbOptions {
	/** Orb height (cylinder length) */
	height?: number;
	/** Orb diameter (cylinder diameter) */
	diameter?: number;
	/** Glow intensity */
	/** (Glow removed) */
	// glowIntensity?: number;
	/** Point light intensity */
	lightIntensity?: number;
	/** Light range */
	lightRange?: number;
	/** Orb color (used for material emissive and light color) */
	color?: BABYLON.Color3;
	/** Enable physics (static by default) */
	physics?: boolean;
	/** Local point-light radius to limit illumination around the orb */
	localRange?: number;
	/** (Glow removed) */
	// glow?: boolean;
	/** Use a rectangular-like area light (approximated with multiple point lights). */
	areaLight?: boolean;
	/** Width/height for area light approximation */
	areaLightSize?: [number, number];
	/** Intensity for area light (overrides `lightIntensity` when provided) */
	areaLightIntensity?: number;
	/** Offset applied to the created light(s) relative to the orb position */
	areaLightOffset?: BABYLON.Vector3;
}

export interface OrbResult {
	mesh: BABYLON.Mesh;
	light: BABYLON.Light | undefined;
	areaLights?: BABYLON.Light[];
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
		// glowIntensity = 2,
		lightIntensity = 5,
		lightRange = undefined,
		color = new BABYLON.Color3(1, 0.9, 0.6), // warm white-yellow
		physics = false,
		localRange,
		// glow = true,
		areaLight = false,
		areaLightSize,
		areaLightIntensity,
		areaLightOffset
	} = options;

	// Create sphere mesh
	const orb = BABYLON.MeshBuilder.CreateSphere(
		`orb_${Date.now()}`,
		{ 
			diameter,
			segments: 16 
		},
		scene
	);
	orb.position = position.clone();
	console.log(`✨ SPHERE ORB CREATED!`);
	console.log(`✨ Position: x=${position.x.toFixed(2)}, y=${position.y.toFixed(2)}, z=${position.z.toFixed(2)}`);
	console.log(`✨ Options: diameter=${diameter}`);
	console.log(`✨ Color: r=${color.r.toFixed(2)}, g=${color.g.toFixed(2)}, b=${color.b.toFixed(2)}`);

	// Create visible material with some brightness
	const mat = new BABYLON.StandardMaterial(`orbMaterial_${Date.now()}`, scene);
	mat.diffuseColor = color;
	mat.emissiveColor = color.scale(0.3); // Add some self-illumination for visibility
	mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
	mat.backFaceCulling = false; // Ensure visible from all angles
	orb.material = mat;

	// Determine an effective light range. Prefer an explicit `lightRange` if provided,
	// otherwise fall back to `localRange`, then a heuristic based on diameter.
	const effectiveLightRange = typeof lightRange === 'number' && lightRange > 0
		? lightRange
		: (typeof localRange === 'number' && localRange > 0 ? localRange : Math.max(diameter * 2.5, 2));

	// Create lighting. If `areaLight` is requested, approximate an area light
	// by placing several point lights over a small rectangle centered on the orb.
	let light: BABYLON.Light | undefined;
	let areaLights: BABYLON.Light[] | undefined;
	try {
		if (areaLight) {
			const size = Array.isArray(areaLightSize) ? areaLightSize : [Math.max(0.5, diameter), Math.max(0.5, diameter) * 2];
			const inten = typeof areaLightIntensity === 'number' ? areaLightIntensity : lightIntensity;
			const w = Math.max(0.01, size[0]);
			const h = Math.max(0.01, size[1]);
			const offsets = [
				new BABYLON.Vector3(-w / 2, 0, -h / 2),
				new BABYLON.Vector3(w / 2, 0, -h / 2),
				new BABYLON.Vector3(-w / 2, 0, h / 2),
				new BABYLON.Vector3(w / 2, 0, h / 2)
			];
			areaLights = [];
			for (let i = 0; i < offsets.length; i++) {
				const pos = position.clone().add(offsets[i]).add(areaLightOffset || BABYLON.Vector3.Zero());
				const pl = new BABYLON.PointLight(`orbAreaLight_${Date.now()}_${i}`, pos, scene);
				pl.intensity = inten / offsets.length;
				pl.range = effectiveLightRange;
				pl.diffuse = color;
				pl.parent = orb;
				areaLights.push(pl);
				if (i === 0) light = pl;
			}
		} else {
			const pl = new BABYLON.PointLight(`orbLight_${Date.now()}`, position.clone(), scene);
			pl.intensity = lightIntensity;
			pl.range = effectiveLightRange;
			pl.diffuse = color;
			pl.parent = orb;
			light = pl;
		}
	} catch (e) {
		console.warn('Orb.create: failed creating light(s)', e);
	}

	// Optional physics (static obstacle)
	let aggregate: BABYLON.PhysicsAggregate | undefined;
	if (physics) {
		aggregate = new BABYLON.PhysicsAggregate(
			orb,
			BABYLON.PhysicsShapeType.SPHERE,
			{ mass: 0, restitution: 0.5 },
			scene
		);
	}

	// No area-light support in public API anymore; use local point light only.

	// Glow layer removed — orb uses emissive material and lights only

	const dispose = () => {
		try { aggregate?.dispose(); } catch {}
		try { if (areaLights) { for (const l of areaLights) try { l.dispose(); } catch {} } } catch {}
		try { if (light && !areaLights) light.dispose(); } catch {}
		// glowLayer disposal removed
		try { mat.dispose(); } catch {}
		try { orb.dispose(); } catch {}
	};

	return { mesh: orb, light, areaLights, material: mat, dispose };
}
