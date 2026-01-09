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
  private _imageDelayHandle: number | null = null;
  private _pendingImageUrl: string | null = null;
  private _imgElement: HTMLImageElement | null = null;

  private _applyImage(url: string) {
    try {
      if (!this._container) return;
      if (!this._imgElement) {
        const img = document.createElement('img');
        img.alt = '';
        img.style.position = 'absolute';
        img.style.left = '50%';
        img.style.top = '50%';
        img.style.transform = 'translate(-50%, -50%)';
        img.style.maxWidth = '80vw';
        img.style.maxHeight = '80vh';
        img.style.objectFit = 'contain';
        img.style.pointerEvents = 'none';
        this._imgElement = img;
        this._container.appendChild(img);
      }
      this._imgElement.src = url;
    } catch (e) { /* ignore */ }
  }

  constructor(loadingUIText: string, imageUrl?: string) {
    this.loadingUIText = loadingUIText;
    if (imageUrl !== undefined) {
      this.loadingUIImageUrl = imageUrl;
    } else {
      // default to the local parallelspace.png, but allow centralized override
      this.loadingUIImageUrl = '/parallelspace.png';
      try {
        getLoadingImageUrl()
          .then((u) => {
            if (!u) return;
            this.loadingUIImageUrl = u;
            // If container already created, preload image then apply (or mark pending)
            try {
              if (this._container) {
                const img = new Image();
                img.src = u;
                img.onload = () => {
                  try {
                    if (this._imageDelayHandle) {
                      this._pendingImageUrl = u;
                    } else {
                      this._applyImage(u);
                    }
                  } catch (e) {}
                };
              }
            } catch (e) {}
          })
          .catch(() => {});
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
          // show red background immediately; add the image element after 3s
          container.style.background = this.loadingUIBackgroundColor;
          if (this.loadingUIImageUrl) {
            try {
              if (this._imageDelayHandle) {
                try { clearTimeout(this._imageDelayHandle); } catch {}
                this._imageDelayHandle = null;
              }
              this._imageDelayHandle = window.setTimeout(() => {
                try {
                  const url = this._pendingImageUrl || this.loadingUIImageUrl;
                  if (url) this._applyImage(url);
                } catch (e) { /* ignore */ }
                this._imageDelayHandle = null;
                this._pendingImageUrl = null;
              }, 3000) as unknown as number;
            } catch (e) { /* ignore */ }
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
      try {
        if (this._imageDelayHandle) {
          try { clearTimeout(this._imageDelayHandle); } catch {}
          this._imageDelayHandle = null;
        }
      } catch (e) { /* ignore */ }
      try {
        if (this._imgElement) {
          try { this._imgElement.remove(); } catch {}
          this._imgElement = null;
        }
      } catch (e) { /* ignore */ }
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
