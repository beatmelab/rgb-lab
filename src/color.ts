export type RGB = Readonly<{ r: number; g: number; b: number }>;
export type Channel = keyof RGB;

export const DEFAULT_COLOR: RGB = { r: 255, g: 255, b: 255 };

export function clampChannel(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : 0;
}

/** Sum emitted RGB contributions, saturating each channel at 255. */
export function addLights(...lights: RGB[]): RGB {
  return {
    r: clampChannel(lights.reduce((sum, light) => sum + light.r, 0)),
    g: clampChannel(lights.reduce((sum, light) => sum + light.g, 0)),
    b: clampChannel(lights.reduce((sum, light) => sum + light.b, 0)),
  };
}

/** Each primary contributes only to its own channel; coverage antialiases edges. */
export function mixPrimaries(intensity: RGB, coverage: RGB): RGB {
  return addLights(
    { r: intensity.r * coverage.r, g: 0, b: 0 },
    { r: 0, g: intensity.g * coverage.g, b: 0 },
    { r: 0, g: 0, b: intensity.b * coverage.b },
  );
}

export function toHex(color: RGB): string {
  return '#' + [color.r, color.g, color.b].map(value => clampChannel(value).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function toCSS(color: RGB): string {
  return `rgb(${clampChannel(color.r)}, ${clampChannel(color.g)}, ${clampChannel(color.b)})`;
}

export const PRESETS: ReadonlyArray<{ name: string; color: RGB }> = [
  { name: 'Red', color: { r: 255, g: 0, b: 0 } },
  { name: 'Green', color: { r: 0, g: 255, b: 0 } },
  { name: 'Blue', color: { r: 0, g: 0, b: 255 } },
  { name: 'Yellow', color: { r: 255, g: 255, b: 0 } },
  { name: 'Cyan', color: { r: 0, g: 255, b: 255 } },
  { name: 'Magenta', color: { r: 255, g: 0, b: 255 } },
  { name: 'White', color: DEFAULT_COLOR },
  { name: 'Black', color: { r: 0, g: 0, b: 0 } },
];
