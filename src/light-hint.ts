import type { Point } from './scene.ts';

/** Sharp interaction overlay, separate from the blurred simulation pixels. */
export class LightHint {
  private readonly ring = document.createElement('div');
  private readonly label = document.createElement('span');

  constructor(container: HTMLElement, extraClass = '') {
    this.ring.className = `light-hint ${extraClass}`.trim();
    this.ring.hidden = true;
    this.ring.setAttribute('aria-hidden', 'true');
    this.label.className = 'light-hint-label';
    this.ring.append(this.label);
    container.append(this.ring);
  }

  show(center: Point, radius: number, name: string): void {
    this.ring.style.left = `${center.x}px`;
    this.ring.style.top = `${center.y}px`;
    this.ring.style.width = this.ring.style.height = `${radius * 2}px`;
    this.label.textContent = name;
    this.ring.hidden = false;
  }

  hide(): void { this.ring.hidden = true; }
  destroy(): void { this.ring.remove(); }
}
