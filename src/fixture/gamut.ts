import { SPECTRAL_LOCUS } from '../data/spectral-locus.ts';
import { xyToUv, uvToXy, type Chromaticity } from './colorimetry.ts';

const cross = (a: Chromaticity, b: Chromaticity, c: Chromaticity): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

export function convexHull(points: readonly Chromaticity[]): Chromaticity[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y).filter((p, i, all) => !i || p.x !== all[i - 1].x || p.y !== all[i - 1].y);
  if (sorted.length <= 2) return sorted;
  const half = (items: Chromaticity[]): Chromaticity[] => {
    const result: Chromaticity[] = [];
    for (const point of items) {
      while (result.length > 1 && cross(result[result.length - 2], result[result.length - 1], point) <= 1e-12) result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

export function pointInPolygon(point: Chromaticity, polygon: readonly Chromaticity[]): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !polygon.length) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (Math.abs(cross(a, b, point)) <= 1e-9 && point.x >= Math.min(a.x, b.x) - 1e-9 && point.x <= Math.max(a.x, b.x) + 1e-9 && point.y >= Math.min(a.y, b.y) - 1e-9 && point.y <= Math.max(a.y, b.y) + 1e-9) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function isVisibleChromaticity(point: Chromaticity): boolean {
  return point.y > 1e-6 && point.x >= 0 && point.x + point.y <= 1 + 1e-9 && pointInPolygon(point, SPECTRAL_LOCUS);
}

/** Project onto gamut edges in the more uniform CIE 1976 u′v′ plane. */
export function projectToGamut(target: Chromaticity, hull: readonly Chromaticity[]): Chromaticity {
  if (pointInPolygon(target, hull)) return target;
  const uv = xyToUv(target);
  let distance = Infinity;
  let closest = xyToUv(hull[0]);
  hull.forEach((point, index) => {
    const a = xyToUv(point), b = xyToUv(hull[(index + 1) % hull.length]);
    const dx = b.u - a.u, dy = b.v - a.v;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((uv.u - a.u) * dx + (uv.v - a.v) * dy) / length)) : 0;
    const candidate = { u: a.u + t * dx, v: a.v + t * dy };
    const nextDistance = (candidate.u - uv.u) ** 2 + (candidate.v - uv.v) ** 2;
    if (nextDistance < distance) { distance = nextDistance; closest = candidate; }
  });
  return uvToXy(closest);
}
