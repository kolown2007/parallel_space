import { KolownScene } from '@kolown/scene-manager';


export class VideoScene extends KolownScene {
  private videoElement: HTMLVideoElement;

  constructor(name: string, videoElement: HTMLVideoElement) {
    super(name);
    this.videoElement = videoElement;
    this.videoElement.style.display = 'none'; // Initially hide the video element

    // Create a <source> element for the video
    const sourceElement = document.createElement('source');
    sourceElement.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'; // Set the video source
    sourceElement.type = 'video/mp4'; // Set the video type

    // Append the <source> element to the video element
    this.videoElement.appendChild(sourceElement);
  }

  public onEnter(): void {
    this.videoElement.style.display = 'block'; // Show the video element
    this.videoElement.style.position = 'absolute'; // Position the video to cover the screen
    this.videoElement.style.top = '0';
    this.videoElement.style.left = '0';
    this.videoElement.style.width = '100%'; // Ensure the video element covers the width
    this.videoElement.style.height = '100%'; // Ensure the video element covers the height
    this.videoElement.style.objectFit = 'cover'; // Cover the container while maintaining aspect ratio
    console.log('Video element styles:', {
      display: this.videoElement.style.display,
      position: this.videoElement.style.position,
      top: this.videoElement.style.top,
      left: this.videoElement.style.left,
      width: this.videoElement.style.width,
      height: this.videoElement.style.height,
      objectFit: this.videoElement.style.objectFit,
    });
    this.videoElement.play().catch((error: unknown) => {
      console.error('Error playing video:', error);
    });
  }

  public onExit(): void {
    this.videoElement.style.display = 'none'; // Hide the video element
    this.videoElement.pause(); // Pause the video when exiting the scene
  }

  public dispose(): void {
    this.videoElement.src = ''; // Clear the video source when no longer needed
  }
}