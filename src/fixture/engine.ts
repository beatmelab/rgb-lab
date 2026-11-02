import { clampChannel, type RGB } from '../color.ts';
import { BLACK_XYZ, deltaUv, hexToXYZ, previewXYZ, scaleXYZ, xyYToXYZ, xyzToXy, type Chromaticity, type XYZ } from './colorimetry.ts';
import { convexHull, pointInPolygon, projectToGamut } from './gamut.ts';
import { FIXTURE_PROFILES, type EmitterId, type FixtureProfile } from './profiles.ts';

export type EmitterLevels = Record<EmitterId, number>;
export type FixtureComponent = Readonly<{ id: EmitterId; name: string; xyz: XYZ }>;
export type FixtureState = { profile: FixtureProfile; levels: EmitterLevels; target: XYZ; matched: boolean };
export type FixtureMixResult = Readonly<{
  xyz: XYZ; xy: Chromaticity | null; preview: RGB; deltaUv: number | null;
  targetInGamut: boolean; targetOutsideSRGB: boolean; actualOutsideSRGB: boolean;
}>;
export const zeroLevels = (): EmitterLevels => ({ red: 0, green: 0, blue: 0, white: 0, amber: 0, mint: 0 });
export function fullLevels(profile: FixtureProfile): EmitterLevels {
  const levels = zeroLevels();
  for (const emitter of profile.emitters) levels[emitter.id] = 255;
  return levels;
}
export const fixtureGamut = (profile: FixtureProfile): Chromaticity[] => convexHull(profile.emitters.map(emitter => emitter.xy));

export function fixtureComponents(profile: FixtureProfile, levels: EmitterLevels): FixtureComponent[] {
  return profile.emitters.map(emitter => ({
    id: emitter.id, name: emitter.name,
    xyz: xyYToXYZ(emitter.xy, emitter.relativeY * clampChannel(levels[emitter.id]) / 255),
  }));
}

/** Sum spatially weighted emitter contributions before any display mapping. */
export function mixComponents(components: readonly FixtureComponent[], coverages?: Partial<Record<EmitterId, number>>): XYZ {
  const xyz = { ...BLACK_XYZ };
  for (const component of components) {
    const value = coverages ? coverages[component.id] ?? 0 : 1;
    const coverage = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    xyz.X += component.xyz.X * coverage; xyz.Y += component.xyz.Y * coverage; xyz.Z += component.xyz.Z * coverage;
  }
  return xyz;
}

export function mixFixture(profile: FixtureProfile, levels: EmitterLevels, target: XYZ): FixtureMixResult {
  const xyz = mixComponents(fixtureComponents(profile, levels));
  const xy = xyzToXy(xyz), targetXy = xyzToXy(target);
  const preview = previewXYZ(xyz);
  return {
    xyz, xy, preview: preview.rgb, deltaUv: deltaUv(targetXy, xy),
    targetInGamut: targetXy === null || pointInPolygon(targetXy, fixtureGamut(profile)),
    targetOutsideSRGB: previewXYZ(target).outsideSRGB,
    actualOutsideSRGB: preview.outsideSRGB,
  };
}

function solve3(matrix: number[][], vector: number[]): number[] {
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < 3; column++) {
    let pivot = column;
    for (let row = column + 1; row < 3; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const scale = rows[column][column];
    for (let cell = column; cell < 4; cell++) rows[column][cell] /= scale;
    for (let row = 0; row < 3; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let cell = column; cell < 4; cell++) rows[row][cell] -= factor * rows[column][cell];
    }
  }
  return rows.map(row => row[3]);
}

/** Enumerate ≤64 active sets. Ridge in the 3×3 dual gives a unique minimum-norm recipe. */
export function solveNonnegativeLeastSquares(columns: readonly XYZ[], target: XYZ): number[] {
  const vectors = columns.map(column => [column.X, column.Y, column.Z]);
  const desired = [target.X, target.Y, target.Z];
  const lambda = 1e-7;
  let best = columns.map(() => 0);
  let bestCost = desired.reduce((sum, value) => sum + value * value, 0);
  for (let active = 1; active < 2 ** columns.length; active++) {
    const selected = vectors.filter((_, index) => active & (1 << index));
    const matrix = Array.from({ length: 3 }, (_, row) => Array.from({ length: 3 }, (_, column) => selected.reduce((sum, vector) => sum + vector[row] * vector[column], row === column ? lambda : 0)));
    const dual = solve3(matrix, desired);
    const weights = vectors.map((vector, index) => active & (1 << index) ? vector.reduce((sum, value, axis) => sum + value * dual[axis], 0) : 0);
    if (weights.some(weight => weight < -1e-8 || !Number.isFinite(weight))) continue;
    const candidate = weights.map(weight => Math.max(0, weight));
    const residual = desired.map((value, axis) => vectors.reduce((sum, vector, index) => sum + vector[axis] * candidate[index], -value));
    const cost = residual.reduce((sum, value) => sum + value * value, 0) + lambda * candidate.reduce((sum, value) => sum + value * value, 0);
    if (cost < bestCost) { bestCost = cost; best = candidate; }
  }
  return best;
}

export function matchTarget(profile: FixtureProfile, target: XYZ): EmitterLevels {
  const levels = zeroLevels();
  const xy = xyzToXy(target);
  if (!xy || target.Y <= 0) return levels;
  const goal = xyYToXYZ(projectToGamut(xy, fixtureGamut(profile)), target.Y);
  const columns = profile.emitters.map(emitter => xyYToXYZ(emitter.xy, emitter.relativeY));
  const weights = solveNonnegativeLeastSquares(columns, goal);
  const scale = Math.max(1, ...weights);
  profile.emitters.forEach((emitter, index) => { levels[emitter.id] = clampChannel(255 * weights[index] / scale); });
  return levels;
}

export function createFixtureState(): FixtureState {
  const profile = FIXTURE_PROFILES[0];
  const target = hexToXYZ('#FFFFFF')!;
  return { profile, target, levels: matchTarget(profile,target), matched: true };
}

export function selectTargetXy(state: FixtureState, xy: Chromaticity): void {
  state.target = xyYToXYZ(xy, state.target.Y > 0 ? state.target.Y : 1);
}

// Reference preview for one spatial contribution: coverage is a linear light field.
export const previewAtCoverage = (xyz: XYZ, coverage: number): RGB => previewXYZ(scaleXYZ(xyz, coverage)).rgb;
