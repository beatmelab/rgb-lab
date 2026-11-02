import { encodeLinear } from './colorimetry.ts';

const RESOLUTION = 16384;
const TOE = 0.02;
const SHOULDER = 0.85;
const MAX_LINEAR = 8;

/** C1 transition into the display gamut: no hard knee as a channel crosses zero. */
export function displayChannel(linear: number): number {
  if (linear <= 0) return 0;
  // A fixed, monotonic shoulder leaves the calibrated RGB white bright and
  // gives extra emitters room without normalizing individual pixels or mixes.
  if (linear > SHOULDER) return SHOULDER+(1-SHOULDER)*(-Math.expm1(-(linear-SHOULDER)/(1-SHOULDER)));
  if (linear >= TOE) return linear;
  const t = linear / TOE;
  return TOE * t * t * (2 - t);
}

export const DISPLAY_ENCODE = Uint8ClampedArray.from({ length: MAX_LINEAR*RESOLUTION + 1 }, (_, index) =>
  Math.round(encodeLinear(displayChannel(index / RESOLUTION))));
export const DISPLAY_RESOLUTION = RESOLUTION;

/** One relative exposure across engines, CCTs and levels. Highlight compression
 * handles added output instead of reserving display headroom for all channels.
 */
export const SCENE_EXPOSURE = 1;
