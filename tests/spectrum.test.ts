import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SURFACE_DATA } from '../src/data/surface-data.ts';
import { BLACK_XYZ, deltaUv, hexToXYZ, scaleXYZ, xyYToXYZ, xyzToXy, type XYZ } from '../src/fixture/colorimetry.ts';
import { fixtureComponents, fullLevels, matchTarget, mixComponents, solveNonnegativeLeastSquares, zeroLevels } from '../src/fixture/engine.ts';
import { FIXTURE_PROFILES, WHITE_TEMPERATURES, withWhiteTemperature } from '../src/fixture/profiles.ts';
import { compareSurfaces, emitterSpectrum, equalIlluminance, integrateSpectrum, MATERIAL_SAMPLES, mixSpectrum, reflectedComponents, REFERENCE_SPECTRUM, SKIN_SAMPLES, SPECTRUM_SIZE } from '../src/fixture/spectrum.ts';

const close = (a: number, b: number, tolerance = 1e-7): void => assert.ok(Math.abs(a-b) < tolerance, `${a} != ${b}`);
const xyzClose = (a: XYZ, b: XYZ): void => { close(a.X,b.X); close(a.Y,b.Y); close(a.Z,b.Z); };

test('surface data preserves checksum-verified CIE samples and the original observer grid', () => {
  for (const [file, hash] of [['CIE_srf_cfi.csv','11ef0bcbfaea43f1143ac40fbf52d7ff'],['CIE_std_illum_D65.csv','03d4eb9b837c60671627c946fb534deb']]) {
    const source = readFileSync(new URL(`../src/data/${file}`,import.meta.url));
    assert.equal(createHash('md5').update(source).digest('hex'),hash);
  }
  const rows = readFileSync(new URL('../src/data/CIE_srf_cfi.csv',import.meta.url),'utf8').trim().split(/\r?\n/).map(row => row.split(',').map(Number));
  for (const sample of MATERIAL_SAMPLES.filter(sample => sample.id.startsWith('ces-'))) {
    assert.deepEqual(sample.reflectance,rows.map(row => row[Number(sample.id.slice(4))]));
  }
  const observer = readFileSync(new URL('../src/data/CIE_xyz_1931_2deg.csv',import.meta.url),'utf8').trim().split(/\r?\n/).map(row => row.split(',').map(Number));
  assert.deepEqual(SURFACE_DATA.cmf,observer.filter(([w])=>w>=380&&w<=780&&w%5===0).map(row=>row.slice(1)));
  assert.equal(SPECTRUM_SIZE,81);
  for (const sample of [...MATERIAL_SAMPLES,...SKIN_SAMPLES]) {
    assert.equal(sample.reflectance.length,SPECTRUM_SIZE);
    assert.ok(sample.reflectance.every(r=>Number.isFinite(r)&&r>=0&&r<=1));
  }
});

test('synthetic nonnegative LED spectra integrate to every configured emitter xyY', () => {
  for (const base of FIXTURE_PROFILES) for (const temperature of WHITE_TEMPERATURES) {
    const profile = withWhiteTemperature(base,temperature.kelvin);
    for (const emitter of profile.emitters) {
      const spectrum = emitterSpectrum(emitter,profile);
      assert.ok(spectrum.every(p=>Number.isFinite(p)&&p>=0));
      xyzClose(integrateSpectrum(spectrum),xyYToXYZ(emitter.xy,emitter.relativeY));
    }
  }
});

test('spectral and existing XYZ mixtures agree for quantized manual recipes', () => {
  for (const base of FIXTURE_PROFILES) for (const temperature of WHITE_TEMPERATURES) {
    const profile = withWhiteTemperature(base,temperature.kelvin);
    const levels = {...zeroLevels(),red:255,green:136,blue:19,white:82,amber:73,mint:201};
    xyzClose(integrateSpectrum(mixSpectrum(profile,levels)),mixComponents(fixtureComponents(profile,levels)));
    assert.deepEqual(mixSpectrum(profile,zeroLevels()),Array(81).fill(0));
  }
});

test('spectral RGB contributions remain identical across engines with extra channels off', () => {
  const levels = {...zeroLevels(),red:131,green:231,blue:79};
  const expected = mixSpectrum(FIXTURE_PROFILES[0],levels);
  for (const profile of FIXTURE_PROFILES) assert.deepEqual(mixSpectrum(profile,levels),expected);
});

test('equal illuminance removes only overall output and preserves black without NaN', () => {
  const spectrum = mixSpectrum(FIXTURE_PROFILES[3],fullLevels(FIXTURE_PROFILES[3]));
  const normalized = equalIlluminance(spectrum), dimmed = equalIlluminance(spectrum.map(p=>p*.013));
  close(integrateSpectrum(normalized).Y,1);
  normalized.forEach((p,i)=>close(p,dimmed[i]));
  const off = compareSurfaces(FIXTURE_PROFILES[0],zeroLevels(),SKIN_SAMPLES);
  assert.equal(off.off,true); assert.equal(off.whiteDifference,null);
  off.actual.forEach(xyz=>assert.deepEqual(xyz,BLACK_XYZ));
  assert.ok(off.reference.every(xyz=>xyz.Y>0));
});

test('reference D65 and flat reflectors preserve physical reflectance and object brightness', () => {
  const white = integrateSpectrum(REFERENCE_SPECTRUM);
  close(white.Y,1);
  // Finite 380–780 nm / 5 nm sampling differs slightly from full-range D65.
  close(xyzToXy(white)!.x,.3127,.00005); close(xyzToXy(white)!.y,.329,.00005);
  for (const reflectance of [.18,.5]) xyzClose(integrateSpectrum(REFERENCE_SPECTRUM,Array(81).fill(reflectance)),scaleXYZ(white,reflectance));
  assert.deepEqual(integrateSpectrum(REFERENCE_SPECTRUM,Array(81).fill(0)),BLACK_XYZ);
});

test('controlled white comparison equalizes incident Y across engines without equalizing materials', () => {
  const target=hexToXYZ('#FFFFFF')!;
  const samples=[...SKIN_SAMPLES,...MATERIAL_SAMPLES,{id:'white',name:'White',source:'Ideal reflector',reflectance:Array(81).fill(1)}];
  for (const profile of FIXTURE_PROFILES) {
    const levels=matchTarget(profile,target), result=compareSurfaces(profile,levels,samples,true);
    const white=result.actual.at(-1)!;
    close(white.Y,1);
    assert.ok(deltaUv(xyzToXy(white),xyzToXy(target))!<.001);
    const components=reflectedComponents(profile,levels,samples,result.gain);
    samples.forEach((_,i)=>{
      const sum=components.reduce((s,c)=>({X:s.X+c.colors[i].X,Y:s.Y+c.colors[i].Y,Z:s.Z+c.colors[i].Z}),{...BLACK_XYZ});
      xyzClose(sum,result.actual[i]);
    });
    const gray=result.actual[SKIN_SAMPLES.length+MATERIAL_SAMPLES.length-1];
    close(gray.Y,.18);
    assert.ok(result.actual[0].Y<result.actual[2].Y);
  }
});

test('relative-output comparison preserves dimming; normalized comparison uses only one global gain', () => {
  const profile=FIXTURE_PROFILES[0], levels=matchTarget(profile,hexToXYZ('#FFFFFF')!);
  const dimmed=Object.fromEntries(Object.entries(levels).map(([id,value])=>[id,Math.round(value/2)])) as typeof levels;
  const raw=compareSurfaces(profile,levels,SKIN_SAMPLES,false), dim=compareSurfaces(profile,dimmed,SKIN_SAMPLES,false);
  assert.equal(raw.gain,1);assert.equal(dim.gain,1);
  assert.ok(dim.actual.every((xyz,i)=>xyz.Y<raw.actual[i].Y*.51));
  const normalized=compareSurfaces(profile,levels,SKIN_SAMPLES,true);
  raw.actual.forEach((xyz,i)=>xyzClose(normalized.actual[i],scaleXYZ(xyz,normalized.gain)));
  const off=compareSurfaces(profile,zeroLevels(),SKIN_SAMPLES,true);
  assert.equal(off.gain,0);assert.ok(off.actual.every(xyz=>xyz.Y===0&&Number.isFinite(xyz.X)));
});

test('matched white spectra can render measured materials differently without an artificial bonus', () => {
  const profile = FIXTURE_PROFILES[0], whiteProfile = FIXTURE_PROFILES[1];
  const white = emitterSpectrum(whiteProfile.emitters.find(e=>e.id==='white')!,whiteProfile);
  const columns = profile.emitters.map(e=>integrateSpectrum(emitterSpectrum(e,profile)));
  const weights = solveNonnegativeLeastSquares(columns,integrateSpectrum(white));
  const rgb = Array(81).fill(0).map((_,i)=>profile.emitters.reduce((sum,e,j)=>sum+emitterSpectrum(e,profile)[i]*weights[j],0));
  assert.ok(deltaUv(xyzToXy(integrateSpectrum(white)),xyzToXy(integrateSpectrum(rgb)))!<1e-6);
  const a = equalIlluminance(rgb), b = equalIlluminance(white);
  assert.ok([...SKIN_SAMPLES,...MATERIAL_SAMPLES].some(sample=>{
    const first = integrateSpectrum(a,sample.reflectance), second = integrateSpectrum(b,sample.reflectance);
    return Math.hypot(first.X-second.X,first.Y-second.Y,first.Z-second.Z)>.005;
  }));
});

test('skin selection changes measured reflectance, not an RGB tint or exposure', () => {
  const comparison = compareSurfaces(FIXTURE_PROFILES[1],fullLevels(FIXTURE_PROFILES[1]),SKIN_SAMPLES);
  assert.ok(comparison.reference[0].Y<comparison.reference[1].Y);
  assert.ok(comparison.reference[1].Y<comparison.reference[2].Y);
  assert.notDeepEqual(comparison.reference,comparison.actual);
  assert.throws(()=>integrateSpectrum([1]),RangeError);
  assert.throws(()=>integrateSpectrum(Array(81).fill(-1)),RangeError);
  assert.throws(()=>integrateSpectrum(Array(81).fill(1),Array(81).fill(2)),RangeError);
});

test('skin examples span dark to light measured reflectance with a perceptually intermediate sample', () => {
  const values=SKIN_SAMPLES.map(sample=>integrateSpectrum(REFERENCE_SPECTRUM,sample.reflectance).Y);
  assert.ok(values[0]<.15&&values[2]>.42);
  assert.ok(values[2]/values[0]>3);
  const lightness=values.map(y=>116*Math.cbrt(y)-16);
  assert.ok(lightness[1]-lightness[0]>10&&lightness[2]-lightness[1]>10);
  assert.ok(Math.abs(lightness[1]-(lightness[0]+lightness[2])/2)<3);
});

test('the light skin retains measured light reflectance with warmer D65 chroma', () => {
  const white=integrateSpectrum(REFERENCE_SPECTRUM);
  const light=integrateSpectrum(REFERENCE_SPECTRUM,SKIN_SAMPLES[2].reflectance);
  const a=500*(Math.cbrt(light.X/white.X)-Math.cbrt(light.Y/white.Y));
  const b=200*(Math.cbrt(light.Y/white.Y)-Math.cbrt(light.Z/white.Z));
  assert.ok(a>9.5&&b>14);
});
