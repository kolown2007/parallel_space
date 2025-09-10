    import * as BABYLON from 'babylonjs';
  
  
  export class WormHoleScene {

   

    static CreateScene(engine: any, canvas: HTMLCanvasElement) {
      const scene = new BABYLON.Scene(engine);

      const camera = new BABYLON.ArcRotateCamera('camera1', Math.PI / 2, Math.PI / 4, 10, BABYLON.Vector3.Zero(), scene);
      camera.attachControl(canvas, true);



      const light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 0), scene);
      light.intensity = 0.8;


      const torus = BABYLON.MeshBuilder.CreateTorus('torus', { diameter: 90, thickness: 10,tessellation: 10}, scene);
      torus.position.y = 1;

//debuging delete soon
    console.log("torus:" +  torus.getBoundingInfo());

    var torusMaterial = new BABYLON.StandardMaterial("materialTorus1", scene);
    torusMaterial.wireframe = false;
    torus.material = torusMaterial;


    const sphere = BABYLON.MeshBuilder.CreateSphere('sphere', { diameter: 2, segments: 32 }, scene);
    sphere.position.y = 1;
    sphere.position.x = 5;



 // Get torus dimensions from bounding box
      const boundingInfo = torus.getBoundingInfo();
      const boundingBox = boundingInfo.boundingBox;
      const torusDiameter = boundingBox.maximumWorld.x - boundingBox.minimumWorld.x;
      const torusThickness = 5; // store thickness since it's hard to calculate from bounding box
      
      console.log('Calculated torus diameter:', torusDiameter);

      // Create a helical line inside the torus using calculated data
   const points = [];
      const torusOuterRadius = torusDiameter / 2; // 15
      const torusTubeRadius = torusThickness / 2; // 2.5
      
      // Line follows the torus tube path, not the center hole
      const torusMainRadius = torusOuterRadius - torusTubeRadius; // 12.5 (center of tube)
      const lineRadius = torusTubeRadius * 0.6; // CONTROL: how far from tube center (0.1-0.9)
      
      const turns = 1; // CONTROL: loops around main torus (1, 2, 3...)
      const spiralTurns = 2; // CONTROL: how many times it spirals inside tube (2, 4, 8...)
      const segments = 128; // CONTROL: smoothness (64=rough, 256=very smooth)
      
      for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const mainAngle = t * Math.PI * 2 * turns; // angle around main torus
          const tubeAngle = t * Math.PI * 2 * spiralTurns; // CONTROL: spiral frequency
          
          // Position on the main torus ring
          const mainX = Math.cos(mainAngle) * torusMainRadius;
          const mainZ = Math.sin(mainAngle) * torusMainRadius;
          const mainY = 1; // same as torus center
          
          // Offset within the tube
          const tubeX = Math.cos(tubeAngle) * lineRadius;
          const tubeY = Math.sin(tubeAngle) * lineRadius;
          
          // Combine main position + tube offset
          const x = mainX + Math.cos(mainAngle) * tubeX; // offset in radial direction
          const z = mainZ + Math.sin(mainAngle) * tubeX; // offset in radial direction  
          const y = mainY + tubeY; // offset vertically
          
          points.push(new BABYLON.Vector3(x, y, z));
      }
      
      const vectorLine = BABYLON.MeshBuilder.CreateLines('vectorLine', { points: points }, scene);
      vectorLine.color = new BABYLON.Color3(0, 1, 1); // cyan line
    






    


 window.addEventListener('keydown', (event) => {
    if (event.key === 'q') {
        torusMaterial.wireframe = !torusMaterial.wireframe; // toggle current state
        console.log('Wireframe:', torusMaterial.wireframe); // debug log
    }
});
    

      return scene;
    }

    
  }