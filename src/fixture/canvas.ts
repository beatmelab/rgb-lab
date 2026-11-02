import type { Point } from '../scene.ts';
import { xyzToLinearRGB } from './colorimetry.ts';
import { DISPLAY_ENCODE, DISPLAY_RESOLUTION, SCENE_EXPOSURE } from './display.ts';
import type { FixtureComponent } from './engine.ts';
import type { EmitterId } from './profiles.ts';
import { ComponentScene } from './beam.ts';
import { gaussianCoverage } from './gaussian.ts';
import { LightHint } from '../light-hint.ts';
import type { BeamField } from './spatial.ts';

/** Independently positioned emitters; sum their blurred linear fields, then encode. */
export class FixtureCanvas {
  private readonly scene = new ComponentScene();
  private readonly context: CanvasRenderingContext2D;
  private readonly mask = document.createElement('canvas');
  private readonly maskContext: CanvasRenderingContext2D;
  private readonly handles = new Map<EmitterId, HTMLButtonElement>();
  private handleEvents = new AbortController();
  private readonly observer: ResizeObserver;
  private readonly events = new AbortController();
  private components: readonly FixtureComponent[] = [];
  private blur = 20;
  private ratio = 1;
  private coverage: Float32Array = new Float32Array();
  private fields: Float32Array[] = [];
  private image: ImageData | null = null;
  private maskDirty = true;
  private active = false;
  private animation = 0;
  private drag: { id: number; emitter: EmitterId; offset: Point } | null = null;
  private hoverPoint: Point | null = null;
  private readonly hint: LightHint;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onField?: (field: BeamField) => void, private readonly interactionTarget?: HTMLElement) {
    const context = canvas.getContext('2d', { alpha: false });
    const maskContext = this.mask.getContext('2d', { willReadFrequently: true });
    if (!context || !maskContext) throw new Error('Your browser does not support Canvas 2D.');
    this.context = context; this.maskContext = maskContext;
    this.hint = new LightHint(canvas.parentElement!.parentElement!, 'fixture-hint');
    const signal = this.events.signal;
    const listen = <K extends keyof HTMLElementEventMap>(name: K, listener: (event: HTMLElementEventMap[K]) => void): void => {
      canvas.addEventListener(name,listener,{ signal });
      interactionTarget?.addEventListener(name,listener,{ signal });
    };
    listen('pointerdown', event => {
      if (event.button !== 0 || this.drag) return;
      const point = this.point(event), emitter = this.hitTest(point);
      if (!emitter) return;
      const center = this.scene.positions.get(emitter)!;
      this.drag = { id: event.pointerId, emitter, offset: { x: point.x - center.x, y: point.y - center.y } };
      canvas.setPointerCapture(event.pointerId);
      this.hoverPoint = event.pointerType === 'touch' ? null : point;
      this.refreshHint(); event.preventDefault();
    });
    listen('pointermove', event => {
      const point = this.point(event);
      this.hoverPoint = event.pointerType === 'touch' ? null : point;
      if (this.drag) {
        if (event.pointerId !== this.drag.id) return;
        this.scene.moveTo(this.drag.emitter, { x: point.x - this.drag.offset.x, y: point.y - this.drag.offset.y });
        this.updateHandles(); this.schedule();
      } else this.refreshHint();
    });
    listen('pointerenter', event => {
      if (this.drag) return;
      this.hoverPoint = event.pointerType === 'touch' ? null : this.point(event);
      this.refreshHint();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) listen(name, event => {
      if (event.pointerId !== this.drag?.id) return;
      this.endDrag();
      if (name === 'pointerup' && event.pointerType !== 'touch') {
        this.hoverPoint = this.point(event); this.refreshHint();
      }
    });
    listen('pointerleave', () => { this.hoverPoint = null; if (!this.drag) this.refreshHint(); });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
  }

  setActive(active: boolean): void {
    this.endDrag(); this.active = active; this.canvas.hidden = !active;
    for (const handle of this.handles.values()) handle.hidden = !active;
    if (active) { this.resize(); this.schedule(); }
    else { cancelAnimationFrame(this.animation); this.animation = 0; }
  }

  setComponents(components: readonly FixtureComponent[]): void {
    const changed = components.map(component => component.id).join() !== this.components.map(component => component.id).join();
    this.components = components;
    this.scene.setEmitters(components.map(component => component.id));
    if (changed) {
      this.endDrag(); this.handleEvents.abort(); this.handleEvents = new AbortController();
      for (const handle of this.handles.values()) handle.remove();
      this.handles.clear();
      for (const component of components) {
        const handle = document.createElement('button');
        handle.type = 'button'; handle.className = 'light-handle'; handle.hidden = !this.active;
        handle.dataset.emitter = component.id;
        handle.setAttribute('aria-label', `Move ${component.name.toLowerCase()} component`);
        handle.setAttribute('aria-describedby', 'move-help');
        handle.addEventListener('focus', () => this.refreshHint(), { signal: this.handleEvents.signal });
        handle.addEventListener('blur', () => this.refreshHint(), { signal: this.handleEvents.signal });
        handle.addEventListener('keydown', event => {
          const direction = new Map([['ArrowLeft', [-1, 0]], ['ArrowRight', [1, 0]], ['ArrowUp', [0, -1]], ['ArrowDown', [0, 1]]]).get(event.key);
          const position = this.scene.positions.get(component.id);
          if (!direction || !position) return;
          event.preventDefault();
          const step = event.shiftKey ? 20 : 5;
          this.scene.moveTo(component.id, { x: position.x + direction[0] * step, y: position.y + direction[1] * step });
          this.updateHandles(); this.schedule();
        }, { signal: this.handleEvents.signal });
        this.canvas.parentElement!.append(handle); this.handles.set(component.id, handle);
      }
      this.updateHandles();
    }
    for (const component of components) this.handles.get(component.id)?.setAttribute('aria-label', `Move ${component.name.toLowerCase()} component`);
    this.refreshHint();
    this.schedule();
  }

  setBlur(value: number): void {
    const blur = Math.max(0, Math.min(80, Number.isFinite(value) ? value : 0));
    if (blur === this.blur) return;
    this.blur = blur; this.maskDirty = true; this.schedule();
  }
  resetPositions(): void { this.endDrag(); this.scene.reset(); this.updateHandles(); this.schedule(); }

  overlapAt(point: Point): void {
    const bounds = this.canvas.getBoundingClientRect();
    this.endDrag(); this.scene.overlap({x:point.x-bounds.left,y:point.y-bounds.top});
    this.updateHandles(); this.schedule();
  }

  private hitTest(point: Point): EmitterId | null {
    // Unlit components remain keyboard-accessible but cannot steal a visible light's drag.
    return this.scene.hitTest(point, this.components.filter(component => component.xyz.Y > 0).map(component => component.id));
  }

  private point(event: PointerEvent): Point {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  private endDrag(): void {
    const id = this.drag?.id; this.drag = null;
    this.hoverPoint = null; this.hint.hide();
    if (id !== undefined && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    this.setCursor('default');
  }

  private updateHandles(): void {
    for (const [id, handle] of this.handles) {
      const position = this.scene.positions.get(id);
      if (!position) continue;
      handle.style.left = `${position.x}px`; handle.style.top = `${position.y}px`;
    }
    this.refreshHint();
  }

  private refreshHint(): void {
    if (this.drag) { this.setCursor('grabbing'); this.hint.hide(); return; }
    const hovered = this.hoverPoint ? this.hitTest(this.hoverPoint) : null;
    const focused = [...this.handles].find(([,handle]) => handle.matches(':focus-visible'))?.[0] ?? null;
    const emitter = this.active ? hovered ?? focused : null;
    this.setCursor(this.active && hovered ? 'grab' : 'default');
    if (!emitter) { this.hint.hide(); return; }
    const component = this.components.find(component => component.id === emitter)!;
    const center = this.scene.positions.get(emitter)!, bounds = this.canvas.getBoundingClientRect();
    const parent = this.canvas.parentElement!.parentElement!.getBoundingClientRect();
    this.hint.show({ x: center.x+bounds.left-parent.left, y: center.y+bounds.top-parent.top }, this.scene.radius, component.name);
  }

  private setCursor(cursor: 'default' | 'grab' | 'grabbing'): void {
    this.canvas.style.cursor = cursor;
    if (this.interactionTarget) this.interactionTarget.style.cursor = cursor;
  }

  private resize(): void {
    if (!this.active) return;
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height || (bounds.width === this.scene.width && bounds.height === this.scene.height)) return;
    this.endDrag();
    this.ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4_000_000 / (bounds.width * bounds.height)));
    this.canvas.width = Math.round(bounds.width * this.ratio); this.canvas.height = Math.round(bounds.height * this.ratio);
    this.scene.resize(bounds.width, bounds.height);
    this.image = this.context.createImageData(this.canvas.width, this.canvas.height);
    this.fields = Array.from({ length: 3 }, () => new Float32Array(this.canvas.width * this.canvas.height));
    this.maskDirty = true; this.updateHandles(); this.render();
  }

  private schedule(): void {
    if (!this.active || this.animation) return;
    this.animation = requestAnimationFrame(() => { this.animation = 0; this.render(); });
  }

  private rebuildMask(): void {
    const radius = this.scene.radius * this.ratio, sigma = this.blur * this.ratio;
    const size = Math.ceil(2 * (radius + 3 * sigma + 2));
    this.mask.width = size; this.mask.height = size;
    const context = this.maskContext;
    context.beginPath(); context.arc(size / 2, size / 2, radius, 0, 2 * Math.PI); context.fillStyle = '#fff'; context.fill();
    const pixels = context.getImageData(0, 0, size, size).data;
    const coverage = new Float32Array(size * size);
    for (let i = 0; i < coverage.length; i++) coverage[i] = pixels[i * 4 + 3] / 255;
    this.coverage = sigma ? gaussianCoverage(coverage, size, size, sigma) : coverage;
    this.maskDirty = false;
  }

  private render(): void {
    if (!this.image) return;
    if (this.maskDirty) this.rebuildMask();
    const { width, height } = this.canvas, size = this.mask.width;
    const [red, green, blue] = this.fields;
    red.fill(0); green.fill(0); blue.fill(0);
    // XYZ→linear RGB is linear too: accumulate signed contributions here, with
    // no clipping per emitter. Map and encode only after all emitters are summed.
    for (const component of this.components) {
      if (component.xyz.Y <= 0) continue;
      const point = this.scene.positions.get(component.id)!;
      const left = Math.round(point.x * this.ratio - size / 2), top = Math.round(point.y * this.ratio - size / 2);
      const [r, g, b] = xyzToLinearRGB(component.xyz);
      const x0 = Math.max(0, left), x1 = Math.min(width, left + size);
      const y0 = Math.max(0, top), y1 = Math.min(height, top + size);
      for (let y = y0; y < y1; y++) {
        let index = y * width + x0, maskIndex = (y - top) * size + x0 - left;
        for (let x = x0; x < x1; x++, index++, maskIndex++) {
          const coverage = this.coverage[maskIndex];
          red[index] += r * coverage; green[index] += g * coverage; blue[index] += b * coverage;
        }
      }
    }
    const pixels = this.image.data;
    // One exposure for the whole scene, not a separate peak normalization at
    // every pixel. Smooth the display gamut boundary only after the linear sum.
    const gain = SCENE_EXPOSURE * DISPLAY_RESOLUTION;
    const last = DISPLAY_ENCODE.length-1;
    for (let i = 0; i < red.length; i++) {
      pixels[i * 4] = DISPLAY_ENCODE[Math.max(0, Math.min(last, Math.round(red[i] * gain)))];
      pixels[i * 4 + 1] = DISPLAY_ENCODE[Math.max(0, Math.min(last, Math.round(green[i] * gain)))];
      pixels[i * 4 + 2] = DISPLAY_ENCODE[Math.max(0, Math.min(last, Math.round(blue[i] * gain)))]; pixels[i * 4 + 3] = 255;
    }
    this.context.putImageData(this.image, 0, 0);
    if (this.onField) {
      const bounds = this.canvas.getBoundingClientRect();
      this.onField({
        bounds: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
        ratio: this.ratio, blur: this.blur, size, coverage: this.coverage,
        beams: this.components.map(component => {
          const point = this.scene.positions.get(component.id)!;
          return { id: component.id, left: Math.round(point.x*this.ratio-size/2), top: Math.round(point.y*this.ratio-size/2) };
        }),
      });
    }
  }

  destroy(): void {
    this.endDrag(); this.events.abort(); this.handleEvents.abort(); this.observer.disconnect(); cancelAnimationFrame(this.animation);
    this.hint.destroy();
    for (const handle of this.handles.values()) handle.remove();
  }
}
