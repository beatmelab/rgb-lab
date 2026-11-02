export type Point = Readonly<{ x: number; y: number }>;
export type LightIndex = 0 | 1 | 2;

/** Geometry is expressed in CSS pixels, independently of the backing resolution. */
export class LightScene {
  width = 0;
  height = 0;
  radius = 0;
  private centers: Point[] = [];

  get positions(): readonly Point[] { return this.centers; }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    const previousWidth = this.width;
    const previousHeight = this.height;
    this.width = width;
    this.height = height;
    this.radius = this.unit * 0.345;
    if (previousWidth && previousHeight) {
      this.centers = this.centers.map(point => this.constrain({
        x: point.x / previousWidth * width,
        y: point.y / previousHeight * height,
      }));
    } else {
      this.resetPositions();
    }
  }

  resetPositions(): void {
    const unit = this.unit;
    this.centers = [
      { x: this.width / 2 - unit * 0.195, y: this.height / 2 - unit * 0.14 },
      { x: this.width / 2 + unit * 0.195, y: this.height / 2 - unit * 0.14 },
      { x: this.width / 2, y: this.height / 2 + unit * 0.198 },
    ];
  }

  moveLight(index: LightIndex, point: Point): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    this.centers[index] = this.constrain(point);
  }

  /** Pick the nearest center in overlaps, so no channel permanently covers another. */
  hitTest(point: Point): LightIndex | null {
    let nearest: LightIndex | null = null;
    let nearestDistance = Infinity;
    this.centers.forEach((center, index) => {
      const distance = (point.x - center.x) ** 2 + (point.y - center.y) ** 2;
      if (distance <= this.radius ** 2 && distance < nearestDistance) {
        nearest = index as LightIndex;
        nearestDistance = distance;
      }
    });
    return nearest;
  }

  private get unit(): number { return Math.min(this.width / 1.48, this.height / 1.35) * 0.8; }

  private constrain(point: Point): Point {
    return {
      x: Math.max(this.radius, Math.min(this.width - this.radius, point.x)),
      y: Math.max(this.radius, Math.min(this.height - this.radius, point.y)),
    };
  }
}
