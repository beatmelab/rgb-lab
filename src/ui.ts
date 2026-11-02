import { DEFAULT_COLOR, PRESETS, toCSS, toHex, type Channel, type RGB } from './color';
import { LightCanvas } from './canvas';
import type { LightIndex } from './scene';
import { initializeFixtureUI } from './fixture/ui';
import { loadMode, saveMode, type SimulationMode } from './mode-preference';

function element<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Element not found: ${selector}`);
  return node;
}

export function initializeUI(): () => void {
  let color = { ...DEFAULT_COLOR };
  let announcementTimer = 0;
  const swatch = element('#color-swatch');
  const hex = element('#hex-value');
  const rgb = element('#rgb-value');
  const status = element('#result-announcement');
  const channels: [string, Channel][] = [['red', 'r'], ['green', 'g'], ['blue', 'b']];
  const sliders = channels.map(([id, channel]) => ({
    input: element<HTMLInputElement>(`#${id}`),
    output: element<HTMLOutputElement>(`#${id}-value`),
    channel,
  }));
  const canvas = element<HTMLCanvasElement>('#light-canvas');
  const handles = ['red', 'green', 'blue'].map(name => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'light-handle';
    button.setAttribute('aria-label', `Move ${name} light`);
    button.setAttribute('aria-describedby', 'move-help');
    canvas.parentElement!.append(button);
    return button;
  });
  const simulation = new LightCanvas(
    canvas,
    color,
    displayColor => { swatch.style.backgroundColor = toCSS(displayColor); },
    positions => positions.forEach((point, index) => {
      handles[index].style.left = `${point.x}px`;
      handles[index].style.top = `${point.y}px`;
    }),
  );
  handles.forEach((handle, index) => {
    handle.addEventListener('keydown', event => {
      let x = 0;
      let y = 0;
      switch (event.key) {
        case 'ArrowLeft': x = -1; break;
        case 'ArrowRight': x = 1; break;
        case 'ArrowUp': y = -1; break;
        case 'ArrowDown': y = 1; break;
        default: return;
      }
      event.preventDefault();
      const step = event.shiftKey ? 20 : 5;
      simulation.moveBy(index as LightIndex, x * step, y * step);
    });
  });

  const blur = element<HTMLInputElement>('#blur');
  const blurValue = element<HTMLOutputElement>('#blur-value');
  const fixture = initializeFixtureUI();
  let mode: SimulationMode = 'basic';
  const blurSettings = { basic: 20, fixture: 20 };
  const updateBlur = (): void => {
    const value = blur.valueAsNumber;
    blurValue.value = `${value} px`;
    blur.style.setProperty('--fill', `${value / 80 * 100}%`);
    blur.setAttribute('aria-valuetext', `${value} pixels`);
    blurSettings[mode === 'basic' ? 'basic' : 'fixture'] = value;
    if (mode === 'basic') simulation.setBlur(value);
    else fixture.setBlur(value);
  };
  blur.addEventListener('input', updateBlur);
  updateBlur();
  element<HTMLButtonElement>('#reset-positions').addEventListener('click', () => {
    if (mode === 'basic') simulation.resetPositions();
    else fixture.resetPositions();
  });
  const switchMode = (next: SimulationMode, persist = true): void => {
    mode = next;
    const advanced = mode !== 'basic';
    simulation.suspendInteraction();
    canvas.hidden = advanced;
    handles.forEach(handle => { handle.hidden = advanced; });
    for (const selector of ['#basic-intensity', '#basic-result', '#basic-presets']) element(selector).hidden = advanced;
    element('#fixture-controls').hidden = !advanced;
    for (const name of ['basic', 'fixture', 'surfaces'] as const) element(`#${name}-mode`).setAttribute('aria-pressed', String(mode === name));
    fixture.setView(mode === 'basic' ? null : mode);
    blur.value = String(blurSettings[mode === 'basic' ? 'basic' : 'fixture']); updateBlur();
    element<HTMLElement>('.controls').scrollTop = 0;
    if (persist) saveMode(mode);
  };
  element('#basic-mode').addEventListener('click', () => switchMode('basic'));
  element('#fixture-mode').addEventListener('click', () => switchMode('fixture'));
  element('#surfaces-mode').addEventListener('click', () => switchMode('surfaces'));

  const presetContainer = element('#presets');
  const buttons = PRESETS.map(preset => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset';
    button.setAttribute('aria-pressed', 'false');
    const dot = document.createElement('span');
    dot.className = 'preset-dot';
    dot.style.backgroundColor = toCSS(preset.color);
    dot.setAttribute('aria-hidden', 'true');
    button.append(dot, document.createTextNode(preset.name));
    button.addEventListener('click', () => update(preset.color));
    presetContainer.append(button);
    return { button, preset };
  });

  function update(next: RGB): void {
    color = { ...next };
    for (const { input, output, channel } of sliders) {
      input.value = String(color[channel]);
      output.value = String(color[channel]);
      input.style.setProperty('--fill', `${color[channel] / 255 * 100}%`);
      input.setAttribute('aria-valuetext', `${color[channel]} out of 255`);
    }
    hex.textContent = toHex(color);
    rgb.textContent = `RGB(${color.r}, ${color.g}, ${color.b})`;
    for (const { button, preset } of buttons) {
      button.setAttribute('aria-pressed', String(channels.every(([, channel]) => color[channel] === preset.color[channel])));
    }
    simulation.setColor(color);
    window.clearTimeout(announcementTimer);
    announcementTimer = window.setTimeout(() => {
      status.textContent = `Resulting color: red ${color.r}, green ${color.g}, blue ${color.b}. Hex ${toHex(color)}.`;
    }, 220);
  }

  for (const { input, channel } of sliders) {
    input.addEventListener('input', () => update({ ...color, [channel]: input.valueAsNumber }));
  }
  element<HTMLButtonElement>('#reset').addEventListener('click', () => update(DEFAULT_COLOR));
  update(color);
  switchMode(loadMode(), false);
  return () => {
    window.clearTimeout(announcementTimer);
    simulation.destroy();
    fixture.destroy();
    handles.forEach(handle => handle.remove());
  };
}
