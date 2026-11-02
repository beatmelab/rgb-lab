/** Preserve the face's 6:7 aspect ratio without stretching its geometry. */
export function faceResolution(cssWidth: number, cssHeight: number, density: number): { width: number; height: number } {
  if (!Number.isFinite(cssWidth) || !Number.isFinite(cssHeight) || cssWidth <= 0 || cssHeight <= 0) return { width: 6, height: 7 };
  const ratio = Number.isFinite(density) ? Math.max(1,Math.min(3,density)) : 1;
  const target = Math.min(cssWidth/6,cssHeight/7)*ratio;
  // A large master serves the main view and is reduced for the reference PIP.
  // Keep at least 1440 × 1680; Retina desktops grow to their displayed density.
  const unit = Math.max(240,Math.min(Math.ceil(target),Math.floor(Math.sqrt(12_000_000/42))));
  return { width: unit*6, height: unit*7 };
}

/** One vector silhouette, rasterized with native coverage at master resolution. */
export function facePathData(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !(width > 0 && height > 0)) return '';
  const fit = Math.min(width/240,height/280), left = (width-240*fit)/2, top = (height-280*fit)/2;
  const x = (v: number): string => (left+v*fit).toFixed(3);
  const y = (v: number): string => (top+v*fit).toFixed(3);
  const ellipse = (cx: number,cy: number,rx: number,ry: number): string => {
    const radius = `${(rx*fit).toFixed(3)} ${(ry*fit).toFixed(3)}`;
    return `M${x(cx+rx)} ${y(cy)}A${radius} 0 1 1 ${x(cx-rx)} ${y(cy)}A${radius} 0 1 1 ${x(cx+rx)} ${y(cy)}Z`;
  };
  let path = ellipse(120,280,102,69)+`M${x(98)} ${y(153)}H${x(142)}V${y(233)}H${x(98)}Z`;
  path += ellipse(58,106,9,20)+ellipse(182,106,9,20);
  for (let step = 0; step <= 720; step++) {
    const angle = step/720*Math.PI*2, fy = Math.sin(angle);
    path += `${step ? 'L' : 'M'}${x(120+59*(1-.18*Math.max(0,fy))*Math.cos(angle))} ${y(103+82*fy)}`;
  }
  return `${path}Z`;
}

/** Analytic surface normals and features; no enlarged shading bitmap. */
export function faceShadingAt(X: number, Y: number, pixel = .25): number {
  const y = (Y-103)/82, jaw = 1-.18*Math.max(0,y), x = (X-120)/(59*jaw);
  let shade = 0;
  if (((X-120)/102)**2+((Y-280)/69)**2 < 1) shade = .45+.18*(1-(X-120)/120);
  if (Math.abs(X-120)<22 && Y>153 && Y<233) shade = .4+.25*(1-(X-98)/44);
  for (const ear of [58,182]) if (((X-ear)/9)**2+((Y-106)/20)**2 < 1) shade = .49;
  const q = 1-x*x-y*y;
  if (q <= 0) return Math.max(0,shade);
  const root = Math.sqrt(Math.max(1e-10,q));
  let dx = -18*x/root, dy = -18*y/root;
  const bump = (cx: number,cy: number,sx: number,sy: number,amplitude: number): void => {
    const value = amplitude*Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2));
    dx -= 2*(x-cx)/(sx*sx)*value; dy -= 2*(y-cy)/(sy*sy)*value;
  };
  // Separate the bridge, tip and wings so the nose reads as a defined volume,
  // rather than one broad vertical shadow.
  bump(0,.035,.065,.20,4);
  bump(0,.245,.085,.07,3);
  bump(-.09,.275,.045,.04,1.2); bump(.09,.275,.045,.04,1.2);
  bump(-.43,.1,.25,.28,4); bump(.43,.1,.25,.28,4);
  bump(-.34,-.19,.2,.11,-4); bump(.34,-.19,.2,.11,-4);
  bump(0,-.33,.7,.1,2); bump(0,.7,.35,.18,3);
  dx /= 59*jaw; dy /= 82;
  const dot = (.35*dx+.3*dy+1)/(Math.hypot(dx,dy,1)*Math.hypot(.35,.3,1));
  shade = .12+.88*Math.max(0,dot);
  const groove = (cx: number,cy: number,sx: number,sy: number): number => Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2));
  // Compact crease profiles keep facial features defined at full size instead of
  // representing every feature as a broad, blurry Gaussian shadow.
  const crease = (distance: number, halfWidth: number, strength: number): number => {
    const aa = Math.max(pixel*.6,.025), t = Math.max(0,Math.min(1,(halfWidth+aa-Math.abs(distance))/(2*aa)));
    return 1-strength*t*t*(3-2*t);
  };
  for (const eye of [-.34,.34]) {
    const u = (x-eye)/.19;
    if (Math.abs(u)<1) {
      const taper = Math.sqrt(1-u*u);
      shade *= crease((y+.17-.035*u*u)*82,.46*taper,.58*taper);
      shade *= 1-.15*groove(eye,-.115,.15,.035);
    }
  }
  // Tapered contours link the bridge to the wings; the base and nostrils use
  // the same antialiased crease model as the lids and lips.
  const bridge = (y+.12)/.38;
  if (bridge>0 && bridge<1) {
    const side = .055+.04*bridge*bridge;
    shade *= crease((Math.abs(x)-side)*59*jaw,.26,.22*Math.sin(Math.PI*bridge));
  }
  const nose = x/.14;
  if (Math.abs(nose)<1) {
    const base = .30+.035*(1-nose*nose);
    shade *= crease((y-base)*82,.32,.35*Math.sqrt(1-nose*nose));
  }
  for (const nostril of [-.075,.075]) {
    const u = (x-nostril)/.035;
    if (Math.abs(u)<1) shade *= crease((y-.285+.01*(1-u*u))*82,.36,.46*Math.sqrt(1-u*u));
  }
  const mouth = x/.26;
  // Level corners give the resting mouth a neutral expression.
  if (Math.abs(mouth)<1) shade *= crease((y-.46)*82,.42,.48*(1-mouth*mouth));
  shade *= .99+.01*Math.sin(X*2.3)*Math.sin(Y*2.7);
  return Math.max(0,shade);
}

/** Subpixel shading at the head/ear/neck joins, independent of mask coverage. */
export function facePixelShadingAt(X: number, Y: number, pixel: number): number {
  const y = (Y-103)/82, x = (X-120)/(59*(1-.18*Math.max(0,y)));
  if (Math.abs(1-x*x-y*y)>pixel*.05) return faceShadingAt(X,Y,pixel);
  let sum = 0, count = 0;
  for (const dy of [-.25,.25]) for (const dx of [-.25,.25]) {
    const shade = faceShadingAt(X+dx*pixel,Y+dy*pixel,pixel);
    if (shade>0) { sum+=shade; count++; }
  }
  return count ? sum/count : 0;
}
