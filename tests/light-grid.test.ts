import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLightGrid } from '../src/fixture/light-grid.ts';
import { gaussianCoverage } from '../src/fixture/gaussian.ts';
import { sampleCoverage, type BeamField } from '../src/fixture/spatial.ts';

test('lighting grids retain signed linear light and exact smooth ramps', () => {
  const size=61, coverage=new Float32Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)coverage[y*size+x]=x/(size-1);
  const field: BeamField={bounds:{left:0,top:0,width:size,height:size},ratio:1,blur:20,size,coverage,beams:[]};
  const grid=buildLightGrid(field,[{left:.5,top:.5,color:[.7,-.2,.5]}],size,size,0,0,1,1)!;
  assert.ok(grid.width<size);
  for(let x=0;x<grid.width;x++){
    const expected=x/(grid.width-1),i=x*3;
    assert.ok(Math.abs(grid.rgb[i]-.7*expected)<1e-7);
    assert.ok(Math.abs(grid.rgb[i+1]+.2*expected)<1e-7);
    assert.ok(Math.abs(grid.rgb[i+2]-.5*expected)<1e-7);
  }
});

test('sharp and already small illumination buffers use direct per-pixel sampling', () => {
  const field: BeamField={bounds:{left:0,top:0,width:10,height:10},ratio:1,blur:0,size:1,coverage:new Float32Array([1]),beams:[]};
  assert.equal(buildLightGrid(field,[],1000,1000,0,0,1,1),null);
  assert.equal(buildLightGrid({...field,blur:20},[],2,2,0,0,1,1),null);
});

test('smooth beam resampling remains close to the original mask in linear energy', () => {
  const size=81,input=new Float32Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(Math.hypot(x-40,y-40)<20)input[y*size+x]=1;
  const coverage=gaussianCoverage(input,size,size,8);
  const field: BeamField={bounds:{left:0,top:0,width:size,height:size},ratio:1,blur:8,size,coverage,beams:[]};
  const width=161,grid=buildLightGrid(field,[{left:.5,top:.5,color:[1,.5,.25]}],width,width,0,0,.5,.5)!;
  let maxError=0;
  for(let y=0;y<width;y+=7)for(let x=0;x<width;x+=7){
    const gx=x*(grid.width-1)/(width-1),gy=y*(grid.height-1)/(width-1),x0=Math.floor(gx),y0=Math.floor(gy),tx=gx-x0,ty=gy-y0;
    const x1=Math.min(grid.width-1,x0+1),y1=Math.min(grid.height-1,y0+1);
    const sampled=grid.rgb[(y0*grid.width+x0)*3]*(1-tx)*(1-ty)+grid.rgb[(y0*grid.width+x1)*3]*tx*(1-ty)+grid.rgb[(y1*grid.width+x0)*3]*(1-tx)*ty+grid.rgb[(y1*grid.width+x1)*3]*tx*ty;
    maxError=Math.max(maxError,Math.abs(sampled-sampleCoverage(coverage,size,(x+.5)*.5-.5,(y+.5)*.5-.5)));
  }
  assert.ok(maxError<.01,`Linear energy error ${maxError}`);
});
