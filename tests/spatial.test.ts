import test from 'node:test';
import assert from 'node:assert/strict';
import { BLACK_XYZ, scaleXYZ, type XYZ } from '../src/fixture/colorimetry.ts';
import { fullLevels, zeroLevels } from '../src/fixture/engine.ts';
import { FIXTURE_PROFILES } from '../src/fixture/profiles.ts';
import { gaussianCoverage } from '../src/fixture/gaussian.ts';
import { integrateSpectrum, MATERIAL_SAMPLES, mixSpectrum, reflectedComponents, SKIN_SAMPLES } from '../src/fixture/spectrum.ts';
import { reflectedAt, sampleCoverage, type BeamField } from '../src/fixture/spatial.ts';

const close = (a: number,b: number): void => assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const xyzClose = (a: XYZ,b: XYZ): void => { close(a.X,b.X); close(a.Y,b.Y); close(a.Z,b.Z); };

test('linear mask interpolation preserves coverage and samples zero outside its tile', () => {
  const mask = new Float32Array([0,1,1,0]);
  close(sampleCoverage(mask,2,.5,.5),.5);
  close(sampleCoverage(mask,2,1,0),1);
  close(sampleCoverage(mask,2,-.5,1),.5);
  for (const [x,y] of [[-1,0],[0,-1],[2,0],[0,2],[-20,50]]) close(sampleCoverage(mask,2,x,y),0);
});

test('full spatial overlap equals spectral emitter addition times measured surface reflectance', () => {
  const profile = FIXTURE_PROFILES[3], levels = fullLevels(profile), samples = [...SKIN_SAMPLES,...MATERIAL_SAMPLES];
  const components = reflectedComponents(profile,levels,samples);
  const field: BeamField = { bounds:{left:0,top:0,width:10,height:10},ratio:1,size:3,coverage:new Float32Array(9).fill(1),beams:profile.emitters.map(e=>({id:e.id,left:0,top:0})) };
  for (let i=0;i<samples.length;i++) xyzClose(reflectedAt(field,components,1.5,1.5,i),integrateSpectrum(mixSpectrum(profile,levels),samples[i].reflectance));
});

test('moving a beam changes local reflected color, leaving uncovered areas black', () => {
  const profile = FIXTURE_PROFILES[0], samples = [SKIN_SAMPLES[1]];
  const components = reflectedComponents(profile,{...zeroLevels(),red:255},samples);
  const field: BeamField = {bounds:{left:0,top:0,width:30,height:30},ratio:1,size:3,coverage:new Float32Array(9).fill(1),beams:[{id:'red',left:0,top:0}]};
  assert.ok(reflectedAt(field,components,1.5,1.5,0).Y>0);
  assert.deepEqual(reflectedAt(field,components,10.5,1.5,0),BLACK_XYZ);
  const moved = {...field,beams:[{id:'red' as const,left:9,top:0}]};
  assert.deepEqual(reflectedAt(moved,components,1.5,1.5,0),BLACK_XYZ);
  assert.ok(reflectedAt(moved,components,10.5,1.5,0).Y>0);
});

test('local overlap sums linear XYZ without normalization or per-emitter clipping', () => {
  const components = reflectedComponents(FIXTURE_PROFILES[0],fullLevels(FIXTURE_PROFILES[0]),[MATERIAL_SAMPLES[0]]);
  const field: BeamField = {bounds:{left:0,top:0,width:10,height:10},ratio:1,size:1,coverage:new Float32Array([.5]),beams:[{id:'red',left:0,top:0},{id:'green',left:0,top:0}]};
  const red = components.find(c=>c.id==='red')!.colors[0], green = components.find(c=>c.id==='green')!.colors[0];
  xyzClose(reflectedAt(field,components,.5,.5,0),scaleXYZ({X:red.X+green.X,Y:red.Y+green.Y,Z:red.Z+green.Z},.5));
  const dim = reflectedComponents(FIXTURE_PROFILES[0],{...zeroLevels(),red:128,green:128,blue:128},[MATERIAL_SAMPLES[0]]);
  xyzClose(reflectedAt(field,dim,.5,.5,0),scaleXYZ(reflectedAt(field,components,.5,.5,0),128/255));
});

test('blurred spatial falloff is applied to reflected energy before screen encoding', () => {
  const size=41, mask=new Float32Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(Math.hypot(x-20,y-20)<=10)mask[y*size+x]=1;
  const blurred=gaussianCoverage(mask,size,size,3), components=reflectedComponents(FIXTURE_PROFILES[0],{...zeroLevels(),green:255},[SKIN_SAMPLES[1]]);
  const field: BeamField={bounds:{left:0,top:0,width:size,height:size},ratio:1,size,coverage:blurred,beams:[{id:'green',left:0,top:0}]};
  const interior=reflectedAt(field,components,20.5,20.5,0),edge=reflectedAt(field,components,30.5,20.5,0),tail=reflectedAt(field,components,35.5,20.5,0);
  assert.ok(interior.Y>edge.Y&&edge.Y>tail.Y&&tail.Y>0);
  xyzClose(edge,scaleXYZ(components[1].colors[0],sampleCoverage(blurred,size,30,20)));
  const dense={...field,ratio:2};
  xyzClose(reflectedAt(dense,components,15.25,10.25,0),edge);
  assert.deepEqual(reflectedAt(field,reflectedComponents(FIXTURE_PROFILES[0],zeroLevels(),[SKIN_SAMPLES[1]]),20.5,20.5,0),BLACK_XYZ);
});
