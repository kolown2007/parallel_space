export type SceneMode = 'scene1' | 'scene2' | 'scene3'; 

export class SceneManager {
  mode: SceneMode = 'scene2';
  private paused = false;
  private videoMount: any = null;
  private renderActive = false;
  private scene2: any = null;
  private scene2Factory: () => Promise<any>;
  private scene2Loading = false;
  private scene3: any = null;
  private scene3Loading = false;

  constructor(
    private engine: any,
    scene2Factory: () => Promise<any>,
    private scene3Factory: () => Promise<any>,
    private mountVideo: () => any,
    scene2: any = null
  ) {
    this.scene2 = scene2;
    this.scene2Factory = scene2Factory;
  }

  private disposeScene2() {
    try { this.scene2?.dispose(); } catch {}
    this.scene2 = null;
    this.scene2Loading = false;
  }

  switchTo(mode: SceneMode, onReady?: () => void) {
    this.paused = false;

    if (mode === 'scene1') {
      this.stopRender();
      if (!this.videoMount) {
        this.videoMount = this.mountVideo();
      }
      this.mode = mode;
      onReady?.();
    } else if (mode === 'scene3') {
      this.cleanup();
      this.disposeScene2();
      this.mode = mode;
      if (!this.scene3 && !this.scene3Loading) {
        this.scene3Loading = true;
        this.scene3Factory().then((s) => {
          this.scene3 = s;
          this.scene3Loading = false;
          if (!this.paused && this.mode === 'scene3') this.startRender();
          onReady?.();
        }).catch((e) => {
          console.warn('Scene3 failed to load', e);
          this.scene3Loading = false;
          onReady?.();
        });
      } else {
        if (!this.paused) this.startRender();
        onReady?.();
      }
    } else {
      this.cleanup();
      this.mode = mode;
      if (!this.scene2 && !this.scene2Loading) {
        this.scene2Loading = true;
        this.scene2Factory().then((s) => {
          this.scene2 = s;
          this.scene2Loading = false;
          if (!this.paused && this.mode === 'scene2') this.startRender();
          onReady?.();
        }).catch((e) => {
          console.warn('Scene2 failed to load', e);
          this.scene2Loading = false;
          onReady?.();
        });
      } else {
        if (this.scene2 && !this.paused) this.startRender();
        onReady?.();
      }
    }
  }

  private startRender() {
    if (this.paused || this.renderActive) return;
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

  public pause() {
    this.paused = true;
    this.stopRender();
  }

  private cleanup() {
    this.videoMount?.cleanup();
    this.videoMount = null;
  }

  dispose() {
    this.stopRender();
    this.cleanup();
    this.disposeScene2();
    try { this.scene3?.dispose(); } catch {}
    this.scene3 = null;
  }
}
