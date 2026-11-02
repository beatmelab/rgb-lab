import { mixPrimaries, type RGB } from './color';
import { LightScene, type LightIndex, type Point } from './scene';
import { LightHint } from './light-hint';

/** Opaque pixels contain the sum of light emissions, never source-over layers. */
export class LightCanvas {
  private readonly context: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private readonly motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private coverage = new Uint8ClampedArray();
  private frame: ImageData | null = null;
  private current: RGB;
  private target: RGB;
  private animation = 0;
  private previousTime = 0;
  private readonly scene = new LightScene();
  private readonly mask = document.createElement('canvas');
  private readonly maskContext: CanvasRenderingContext2D;
  private readonly dirtyMasks = new Set<LightIndex>();
  private pixelRatio = 1;
  private drag: { pointerId: number; index: LightIndex; offset: Point } | null = null;
  private hoverPoint: Point | null = null;
  private readonly hint: LightHint;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    initial: RGB,
    private readonly onFrame: (color: RGB) => void,
    private readonly onLayout?: (positions: readonly Point[]) => void,
  ) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Your browser does not support Canvas 2D.');
    this.context = context;
    const maskContext = this.mask.getContext('2d', { willReadFrequently: true });
    if (!maskContext) throw new Error('Your browser does not support Canvas 2D.');
    this.maskContext = maskContext;
    this.hint = new LightHint(canvas.parentElement!);
    this.current = { ...initial };
    this.target = { ...initial };
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.motion.addEventListener('change', this.handleMotionChange);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerEnd);
    canvas.addEventListener('pointercancel', this.pointerEnd);
    canvas.addEventListener('lostpointercapture', this.pointerEnd);
    canvas.addEventListener('pointerleave', this.pointerLeave);
    this.resize();
  }

  setColor(color: RGB): void {
    this.target = { ...color };
    if (this.motion.matches) {
      cancelAnimationFrame(this.animation);
      this.animation = 0;
      this.current = { ...color };
      this.rebuildMasks();
      this.render();
    } else this.scheduleFrame();
  }

  setBlur(pixels: number): void {
    const blur = Number.isFinite(pixels) ? Math.max(0, Math.min(80, pixels)) : 0;
    // Gaussian convolution acts on each RGB channel independently. With one light
    // per channel, filtering the summed image equals filtering each light first.
    // No source-over color layers or opacity mixing are involved.
    this.canvas.style.filter = blur ? `blur(${blur}px)` : 'none';
  }

  resetPositions(): void {
    this.endDrag();
    this.scene.resetPositions();
    for (const index of [0, 1, 2] as const) this.dirtyMasks.add(index);
    this.onLayout?.(this.scene.positions);
    this.refreshHint();
    this.scheduleFrame();
  }

  suspendInteraction(): void { this.endDrag(); }

  moveBy(index: LightIndex, x: number, y: number): void {
    const center = this.scene.positions[index];
    if (center) this.moveLight(index, { x: center.x + x, y: center.y + y });
  }

  private moveLight(index: LightIndex, point: Point): void {
    this.scene.moveLight(index, point);
    this.dirtyMasks.add(index);
    this.onLayout?.(this.scene.positions);
    this.refreshHint();
    this.scheduleFrame();
  }

  private scheduleFrame(): void {
    if (this.animation) return;
    this.previousTime = performance.now();
    this.animation = requestAnimationFrame(this.animate);
  }

  private pointerPosition(event: PointerEvent): Point {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  private readonly pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.drag) return;
    const point = this.pointerPosition(event);
    const index = this.scene.hitTest(point);
    if (index === null) return;
    const center = this.scene.positions[index];
    this.drag = { pointerId: event.pointerId, index, offset: { x: point.x - center.x, y: point.y - center.y } };
    this.canvas.setPointerCapture(event.pointerId);
    this.hoverPoint = event.pointerType === 'touch' ? null : point;
    this.refreshHint();
    event.preventDefault();
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    const point = this.pointerPosition(event);
    this.hoverPoint = event.pointerType === 'touch' ? null : point;
    if (this.drag) {
      if (event.pointerId !== this.drag.pointerId) return;
      this.moveLight(this.drag.index, { x: point.x - this.drag.offset.x, y: point.y - this.drag.offset.y });
    } else {
      this.refreshHint();
    }
  };

  private readonly pointerEnd = (event: PointerEvent): void => {
    if (this.drag?.pointerId !== event.pointerId) return;
    this.endDrag();
    if (event.type === 'pointerup' && event.pointerType !== 'touch') {
      this.hoverPoint = this.pointerPosition(event);
      this.refreshHint();
    }
  };

  private readonly pointerLeave = (): void => {
    this.hoverPoint = null;
    if (!this.drag) this.refreshHint();
  };

  private refreshHint(): void {
    if (this.drag) { this.canvas.style.cursor = 'grabbing'; this.hint.hide(); return; }
    const index = this.hoverPoint ? this.scene.hitTest(this.hoverPoint) : null;
    this.canvas.style.cursor = index === null ? 'default' : 'grab';
    if (index === null) { this.hint.hide(); return; }
    this.hint.show(this.scene.positions[index], this.scene.radius, ['Red', 'Green', 'Blue'][index]);
  }

  private endDrag(): void {
    const drag = this.drag;
    this.drag = null;
    this.hoverPoint = null;
    this.hint.hide();
    if (drag && this.canvas.hasPointerCapture(drag.pointerId)) this.canvas.releasePointerCapture(drag.pointerId);
    this.canvas.style.cursor = 'default';
  }

  destroy(): void {
    this.endDrag();
    this.hint.destroy();
    this.observer.disconnect();
    this.motion.removeEventListener('change', this.handleMotionChange);
    cancelAnimationFrame(this.animation);
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerEnd);
    this.canvas.removeEventListener('pointercancel', this.pointerEnd);
    this.canvas.removeEventListener('lostpointercapture', this.pointerEnd);
    this.canvas.removeEventListener('pointerleave', this.pointerLeave);
  }

  private readonly handleMotionChange = (): void => { this.setColor(this.target); };

  private readonly animate = (time: number): void => {
    const delta = Math.min(time - this.previousTime, 64);
    this.previousTime = time;
    const factor = 1 - Math.exp(-delta / 46);
    const values = { ...this.current };
    let settled = true;
    for (const channel of ['r', 'g', 'b'] as const) {
      const distance = this.target[channel] - values[channel];
      values[channel] = Math.abs(distance) < 0.35 ? this.target[channel] : values[channel] + distance * factor;
      if (values[channel] !== this.target[channel]) settled = false;
    }
    this.current = values;
    this.rebuildMasks();
    this.render();
    this.animation = settled ? 0 : requestAnimationFrame(this.animate);
  };

  private resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    // Bound the full-window backing buffer on large and high-density screens.
    const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4_000_000 / (bounds.width * bounds.height)));
    const width = Math.round(bounds.width * ratio);
    const height = Math.round(bounds.height * ratio);
    if (this.frame && this.canvas.width === width && this.canvas.height === height && this.scene.width === bounds.width && this.scene.height === bounds.height) return;
    this.endDrag();
    this.pixelRatio = ratio;
    this.scene.resize(bounds.width, bounds.height);
    this.canvas.width = width;
    this.canvas.height = height;
    this.frame = this.context.createImageData(width, height);
    this.coverage = new Uint8ClampedArray(width * height * 3);
    this.mask.width = width;
    this.mask.height = height;
    for (const index of [0, 1, 2] as const) this.dirtyMasks.add(index);
    this.onLayout?.(this.scene.positions);
    this.rebuildMasks();
    this.render();
  }

  private rebuildMasks(): void {
    if (!this.frame || !this.dirtyMasks.size) return;
    const { width, height } = this.canvas;
    const context = this.maskContext;
    // Alpha measures geometric edge coverage only, never color compositing.
    for (const channel of this.dirtyMasks) {
      const center = this.scene.positions[channel];
      context.clearRect(0, 0, width, height);
      context.beginPath();
      context.arc(center.x * this.pixelRatio, center.y * this.pixelRatio, this.scene.radius * this.pixelRatio, 0, Math.PI * 2);
      context.fillStyle = '#fff';
      context.fill();
      const pixels = context.getImageData(0, 0, width, height).data;
      for (let pixel = 0; pixel < width * height; pixel++) {
        this.coverage[pixel * 3 + channel] = pixels[pixel * 4 + 3];
      }
    }
    this.dirtyMasks.clear();
  }

  private render(): void {
    if (!this.frame) return;
    // 256-entry LUTs avoid allocations and color calculations inside the pixel loop.
    const tables = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
    for (let level = 0; level < 256; level++) {
      const color = mixPrimaries(this.current, { r: level / 255, g: level / 255, b: level / 255 });
      tables[0][level] = color.r;
      tables[1][level] = color.g;
      tables[2][level] = color.b;
    }
    const pixels = this.frame.data;
    for (let pixel = 0; pixel < pixels.length / 4; pixel++) {
      pixels[pixel * 4] = tables[0][this.coverage[pixel * 3]];
      pixels[pixel * 4 + 1] = tables[1][this.coverage[pixel * 3 + 1]];
      pixels[pixel * 4 + 2] = tables[2][this.coverage[pixel * 3 + 2]];
      pixels[pixel * 4 + 3] = 255;
    }
    this.context.putImageData(this.frame, 0, 0);
    this.onFrame(this.current);
  }
}
