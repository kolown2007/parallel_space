import * as BABYLON from '@babylonjs/core';
import { Scene } from '@babylonjs/core';
import { Inspector } from '@babylonjs/inspector';

export function setupDebugUI(scene: Scene, canvas: HTMLCanvasElement) {
  // Try to show the embedded inspector and create a small HUD. Non-fatal if DOM not available.
  try {
    (Inspector as any)?.Show?.(scene, { embedMode: true });
    // Diagnostic check for inspector DOM nodes; fallback to debugLayer if not present.
    setTimeout(() => {
      try {
        const nodes = Array.from(document.querySelectorAll('[id*="inspector"], [class*="inspector"], [id*="Inspector"], [class*="Inspector"]')) as Element[];
        if (nodes.length === 0) {
          try { scene.debugLayer.show(); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        // ignore
      }
    }, 400);
  } catch (e) {
    // ignore if Inspector not available in this environment
  }

  // Create or update a tiny HUD to show which camera is active
  try {
    let hud = document.getElementById('camera-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'camera-hud';
      hud.style.position = 'fixed';
      hud.style.left = '8px';
      hud.style.top = '8px';
      hud.style.padding = '6px 10px';
      hud.style.background = 'rgba(0,0,0,0.5)';
      hud.style.color = 'white';
      hud.style.fontFamily = 'monospace';
      hud.style.fontSize = '12px';
      hud.style.zIndex = '9999';
      hud.style.borderRadius = '4px';
      hud.innerText = `Active camera: ${scene.activeCamera ? (scene.activeCamera as any).name : 'none'}`;
      document.body.appendChild(hud);
    }
  } catch (e) {
    // ignore if DOM not available
  }

  return {
    dispose: () => {
      try { const hud = document.getElementById('camera-hud'); if (hud && hud.parentNode) hud.parentNode.removeChild(hud); } catch (e) { /* ignore */ }
      try { (Inspector as any)?.Hide?.(scene); } catch (e) { /* ignore */ }
    }
  };
}

export function toggleInspector(scene: Scene) {
  try {
    if (scene.debugLayer && scene.debugLayer.isVisible && scene.debugLayer.show) {
      if (scene.debugLayer.isVisible()) {
        try { scene.debugLayer.hide(); } catch (e) { /* ignore */ }
      } else {
        try { scene.debugLayer.show(); } catch (e) { try { (Inspector as any)?.Show?.(scene, { embedMode: false }); } catch (e2) { /* ignore */ } }
      }
    } else {
      try { (Inspector as any)?.Show?.(scene, { embedMode: false }); } catch (e) { /* ignore */ }
    }
  } catch (e) {
    // ignore
  }
}
