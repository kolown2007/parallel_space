import * as BABYLON from 'babylonjs';

export class CustomLoadingScreen implements BABYLON.ILoadingScreen {
  // use a solid red background for loading
  public loadingUIBackgroundColor: string = '#BB464B';
  public loadingUIText: string;

  private _container: HTMLDivElement | null = null;

  constructor(loadingUIText: string) {
    this.loadingUIText = loadingUIText;
  }

  public displayLoadingUI() {
    if (typeof document === 'undefined') return;

    // debug
    // console.log('CustomLoadingScreen: displayLoadingUI called');

    // don't recreate if already present
    if (this._container) {
      this._container.style.display = 'block';
      return;
    }

    const container = document.createElement('div');
    container.setAttribute('role', 'status');
    container.style.position = 'fixed';
    // explicit full-viewport sizing to avoid stacking/context issues
    container.style.left = '0';
    container.style.top = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.display = 'block';
    // set background as important to beat competing stylesheet rules
    container.style.setProperty('background', this.loadingUIBackgroundColor, 'important');
    // also set backgroundColor explicitly
    container.style.backgroundColor = this.loadingUIBackgroundColor;
    container.style.background = this.loadingUIBackgroundColor;
    // force full opacity
    container.style.opacity = '1';
    // extremely large z-index to ensure it's on top of canvas
    container.style.zIndex = '2147483647';
    // ensure it captures pointer events while visible
    container.style.pointerEvents = 'auto';

    // append last in the body to be on top in DOM order too
    document.body.appendChild(container);

    // tiny debug attribute so you can inspect in the devtools
    container.setAttribute('data-custom-loading', 'true');

    // console.log to help debug color issues
    // console.log('CustomLoadingScreen appended, computed background:', getComputedStyle(container).backgroundColor);

    this._container = container;
  }

  public hideLoadingUI() {
    // console.log('CustomLoadingScreen: hideLoadingUI called');
    if (typeof document === 'undefined') return;
    if (this._container) {
      try {
        this._container.remove();
      } catch (e) {
        if (this._container.parentNode) this._container.parentNode.removeChild(this._container);
      }
      this._container = null;
    }
  }
}
