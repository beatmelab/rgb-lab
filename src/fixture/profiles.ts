import { toHex } from '../color.ts';
import { previewXYZ, xyYToXYZ, type Chromaticity } from './colorimetry.ts';

export type EmitterId = 'red' | 'green' | 'blue' | 'white' | 'amber' | 'mint';
export type EmitterDefinition = Readonly<{ id: EmitterId; name: string; xy: Chromaticity; relativeY: number; controlColor: string }>;
export type FixtureProfile = Readonly<{ id: string; name: string; emitters: readonly EmitterDefinition[]; whiteTemperature: number | null }>;

// Nominal white references, not a claim that CCT uniquely defines an LED's xy.
// The 6500 K preset deliberately uses D65 to match the app's sRGB white target.
export const WHITE_TEMPERATURES = [
  { kelvin: 2700, label: '2700 K', xy: { x: 0.4593, y: 0.4107 } },
  { kelvin: 3200, label: '3200 K', xy: { x: 0.4232, y: 0.3991 } },
  { kelvin: 4000, label: '4000 K', xy: { x: 0.3805, y: 0.3767 } },
  { kelvin: 5600, label: '5600 K', xy: { x: 0.3302, y: 0.3457 } },
  { kelvin: 6500, label: '6500 K · D65', xy: { x: 0.3127, y: 0.3290 } },
] as const;
export const DEFAULT_WHITE_TEMPERATURE = 6500;

// Synthetic teaching profiles: nominal assumptions, not manufacturer measurements.
export const EMITTERS: Readonly<Record<EmitterId, EmitterDefinition>> = {
  red: { id: 'red', name: 'Red', xy: { x: 0.69, y: 0.305 }, relativeY: 0.22, controlColor: '#ff7471' },
  green: { id: 'green', name: 'Green', xy: { x: 0.17, y: 0.72 }, relativeY: 0.7, controlColor: '#b5ed8a' },
  blue: { id: 'blue', name: 'Blue', xy: { x: 0.145, y: 0.045 }, relativeY: 0.08, controlColor: '#8ca7ff' },
  white: { id: 'white', name: 'White · 6500 K', xy: WHITE_TEMPERATURES[4].xy, relativeY: 1, controlColor: '#ffffff' },
  amber: { id: 'amber', name: 'Amber', xy: { x: 0.565, y: 0.425 }, relativeY: 0.45, controlColor: '#ffc05b' },
  mint: { id: 'mint', name: 'Mint', xy: { x: 0.385, y: 0.52 }, relativeY: 0.8, controlColor: '#a2efd0' },
};

const profile = (id: string, name: string, ids: EmitterId[]): FixtureProfile => ({ id, name, emitters: ids.map(id => EMITTERS[id]), whiteTemperature: ids.includes('white') ? DEFAULT_WHITE_TEMPERATURE : null });
export const FIXTURE_PROFILES: readonly FixtureProfile[] = [
  profile('rgb', 'RGB', ['red', 'green', 'blue']),
  profile('rgbw', 'RGBW', ['red', 'green', 'blue', 'white']),
  profile('rgbwa', 'RGBWA', ['red', 'green', 'blue', 'white', 'amber']),
  profile('rgbwam', 'RGBWAM', ['red', 'green', 'blue', 'white', 'amber', 'mint']),
];

export function withWhiteTemperature(profile: FixtureProfile, kelvin: number): FixtureProfile {
  if (!profile.emitters.some(emitter => emitter.id === 'white')) return profile;
  const reference = WHITE_TEMPERATURES.find(reference => reference.kelvin === kelvin);
  if (!reference) throw new RangeError('Unsupported white emitter temperature.');
  const white: EmitterDefinition = {
    ...EMITTERS.white, name: `White · ${kelvin} K`, xy: reference.xy,
    controlColor: toHex(previewXYZ(xyYToXYZ(reference.xy, EMITTERS.white.relativeY)).rgb),
  };
  return { ...profile, whiteTemperature: kelvin, emitters: profile.emitters.map(emitter => emitter.id === 'white' ? white : emitter) };
}
