import * as BABYLON from '@babylonjs/core';
import { getLoadingImageUrl } from '../assetsConfig';

export class CustomLoadingScreen implements BABYLON.ILoadingScreen {
  // use a solid red background for loading
  public loadingUIBackgroundColor: string = '#BB464B';
  public loadingUIText: string;
  // optional background image for loader (full cover)
  public loadingUIImageUrl: string | null = null;

  private _container: HTMLDivElement | null = null;
  private _textElement: HTMLDivElement | null = null;
  private _shownAt: number | null = null;
  private _hideTimeoutHandle: number | null = null;

  constructor(loadingUIText: string, imageUrl?: string) {
    this.loadingUIText = loadingUIText;
    if (imageUrl !== undefined) {
      this.loadingUIImageUrl = imageUrl;
    } else {
      // attempt to load loading image from centralized assets.json
      try {
        getLoadingImageUrl().then((u) => {
          if (u) this.loadingUIImageUrl = u;
        }).catch(() => {});
      } catch (e) {}
    }
  }

  public displayLoadingUI() {
    if (typeof document === 'undefined') return;
      // minimal DOM overlay: show image (cover) if available, otherwise log only
      console.log('CustomLoadingScreen: displayLoadingUI');
      try {
        this._shownAt = Date.now();
        if (this._hideTimeoutHandle) {
          try { clearTimeout(this._hideTimeoutHandle); } catch {};
          this._hideTimeoutHandle = null;
        }
      } catch (e) { /* ignore */ }

      if (typeof document === 'undefined') {
        // non-browser environment: nothing more to do
        return;
      }

      // create a simple full-viewport container that displays the image as a cover
      try {
        if (!this._container) {
          const container = document.createElement('div');
          container.setAttribute('role', 'status');
          container.setAttribute('data-custom-loading', 'true');
          container.style.position = 'fixed';
          container.style.left = '0';
          container.style.top = '0';
          container.style.width = '100vw';
          container.style.height = '100vh';
          container.style.display = 'block';
          container.style.opacity = '1';
          container.style.zIndex = '2147483647';
          container.style.pointerEvents = 'auto';
          if (this.loadingUIImageUrl) {
            container.style.backgroundImage = `url(${this.loadingUIImageUrl})`;
            container.style.backgroundSize = 'cover';
            container.style.backgroundPosition = 'center center';
            container.style.backgroundRepeat = 'no-repeat';
            container.style.backgroundColor = this.loadingUIBackgroundColor;
          } else {
            container.style.background = this.loadingUIBackgroundColor;
          }
          document.body.appendChild(container);
          this._container = container;
        } else {
          this._container.style.display = 'block';
        }
      } catch (e) {
        console.log('CustomLoadingScreen: failed to create DOM overlay', e);
      }
  }

  public hideLoadingUI() {
    // console.log('CustomLoadingScreen: hideLoadingUI called');
    if (typeof document === 'undefined') return;
    if (this._container) {
      // enforce minimum visible duration (default 5000ms) before removing
      const minMs = 5000;
      try {
        const now = Date.now();
        const shown = this._shownAt ?? 0;
        const elapsed = shown ? (now - shown) : minMs;
        const remaining = Math.max(0, minMs - elapsed);
        if (remaining > 0) {
          // schedule removal after remaining time
          try {
            this._hideTimeoutHandle = window.setTimeout(() => {
              try {
                if (this._container) {
                  try { this._container.remove(); } catch (e) { if (this._container && this._container.parentNode) this._container.parentNode.removeChild(this._container); }
                  this._container = null;
                  this._textElement = null;
                }
                try {
                  // clear any body background set by the loader
                  document.body.style.backgroundImage = '';
                  document.body.style.backgroundSize = '';
                  document.body.style.backgroundPosition = '';
                  document.body.style.backgroundRepeat = '';
                  document.body.style.backgroundColor = '';
                } catch (e) { /* ignore */ }
              } catch (e) { /* ignore */ }
              this._hideTimeoutHandle = null;
              this._shownAt = null;
            }, remaining) as unknown as number;
          } catch (e) {
            // fallback to immediate removal
          }
          return;
        }
      } catch (e) { /* ignore */ }

      // immediate removal (minimum visible time already satisfied)
      try {
        this._container.remove();
      } catch (e) {
        if (this._container.parentNode) this._container.parentNode.removeChild(this._container);
      }
      this._container = null;
      this._textElement = null;
      try {
        // clear any body background set by the loader
        document.body.style.backgroundImage = '';
        document.body.style.backgroundSize = '';
        document.body.style.backgroundPosition = '';
        document.body.style.backgroundRepeat = '';
        document.body.style.backgroundColor = '';
      } catch (e) { /* ignore */ }
      this._shownAt = null;
    } else {
      // no DOM container: just enforce the min-time and log
      console.log('CustomLoadingScreen: hideLoadingUI requested (no DOM)');
      const minMs = 5000;
      try {
        const now = Date.now();
        const shown = this._shownAt ?? 0;
        const elapsed = shown ? (now - shown) : minMs;
        const remaining = Math.max(0, minMs - elapsed);
        if (remaining > 0) {
          try {
            this._hideTimeoutHandle = window.setTimeout(() => {
              console.log('CustomLoadingScreen: hideLoadingUI (delayed)');
              this._hideTimeoutHandle = null;
              this._shownAt = null;
            }, remaining) as unknown as number;
          } catch (e) {
            this._shownAt = null;
          }
          return;
        }
      } catch (e) { /* ignore */ }
      this._shownAt = null;
      console.log('CustomLoadingScreen: hideLoadingUI immediate (no DOM)');
    }

  }

  public setLoadingText(text: string) {
    this.loadingUIText = text;
    console.log('CustomLoadingScreen: setLoadingText ->', text);
  }
}
