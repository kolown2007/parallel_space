import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

// AssetType is a string key identifying cached models. Keep flexible for future assets.
export type AssetType = string;

interface AssetConfig {
    type: AssetType;
    position: BABYLON.Vector3;
    scale: BABYLON.Vector3;
    physics?: {
        shape?: BABYLON.PhysicsShapeType;
        mass?: number;
        restitution?: number;
        friction?: number;
    };
}

export class AssetManager {
    private scene: BABYLON.Scene;
    private assetManager: BABYLON.AssetsManager;
    private meshCache: Map<string, BABYLON.AbstractMesh[]>;
    private instanceTracker: Map<string, BABYLON.AbstractMesh[]>;
    private floatObservers: Map<string, BABYLON.Observer<BABYLON.Scene>>;
    private initialized: boolean = false;
    private baseUrl: string;

    constructor(scene: BABYLON.Scene, baseUrl: string = "https://kolown.net/assets/p1sonet/") {
        this.scene = scene;
        this.assetManager = new BABYLON.AssetsManager(scene);
        this.meshCache = new Map();
        this.instanceTracker = new Map();
    this.floatObservers = new Map();
        this.baseUrl = baseUrl;
        
        // Configure asset manager
        this.assetManager.useDefaultLoadingScreen = false;
        this.assetManager.onTaskErrorObservable.add((task) => {
            console.error(`Failed to load asset: ${task.name}`, task.errorObject);
        });
    }

    async initialize(): Promise<void> {
    // No eager asset loading by default. Call loadModel manually when needed.
    this.initialized = true;
    }

    async loadModel(type: AssetType, fileName: string): Promise<void> {
    return new Promise((resolve, reject) => {
    // Add a cache-busting query string during local development to avoid stale cached GLB/texture issues
    const isLocal = typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const urlFile = isLocal ? `${fileName}?t=${Date.now()}` : fileName;
    const task = this.assetManager.addMeshTask(type, "", this.baseUrl, urlFile);

            task.onSuccess = (task) => {
                this.meshCache.set(type, task.loadedMeshes);
                task.loadedMeshes[0].position = new BABYLON.Vector3(0,50,0);
              
                console.log(`Loaded model ${type} successfully:`, 
                    task.loadedMeshes.map(m => m.name).join(', '));
                    
                resolve();
            };

    

            task.onError = (task, message) => {
                reject(new Error(`Failed to load ${type}: ${message}`));
            };

            this.assetManager.load();
        });
    }

    createAsset(config: AssetConfig): BABYLON.AbstractMesh[] | null {
        if (!this.initialized) {
            console.warn('AssetManager not initialized');
            return null;
        }

        const originalMeshes = this.meshCache.get(config.type);
        if (!originalMeshes) {
            console.error(`No cached mesh found for type: ${config.type}`);
            return null;
        }

        try {
            // Create a parent container for this instance
            const container = new BABYLON.TransformNode(`asset_${config.type}_${Date.now()}`, this.scene);
            const clones: BABYLON.AbstractMesh[] = [];

            // For each source mesh, try to create an instance (shares materials/textures). Fallback to clone.
            for (const src of originalMeshes) {
                if (!(src instanceof BABYLON.Mesh)) continue;
                let c: BABYLON.AbstractMesh | null = null;
                try {
                    // Prefer instances where possible (safer for preserving textures)
                    if ((src as BABYLON.Mesh).geometry && typeof (src as BABYLON.Mesh).createInstance === 'function') {
                        c = (src as BABYLON.Mesh).createInstance(`${src.name}_inst_${Date.now()}`);
                    }
                } catch (e) {
                    c = null;
                }

                if (!c) {
                    // Fallback: clone the mesh (non-recursive). If the loader produced a TransformNode root,
                    // individual mesh clones will still render and we parent them to the container below.
                    c = (src as BABYLON.Mesh).clone(`${src.name}_clone_${Date.now()}`, null);
                }

                if (!c) continue;

                // Ensure material is assigned (some clones may lose material references)
                const srcMat = (src as BABYLON.Mesh).material as any;
                let cMat = (c as BABYLON.Mesh).material as any;
                if (srcMat && !cMat) {
                    (c as BABYLON.Mesh).material = srcMat;
                    cMat = srcMat;
                }
                // If the clone/instance has a material but no active textures, prefer the source material which typically has textures
                try {
                    const hasNoTextures = cMat && typeof cMat.getActiveTextures === 'function' && cMat.getActiveTextures().length === 0;
                    if (hasNoTextures && srcMat) {
                        (c as BABYLON.Mesh).material = srcMat;
                    }
                } catch (e) {
                    // ignore diagnostic errors
                }

                c.parent = container;
                c.isVisible = true;
                // Setting receiveShadows on InstancedMesh has no effect; only on regular Mesh
                try {
                    if (!(c instanceof (BABYLON as any).InstancedMesh)) {
                        c.receiveShadows = true;
                    }
                } catch (e) {
                    // fallback: if InstancedMesh class not available, skip setting for instances
                }
                clones.push(c);
            }

            // If nothing was created, try a final fallback to clone the first node
            if (clones.length === 0) {
                const root = originalMeshes[0];
                const main = root.clone(`asset_root_clone_${Date.now()}`, null);
                if (!main) throw new Error('Failed to clone fallback root');
                main.parent = container;
                clones.push(main as BABYLON.AbstractMesh);
            }

            // Apply transforms to the container (so children are positioned/scaled correctly).
            // If physics is enabled for this asset we'll parent the visual container to the
            // physics mesh (physClone) so the physics body drives world transforms.
            container.scaling = config.scale.clone();

            // If physics is requested, create a separate physics root mesh that will own the
            // PhysicsAggregate. Do NOT parent the physics mesh to the visual container, instead
            // parent the visual container to the physics mesh so physics controls world transforms.
            let physRoot: BABYLON.Mesh | null = null;
            if (config.physics) {
                const sourceForPhysics = originalMeshes.find(m => (m instanceof BABYLON.Mesh) && typeof (m as BABYLON.Mesh).getTotalVertices === 'function' && (m as BABYLON.Mesh).getTotalVertices() > 0) as BABYLON.Mesh | undefined;
                if (sourceForPhysics) {
                    physRoot = sourceForPhysics.clone(`phys_${config.type}_${Date.now()}`, null) as BABYLON.Mesh | null;
                    if (physRoot) {
                        // Place physics root at the intended spawn location and scale it to match visuals
                        physRoot.position = config.position.clone();
                        physRoot.scaling = config.scale.clone();
                        physRoot.isVisible = false;
                        try {
                            const bounds = physRoot.getBoundingInfo().boundingBox;
                            const size = bounds.maximumWorld.subtract(bounds.minimumWorld);
                            // Prefer a cheap approximate shape for spawned assets to reduce physics cost.
                            // Use BOX by default (based on bounding box extents). Use the provided shape
                            // only when explicitly requested (e.g., CONVEX_HULL for detailed collisions).
                            const preferredShape = config.physics.shape || BABYLON.PhysicsShapeType.BOX;
                            const extents = size.scale(0.5);
                            const agg = new BABYLON.PhysicsAggregate(
                                physRoot,
                                preferredShape,
                                {
                                    mass: config.physics.mass ?? 0,
                                    restitution: config.physics.restitution ?? 0.4,
                                    friction: config.physics.friction ?? 0.8,
                                    extents
                                },
                                this.scene
                            );
                            physRoot.checkCollisions = true;

                            // Parent visuals to the physics root so they follow physics-driven movement.
                            container.parent = physRoot;
                            // Localize visuals to the physics root
                            container.position = new BABYLON.Vector3(0, 0, 0);

                            // Give a gentle random impulse to separate spawned bodies; keep magnitude small
                            // to avoid high initial simulation cost.
                            try {
                                const rand = new BABYLON.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6);
                                if ((agg as any).body && typeof (agg as any).body.applyImpulse === 'function') {
                                    (agg as any).body.applyImpulse(rand, physRoot.getAbsolutePosition());
                                }
                            } catch (e) {
                                // non-fatal if impulse can't be applied
                            }

                            // include physRoot in cleanup/instance tracking
                            clones.push(physRoot);
                        } catch (e) {
                            console.warn('Failed to create physics aggregate for asset:', e);
                            // fallback: put visuals at requested position so they at least appear in scene
                            container.parent = null;
                            container.position = config.position.clone();
                        }
                    } else {
                        // couldn't clone source for physics; position visuals directly
                        container.parent = null;
                        container.position = config.position.clone();
                    }
                } else {
                    console.warn('No suitable source mesh found for physics for asset', config.type);
                    container.parent = null;
                    container.position = config.position.clone();
                }
            } else {
                // No physics: place container in world and use a light floating animation for visuals only.
                container.parent = null;
                container.position = config.position.clone();
                try {
                    const baseY = container.position.y;
                    const start = performance.now() / 1000;
                    const speed = 0.7 + Math.random() * 0.8;
                    const amp = 0.18 * Math.max(1, (config.scale?.y ?? 1));
                    const obs = this.scene.onBeforeRenderObservable.add(() => {
                        const t = performance.now() / 1000 - start;
                        container.position.y = baseY + Math.sin(t * speed) * amp;
                        container.rotation.y += 0.01; // slow spin
                    });
                    this.floatObservers.set(container.id, obs);
                } catch (e) {
                    // ignore if performance or observable not available
                }
            }

            // (Physics handled above when requested — no duplicate physics creation here)

            this.instanceTracker.set(container.id, clones);

            // Debug: log material/texture state for each created mesh to help diagnose missing textures after refresh
            try {
                clones.forEach((m) => {
                    const mat = (m as BABYLON.Mesh).material as any;
                    if (!mat) {
                        console.warn(`Asset ${config.type} spawn: mesh ${m.name} has no material`);
                        return;
                    }
                    const active = typeof mat.getActiveTextures === 'function' ? mat.getActiveTextures() : [];
                    console.log(`Asset ${config.type} spawn: mesh=${m.name} material=${mat.name} textures=`, active.map((t: any) => t && t.name ? t.name : t));
                });
            } catch (e) {
                // non-critical
            }
            return clones;
        } catch (error) {
            console.error('Error creating asset:', error);
            return null;
        }
    }

    cleanup(): void {
        this.instanceTracker.forEach((instances, key) => {
            // remove float observer if present
            const obs = this.floatObservers.get(key);
            if (obs) {
                this.scene.onBeforeRenderObservable.remove(obs);
                this.floatObservers.delete(key);
            }
            instances.forEach(mesh => mesh?.dispose());
        });
        this.instanceTracker.clear();
        this.meshCache.forEach((meshes) => {
            meshes.forEach(mesh => mesh?.dispose());
        });
        this.meshCache.clear();
    }
}