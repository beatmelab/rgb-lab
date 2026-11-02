import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SPECTRAL_LOCUS } from '../src/data/spectral-locus.ts';
import { toHex } from '../src/color.ts';
import { BLACK_XYZ, SRGB_PRIMARIES, deltaUv, hexToXYZ, previewXYZ, rgbToXYZ, scaleXYZ, xyToUv, uvToXy, xyYToXYZ, xyzToLinearRGB, xyzToXy } from '../src/fixture/colorimetry.ts';
import { convexHull, isVisibleChromaticity, pointInPolygon, projectToGamut } from '../src/fixture/gamut.ts';
import { DEFAULT_WHITE_TEMPERATURE, EMITTERS, FIXTURE_PROFILES, WHITE_TEMPERATURES, withWhiteTemperature } from '../src/fixture/profiles.ts';
import { createFixtureState, fixtureComponents, fixtureGamut, fullLevels, matchTarget, mixComponents, mixFixture, previewAtCoverage, selectTargetXy, solveNonnegativeLeastSquares, zeroLevels } from '../src/fixture/engine.ts';
import { ComponentScene } from '../src/fixture/beam.ts';
import { LightScene } from '../src/scene.ts';
import { gaussianCoverage } from '../src/fixture/gaussian.ts';
import { displayChannel, DISPLAY_ENCODE, DISPLAY_RESOLUTION, SCENE_EXPOSURE } from '../src/fixture/display.ts';

const close = (actual: number, expected: number, tolerance = 1e-7): void => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);

test('fixed exposure and smooth highlight compression handle every emitter subset', () => {
  for (const base of FIXTURE_PROFILES) for (const temperature of WHITE_TEMPERATURES) {
    const profile = withWhiteTemperature(base, temperature.kelvin);
    const exposure = SCENE_EXPOSURE;
    assert.ok(exposure > 0 && exposure <= 1);
    const components = fixtureComponents(profile, fullLevels(profile));
    for (let subset = 0; subset < 2 ** components.length; subset++) {
      const xyz = mixComponents(components.filter((_, index) => subset & (1 << index)));
      for (const channel of xyzToLinearRGB(xyz)) {
        const mapped=displayChannel(channel*exposure);
        assert.ok(Number.isFinite(mapped)&&mapped>=0&&mapped<=1);
        assert.ok(channel*exposure<DISPLAY_ENCODE.length/DISPLAY_RESOLUTION);
      }
    }
    // Dimming a mix preserves its exposed linear ratios; exposure uses no levels.
    const sum = mixComponents(components);
    const bright = xyzToLinearRGB(sum), dim = xyzToLinearRGB(scaleXYZ(sum, 0.4));
    for (let i = 0; i < 3; i++) close(dim[i] * exposure, bright[i] * exposure * 0.4);
  }
});

test('adding channels preserves RGB display brightness and White adds light at the shared exposure', () => {
  const levels = { ...zeroLevels(), red: 255, green: 255, blue: 255 };
  const exposed = (profile: (typeof FIXTURE_PROFILES)[number], white: number) =>
    xyzToLinearRGB(mixComponents(fixtureComponents(profile, { ...levels, white })))
      .map(channel => displayChannel(channel * SCENE_EXPOSURE));
  const rgb = exposed(FIXTURE_PROFILES[0], 0);
  for (const profile of FIXTURE_PROFILES.slice(1)) {
    assert.deepEqual(exposed(profile, 0), rgb);
    const rgbw = exposed(profile, 255);
    for (let channel = 0; channel < 3; channel++) assert.ok(rgbw[channel] > rgb[channel]);
    // The physical addition remains linear; only the display has a shoulder.
    const rawRGB=xyzToLinearRGB(mixFixture(profile,{...levels,white:0},BLACK_XYZ).xyz);
    const rawRGBW=xyzToLinearRGB(mixFixture(profile,{...levels,white:255},BLACK_XYZ).xyz);
    const contributions = rawRGBW.map((value, channel) => value - rawRGB[channel]);
    close(contributions[0], contributions[1]);
    close(contributions[1], contributions[2]);
    assert.ok((Math.max(...rgbw) - Math.min(...rgbw)) / Math.max(...rgbw)
      < (Math.max(...rgb) - Math.min(...rgb)) / Math.max(...rgb));
  }
});

test('display gamut transition is monotonic, black-preserving and smooth at its boundaries', () => {
  assert.equal(displayChannel(-1), 0);
  assert.equal(displayChannel(0), 0);
  assert.equal(displayChannel(0.5), 0.5);
  assert.ok(displayChannel(1)>.9&&displayChannel(1)<1);
  assert.ok(displayChannel(2)>displayChannel(1));
  let previous = 0;
  for (let i = 0; i <= 10000; i++) {
    const value = i / 1250;
    const mapped = displayChannel(value);
    assert.ok(mapped >= previous && mapped <= value + 1e-12);
    previous = mapped;
  }
  const epsilon = 1e-7;
  close(displayChannel(epsilon) / epsilon, 0, 0.00002);
  close((displayChannel(0.02) - displayChannel(0.02 - epsilon)) / epsilon, 1, 0.00002);
  close((displayChannel(0.02 + epsilon) - displayChannel(0.02)) / epsilon, 1);
  close((displayChannel(.85) - displayChannel(.85 - epsilon)) / epsilon,1);
  close((displayChannel(.85+epsilon) - displayChannel(.85)) / epsilon,1,.000002);
});

test('Fixture starts with a balanced, bright D65 RGB recipe', () => {
  const state = createFixtureState();
  assert.equal(state.matched, true);
  assert.deepEqual(state.levels,matchTarget(state.profile,state.target));
  assert.deepEqual(state.target, hexToXYZ('#FFFFFF'));
  const result=mixFixture(state.profile,state.levels,state.target);
  assert.ok(result.deltaUv!<.001);
  const channels=xyzToLinearRGB(result.xyz).map(value=>DISPLAY_ENCODE[Math.max(0,Math.round(value*SCENE_EXPOSURE*DISPLAY_RESOLUTION))]);
  assert.ok(Math.min(...channels)>220);
  assert.ok(Math.max(...channels)-Math.min(...channels)<=2);
});

test('the manual full-level recipe sets active emitters to 255 and leaves absent emitters off', () => {
  for (const profile of FIXTURE_PROFILES) {
    const levels = fullLevels(profile);
    for (const id of Object.keys(levels) as (keyof typeof levels)[]) {
      assert.equal(levels[id], profile.emitters.some(emitter => emitter.id === id) ? 255 : 0);
    }
  }
});

test('the spectral boundary derives from the checksum-verified official CIE data', () => {
  const csv = readFileSync(new URL('../src/data/CIE_xyz_1931_2deg.csv', import.meta.url));
  assert.equal(createHash('md5').update(csv).digest('hex'), '17cca777db64b17170f06f67ce9d3ab7');
  const expected = csv.toString().trim().split(/\r?\n/).map(row => row.split(',').map(Number)).filter(([wavelength]) => wavelength >= 380 && wavelength <= 780).map(([, X, Y, Z]) => ({ x: Number((X / (X + Y + Z)).toFixed(10)), y: Number((Y / (X + Y + Z)).toFixed(10)) }));
  assert.deepEqual(SPECTRAL_LOCUS, expected);
});

test('sRGB / XYZ round trips preserve 8-bit colors and D65 white', () => {
  for (const hex of ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#7F40E6', '#808080', '#01010F']) {
    assert.equal(toHex(previewXYZ(hexToXYZ(hex)!).rgb), hex);
    assert.equal(previewXYZ(hexToXYZ(hex)!).outsideSRGB, false);
  }
  close(xyzToXy(hexToXYZ('#FFFFFF')!)!.x, 0.3127);
  close(xyzToXy(hexToXYZ('#FFFFFF')!)!.y, 0.329);
  assert.equal(hexToXYZ('#fff'), null);
  assert.equal(hexToXYZ('#xyzxyz'), null);
});

test('xyY, XYZ and 1976 u′v′ conversions are reversible; black has no chromaticity', () => {
  for (const emitter of Object.values(EMITTERS)) {
    const xyz = xyYToXYZ(emitter.xy, emitter.relativeY);
    close(xyzToXy(xyz)!.x, emitter.xy.x);
    close(xyzToXy(xyz)!.y, emitter.xy.y);
    close(uvToXy(xyToUv(emitter.xy)).x, emitter.xy.x);
    close(uvToXy(xyToUv(emitter.xy)).y, emitter.xy.y);
  }
  assert.equal(xyzToXy(BLACK_XYZ), null);
  assert.equal(deltaUv(null, EMITTERS.red.xy), null);
  assert.throws(() => xyYToXYZ({ x: 0.5, y: 0 }, 1), RangeError);
});

test('profile mixing is an unclipped linear XYZ sum; unused channels have no effect', () => {
  const profile = FIXTURE_PROFILES[3];
  const levels = { ...zeroLevels(), red: 255, green: 128, white: 255 };
  const result = mixFixture(profile, levels, BLACK_XYZ);
  const red = xyYToXYZ(EMITTERS.red.xy, EMITTERS.red.relativeY);
  const green = xyYToXYZ(EMITTERS.green.xy, EMITTERS.green.relativeY * 128 / 255);
  const white = xyYToXYZ(EMITTERS.white.xy, EMITTERS.white.relativeY);
  close(result.xyz.X, red.X + green.X + white.X);
  close(result.xyz.Y, red.Y + green.Y + white.Y);
  assert.ok(result.xyz.Y > 1);
  assert.equal(result.actualOutsideSRGB, true);
  assert.deepEqual(mixFixture(FIXTURE_PROFILES[0], { ...zeroLevels(), white: 255 }, BLACK_XYZ).xyz, BLACK_XYZ);
});

test('white and mint inside the RGB hull do not invent gamut; amber expands the agreed nominal profile', () => {
  assert.deepEqual(fixtureGamut(FIXTURE_PROFILES[0]), fixtureGamut(FIXTURE_PROFILES[1]));
  assert.deepEqual(fixtureGamut(FIXTURE_PROFILES[2]), fixtureGamut(FIXTURE_PROFILES[3]));
  assert.equal(pointInPolygon(EMITTERS.amber.xy, fixtureGamut(FIXTURE_PROFILES[0])), false);
  assert.equal(pointInPolygon(EMITTERS.amber.xy, fixtureGamut(FIXTURE_PROFILES[2])), true);
  for (const point of fixtureGamut(FIXTURE_PROFILES[0])) assert.equal(pointInPolygon(point, fixtureGamut(FIXTURE_PROFILES[0])), true);
});

test('white defaults to the nominal 6500 K D65 reference and can reproduce screen white without other emitters', () => {
  assert.equal(DEFAULT_WHITE_TEMPERATURE, 6500);
  assert.deepEqual(EMITTERS.white.xy, { x: 0.3127, y: 0.329 });
  const target = hexToXYZ('#FFFFFF')!;
  for (const profile of FIXTURE_PROFILES.slice(1)) {
    assert.equal(profile.whiteTemperature, 6500);
    const result = mixFixture(profile, { ...zeroLevels(), white: 255 }, target);
    assert.equal(toHex(result.preview), '#FFFFFF');
    close(result.deltaUv!, 0);
  }
});

test('white temperature changes only the profile white emitter and leaves shared definitions immutable', () => {
  const base = FIXTURE_PROFILES[3];
  const warm = withWhiteTemperature(base, 3200);
  assert.equal(warm.whiteTemperature, 3200);
  assert.equal(warm.emitters.find(emitter => emitter.id === 'white')!.name, 'White · 3200 K');
  assert.equal(base.whiteTemperature, 6500);
  assert.deepEqual(base.emitters.find(emitter => emitter.id === 'white')!.xy, { x: 0.3127, y: 0.329 });
  for (const emitter of base.emitters.filter(emitter => emitter.id !== 'white')) {
    assert.equal(warm.emitters.find(candidate => candidate.id === emitter.id), emitter);
  }
  const target = hexToXYZ('#FFFFFF')!;
  const warmOutput = mixFixture(warm, { ...zeroLevels(), white: 255 }, target);
  assert.ok(warmOutput.xy!.x > 0.4);
  assert.notEqual(toHex(warmOutput.preview), '#FFFFFF');
  assert.equal(withWhiteTemperature(FIXTURE_PROFILES[0], 3200), FIXTURE_PROFILES[0]);
  assert.throws(() => withWhiteTemperature(base, 1234), RangeError);
});

test('all supported white references remain physically valid and match the target with available channels', () => {
  const target = hexToXYZ('#FFFFFF')!;
  for (const reference of WHITE_TEMPERATURES) {
    assert.equal(isVisibleChromaticity(reference.xy), true);
    for (const base of FIXTURE_PROFILES.slice(1)) {
      const configured = withWhiteTemperature(base, reference.kelvin);
      const result = mixFixture(configured, matchTarget(configured, target), target);
      assert.ok(result.deltaUv! < 0.003, `${base.id} at ${reference.kelvin}: ${result.deltaUv}`);
      assert.deepEqual(fixtureGamut(configured), fixtureGamut(base));
    }
  }
});

test('outside targets project to a gamut boundary in u′v′; inside targets remain unchanged', () => {
  const hull = fixtureGamut(FIXTURE_PROFILES[0]);
  const target = EMITTERS.amber.xy;
  const projected = projectToGamut(target, hull);
  assert.equal(pointInPolygon(projected, hull), true);
  const error = deltaUv(projected, target)!;
  for (let i = 0; i < hull.length; i++) {
    const a = xyToUv(hull[i]), b = xyToUv(hull[(i + 1) % hull.length]);
    for (let step = 0; step <= 100; step++) {
      const point = uvToXy({ u: a.u + (b.u - a.u) * step / 100, v: a.v + (b.v - a.v) * step / 100 });
      assert.ok(error <= deltaUv(point, target)! + 1e-8);
    }
  }
  const white = xyzToXy(hexToXYZ('#FFFFFF')!)!;
  assert.deepEqual(projectToGamut(white, hull), white);
});

test('minimum-norm NNLS shares identical emitters and rejects negative solutions', () => {
  const column = { X: 0.5, Y: 1, Z: 0.5 };
  const weights = solveNonnegativeLeastSquares([column, column], column);
  close(weights[0], 0.5, 1e-6);
  close(weights[1], 0.5, 1e-6);
  assert.deepEqual(solveNonnegativeLeastSquares([column], BLACK_XYZ), [0]);
});

test('matching is deterministic, bounded, quantized and evaluated after quantization', () => {
  for (const profile of FIXTURE_PROFILES) {
    for (const target of [hexToXYZ('#FFFFFF')!, hexToXYZ('#194A85')!, xyYToXYZ(EMITTERS.amber.xy, 1), BLACK_XYZ]) {
      const levels = matchTarget(profile, target);
      assert.deepEqual(matchTarget(profile, target), levels);
      for (const level of Object.values(levels)) assert.ok(Number.isInteger(level) && level >= 0 && level <= 255);
      const result = mixFixture(profile, levels, target);
      assert.equal(result.deltaUv, deltaUv(xyzToXy(target), xyzToXy(result.xyz)));
      if (target.Y === 0) assert.deepEqual(result.xyz, BLACK_XYZ);
      else if (result.targetInGamut) assert.ok(result.deltaUv! < 0.003, `${profile.id}: ${result.deltaUv}`);
    }
  }
});

test('physical visibility and fixture gamut are distinct from the display gamut', () => {
  for (const emitter of Object.values(EMITTERS)) assert.equal(isVisibleChromaticity(emitter.xy), true, emitter.id);
  assert.equal(isVisibleChromaticity({ x: 0.8, y: 0.8 }), false);
  assert.equal(isVisibleChromaticity({ x: 0, y: 0 }), false);
  assert.equal(isVisibleChromaticity({ x: NaN, y: 0.3 }), false);
  assert.equal(previewXYZ(xyYToXYZ(EMITTERS.amber.xy, 0.2)).outsideSRGB, true);
  assert.equal(pointInPolygon(EMITTERS.amber.xy, convexHull(SRGB_PRIMARIES)), false);
});

test('xy target selection preserves luminance and restores Y=1 after black', () => {
  const state = createFixtureState();
  state.target = rgbToXYZ({ r: 128, g: 128, b: 128 });
  const Y = state.target.Y;
  selectTargetXy(state, EMITTERS.amber.xy);
  assert.equal(state.target.Y, Y);
  state.target = BLACK_XYZ;
  selectTargetXy(state, EMITTERS.mint.xy);
  assert.equal(state.target.Y, 1);
});

test('fixture coverage is applied to linear XYZ before sRGB encoding', () => {
  const white = hexToXYZ('#FFFFFF')!;
  assert.equal(previewAtCoverage(white, 0).r, 0);
  assert.equal(previewAtCoverage(white, 0.5).r, 188);
  assert.deepEqual(previewAtCoverage(white, 0.5), previewXYZ(scaleXYZ(white, 0.5)).rgb);
});

test('fixture RGB components start in the same arrangement as Basic and move independently', () => {
  const scene = new ComponentScene();
  scene.setEmitters(['red', 'green', 'blue']);
  scene.resize(1000, 800);
  const basic = new LightScene(); basic.resize(1000, 800);
  const initial = ['red', 'green', 'blue'].map(id => scene.positions.get(id as 'red' | 'green' | 'blue'));
  assert.deepEqual(initial, basic.positions);
  assert.equal(scene.hitTest(initial[0]!), 'red');
  assert.equal(scene.hitTest({ x: 0, y: 0 }), null);
  scene.moveTo('red', { x: 600, y: 300 });
  assert.deepEqual(scene.positions.get('green'), initial[1]);
  assert.deepEqual(scene.positions.get('blue'), initial[2]);
  scene.resize(500, 400);
  assert.deepEqual(scene.positions.get('red'), { x: 300, y: 150 });
  scene.moveTo('red', { x: -100, y: 9000 });
  assert.deepEqual(scene.positions.get('red'), { x: scene.radius, y: scene.height - scene.radius });
  scene.reset();
  const defaults = new ComponentScene(); defaults.resize(500, 400);
  assert.deepEqual(scene.positions, defaults.positions);
});

test('component positions survive profile changes and unlit emitters cannot steal a pointer selection', () => {
  const scene = new ComponentScene(); scene.resize(1000, 800);
  scene.setEmitters(['red', 'green', 'blue', 'white', 'amber', 'mint']);
  scene.moveTo('mint', { x: 600, y: 300 });
  scene.moveTo('white', scene.positions.get('red')!);
  assert.equal(scene.hitTest(scene.positions.get('red')!, ['white']), 'white');
  scene.setEmitters(['red', 'green', 'blue']);
  assert.notEqual(scene.hitTest(scene.positions.get('mint')!), 'mint');
  scene.setEmitters(['red', 'green', 'blue', 'white', 'amber', 'mint']);
  assert.deepEqual(scene.positions.get('mint'), { x: 600, y: 300 });
});

test('overlap aligns current and future emitter channels and reset restores separated positions', () => {
  const scene=new ComponentScene();scene.resize(1000,800);scene.setEmitters(['red','green','blue']);
  scene.overlap({x:500,y:350});
  for (const point of scene.positions.values()) assert.deepEqual(point,{x:500,y:350});
  scene.setEmitters(['red','green','blue','white','amber','mint']);
  assert.deepEqual(scene.positions.get('white'),scene.positions.get('red'));
  scene.moveTo('green',{x:700,y:300});assert.notDeepEqual(scene.positions.get('green'),scene.positions.get('red'));
  scene.reset();assert.notDeepEqual(scene.positions.get('white'),scene.positions.get('red'));
});

test('spatial component coverage weights XYZ before display clipping or encoding', () => {
  const components = fixtureComponents(FIXTURE_PROFILES[3], { ...zeroLevels(), red: 255, green: 255, white: 255, mint: 128 });
  const mixed = mixComponents(components, { red: 1, green: 0.5 });
  const red = components.find(component => component.id === 'red')!.xyz;
  const green = components.find(component => component.id === 'green')!.xyz;
  close(mixed.X, red.X + 0.5 * green.X);
  close(mixed.Y, red.Y + 0.5 * green.Y);
  close(mixed.Z, red.Z + 0.5 * green.Z);
  const linear = xyzToLinearRGB(mixed);
  const r = xyzToLinearRGB(red), g = xyzToLinearRGB(green);
  assert.ok(r[1] < 0 && g[0] < 0);
  linear.forEach((value, index) => close(value, r[index] + 0.5 * g[index]));
  assert.deepEqual(mixComponents(components, {}), BLACK_XYZ);
  assert.deepEqual(mixComponents(components), mixFixture(FIXTURE_PROFILES[3], { ...zeroLevels(), red: 255, green: 255, white: 255, mint: 128 }, BLACK_XYZ).xyz);
});

test('floating-point Gaussian coverage is symmetric, nonnegative and conserves an interior impulse', () => {
  const size = 41;
  const input = new Float32Array(size * size);
  input[20 * size + 20] = 1;
  const blurred = gaussianCoverage(input, size, size, 3);
  assert.equal(input[20 * size + 20], 1);
  assert.ok(blurred.some(value => value > 0 && value < 1 / 255));
  close(blurred.reduce((sum, value) => sum + value, 0), 1, 1e-6);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    assert.ok(blurred[y * size + x] >= -1e-8);
    close(blurred[y * size + x], blurred[y * size + size - 1 - x]);
    close(blurred[y * size + x], blurred[(size - 1 - y) * size + x]);
  }
  assert.deepEqual(gaussianCoverage(input, size, size, 0), input);
});
