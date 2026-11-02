import type { EmitterId } from './profiles.ts';
import type { XYZ } from './colorimetry.ts';

export type BeamField = Readonly<{
  bounds: Readonly<{ left: number; top: number; width: number; height: number }>;
  ratio: number;
  blur?: number;
  size: number;
  coverage: Float32Array;
  beams: readonly Readonly<{ id: EmitterId; left: number; top: number }>[];
}>;
export type ReflectedComponent = Readonly<{ id: EmitterId; colors: readonly XYZ[] }>;

/** Bilinear sampling of a linear intensity mask; zero outside the mask. */
export function sampleCoverage(mask: Float32Array, size: number, x: number, y: number): number {
  if (x <= -1 || y <= -1 || x >= size || y >= size) return 0;
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = x-x0, ty = y-y0;
  const x1 = x0+1, y1 = y0+1;
  const a0 = x0 < 0 || y0 < 0 || x0 >= size || y0 >= size ? 0 : mask[y0*size+x0];
  const a1 = x1 < 0 || y0 < 0 || x1 >= size || y0 >= size ? 0 : mask[y0*size+x1];
  const b0 = x0 < 0 || y1 < 0 || x0 >= size || y1 >= size ? 0 : mask[y1*size+x0];
  const b1 = x1 < 0 || y1 < 0 || x1 >= size || y1 >= size ? 0 : mask[y1*size+x1];
  const a = a0*(1-tx)+a1*tx, b = b0*(1-tx)+b1*tx;
  return Math.max(0,Math.min(1,a*(1-ty)+b*ty));
}

/** Local CSS coordinates, identical mask placement to FixtureCanvas. */
export function reflectedAt(field: BeamField, components: readonly ReflectedComponent[], x: number, y: number, sample: number): XYZ {
  const result = { X: 0, Y: 0, Z: 0 };
  for (const component of components) {
    const beam = field.beams.find(beam => beam.id === component.id);
    if (!beam) continue;
    const coverage = sampleCoverage(field.coverage,field.size,x*field.ratio-beam.left-.5,y*field.ratio-beam.top-.5);
    const color = component.colors[sample];
    result.X += color.X*coverage; result.Y += color.Y*coverage; result.Z += color.Z*coverage;
  }
  return result;
}
