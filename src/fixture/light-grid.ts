import { sampleCoverage, type BeamField } from './spatial.ts';

export type SpatialEmitter = Readonly<{ left: number; top: number; color: readonly [number, number, number] }>;
export type LinearLightGrid = Readonly<{ width: number; height: number; rgb: Float32Array }>;

/** Smooth irradiance may be resampled in linear light independently of the
 * native-resolution silhouette. Sharp masks retain direct per-pixel sampling.
 */
export function buildLightGrid(field: BeamField, components: readonly SpatialEmitter[], width: number, height: number, startX: number, startY: number, stepX: number, stepY: number): LinearLightGrid | null {
  const spacing = Math.min(3,(field.blur ?? 0)/4);
  if (spacing <= 0) return null;
  const gridWidth = Math.max(2,Math.ceil((width-1)*stepX/(spacing*field.ratio))+1);
  const gridHeight = Math.max(2,Math.ceil((height-1)*stepY/(spacing*field.ratio))+1);
  if (gridWidth*gridHeight >= width*height/2) return null;
  const rgb = new Float32Array(gridWidth*gridHeight*3);
  for (let y = 0; y < gridHeight; y++) {
    const fy = startY+(y*(height-1)/(gridHeight-1)+.5)*stepY;
    for (let x = 0; x < gridWidth; x++) {
      const fx = startX+(x*(width-1)/(gridWidth-1)+.5)*stepX;
      let r = 0, g = 0, b = 0;
      for (const component of components) {
        const coverage = sampleCoverage(field.coverage,field.size,fx-component.left,fy-component.top);
        r += component.color[0]*coverage; g += component.color[1]*coverage; b += component.color[2]*coverage;
      }
      const i = (y*gridWidth+x)*3;
      rgb[i] = r; rgb[i+1] = g; rgb[i+2] = b;
    }
  }
  return { width: gridWidth, height: gridHeight, rgb };
}
