import { toCSS, toHex } from '../color.ts';
import { hexToXYZ, previewXYZ, xyzToXy, type Chromaticity } from './colorimetry.ts';
import { createFixtureState, fixtureComponents, fixtureGamut, matchTarget, mixFixture, selectTargetXy } from './engine.ts';
import { DEFAULT_WHITE_TEMPERATURE, FIXTURE_PROFILES, WHITE_TEMPERATURES, withWhiteTemperature } from './profiles.ts';
import { isVisibleChromaticity } from './gamut.ts';
import { FixtureCanvas } from './canvas';
import { GamutDiagram } from './diagram';
import { SurfaceView } from './surfaces.ts';
import { SKIN_SAMPLES } from './spectrum.ts';

const get = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Element not found: ${id}`);
  return element as T;
};
const formatXy = (xy: Chromaticity | null): string => xy ? `${xy.x.toFixed(4)}, ${xy.y.toFixed(4)}` : 'Off';

export function initializeFixtureUI() {
  const state = createFixtureState();
  const events = new AbortController();
  const signal = events.signal;
  const surfaces = new SurfaceView(get('surface-view'));
  const simulation = new FixtureCanvas(get<HTMLCanvasElement>('fixture-canvas'), field => surfaces.setField(field), get('surface-view'));
  const skinSample = get<HTMLSelectElement>('skin-sample');
  const equalIlluminance = get<HTMLInputElement>('equal-illuminance');
  const hex = get<HTMLInputElement>('target-hex');
  const xInput = get<HTMLInputElement>('target-x'), yInput = get<HTMLInputElement>('target-y');
  const error = get('target-error');
  const profileSelect = get<HTMLSelectElement>('fixture-profile');
  const whiteTemperature = get<HTMLSelectElement>('white-temperature');
  const whiteTemperatures = new Map<string, number>();
  const emitters = get('fixture-emitters');
  let hexDirty = false;
  let announcementTimer = 0;
  const diagram = new GamutDiagram(get<HTMLCanvasElement>('gamut-diagram'), xy => {
    hexDirty = false; selectTargetXy(state, xy); state.matched = false;
    clearError(); updateTargetFields(); update();
  });

  for (const profile of FIXTURE_PROFILES) {
    const option = document.createElement('option'); option.value = profile.id; option.textContent = profile.name; profileSelect.append(option);
  }
  profileSelect.value = state.profile.id;
  for (const reference of WHITE_TEMPERATURES) {
    const option = document.createElement('option'); option.value = String(reference.kelvin); option.textContent = reference.label; whiteTemperature.append(option);
  }
  SKIN_SAMPLES.forEach((sample, index) => {
    const option = document.createElement('option'); option.value = String(index); option.textContent = sample.name; skinSample.append(option);
  });
  skinSample.value = '1';
  equalIlluminance.checked = true;
  skinSample.addEventListener('change', () => update(), { signal });
  equalIlluminance.addEventListener('change', () => update(), { signal });
  get('overlap-beams').addEventListener('click', () => simulation.overlapAt(surfaces.comparisonPoint()), { signal });

  function syncProfileConfiguration(): void {
    get('white-temperature-row').hidden = state.profile.whiteTemperature === null;
    whiteTemperature.value = String(state.profile.whiteTemperature ?? DEFAULT_WHITE_TEMPERATURE);
  }

  function clearError(): void {
    error.textContent = '';
    for (const input of [hex, xInput, yInput]) { input.removeAttribute('aria-invalid'); input.setCustomValidity(''); }
  }

  function updateTargetFields(): void {
    hex.value = toHex(previewXYZ(state.target).rgb);
    const xy = xyzToXy(state.target);
    xInput.value = xy ? xy.x.toFixed(4) : '';
    yInput.value = xy ? xy.y.toFixed(4) : '';
    get('target-hex-label').textContent = previewXYZ(state.target).outsideSRGB ? 'Target preview HEX' : 'Target HEX';
  }

  function update(): void {
    const result = mixFixture(state.profile, state.levels, state.target);
    const targetXy = xyzToXy(state.target);
    simulation.setComponents(fixtureComponents(state.profile, state.levels));
    surfaces.update(state.profile, state.levels, Number(skinSample.value),equalIlluminance.checked);
    get('fixture-target-swatch').style.backgroundColor = toCSS(previewXYZ(state.target).rgb);
    get('fixture-actual-swatch').style.backgroundColor = toCSS(result.preview);
    get('fixture-target-xy').textContent = formatXy(targetXy);
    get('fixture-actual-xy').textContent = formatXy(result.xy);
    get('fixture-preview-hex').textContent = toHex(result.preview);
    get('fixture-delta').textContent = result.deltaUv === null ? '—' : result.deltaUv.toFixed(5);
    get('fixture-recipe-status').textContent = state.matched ? 'Matched' : 'Manual';
    get('fixture-gamut-status').textContent = result.targetInGamut ? 'Target in fixture gamut' : 'Outside fixture gamut';
    get('fixture-gamut-status').classList.toggle('warning', !result.targetInGamut);
    get('target-display-status').textContent = result.targetOutsideSRGB ? 'Target outside sRGB' : '';
    get('actual-display-status').textContent = result.actualOutsideSRGB ? 'Actual outside sRGB' : '';
    diagram.draw(fixtureGamut(state.profile), targetXy, result.xy, state.profile.emitters);
    window.clearTimeout(announcementTimer);
    announcementTimer = window.setTimeout(() => {
      get('fixture-announcement').textContent = `${state.profile.name}. ${result.targetInGamut ? 'Target in fixture gamut.' : 'Outside fixture gamut.'} Actual ${formatXy(result.xy)}. Preview HEX ${toHex(result.preview)}.`;
    }, 220);
  }

  function renderEmitters(): void {
    emitters.replaceChildren();
    for (const emitter of state.profile.emitters) {
      const wrapper = document.createElement('div'); wrapper.className = 'channel'; wrapper.style.setProperty('--channel-color', emitter.controlColor);
      const heading = document.createElement('div'); heading.className = 'channel-heading';
      const label = document.createElement('label'); label.htmlFor = `emitter-${emitter.id}`; label.textContent = emitter.name;
      const input = document.createElement('input'); input.id = label.htmlFor; input.type = 'range'; input.min = '0'; input.max = '255'; input.step = '1';
      const output = document.createElement('output'); output.htmlFor.add(input.id);
      const sync = (): void => {
        input.value = String(state.levels[emitter.id]); output.value = input.value;
        input.style.setProperty('--fill', `${state.levels[emitter.id] / 255 * 100}%`);
        input.setAttribute('aria-valuetext', `${input.value} out of 255`);
      };
      input.addEventListener('input', () => { state.levels[emitter.id] = input.valueAsNumber; state.matched = false; sync(); update(); });
      heading.append(label, output); wrapper.append(heading, input); emitters.append(wrapper); sync();
    }
  }

  const match = (): void => { state.levels = matchTarget(state.profile, state.target); state.matched = true; renderEmitters(); update(); };
  get('match-reference-white').addEventListener('click', () => {
    state.target = hexToXYZ('#FFFFFF')!; hexDirty = false; clearError(); updateTargetFields(); match();
  }, { signal });
  profileSelect.addEventListener('change', () => {
    const base = FIXTURE_PROFILES.find(profile => profile.id === profileSelect.value)!;
    state.profile = withWhiteTemperature(base, whiteTemperatures.get(base.id) ?? DEFAULT_WHITE_TEMPERATURE);
    syncProfileConfiguration(); match();
  }, { signal });
  whiteTemperature.addEventListener('change', () => {
    const kelvin = Number(whiteTemperature.value);
    if (!WHITE_TEMPERATURES.some(reference => reference.kelvin === kelvin)) { syncProfileConfiguration(); return; }
    state.profile = withWhiteTemperature(state.profile, kelvin);
    whiteTemperatures.set(state.profile.id, kelvin);
    state.matched = false; renderEmitters(); update();
  }, { signal });
  get('match-target').addEventListener('click', () => { if (commitHex() && ![xInput, yInput].some(input => input.hasAttribute('aria-invalid'))) match(); }, { signal });

  // A dirty HEX field is committed by Enter, blur or Match; programmatic preview
  // values never replace an exact xy target until the user actually edits them.
  function commitHex(): boolean {
    if (!hexDirty) return !hex.hasAttribute('aria-invalid');
    const parsed = hexToXYZ(hex.value.trim());
    if (!parsed) {
      error.textContent = 'Enter a HEX color in #RRGGBB format.'; hex.setAttribute('aria-invalid', 'true');
      return false;
    }
    clearError(); state.target = parsed; state.matched = false; hexDirty = false;
    updateTargetFields(); update(); return true;
  }
  hex.addEventListener('input', () => { hexDirty = true; }, { signal });
  hex.addEventListener('change', commitHex, { signal });
  hex.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); commitHex(); } }, { signal });
  for (const input of [xInput, yInput]) input.addEventListener('change', () => {
    const xy = { x: xInput.valueAsNumber, y: yInput.valueAsNumber };
    if (!isVisibleChromaticity(xy)) {
      error.textContent = 'Choose coordinates inside the visible chromaticity boundary.';
      input.setAttribute('aria-invalid', 'true'); return;
    }
    hexDirty = false; clearError(); selectTargetXy(state, xy); state.matched = false; updateTargetFields(); update();
  }, { signal });

  syncProfileConfiguration(); updateTargetFields(); renderEmitters(); update();
  return {
    setView: (view: 'fixture' | 'surfaces' | null): void => {
      get('surface-settings').hidden = view !== 'surfaces';
      get('fixture-canvas').classList.toggle('surface-beams', view === 'surfaces');
      simulation.setActive(view !== null);
      surfaces.setVisible(view === 'surfaces');
    },
    setBlur: (blur: number): void => simulation.setBlur(blur),
    resetPositions: (): void => simulation.resetPositions(),
    destroy: (): void => { window.clearTimeout(announcementTimer); events.abort(); diagram.destroy(); simulation.destroy(); surfaces.destroy(); },
  };
}
