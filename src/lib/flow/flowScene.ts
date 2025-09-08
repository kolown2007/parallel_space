import { KolownScene } from '@kolown/scene-manager';
import * as BABYLON from '@babylonjs/core';
import { createScene as createFlowScene } from './FlowSceneCore';

export class FlowScene extends KolownScene {
  private canvas: HTMLCanvasElement;
  private engine?: BABYLON.Engine;
  private scene?: BABYLON.Scene;
  private resizeHandler?: () => void;

  constructor(name: string, canvas: HTMLCanvasElement) {
    super(name);
    this.canvas = canvas;
  }

  public async initialize(): Promise<void> {
  this.engine = new BABYLON.Engine(this.canvas, true);
  // Ensure rendering buffer matches device pixel ratio for sharp output
 

  this.scene = await createFlowScene(this.engine, this.canvas);

  // Make sure the engine has the correct size and responds to window resizes
  try { this.engine.resize(); } catch (e) { /* ignore */ }
  this.resizeHandler = () => { try { this.engine?.resize(); } catch (e) { /* ignore */ } };
  window.addEventListener('resize', this.resizeHandler);
  }

  public onEnter(): void {
    if (this.engine && this.scene) {
      this.engine.runRenderLoop(() => {
        try { this.scene!.render(); } catch (e) { /* ignore */ }
      });
    }
  }

  public onExit(): void {
    try { if (this.engine) this.engine.stopRenderLoop(); } catch (e) { /* ignore */ }
    try { if (this.scene) this.scene.dispose(); } catch (e) { /* ignore */ }
    try { if (this.engine) this.engine.dispose(); } catch (e) { /* ignore */ }
  if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
  this.engine = undefined;
  this.scene = undefined;
  }
}
