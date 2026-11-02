import { clampChannel, type RGB } from '../color.ts';

export type XYZ = Readonly<{ X: number; Y: number; Z: number }>;
export type Chromaticity = Readonly<{ x: number; y: number }>;
export type UV = Readonly<{ u: number; v: number }>;
export const BLACK_XYZ: XYZ = { X: 0, Y: 0, Z: 0 };
export const SRGB_PRIMARIES: readonly Chromaticity[] = [{ x: 0.64, y: 0.33 }, { x: 0.3, y: 0.6 }, { x: 0.15, y: 0.06 }];

export function xyYToXYZ(xy: Chromaticity, Y: number): XYZ {
  if (!Number.isFinite(xy.x) || !Number.isFinite(xy.y) || !Number.isFinite(Y) || xy.x < 0 || xy.y <= 0 || xy.x + xy.y > 1 + 1e-9 || Y < 0) {
    throw new RangeError('Invalid xyY color.');
  }
  return { X: xy.x * Y / xy.y, Y, Z: Math.max(0, 1 - xy.x - xy.y) * Y / xy.y };
}

export function xyzToXy(xyz: XYZ): Chromaticity | null {
  const sum = xyz.X + xyz.Y + xyz.Z;
  return sum > 1e-12 ? { x: xyz.X / sum, y: xyz.Y / sum } : null;
}

export function xyToUv(xy: Chromaticity): UV {
  const denominator = -2 * xy.x + 12 * xy.y + 3;
  return { u: 4 * xy.x / denominator, v: 9 * xy.y / denominator };
}

export function uvToXy(uv: UV): Chromaticity {
  const denominator = 6 * uv.u - 16 * uv.v + 12;
  return { x: 9 * uv.u / denominator, y: 4 * uv.v / denominator };
}

export function deltaUv(a: Chromaticity | null, b: Chromaticity | null): number | null {
  if (!a || !b) return null;
  const first = xyToUv(a);
  const second = xyToUv(b);
  return Math.hypot(first.u - second.u, first.v - second.v);
}

function decode(value: number): number {
  const s = clampChannel(value) / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function encodeLinear(value: number): number {
  return 255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);
}

// sRGB/D65 matrices; all physical mixing stays in unclipped linear XYZ.
export function rgbToXYZ(rgb: RGB): XYZ {
  const r = decode(rgb.r), g = decode(rgb.g), b = decode(rgb.b);
  return {
    X: 0.4123907992659595 * r + 0.357584339383878 * g + 0.1804807884018343 * b,
    Y: 0.2126390058715104 * r + 0.715168678767756 * g + 0.0721923153607337 * b,
    Z: 0.0193308187155918 * r + 0.119194779794626 * g + 0.9505321522496607 * b,
  };
}

export function hexToXYZ(hex: string): XYZ | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return rgbToXYZ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });
}

export function xyzToLinearRGB(xyz: XYZ): readonly [number, number, number] {
  return [
    3.2409699419045226 * xyz.X - 1.537383177570094 * xyz.Y - 0.4986107602930034 * xyz.Z,
    -0.9692436362808796 * xyz.X + 1.8759675015077202 * xyz.Y + 0.0415550574071756 * xyz.Z,
    0.0556300796969937 * xyz.X - 0.2039769588889765 * xyz.Y + 1.0569715142428786 * xyz.Z,
  ];
}

export function previewXYZ(xyz: XYZ): { rgb: RGB; outsideSRGB: boolean } {
  const raw = xyzToLinearRGB(xyz);
  const outsideSRGB = raw.some(value => value < -1e-6 || value > 1 + 1e-6);
  const values = raw.map(value => Math.max(0, value));
  const scale = Math.max(1, ...values);
  return {
    rgb: { r: clampChannel(encodeLinear(values[0] / scale)), g: clampChannel(encodeLinear(values[1] / scale)), b: clampChannel(encodeLinear(values[2] / scale)) },
    outsideSRGB,
  };
}

export function scaleXYZ(xyz: XYZ, scale: number): XYZ {
  return { X: xyz.X * scale, Y: xyz.Y * scale, Z: xyz.Z * scale };
}
