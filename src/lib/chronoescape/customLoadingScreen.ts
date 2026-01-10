import * as BABYLON from '@babylonjs/core';

export class CustomLoadingScreen implements BABYLON.ILoadingScreen {
  public loadingUIBackgroundColor: string = '#BB464B';
  public loadingUIText: string;
  
  private _container: HTMLDivElement | null = null;
  private _img: HTMLImageElement | null = null;
  private _textEl: HTMLDivElement | null = null;
  private _shownAt: number = 0;
  private _hideTimeout: number | null = null;
  private _imageUrl: string;
  private _assetsReady: boolean = false;
  private _canHide: boolean = false;

  constructor(loadingUIText: string, imageUrl: string = '/parallelspace.png') {
    this.loadingUIText = loadingUIText;
    this._imageUrl = imageUrl;
  }

  public displayLoadingUI() {
    if (typeof document === 'undefined') return;
    
    this._shownAt = Date.now();
    this._assetsReady = false;
    this._canHide = false;

    if (this._hideTimeout) {
      clearTimeout(this._hideTimeout);
      this._hideTimeout = null;
    }

    if (this._container) {
      this._container.style.display = 'block';
      return;
    }

    // Create container with red background
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      display: block;
      background: ${this.loadingUIBackgroundColor};
      z-index: 2147483647;
      pointer-events: auto;
    `;
    container.setAttribute('role', 'status');

    // Create and add image
    const img = document.createElement('img');
    img.src = this._imageUrl;
    img.alt = 'Loading';
    img.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      max-width: 80vw;
      max-height: 80vh;
      object-fit: contain;
      pointer-events: none;
    `;
    
    // Create loading text
    const textEl = document.createElement('div');
    textEl.textContent = this.loadingUIText;
    textEl.style.cssText = `
      position: absolute;
      left: 50%;
      bottom: 10%;
      transform: translateX(-50%);
      color: white;
      font-size: 1.2rem;
      font-family: system-ui, sans-serif;
      text-align: center;
    `;
    
    container.appendChild(img);
    container.appendChild(textEl);
    document.body.appendChild(container);
    
    this._container = container;
    this._img = img;
    this._textEl = textEl;

    // Ensure minimum 5 seconds display
    setTimeout(() => {
      this._canHide = true;
      this._tryHide();
    }, 5000);
  }

  public hideLoadingUI() {
    this._assetsReady = true;
    this._tryHide();
  }

  private _tryHide() {
    if (!this._assetsReady || !this._canHide) return;
    if (!this._container) return;

    this._container.remove();
    this._container = null;
    this._img = null;
    this._textEl = null;
    
    if (this._hideTimeout) {
      clearTimeout(this._hideTimeout);
      this._hideTimeout = null;
    }
  }

  public setLoadingText(text: string) {
    this.loadingUIText = text;
    if (this._textEl) {
      this._textEl.textContent = text;
    }
  }

  // Called by scene setup after assets are loaded
  public notifyAssetsReady() {
    this._assetsReady = true;
    this._tryHide();
  }
}
