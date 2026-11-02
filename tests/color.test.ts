import test from 'node:test';
import assert from 'node:assert/strict';
import { addLights, mixPrimaries, toHex, PRESETS } from '../src/color.ts';

test('all eight presets produce the exact RGB result in the triple intersection', () => {
  for (const { color } of PRESETS) {
    assert.deepEqual(mixPrimaries(color, { r: 1, g: 1, b: 1 }), color);
  }
});

test('spatial intersections add the light contributions without darkening', () => {
  const white = { r: 255, g: 255, b: 255 };
  assert.deepEqual(mixPrimaries(white, { r: 1, g: 1, b: 0 }), { r: 255, g: 255, b: 0 });
  assert.deepEqual(mixPrimaries(white, { r: 0, g: 1, b: 1 }), { r: 0, g: 255, b: 255 });
  assert.deepEqual(mixPrimaries(white, { r: 1, g: 0, b: 1 }), { r: 255, g: 0, b: 255 });
  assert.deepEqual(mixPrimaries({ r: 127, g: 64, b: 230 }, { r: 1, g: 1, b: 1 }), { r: 127, g: 64, b: 230 });
});

test('unlit regions stay black and antialiasing only affects the covered primary', () => {
  assert.deepEqual(mixPrimaries({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 }), { r: 0, g: 0, b: 0 });
  assert.deepEqual(mixPrimaries({ r: 100, g: 200, b: 20 }, { r: 0.5, g: 1, b: 0 }), { r: 50, g: 200, b: 0 });
});

test('addition saturates each channel independently', () => {
  assert.deepEqual(addLights({ r: 180, g: 10, b: 30 }, { r: 120, g: 20, b: 5 }), { r: 255, g: 30, b: 35 });
});

test('HEX conversion is padded, uppercase and bounded', () => {
  assert.equal(toHex({ r: 0, g: 15, b: 255 }), '#000FFF');
  assert.equal(toHex({ r: 127, g: 64, b: 230 }), '#7F40E6');
  assert.equal(toHex({ r: -5, g: 300, b: Number.NaN }), '#00FF00');
});
