import { KolownScene } from '@kolown/scene-manager';

export class DOMScene extends KolownScene {
  private element: HTMLElement;

  constructor(name: string, element: HTMLElement) {
    super(name);
    this.element = element;
  }

  public onEnter(): void {
    this.element.style.display = 'block';
    // Ensure the BabylonJS canvas is hidden
    const canvas = document.getElementById('renderCanvas');
    if (canvas) {
      canvas.style.display = 'none';
    }
  }

  public onExit(): void {
    this.element.style.display = 'none';
  }
}
