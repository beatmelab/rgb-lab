import test from 'node:test';
import assert from 'node:assert/strict';
import { LightScene } from '../src/scene.ts';

function scene(): LightScene {
  const result = new LightScene();
  result.resize(1000, 800);
  return result;
}

test('each light is selectable at its center and empty space selects none', () => {
  const lights = scene();
  lights.positions.forEach((point, index) => assert.equal(lights.hitTest(point), index));
  assert.equal(lights.hitTest({ x: 0, y: 0 }), null);
});

test('overlapping regions select the nearest light instead of always selecting the last channel', () => {
  const lights = scene();
  const [red, green] = lights.positions;
  const nearRed = { x: red.x + (green.x - red.x) * 0.4, y: red.y };
  const nearGreen = { x: red.x + (green.x - red.x) * 0.6, y: red.y };
  assert.ok(Math.hypot(nearRed.x - green.x, nearRed.y - green.y) < lights.radius);
  assert.equal(lights.hitTest(nearRed), 0);
  assert.equal(lights.hitTest(nearGreen), 1);
});

test('moving one circle preserves the other two and constrains it to visible bounds', () => {
  const lights = scene();
  const before = [...lights.positions];
  lights.moveLight(0, { x: -500, y: 9000 });
  assert.deepEqual(lights.positions[0], { x: lights.radius, y: lights.height - lights.radius });
  assert.deepEqual(lights.positions.slice(1), before.slice(1));
});

test('reset restores the original geometry after independent drags', () => {
  const lights = scene();
  const initial = [...lights.positions];
  lights.moveLight(0, { x: 200, y: 200 });
  lights.moveLight(1, { x: 800, y: 600 });
  lights.resetPositions();
  assert.deepEqual(lights.positions, initial);
});

test('resizing preserves relative positions and resetting uses the new viewport', () => {
  const lights = scene();
  lights.moveLight(2, { x: 700, y: 500 });
  lights.resize(500, 400);
  assert.deepEqual(lights.positions[2], { x: 350, y: 250 });
  lights.resetPositions();
  const resized = new LightScene();
  resized.resize(500, 400);
  assert.deepEqual(lights.positions, resized.positions);
});

test('invalid pointer coordinates do not corrupt the scene', () => {
  const lights = scene();
  const initial = [...lights.positions];
  lights.moveLight(0, { x: NaN, y: Infinity });
  assert.deepEqual(lights.positions, initial);
});
