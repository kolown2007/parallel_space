import * as GUI from '@babylonjs/gui';
import { 
  updateProgress, 
  cleanupDroneControl,
  droneControl,
  displaySpeed,
  droneEvents, 
  MAX_SPEED,
  FPS,
  PATH_POINTS_TOTAL 
} from '../../stores/droneControl.svelte.js';

// Keep track of our store subscriptions so we can safely kill them on cleanup
let unsubs: (() => void)[] = [];
let alertTimeout: any = null;
let currentTexture: GUI.AdvancedDynamicTexture | null = null; // Track texture for clean disposal

export function createGameUI(advancedTexture: GUI.AdvancedDynamicTexture) {
  currentTexture = advancedTexture;

  // =========================================================================
  // 1. UNIFIED SPEED DASHBOARD (Bottom-Center) - COMPACT EDITION
  // =========================================================================
  const controlPanel = new GUI.StackPanel();
  controlPanel.width = "180px";
  controlPanel.height = "180px"; 
  controlPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  controlPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  controlPanel.top = "-20px"; 
  advancedTexture.addControl(controlPanel);

  // A. The Digital Speed Text
  const header = new GUI.TextBlock();
  header.height = "35px";
  header.text = "Speed: 0 units";
  header.alpha = 0.4;
  header.fontFamily = "Lucida Console, Courier, monospace";
  header.fontSize = 18; 
  header.color = "lightgreen";
  controlPanel.addControl(header);

  // B. The Speedometer Dial Circle (Shrunk to 100px)
  const gauge = new GUI.Ellipse();
  gauge.width = "100px";
  gauge.height = "100px";
  gauge.color = "lightgreen";
  gauge.thickness = 3;
  gauge.background = "rgba(0, 0, 0, 0.2 )";
  controlPanel.addControl(gauge);

  // C. The Clock-Style Needle
  const needle = new GUI.Rectangle();
  needle.width = "3px";
  needle.height = "45px"; 
  needle.top = "-22.5px"; 
  needle.color = "lightgreen";
  needle.background = "lightgreen";
  needle.transformCenterY = 1.0; 
  gauge.addControl(needle);


  // =========================================================================
  // 2. VERTICAL PROGRESS TRACKER (Right Side of Screen)
  // =========================================================================
  const TRACK_HEIGHT = 300; 

  // A. The Track Line
  const progressTrack = new GUI.Rectangle();
  progressTrack.width = "4px";
  progressTrack.height = `${TRACK_HEIGHT}px`;
  progressTrack.color = "lightgreen";
  progressTrack.alpha = 0.1;
  progressTrack.background = "lightgreen";
  progressTrack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  progressTrack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  progressTrack.left = "-40px"; 
  advancedTexture.addControl(progressTrack);

  // B. The Indicator Dot
  const progressDot = new GUI.Ellipse();
  progressDot.width = "14px";
  progressDot.height = "14px";
  progressDot.color = "lightgreen";
  progressDot.background = "lightgreen";
  progressDot.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  progressDot.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  progressDot.left = "-35px"; 
  advancedTexture.addControl(progressDot);

  // C. FIXED POSITION: The Percentage Text
  const percentLabel = new GUI.TextBlock();
  percentLabel.text = "0%";
  percentLabel.fontFamily = "Lucida Console, Courier, monospace";
  percentLabel.fontSize = 14;
  percentLabel.color = "lightgreen";
  percentLabel.width = "60px";
  percentLabel.height = "20px";
  percentLabel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  percentLabel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  percentLabel.left = "-40px"; 
  percentLabel.top = "-165px"; 
  advancedTexture.addControl(percentLabel);


  // =========================================================================
  // 3. MASTER ALERT & NOTIFICATION WRAPPER (Dead Center Screen)
  // =========================================================================
  const alertText = new GUI.TextBlock();
  alertText.fontFamily = "Lucida Console, Courier, monospace";
  alertText.fontSize = 32;
  alertText.color = "red"; // Default to collision color
  alertText.fontWeight = "bold";
  alertText.textWrapping = true; 
  alertText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  alertText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  alertText.isVisible = false; 
  advancedTexture.addControl(alertText);


  // =========================================================================
  // 4. CENTRAL UNIVERSAL DATA BRIDGE (Store Listeners)
  // =========================================================================
  const DISPLAY_FACTOR = FPS * PATH_POINTS_TOTAL;
  const maxDisplaySpeed = Math.round(MAX_SPEED * DISPLAY_FACTOR); 

  let transitionTriggered = false;

  // A. Listen for Speed Changes
  const unsubSpeed = displaySpeed.subscribe(speed => {
    header.text = `Speed: ${speed} units`;
    const speedRatio = speed / maxDisplaySpeed;
    needle.rotation = -1.8 + (speedRatio * 3.6);
  });

  // B. Listen for Progress Updates
  const unsubControl = droneControl.subscribe(state => {
    const progressPercent = Math.floor(state.progress * 100);
    percentLabel.text = `${progressPercent}%`;
    
    const halfTrack = TRACK_HEIGHT / 2;
    const targetTop = halfTrack - (state.progress * TRACK_HEIGHT);
    progressDot.top = `${targetTop}px`;

    // REUSED WRAPPER: DETECT 100% COMPLETION TRANSITION
    if (progressPercent >= 100 && !transitionTriggered) {
      transitionTriggered = true;
      
      // Stop any active collision timers immediately
      if (alertTimeout) clearTimeout(alertTimeout);

      // Hide standard peripheral layout elements
      controlPanel.isVisible = false;
      progressTrack.isVisible = false;
      progressDot.isVisible = false;
      percentLabel.isVisible = false;

      // Morph the warning wrapper into the white completion notification
      alertText.color = "white"; 
      alertText.text = "Entering a New Station";
      alertText.isVisible = true;

      // Hold purely on screen for 5000ms (5 seconds)
      alertTimeout = setTimeout(() => {
        alertText.isVisible = false;
        
        // Restore standard instrument displays
        controlPanel.isVisible = true;
        progressTrack.isVisible = true;
        progressDot.isVisible = true;
        percentLabel.isVisible = true;
        
        transitionTriggered = false; // Reset lock for next zone cycle
      }, 5000);
    }
  });

  // C. Listen for Real-Time Gameplay Events (Collisions)
  const unsubEvents = droneEvents.subscribe(event => {
    // Only process crashes if we aren't currently showcasing the 100% transition
    if (event?.type === 'collision' && !transitionTriggered) {
      if (alertTimeout) clearTimeout(alertTimeout);
      
      const reductionPercent = (event.data.reduction * 100).toFixed(0);
      
      // Ensure the wrapper is reset back to its red warning settings
      alertText.color = "red";
      alertText.text = `WARNING\n-${reductionPercent}% SPEED`;
      alertText.isVisible = true;

      alertTimeout = setTimeout(() => {
        alertText.isVisible = false;
      }, 1500);
    }
  });

  unsubs = [unsubSpeed, unsubControl, unsubEvents];
}

// =========================================================================
// 5. UNMOUNT & DESTRUCTION CLEANUP
// =========================================================================
export function disposeGameUI() {
  unsubs.forEach(unsub => unsub());
  unsubs = [];
  
  if (alertTimeout) {
    clearTimeout(alertTimeout);
    alertTimeout = null;
  }

  if (currentTexture) {
    currentTexture.dispose();
    currentTexture = null;
  }
}