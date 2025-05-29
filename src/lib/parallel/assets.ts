import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

export enum AssetType {
    JOLLIBEE = 'jollibee'
}

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
    private initialized: boolean = false;
    private baseUrl: string;

    constructor(scene: BABYLON.Scene, baseUrl: string = "https://kolown.net/assets/p1sonet/") {
        this.scene = scene;
        this.assetManager = new BABYLON.AssetsManager(scene);
        this.meshCache = new Map();
        this.instanceTracker = new Map();
        this.baseUrl = baseUrl;
        
        // Configure asset manager
        this.assetManager.useDefaultLoadingScreen = false;
        this.assetManager.onTaskErrorObservable.add((task) => {
            console.error(`Failed to load asset: ${task.name}`, task.errorObject);
        });
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;
        try {
            await this.loadModel(AssetType.JOLLIBEE, 'jollibee.glb');
            this.initialized = true;
        } catch (error) {
            console.error("Failed to initialize AssetManager:", error);
            throw error;
        }
    }

    async loadModel(type: AssetType, fileName: string): Promise<void> {
        return new Promise((resolve, reject) => {
        const task = this.assetManager.addMeshTask(type, "", this.baseUrl, fileName);

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
            // Clone specific mesh (index 1 contains actual model)
            const mainMesh = originalMeshes[1].clone(`instance_${config.type}_${Date.now()}`, null);
         
            if (!mainMesh) {
                throw new Error('Failed to clone mesh');
            }

            // Apply transformations
            mainMesh.position = config.position;
            mainMesh.scaling = config.scale;
            mainMesh.receiveShadows = true; // Enable receiving shadows

            // Create bounding box for physics
            const bounds = mainMesh.getBoundingInfo().boundingBox;
            const size = bounds.maximumWorld.subtract(bounds.minimumWorld);

            // Apply physics with improved collision settings
            if (config.physics) {
                new BABYLON.PhysicsAggregate(
                    mainMesh,
                    config.physics.shape || BABYLON.PhysicsShapeType.CONVEX_HULL, // Use convex hull for better collision
                    {
                        mass: config.physics.mass ?? 0, // Default to 0 for static objects
                        restitution: config.physics.restitution ?? 0.4, // Increase bounciness
                        friction: config.physics.friction ?? 0.8, // Increase friction
                        extents: size.scale(0.5)
                    },
                    this.scene
                );

                // Enable collision detection explicitly
                mainMesh.checkCollisions = true;
            }

            this.instanceTracker.set(mainMesh.id, [mainMesh]);
            return [mainMesh];
    
        } catch (error) {
            console.error('Error creating asset:', error);
            return null;
        }
    }

    cleanup(): void {
        this.instanceTracker.forEach((instances) => {
            instances.forEach(mesh => mesh?.dispose());
        });
        this.instanceTracker.clear();
        this.meshCache.forEach((meshes) => {
            meshes.forEach(mesh => mesh?.dispose());
        });
        this.meshCache.clear();
    }
}