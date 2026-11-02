import test from 'node:test';
import assert from 'node:assert/strict';
import { faceResolution, facePathData, faceShadingAt, facePixelShadingAt } from '../src/fixture/face-raster.ts';

test('face raster follows displayed dimensions and density while preserving geometry', () => {
  const standard = faceResolution(1096,1000,1), retina = faceResolution(1096,1000,2);
  assert.ok(standard.height>=1000);
  assert.ok(standard.width>480&&standard.height>560);
  assert.ok(retina.height>=2000);
  const large = faceResolution(1576,1200,2);
  assert.ok(large.height>=2400);
  for (const size of [standard,retina,faceResolution(74,76,2),faceResolution(10000,10000,4)]) {
    assert.equal(size.width*7,size.height*6);
    assert.ok(size.width*size.height<=12_000_000);
    assert.ok(size.width>=1440&&size.height>=1680);
  }
  const mobile = faceResolution(390,449,2);
  assert.ok(mobile.height>=449*2);
  assert.ok(faceResolution(1920,2000,1).height>standard.height);
});

test('invalid or hidden face bounds do not create unbounded buffers', () => {
  for (const [w,h,d] of [[0,0,1],[-1,100,2],[NaN,Infinity,NaN],[1,1,-2]]) {
    const size = faceResolution(w,h,d);
    assert.ok(Number.isInteger(size.width)&&Number.isInteger(size.height));
    assert.ok(size.width>0&&size.height>0&&size.width*size.height<=12_000_000);
  }
});

test('one vector silhouette maps to the full-size master and centered aspect ratio', () => {
  assert.equal(facePathData(0,0),'');
  assert.equal(facePathData(Infinity,200),'');
  assert.ok(facePathData(240,280).includes('M179.000 103.000'));
  assert.ok(facePathData(480,560).includes('M358.000 206.000'));
  assert.ok(facePathData(480,280).includes('M299.000 103.000'));
  assert.notEqual(facePathData(8000,5000),facePathData(800,500));
});

test('subpixel join shading remains bounded at large and reduced pixel footprints', () => {
  for (const pixel of [.1,.5,1,2]) for (let y=20;y<230;y+=2) for (let x=45;x<195;x+=2) {
    const shade=facePixelShadingAt(x,y,pixel);
    assert.ok(Number.isFinite(shade)&&shade>=0&&shade<=1);
  }
});

test('analytic shading is finite and independent of any fixed-resolution template', () => {
  assert.equal(faceShadingAt(0,0),0);
  assert.equal(faceShadingAt(187,106),.49);
  assert.ok(faceShadingAt(120,103)>0);
  for(let y=0;y<280;y+=3)for(let x=0;x<240;x+=3){
    const shade=faceShadingAt(x,y);
    assert.ok(Number.isFinite(shade)&&shade>=0&&shade<=1);
  }
});
