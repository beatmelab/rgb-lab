/** Floating-point linear coverage convolution, without 8-bit alpha banding.
 * Three normalized box passes approximate a Gaussian, with zero outside the tile.
 */
export function gaussianCoverage(input: Float32Array, width: number, height: number, sigma: number): Float32Array {
  if (sigma <= 0) return input.slice();
  const ideal = Math.sqrt(4 * sigma * sigma + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower--;
  const upper = lower + 2;
  const count = Math.round((12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4));
  let source = input;
  const first = new Float32Array(source.length), second = new Float32Array(source.length);
  let destination = first;
  const pass = (horizontal: boolean, radius: number): void => {
    const output = destination;
    const outer = horizontal ? height : width, inner = horizontal ? width : height;
    const index = (line: number, cell: number): number => horizontal ? line * width + cell : cell * width + line;
    for (let line = 0; line < outer; line++) {
      let sum = 0;
      for (let cell = 0; cell <= Math.min(radius, inner - 1); cell++) sum += source[index(line, cell)];
      for (let cell = 0; cell < inner; cell++) {
        output[index(line, cell)] = sum / (2 * radius + 1);
        if (cell - radius >= 0) sum -= source[index(line, cell - radius)];
        if (cell + radius + 1 < inner) sum += source[index(line, cell + radius + 1)];
      }
    }
    source = output;
    destination = output === first ? second : first;
  };
  for (let passIndex = 0; passIndex < 3; passIndex++) {
    const radius = Math.max(0, ((passIndex < count ? lower : upper) - 1) / 2);
    pass(true, radius); pass(false, radius);
  }
  return source;
}
