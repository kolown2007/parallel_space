import * as BABYLON from '@babylonjs/core';
import { getTextureUrl, getLoadingImageUrl, randomFrom } from '../assetsConfig';

export class CustomLoadingScreen implements BABYLON.ILoadingScreen {
  public loadingUIBackgroundColor: string = '#BB464B';
  public loadingUIText: string;
  
  private _container: HTMLDivElement | null = null;
  private _img: HTMLImageElement | null = null;
  private _textEl: HTMLDivElement | null = null;
  private _shownAt: number = 0;
  private _hideTimeout: number | null = null;
  private _bgRemoveTimeout: number | null = null;
  private _assetsReady: boolean = false;
  private _canHide: boolean = false;

  constructor(loadingUIText: string) {
    this.loadingUIText = loadingUIText;
  }

  public async displayLoadingUI() {
    if (typeof document === 'undefined') return;
    
    this._shownAt = Date.now();
    this._assetsReady = false;
    this._canHide = false;

    if (this._hideTimeout) {
      clearTimeout(this._hideTimeout);
      this._hideTimeout = null;
    }

    // clear any previous background-removal timer
    if (this._bgRemoveTimeout) {
      clearTimeout(this._bgRemoveTimeout);
      this._bgRemoveTimeout = null;
    }

    if (this._container) {
      this._container.style.display = 'block';
      return;
    }

    // Load image URLs from assets config
    const foregroundUrl = await getLoadingImageUrl();
    const backgroundId = randomFrom('loading1', 'loading2');
    const backgroundUrl = await getTextureUrl(backgroundId);

    // Create container with random background image
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      display: block;
      background-image: url('${backgroundUrl}');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      z-index: 2147483647;
      pointer-events: auto;
    `;
    container.setAttribute('role', 'status');

    // Create and add foreground image
    const img = document.createElement('img');
    img.src = foregroundUrl;
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
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
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
    
    // Remove background immediately on scene switch
    if (this._container) {
      this._container.style.backgroundImage = 'none';
      this._container.style.backgroundColor = 'transparent';
    }

    // Delay hiding the foreground so it bleeds into the next scene
    if (this._hideTimeout) {
      clearTimeout(this._hideTimeout);
    }
    this._hideTimeout = window.setTimeout(() => {
      this._hideTimeout = null;
      this._tryHide();
    }, 3000);
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
    
    if (this._bgRemoveTimeout) {
      clearTimeout(this._bgRemoveTimeout);
      this._bgRemoveTimeout = null;
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
