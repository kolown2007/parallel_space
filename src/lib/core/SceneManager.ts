export type SceneMode = 'scene1' | 'scene2' | 'scene3'; 

export class SceneManager {
  mode: SceneMode = 'scene2';
  private videoMount: any = null;
  private renderActive = false;
  private scene3: any = null;
  private scene3Loading = false;

  constructor(
    private engine: any,
    private scene2: any,
    private scene3Factory: () => Promise<any>,
    private mountVideo: () => any
  ) {}

  switchTo(mode: SceneMode) {
    if (mode === 'scene1') {
      this.stopRender();
      if (!this.videoMount) {
        this.videoMount = this.mountVideo();
      }
      this.mode = mode;
    } else if (mode === 'scene3') {
      this.cleanup();
      this.mode = mode;
      if (!this.scene3 && !this.scene3Loading) {
        this.scene3Loading = true;
        this.scene3Factory().then((s) => {
          this.scene3 = s;
          this.scene3Loading = false;
          if (this.mode === 'scene3') this.startRender();
        }).catch((e) => {
          console.warn('Scene3 failed to load', e);
          this.scene3Loading = false;
        });
      } else {
        this.startRender();
      }
    } else {
      this.cleanup();
      this.startRender();
      this.mode = mode;
    }
  }

  private startRender() {
    if (this.renderActive) return;
    this.renderActive = true;
    this.engine.runRenderLoop(() => {
      if (this.mode === 'scene2') this.scene2?.render();
      else if (this.mode === 'scene3') this.scene3?.render();
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
    try { this.scene3?.dispose(); } catch {}
    this.scene3 = null;
  }
}
