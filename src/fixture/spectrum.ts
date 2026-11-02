import { clampChannel } from '../color.ts';
import { SURFACE_DATA } from '../data/surface-data.ts';
import { BLACK_XYZ, deltaUv, xyzToXy, type XYZ } from './colorimetry.ts';
import type { EmitterLevels } from './engine.ts';
import type { EmitterDefinition, FixtureProfile } from './profiles.ts';
import type { ReflectedComponent } from './spatial.ts';

export type Spectrum = readonly number[];
export type SurfaceSample = Readonly<{ id: string; name: string; source: string; reflectance: Spectrum }>;
export const SKIN_SAMPLES: readonly SurfaceSample[] = SURFACE_DATA.skins;
export const MATERIAL_SAMPLES: readonly SurfaceSample[] = SURFACE_DATA.materials;
export const REFERENCE_SPECTRUM: Spectrum = SURFACE_DATA.d65;
export const SPECTRUM_SIZE = SURFACE_DATA.cmf.length;

/** 380–780 nm, 5 nm, trapezoidal integration with the CIE 1931 2° observer. */
export function integrateSpectrum(spectrum: Spectrum, reflectance?: Spectrum): XYZ {
  if (spectrum.length !== SPECTRUM_SIZE || (reflectance && reflectance.length !== SPECTRUM_SIZE)) throw new RangeError('Invalid spectral sample count.');
  const xyz = { ...BLACK_XYZ };
  for (let i = 0; i < SPECTRUM_SIZE; i++) {
    const power = spectrum[i], factor = reflectance?.[i] ?? 1;
    if (!Number.isFinite(power) || power < 0 || !Number.isFinite(factor) || factor < 0 || factor > 1) throw new RangeError('Invalid spectral power or reflectance.');
    const weighted = power * factor * SURFACE_DATA.step * (i === 0 || i === SPECTRUM_SIZE - 1 ? 0.5 : 1);
    const [x, y, z] = SURFACE_DATA.cmf[i];
    xyz.X += weighted * x; xyz.Y += weighted * y; xyz.Z += weighted * z;
  }
  return xyz;
}

/** Synthetic spectra fitted to the existing emitter xyY, not manufacturer data. */
export function emitterSpectrum(emitter: EmitterDefinition, profile: FixtureProfile): Spectrum {
  const key = emitter.id === 'white' ? `white-${profile.whiteTemperature}` : emitter.id;
  const spectrum = (SURFACE_DATA.emitters as Readonly<Record<string, Spectrum>>)[key];
  if (!spectrum) throw new RangeError(`No spectral model for ${key}.`);
  return spectrum;
}

export function mixSpectrum(profile: FixtureProfile, levels: EmitterLevels): number[] {
  const spectrum = Array<number>(SPECTRUM_SIZE).fill(0);
  for (const emitter of profile.emitters) {
    const power = emitterSpectrum(emitter, profile), level = clampChannel(levels[emitter.id]) / 255;
    for (let i = 0; i < spectrum.length; i++) spectrum[i] += power[i] * level;
  }
  return spectrum;
}

/** Pre-integrate each emitter × material; spatial coverage is applied afterwards
 * in linear XYZ. No local brightness normalization may erase a beam's falloff.
 */
export function reflectedComponents(profile: FixtureProfile, levels: EmitterLevels, samples: readonly SurfaceSample[], gain = 1): ReflectedComponent[] {
  return profile.emitters.map(emitter => {
    const level = clampChannel(levels[emitter.id])/255*gain;
    const spectrum = emitterSpectrum(emitter,profile).map(power => power*level);
    return { id: emitter.id, colors: samples.map(sample => integrateSpectrum(spectrum,sample.reflectance)) };
  });
}

/** Normalize illuminance, never each object's reflected brightness. Black stays black. */
export function equalIlluminance(spectrum: Spectrum): number[] {
  const Y = integrateSpectrum(spectrum).Y;
  return spectrum.map(value => Y > 1e-12 ? value / Y : 0);
}

export type SurfaceComparison = Readonly<{
  reference: readonly XYZ[]; actual: readonly XYZ[];
  whiteDifference: number | null; off: boolean;
  gain: number;
}>;

export function compareSurfaces(profile: FixtureProfile, levels: EmitterLevels, samples: readonly SurfaceSample[], normalize = true): SurfaceComparison {
  const source = mixSpectrum(profile,levels), Y = integrateSpectrum(source).Y;
  const gain = normalize ? (Y>1e-12 ? 1/Y : 0) : 1;
  const fixture = source.map(value=>value*gain);
  const white = integrateSpectrum(fixture);
  return {
    reference: samples.map(sample => integrateSpectrum(REFERENCE_SPECTRUM, sample.reflectance)),
    actual: samples.map(sample => integrateSpectrum(fixture, sample.reflectance)),
    gain,
    whiteDifference: deltaUv(xyzToXy(integrateSpectrum(REFERENCE_SPECTRUM)), xyzToXy(white)),
    off: white.Y <= 1e-12,
  };
}
