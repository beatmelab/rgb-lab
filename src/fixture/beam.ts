import type { Point } from '../scene.ts';
import type { EmitterId } from './profiles.ts';

/** Per-emitter positions survive profile switches, keyed by the shared emitter ID. */
export class ComponentScene {
  width = 0;
  height = 0;
  radius = 0;
  private centers = new Map<EmitterId, Point>();
  private ids: readonly EmitterId[] = [];

  get positions(): ReadonlyMap<EmitterId, Point> { return this.centers; }
  setEmitters(ids: readonly EmitterId[]): void { this.ids = [...ids]; }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    const previousWidth = this.width, previousHeight = this.height;
    this.width = width; this.height = height;
    this.radius = this.unit * 0.345;
    if (previousWidth && previousHeight) {
      for (const [id, point] of this.centers) this.moveTo(id, { x: point.x / previousWidth * width, y: point.y / previousHeight * height });
    } else this.reset();
  }

  reset(): void {
    const offsets: Record<EmitterId, readonly [number, number]> = {
      red: [-0.195, -0.14], green: [0.195, -0.14], blue: [0, 0.198],
      white: [-0.28, 0.16], amber: [0.28, 0.16], mint: [0, -0.30],
    };
    for (const [id, [x, y]] of Object.entries(offsets)) this.moveTo(id as EmitterId, { x: this.width / 2 + x * this.unit, y: this.height / 2 + y * this.unit });
  }

  moveTo(id: EmitterId, point: Point): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    this.centers.set(id, {
      x: Math.max(this.radius, Math.min(this.width - this.radius, point.x)),
      y: Math.max(this.radius, Math.min(this.height - this.radius, point.y)),
    });
  }

  overlap(point: Point): void {
    // Include inactive channels, so changing engines preserves the comparison.
    for (const id of this.centers.keys()) this.moveTo(id,point);
  }

  hitTest(point: Point, selectable: readonly EmitterId[] = this.ids): EmitterId | null {
    let nearest: EmitterId | null = null;
    let distance = Infinity;
    for (const id of this.ids) {
      if (!selectable.includes(id)) continue;
      const center = this.centers.get(id);
      if (!center) continue;
      const next = (point.x - center.x) ** 2 + (point.y - center.y) ** 2;
      if (next <= this.radius ** 2 && next < distance) { nearest = id; distance = next; }
    }
    return nearest;
  }

  private get unit(): number { return Math.min(this.width / 1.48, this.height / 1.35) * 0.8; }
}
