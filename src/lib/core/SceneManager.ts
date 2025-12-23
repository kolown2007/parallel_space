export type SceneMode = 'scene1' | 'scene2';

export class SceneManager {
  mode: SceneMode = 'scene2';
  private videoMount: any = null;
  private renderActive = false;

  constructor(
    private engine: any,
    private scene2: any,
    private mountVideo: () => any
  ) {}

  switchTo(mode: SceneMode) {
    if (mode === 'scene1') {
      this.stopRender();
      if (!this.videoMount) {
        this.videoMount = this.mountVideo();
      }
    } else {
      this.cleanup();
      this.startRender();
    }
    this.mode = mode;
  }

  private startRender() {
    if (this.renderActive) return;
    this.renderActive = true;
    this.engine.runRenderLoop(() => {
      if (this.mode === 'scene2') this.scene2?.render();
    });
  }

  private stopRender() {
    this.renderActive = false;
    this.engine?.stopRenderLoop();
  }

  private cleanup() {
    this.videoMount?.cleanup();
    this.videoMount = null;
  }

  dispose() {
    this.stopRender();
    this.cleanup();
  }
}
