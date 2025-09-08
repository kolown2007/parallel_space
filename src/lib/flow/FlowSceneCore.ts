import * as BABYLON from '@babylonjs/core';

function createLight(
    position: BABYLON.Vector3,
    rotation: BABYLON.Vector3,
    color: BABYLON.Color3,
    name: string,
    scene: BABYLON.Scene
): void {
    const box = BABYLON.MeshBuilder.CreateBox("box" + name, { width: 6, height: 6, depth: 0.01 }, scene);
    const lightMaterial = new BABYLON.StandardMaterial("lightMat" + name, scene);
    lightMaterial.disableLighting = true;
    lightMaterial.emissiveColor = color;
    box.material = lightMaterial;

    box.position = position;
    box.rotation = rotation;
    box.scaling.y = 3;
    box.scaling.x = 0.4;

    const light = new (BABYLON as any).RectAreaLight("light" + name, new BABYLON.Vector3(0, 0, 1), 6, 6, scene);
    light.parent = box;
    light.specular = color;
    light.diffuse = color;
    light.intensity = 0.8;
}

export async function createScene(engine: BABYLON.Engine, canvas: HTMLCanvasElement): Promise<BABYLON.Scene> {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = BABYLON.Color4.FromColor3(BABYLON.Color3.Black(), 1);

    const camera = new BABYLON.FreeCamera("camera1", new BABYLON.Vector3(0, 15, -20), scene);
    camera.setTarget(BABYLON.Vector3.Zero());
    camera.attachControl(canvas, true);

    // Ensure rendering buffer matches device pixel ratio for sharp output when supported
    try {
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
        // setHardwareScalingLevel accepts floats; use 1/dpr to render at native DPR (smaller => higher res)
        try { engine.setHardwareScalingLevel(1 / dpr); } catch (e) { /* ignore if not supported */ }
    } catch (e) {
        // ignore in non-browser environments
    }

    createLight(new BABYLON.Vector3(0, 5, 4), new BABYLON.Vector3(-2.5, 3.141592), BABYLON.Color3.White(), "light1", scene);
    createLight(new BABYLON.Vector3(-8, 5, 4), new BABYLON.Vector3(-2.5, 3.141592), BABYLON.Color3.White(), "light2", scene);
    createLight(new BABYLON.Vector3(8, 5, 4), new BABYLON.Vector3(-2.5, 3.141592), BABYLON.Color3.White(), "light3", scene);

    // Simple Havok initialization: try dynamic import, then BABYLON fallback.
    try {
        // Try dynamic import (works when Havok shipped as async initializer)
        try {
            const mod = await import('@babylonjs/havok');
            const Havok = (mod && (mod as any).default) ? (mod as any).default : mod;
            if (typeof Havok === 'function') {
                // Havok may be an async initializer function returning the runtime
                const maybe = Havok({ locateFile: () => '/HavokPhysics.wasm' });
                const resolved = maybe && typeof maybe.then === 'function' ? await maybe : maybe;
                if (resolved) {
                    try {
                        const plugin = new (BABYLON as any).HavokPlugin(true, resolved);
                        scene.enablePhysics(new BABYLON.Vector3(0, 0, 0), plugin);
                    } catch (err) {
                        console.warn('Failed to create HavokPlugin from resolved runtime', err);
                    }
                }
            }
        } catch (err) {
            // dynamic import failed or not provided in this build - try BABYLON.HavokPlugin
            if ((BABYLON as any).HavokPlugin) {
                try {
                    const plugin = new (BABYLON as any).HavokPlugin();
                    scene.enablePhysics(new BABYLON.Vector3(0, 0, 0), plugin);
                } catch (err2) {
                    console.warn('BABYLON.HavokPlugin exists but failed to initialize', err2);
                }
            } else {
                console.warn('Havok not available; physics disabled for this scene.');
            }
        }
    } catch (e) {
        console.warn('Havok initialization error; physics disabled', e);
    }

    const width = 8;
    const height = 8;
    const depth = 8;

    const baseBlocks = [
        BABYLON.MeshBuilder.CreateSphere("sphere0", { diameter: 0.2, segments: 8 }, scene),
        BABYLON.MeshBuilder.CreateSphere("sphere1", { diameter: 0.3, segments: 8 }, scene),
        BABYLON.MeshBuilder.CreateSphere("sphere2", { diameter: 0.4, segments: 8 }, scene),
    ];

    const standardMaterial = new BABYLON.PBRMaterial("StandardMaterial0", scene);
    (standardMaterial as any).roughness = 0.1;
    (standardMaterial as any).metallic = 0.1;
    standardMaterial.albedoColor = BABYLON.Color3.White();

    const standardMaterial2 = new BABYLON.PBRMaterial("StandardMaterial1", scene);
    (standardMaterial2 as any).roughness = 0.3;
    (standardMaterial2 as any).metallic = 0.3;
    standardMaterial2.albedoColor = BABYLON.Color3.White();

    const standardMaterial3 = new BABYLON.PBRMaterial("StandardMaterial2", scene);
    (standardMaterial3 as any).roughness = 0.5;
    (standardMaterial3 as any).metallic = 0.5;
    standardMaterial3.albedoColor = BABYLON.Color3.White();

    baseBlocks[0].material = standardMaterial;
    baseBlocks[1].material = standardMaterial2;
    baseBlocks[2].material = standardMaterial3;

    const total = width * height * depth;

    const matrixBuffer = new Float32Array(total * 16);
    const matrix = BABYLON.Matrix.Identity();
    const colorBuffer = new Float32Array(total * 4);
    const offsets = new Float32Array(total * 3 * 3);

    for (let b = 0; b < 3; b++) {
        for (let i = 0; i < width; i++) {
            for (let j = 0; j < height; j++) {
                for (let k = 0; k < depth; k++) {
                    const index = i + j * width + k * width * height;
                    const v = index * 17.01;
                    let x = Math.sin(v) * 10.0;
                    let y = Math.cos(v) * 1 + 2;
                    let z = (Math.sin(v) * Math.cos(v)) * 10.0;
                    const disp = 1.3;
                    const ox = Math.random() * disp - disp * 0.5;
                    const oy = Math.random() * disp - disp * 0.5;
                    const oz = Math.random() * disp - disp * 0.5;
                    x += ox; y += oy; z += oz;
                    matrix.setTranslationFromFloats(x, y, z);
                    matrix.copyToArray(matrixBuffer, index * 16);
                    const colVar = 0.2 + Math.random() * 0.2;
                    colorBuffer[index * 4] = colVar;
                    colorBuffer[index * 4 + 1] = colVar;
                    colorBuffer[index * 4 + 2] = colVar;
                    colorBuffer[index * 4 + 3] = 1;
                    offsets[(index + total * b) * 3 + 0] = ox;
                    offsets[(index + total * b) * 3 + 1] = oy;
                    offsets[(index + total * b) * 3 + 2] = oz;
                }
            }
        }
        baseBlocks[b].thinInstanceSetBuffer("matrix", matrixBuffer, 16, false);
        baseBlocks[b].thinInstanceSetBuffer("color", colorBuffer, 4);
    }

    const blockMass = 1;
    const agg = [
        new (BABYLON as any).PhysicsAggregate(baseBlocks[0], BABYLON.PhysicsShapeType.SPHERE, { mass: blockMass, restitution: 0 }, scene),
        new (BABYLON as any).PhysicsAggregate(baseBlocks[1], BABYLON.PhysicsShapeType.SPHERE, { mass: blockMass, restitution: 0 }, scene),
        new (BABYLON as any).PhysicsAggregate(baseBlocks[2], BABYLON.PhysicsShapeType.SPHERE, { mass: blockMass, restitution: 0 }, scene),
    ];

    let t = 0.0;
    const vtmp0 = new BABYLON.Vector3();
    const q = new BABYLON.Quaternion(0, 0, 0, 1);

    const computePos = function (vec: BABYLON.Vector3, v: number): void {
        const x = Math.sin(v) * 10;
        const y = Math.cos(v) * 1 + 2;
        const z = (Math.sin(v) * Math.cos(v)) * 10.0 - 2;
        vec.set(x, y, z);
    };

    scene.onBeforeRenderObservable.add(() => {
        const delta = 0.004;
        for (let b = 0; b < 3; b++) {
            for (let i = 0; i < width; i++) {
                for (let j = 0; j < height; j++) {
                    for (let k = 0; k < depth; k++) {
                        const index = i + j * width + k * width * height;
                        const v0 = index * 17.01 + t * (1.0 + Math.cos(index * 0.01) * 0.5);
                        computePos(vtmp0, v0);
                        vtmp0.x += offsets[(index + total * b) * 3 + 0];
                        vtmp0.y += offsets[(index + total * b) * 3 + 1];
                        vtmp0.z += offsets[(index + total * b) * 3 + 2];
                        (agg[b].body as any).setTargetTransform(vtmp0, q, index);
                    }
                }
            }
        }
        t += delta;
    });

    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 120, height: 120 }, scene);
    ground.material = standardMaterial;

    return scene;
}
