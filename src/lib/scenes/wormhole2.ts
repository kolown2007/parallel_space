    import * as BABYLON from 'babylonjs';
  
  
  export class WormHoleScene2 {
    static CreateScene(engine: any, canvas: HTMLCanvasElement) {
      const scene = new BABYLON.Scene(engine);

      const camera = new BABYLON.FreeCamera('camera1', new BABYLON.Vector3(0, 5, -10), scene);
      camera.setTarget(BABYLON.Vector3.Zero());
      camera.attachControl(canvas, true);

      const light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 0), scene);
      light.intensity = 0.7;

      const sphere = BABYLON.MeshBuilder.CreateSphere('sphere', { diameter: 2, segments: 32 }, scene);
      sphere.position.y = 1;
   

      return scene;
    }
  }