
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { WaterMaterial } from '@babylonjs/materials/water';
import { loadAssetsConfig } from '$lib/assetsConfig';


const SKYBOX_FACE_URLS = [
	"https://playground.babylonjs.com/textures/TropicalSunnyDay_px.jpg",
	"https://playground.babylonjs.com/textures/TropicalSunnyDay_py.jpg",
	"https://playground.babylonjs.com/textures/TropicalSunnyDay_pz.jpg",
	"https://playground.babylonjs.com/textures/TropicalSunnyDay_nx.jpg",
	"https://playground.babylonjs.com/textures/TropicalSunnyDay_ny.jpg",
	"https://playground.babylonjs.com/textures/TropicalSunnyDay_nz.jpg"
];
const WATER_BUMP_URL = "https://playground.babylonjs.com/textures/waterbump.png";

var createScene = async function (
	engine: BABYLON.Engine,
	canvas: HTMLCanvasElement
): Promise<BABYLON.Scene> {
	var scene = new BABYLON.Scene(engine);

	var camera = new BABYLON.ArcRotateCamera("Camera", 3 * Math.PI / 2, Math.PI / 4, 100, BABYLON.Vector3.Zero(), scene);
	camera.attachControl(canvas, true, false);

	var light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene);
	
	// Skybox
	var skybox = BABYLON.Mesh.CreateBox("skyBox", 5000.0, scene);
    var skyboxMaterial = new BABYLON.StandardMaterial("skyBox", scene);
	skyboxMaterial.backFaceCulling = false;
	skyboxMaterial.reflectionTexture = BABYLON.CubeTexture.CreateFromImages(SKYBOX_FACE_URLS, scene);
	skyboxMaterial.reflectionTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;
	skyboxMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0);
	skyboxMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
	skyboxMaterial.disableLighting = true;
	skybox.material = skyboxMaterial;
		
	// Water
	var waterMesh = BABYLON.Mesh.CreateGround("waterMesh", 2048, 2048, 16, scene, false);
	var water = new WaterMaterial("water", scene, new BABYLON.Vector2(512, 512));
	water.backFaceCulling = true;
	water.bumpTexture = new BABYLON.Texture(WATER_BUMP_URL, scene);
	water.windForce = -10;
	water.waveHeight = 1.7;
	water.bumpHeight = 0.1;
	water.windDirection = new BABYLON.Vector2(1, 1);
	water.waterColor = new BABYLON.Color3(0, 0, 221 / 255);
	water.colorBlendFactor = 0.02;
	water.addToRenderList(skybox);
	waterMesh.material = water;

	// Load jollibee model
	try {
		const assetsConfig = await loadAssetsConfig();
		const jollibeeAsset = assetsConfig.models.jollibee;
		const result = await BABYLON.SceneLoader.ImportMeshAsync(
			"",
			jollibeeAsset.rootUrl,
			jollibeeAsset.filename,
			scene
		);
		result.meshes.forEach(mesh => {
			mesh.position = new BABYLON.Vector3(0, -4, 0);
			mesh.scaling = new BABYLON.Vector3(20, 20, 20);
			water.addToRenderList(mesh);
		});
	} catch (error) {
		console.error('Failed to load jollibee model:', error);
	}

	return scene;
}
export default createScene
