declare module '@babylonjs/core/Engines/WebGPU/webgpuEngine' {
  export class WebGPUEngine {
    constructor(canvas: HTMLCanvasElement, options?: any);
    initAsync?: () => Promise<void>;
    resize?: () => void;
    dispose?: () => void;
  }
}
