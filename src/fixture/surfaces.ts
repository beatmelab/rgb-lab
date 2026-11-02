import { encodeLinear, xyzToLinearRGB } from './colorimetry.ts';
import type { EmitterLevels } from './engine.ts';
import type { FixtureProfile } from './profiles.ts';
import { compareSurfaces, reflectedComponents, MATERIAL_SAMPLES, SKIN_SAMPLES, type SurfaceComparison } from './spectrum.ts';
import { sampleCoverage, type BeamField } from './spatial.ts';
import { faceResolution, facePathData, facePixelShadingAt } from './face-raster.ts';
import { buildLightGrid } from './light-grid.ts';

const WIDTH = 240, HEIGHT = 280, RATIO = 2;
// Shared display exposure. Optional source normalization is a single gain on
// the full recipe; never normalize the light separately at each surface pixel.
const EXPOSURE = 0.8;
const ENCODE = Uint8ClampedArray.from({ length: 16385 }, (_, i) => Math.round(encodeLinear(i / 16384)));
const byte = (linear: number): number => ENCODE[Math.round(Math.max(0, Math.min(1, linear)) * 16384)];

export class SurfaceView {
  private readonly geometries = new Map<HTMLCanvasElement, { shading: Float32Array; alpha: Uint8ClampedArray; spans: Uint32Array }>();
  private readonly images = new Map<HTMLCanvasElement,ImageData>();
  private readonly referenceMaster = document.createElement('canvas');
  private readonly canvases: HTMLCanvasElement[] = [];
  private readonly swatches: HTMLCanvasElement[][] = [];
  private readonly status: HTMLElement;
  private readonly actualHeading: HTMLElement;
  private readonly approximation: HTMLElement;
  private active = false;
  private field: BeamField | null = null;
  private comparison: SurfaceComparison | null = null;
  private components: { id: string; colors: readonly (readonly [number, number, number])[] }[] = [];
  private referenceSkin = '';
  private readonly events = new AbortController();
  private readonly observer: ResizeObserver;
  private animation = 0;
  private current: { profile: FixtureProfile; levels: EmitterLevels; skin: number } | null = null;

  constructor(private readonly root: HTMLElement) {
    for (const label of ['Reference · D65', 'Fixture']) {
      const column = document.createElement('section');
      column.className = `surface-column ${label === 'Fixture' ? 'surface-actual' : 'surface-reference'}`;
      const heading = document.createElement('h3'); heading.textContent = label;
      const canvas = document.createElement('canvas'); canvas.width = WIDTH*RATIO; canvas.height = HEIGHT*RATIO;
      canvas.className = 'surface-face'; canvas.setAttribute('role','img');
      const samples = document.createElement('div'); samples.className = 'surface-materials';
      const swatches = MATERIAL_SAMPLES.map(sample => {
        const item = document.createElement('div'), swatch = document.createElement('canvas'), name = document.createElement('span');
        swatch.className = 'surface-swatch'; name.textContent = sample.name;
        swatch.setAttribute('role','img'); item.title = sample.source;
        item.append(swatch,name); samples.append(item); return swatch;
      });
      column.append(heading,canvas,samples); root.querySelector('.surface-columns')!.append(column);
      this.canvases.push(canvas); this.swatches.push(swatches);
    }
    this.status = root.querySelector('.surface-status')!;
    this.actualHeading = root.querySelectorAll('.surface-column h3')[1] as HTMLElement;
    this.approximation = root.querySelector('.surface-approximation')!;
    this.approximation.hidden = false;
    this.approximation.style.visibility = 'hidden';
    this.observer = new ResizeObserver(() => this.schedule());
    this.observer.observe(root);
    root.addEventListener('scroll', () => this.schedule(), { signal: this.events.signal, passive: true });
    window.addEventListener('resize', () => this.schedule(), { signal: this.events.signal });
  }

  setVisible(visible: boolean): void {
    this.active = visible; this.root.hidden = !visible;
    if (!visible) { cancelAnimationFrame(this.animation); this.animation = 0; }
    if (visible && this.current) this.render();
  }

  update(profile: FixtureProfile, levels: EmitterLevels, skin: number, equalIlluminance = true): void {
    this.current = { profile, levels: { ...levels }, skin };
    const samples = [SKIN_SAMPLES[skin] ?? SKIN_SAMPLES[1], ...MATERIAL_SAMPLES];
    this.comparison = compareSurfaces(profile,levels,samples,equalIlluminance);
    this.components = reflectedComponents(profile,levels,samples,this.comparison.gain).map(component => ({
      id: component.id, colors: component.colors.map(xyzToLinearRGB),
    }));
    if (this.active) this.schedule();
  }

  setField(field: BeamField): void {
    this.field = field;
    if (this.active && this.current) this.schedule();
  }

  comparisonPoint(): { x: number; y: number } {
    const bounds = this.canvases[1].getBoundingClientRect(), fit = Math.min(bounds.width/WIDTH,bounds.height/HEIGHT);
    return { x: bounds.left+bounds.width/2, y: bounds.top+(bounds.height-HEIGHT*fit)/2+103*fit };
  }

  private schedule(): void {
    if (!this.active || this.animation) return;
    this.animation = requestAnimationFrame(() => { this.animation = 0; if (this.current) this.render(); });
  }

  private render(): void {
    const { profile, skin } = this.current!;
    const selected = SKIN_SAMPLES[skin] ?? SKIN_SAMPLES[1];
    const comparison = this.comparison!;
    const actualGeometry = this.faceGeometryFor(this.canvases[1]);
    // Build the reference from the same large geometry, then reduce it to the
    // PIP. The small reference canvas never determines the main face's detail.
    const pip = this.canvases[0], pipBounds = pip.getBoundingClientRect();
    const pipUnit = Math.max(1,Math.ceil(Math.min(pipBounds.width/6,pipBounds.height/7)*Math.min(window.devicePixelRatio || 1,3)));
    if (pip.width !== pipUnit*6 || pip.height !== pipUnit*7) { pip.width = pipUnit*6; pip.height = pipUnit*7; }
    this.actualHeading.textContent = `Fixture · ${profile.name}`;
    // Reserve a stable line, so changing diagnostics cannot shift the surfaces
    // after their screen coordinates have been sampled.
    this.status.textContent = comparison.off ? 'Fixture off' : 'Drag beams across the fixture face and samples';
    this.status.classList.toggle('warning', comparison.off);
    let mapped = false;
    const reference = comparison.reference.map(xyzToLinearRGB);
    mapped = reference.some(rgb => rgb.some(c => c < -1e-6 || c*EXPOSURE > 1+1e-6));
    const referenceKey = `${selected.id}:${this.canvases[1].width}:${this.canvases[1].height}:${pip.width}:${pip.height}`;
    if (this.referenceSkin !== referenceKey) {
      const canvas = this.referenceMaster;
      canvas.width = this.canvases[1].width; canvas.height = this.canvases[1].height;
      const context = canvas.getContext('2d')!, image = context.createImageData(canvas.width,canvas.height);
      const { shading, alpha } = actualGeometry;
      for (let i = 0; i < shading.length; i++) {
        if (!shading[i]) continue;
        for (let channel = 0; channel < 3; channel++) image.data[i*4+channel] = byte(reference[0][channel]*shading[i]*EXPOSURE);
        image.data[i*4+3] = alpha[i];
      }
      context.putImageData(image,0,0);
      const pipContext = pip.getContext('2d')!;
      pipContext.clearRect(0,0,pip.width,pip.height);
      pipContext.imageSmoothingEnabled = true; pipContext.imageSmoothingQuality = 'high';
      pipContext.drawImage(canvas,0,0,pip.width,pip.height);
      this.referenceSkin = referenceKey;
    }
    this.canvases[0].setAttribute('aria-label', `Fixed D65 reference illuminating an illustrative face with ${selected.name.toLowerCase()} skin reflectance.`);
    this.canvases[1].setAttribute('aria-label', `Illustrative face with ${selected.name.toLowerCase()} skin reflectance illuminated by movable ${profile.name} beams. Unlit areas are black.`);
    mapped = this.drawSpatial(this.canvases[1],0,actualGeometry.shading,actualGeometry.alpha,actualGeometry.spans) || mapped;
    this.swatches[0].forEach((canvas,i) => {
      this.sizeSwatch(canvas);
      const context = canvas.getContext('2d')!;
      context.fillStyle = `rgb(${reference[i+1].map(c=>byte(c*EXPOSURE)).join(' ')})`;
      context.fillRect(0,0,canvas.width,canvas.height);
      canvas.setAttribute('aria-label', `${MATERIAL_SAMPLES[i].name} under fixed D65 reference light.`);
    });
    this.swatches[1].forEach((canvas,i) => {
      this.sizeSwatch(canvas);
      mapped = this.drawSpatial(canvas,i+1) || mapped;
      canvas.setAttribute('aria-label', `${MATERIAL_SAMPLES[i].name} under spatial ${profile.name} illumination.`);
    });
    this.approximation.style.visibility = mapped ? 'visible' : 'hidden';
  }

  private sizeSwatch(canvas: HTMLCanvasElement): void {
    const bounds = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1,2);
    const width = Math.max(1,Math.round((bounds.width-2*canvas.clientLeft)*ratio));
    const height = Math.max(1,Math.round((bounds.height-2*canvas.clientTop)*ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  }

  private faceGeometryFor(canvas: HTMLCanvasElement): { shading: Float32Array; alpha: Uint8ClampedArray; spans: Uint32Array } {
    const bounds = canvas.getBoundingClientRect();
    const { width, height } = faceResolution(bounds.width,bounds.height,window.devicePixelRatio || 1);
    const previous = this.geometries.get(canvas);
    if (previous && canvas.width === width && canvas.height === height) return previous;
    canvas.width = width; canvas.height = height;
    const mask = document.createElement('canvas'); mask.width = width; mask.height = height;
    const context = mask.getContext('2d',{ willReadFrequently: true })!;
    context.fillStyle = '#fff';
    context.fill(new Path2D(facePathData(width,height)));
    const pixels = context.getImageData(0,0,width,height).data;
    const alpha = new Uint8ClampedArray(width*height), shading = new Float32Array(width*height);
    const spans = new Uint32Array(height*2);
    for (let y=0;y<height;y++) spans[y*2]=width;
    const border: number[] = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y*width+x;
      // Preserve fractional edge coverage; thresholding this to 0/255 creates
      // stair steps even if a separate CSS clip has a smooth outer contour.
      alpha[i] = pixels[i*4+3];
      if (alpha[i]) {
        spans[y*2]=Math.min(spans[y*2],x); spans[y*2+1]=x+1;
        shading[i] = facePixelShadingAt((x+.5)*WIDTH/width,(y+.5)*HEIGHT/height,WIDTH/width);
        if (!shading[i]) border.push(i);
      }
    }
    // Edge pixels whose centers fall outside the geometry still need a surface
    // color. Extend shading without changing their fractional coverage.
    for (let pass = 0; pass < 4; pass++) for (const i of border) {
      if (shading[i]) continue;
      let sum = 0, count = 0;
      const x = i%width, y = Math.floor(i/width);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (x+dx<0 || x+dx>=width || y+dy<0 || y+dy>=height) continue;
        const value = shading[(y+dy)*width+x+dx];
        if (value>0) { sum+=value; count++; }
      }
      if (count) shading[i] = sum/count;
    }
    const geometry = { shading, alpha, spans }; this.geometries.set(canvas,geometry);
    return geometry;
  }

  private drawSpatial(canvas: HTMLCanvasElement, sample: number, shading?: Float32Array, alpha?: Uint8ClampedArray, spans?: Uint32Array): boolean {
    const context = canvas.getContext('2d')!;
    let image = this.images.get(canvas);
    if (!image || image.width !== canvas.width || image.height !== canvas.height) {
      image = context.createImageData(canvas.width,canvas.height); this.images.set(canvas,image);
    }
    const field = this.field;
    if (!field) { image.data.fill(0); context.putImageData(image,0,0); return false; }
    const bounds = canvas.getBoundingClientRect();
    const contentWidth = bounds.width-2*canvas.clientLeft, contentHeight = bounds.height-2*canvas.clientTop;
    const fit = Math.min(contentWidth/canvas.width,contentHeight/canvas.height);
    const stepX = (shading ? fit : contentWidth/canvas.width)*field.ratio;
    const stepY = (shading ? fit : contentHeight/canvas.height)*field.ratio;
    const startX = (bounds.left+canvas.clientLeft+(shading ? (contentWidth-canvas.width*fit)/2 : 0)-field.bounds.left)*field.ratio;
    const startY = (bounds.top+canvas.clientTop+(shading ? (contentHeight-canvas.height*fit)/2 : 0)-field.bounds.top)*field.ratio;
    const components = this.components.flatMap(component => {
      const beam = field.beams.find(beam => beam.id === component.id);
      const color = component.colors[sample];
      return beam && color.some(c=>c!==0) ? [{ left: beam.left+.5, top: beam.top+.5, color }] : [];
    });
    const grid = shading ? buildLightGrid(field,components,canvas.width,canvas.height,startX,startY,stepX,stepY) : null;
    const gridX = grid ? (grid.width-1)/(canvas.width-1) : 0;
    const gridY = grid ? (grid.height-1)/(canvas.height-1) : 0;
    // Interpolate grid rows once, rather than recomputing four bilinear weights
    // and twelve RGB products at every high-resolution face pixel.
    const row = grid ? new Float32Array(grid.width*3) : null;
    const columns = grid ? Int32Array.from({length:canvas.width},(_,x)=>Math.min(grid.width-2,Math.floor(x*gridX))*3) : null;
    const fractions = grid ? Float32Array.from({length:canvas.width},(_,x)=>x*gridX-columns![x]/3) : null;
    let mapped = false;
    for (let y = 0; y < canvas.height; y++) {
      const left=spans ? spans[y*2] : 0, right=spans ? spans[y*2+1] : canvas.width;
      if (left>=right) continue;
      const fy = startY+(y+.5)*stepY;
      const gy = y*gridY, y0 = Math.floor(gy), y1 = grid ? Math.min(grid.height-1,y0+1) : 0, ty = gy-y0;
      if (grid) for (let j=0;j<row!.length;j++) {
        const a=grid.rgb[y0*row!.length+j], b=grid.rgb[y1*row!.length+j];
        row![j]=a+(b-a)*ty;
      }
      for (let x = left; x < right; x++) {
        const i = y*canvas.width+x, shade = shading ? shading[i] : 1;
        if (!shade) continue;
        let r = 0, g = 0, b = 0;
        if (grid) {
          const j=columns![x], t=fractions![x];
          r=row![j]+(row![j+3]-row![j])*t;
          g=row![j+1]+(row![j+4]-row![j+1])*t;
          b=row![j+2]+(row![j+5]-row![j+2])*t;
        } else for (const component of components) {
          const fx = startX+(x+.5)*stepX;
          const coverage = sampleCoverage(field.coverage,field.size,fx-component.left,fy-component.top);
          r += component.color[0]*coverage; g += component.color[1]*coverage; b += component.color[2]*coverage;
        }
        const gain = shade*EXPOSURE;
        if (!mapped && (r < -1e-6 || g < -1e-6 || b < -1e-6 || Math.max(r,g,b)*gain > 1+1e-6)) mapped = true;
        const scale = gain*16384;
        image.data[i*4] = ENCODE[Math.max(0,Math.min(16384,Math.round(r*scale)))];
        image.data[i*4+1] = ENCODE[Math.max(0,Math.min(16384,Math.round(g*scale)))];
        image.data[i*4+2] = ENCODE[Math.max(0,Math.min(16384,Math.round(b*scale)))];
        image.data[i*4+3] = alpha ? alpha[i] : 255;
      }
    }
    context.putImageData(image,0,0);
    return mapped;
  }

  destroy(): void {
    this.observer.disconnect(); this.events.abort(); cancelAnimationFrame(this.animation);
  }
}
