import { SPECTRAL_LOCUS } from '../data/spectral-locus.ts';
import { SRGB_PRIMARIES, previewXYZ, xyYToXYZ, type Chromaticity } from './colorimetry.ts';
import { isVisibleChromaticity } from './gamut.ts';
import type { EmitterDefinition } from './profiles.ts';

const WIDTH = 300, HEIGHT = 260, LEFT = 30, TOP = 12, PLOT_WIDTH = 256, PLOT_HEIGHT = 220;
export const diagramPosition = (xy: Chromaticity): [number, number] => [LEFT + xy.x / 0.8 * PLOT_WIDTH, TOP + (1 - xy.y / 0.9) * PLOT_HEIGHT];

export class GamutDiagram {
  private readonly context: CanvasRenderingContext2D;
  private readonly background = document.createElement('canvas');
  private readonly events = new AbortController();
  private pointerId: number | null = null;

  constructor(canvas: HTMLCanvasElement, onSelect?: (xy: Chromaticity) => void, density = 2) {
    canvas.width = WIDTH * density; canvas.height = HEIGHT * density;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser does not support Canvas 2D.');
    this.context = context;
    context.scale(density, density);
    this.background.width = PLOT_WIDTH; this.background.height = PLOT_HEIGHT;
    const backgroundContext = this.background.getContext('2d')!;
    const pixels = backgroundContext.createImageData(PLOT_WIDTH, PLOT_HEIGHT);
    for (let y = 0; y < PLOT_HEIGHT; y++) for (let x = 0; x < PLOT_WIDTH; x++) {
      const xy = { x: x / PLOT_WIDTH * 0.8, y: Math.max(1e-5, (1 - y / PLOT_HEIGHT) * 0.9) };
      if (xy.x + xy.y > 1) continue;
      const color = previewXYZ(xyYToXYZ(xy, 0.35)).rgb;
      const i = (y * PLOT_WIDTH + x) * 4;
      pixels.data[i] = color.r; pixels.data[i + 1] = color.g; pixels.data[i + 2] = color.b; pixels.data[i + 3] = 255;
    }
    backgroundContext.putImageData(pixels, 0, 0);
    // Educational illustrations share the renderer without accepting targets.
    if (!onSelect) return;
    const select = (event: PointerEvent): boolean => {
      const bounds = canvas.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width * WIDTH;
      const y = (event.clientY - bounds.top) / bounds.height * HEIGHT;
      const xy = { x: (x - LEFT) / PLOT_WIDTH * 0.8, y: (1 - (y - TOP) / PLOT_HEIGHT) * 0.9 };
      if (!isVisibleChromaticity(xy)) return false;
      onSelect(xy); return true;
    };
    const signal = this.events.signal;
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.pointerId !== null || !select(event)) return;
      this.pointerId = event.pointerId; canvas.setPointerCapture(event.pointerId); event.preventDefault();
    }, { signal });
    canvas.addEventListener('pointermove', event => { if (event.pointerId === this.pointerId) select(event); }, { signal });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(name, event => {
      if (event.pointerId !== this.pointerId) return;
      this.pointerId = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }, { signal });
  }

  draw(hull: readonly Chromaticity[], target: Chromaticity | null, actual: Chromaticity | null, emitters: readonly EmitterDefinition[] = []): void {
    const context = this.context;
    const path = (points: readonly Chromaticity[]): void => {
      context.beginPath();
      points.forEach((point, i) => { const [x, y] = diagramPosition(point); if (i) context.lineTo(x, y); else context.moveTo(x, y); });
      context.closePath();
    };
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.save(); path(SPECTRAL_LOCUS); context.clip();
    context.drawImage(this.background, LEFT, TOP);
    context.restore();
    context.strokeStyle = '#ffffff18'; context.lineWidth = 0.6;
    context.fillStyle = '#a3a6ad'; context.font = '9px sans-serif';
    for (let x = 0; x <= 0.801; x += 0.2) {
      const screenX = diagramPosition({ x, y: 0 })[0];
      context.beginPath(); context.moveTo(screenX, TOP); context.lineTo(screenX, TOP + PLOT_HEIGHT); context.stroke();
      context.fillText(x.toFixed(1), screenX - 5, HEIGHT - 12);
    }
    for (let y = 0; y <= 0.901; y += 0.3) {
      const screenY = diagramPosition({ x: 0, y })[1];
      context.beginPath(); context.moveTo(LEFT, screenY); context.lineTo(LEFT + PLOT_WIDTH, screenY); context.stroke();
      context.fillText(y.toFixed(1), 7, screenY + 3);
    }
    context.fillText('x', WIDTH - 7, HEIGHT - 2); context.fillText('y', 7, 7);
    context.strokeStyle = '#ffffff70'; context.lineWidth = 1; path(SPECTRAL_LOCUS); context.stroke();
    context.setLineDash([4, 3]); context.strokeStyle = '#e6e8f0'; path(SRGB_PRIMARIES); context.stroke(); context.setLineDash([]);
    context.lineWidth = 2; context.strokeStyle = '#b5ed8a'; path(hull); context.stroke();
    context.save();
    context.font = '600 10px "DM Sans", sans-serif';
    context.lineJoin = 'round'; context.textBaseline = 'middle';
    for (const emitter of emitters) {
      const [x, y] = diagramPosition(emitter.xy);
      context.beginPath(); context.arc(x, y, 2.8, 0, 2 * Math.PI);
      context.fillStyle = emitter.controlColor; context.fill();
      context.strokeStyle = '#101214'; context.lineWidth = 1.3; context.stroke();
      const labelX = emitter.id === 'blue' ? x - 12 : x + 7;
      const labelY = emitter.id === 'blue' ? y + 9 : y - 8;
      const letter = emitter.id[0].toUpperCase();
      context.strokeStyle = '#101214'; context.lineWidth = 3;
      context.strokeText(letter, labelX, labelY);
      context.fillStyle = '#fff'; context.fillText(letter, labelX, labelY);
    }
    context.restore();
    if (target) {
      const [x, y] = diagramPosition(target);
      context.beginPath(); context.arc(x, y, 6, 0, 2 * Math.PI);
      context.strokeStyle = '#000'; context.lineWidth = 4; context.stroke();
      context.strokeStyle = '#fff'; context.lineWidth = 2; context.stroke();
    }
    if (actual) {
      const [x, y] = diagramPosition(actual);
      context.beginPath(); context.arc(x, y, 3, 0, 2 * Math.PI);
      context.fillStyle = '#79e5ff'; context.fill(); context.strokeStyle = '#000'; context.lineWidth = 1; context.stroke();
    }
  }

  destroy(): void { this.events.abort(); }
}
