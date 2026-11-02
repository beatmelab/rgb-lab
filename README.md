# RGB Lab

An interactive lab for exploring additive light mixing and why LED fixtures use more than Red, Green and Blue. Adjust the emitters, overlap their beams, and observe both the emitted light and its effect on skin and color samples.

Website: **https://rgb-lab.beatmelab.com/**.

Built with **TypeScript, HTML, CSS, Vite and Canvas 2D**, without a UI framework or a backend. The interface and documentation are in English.

## Three modes

| Mode | What it shows |
| --- | --- |
| **Basic** | Ideal display RGB addition: Red, Green and Blue circles, independent 0–255 sliders, eight presets and RGB/HEX readouts. Full RGB is white; all channels off is black. |
| **Fixture** | Generic RGB, RGBW, RGBWA and RGBWAM engines, manual emitter control, target matching and a CIE xy gamut diagram. |
| **Surfaces** | Spatial spectral illumination on an illustrative face and six color samples. Move beams across them and compare with a fixed D65 reference in a corner PIP. |

### Why add W, A and M?

Each letter names an emitter: **R = Red, G = Green, B = Blue, W = White, A = Amber, M = Mint**.

Matching the beam color is only part of the job: skin, costumes and scenery reflect different wavelengths. Two lights that look equally white can render the same object differently. Extra emitters offer more ways to shape the spectrum, even when the gamut outline stays the same.

- **White** supplies white directly, can add output and helps mix pastels. A phosphor-converted white emitter provides broader spectral coverage than narrow RGB peaks, which can help render skin and fabrics more faithfully. RGB can already make white; W offers another recipe, whose color temperature still matters.
- **Amber** adds yellow–orange energy for finer control of warm whites, golds and oranges. It is useful for candlelight, firelight and sunset effects: matching their beam color with RGB alone need not reproduce their effect on objects. Amber also extends this app's nominal RGB gamut.
- **Mint** is a pale greenish, commonly broad-spectrum emitter useful for tuning white color temperature, pastels and green–magenta balance, including matching lights and adjustments for camera work. It can help color rendering without expanding the gamut. Here, Mint adds mixing options rather than access to more saturated greens.

More channels do **not** guarantee a better result for every mixture. Lights with the same white chromaticity can render objects differently because their spectra differ. **CRI** describes color-rendering fidelity relative to a reference at a similar color temperature; RGB Lab does not calculate CRI or TM-30 scores. [ETC explains additional emitters](https://blog.etcconnect.com/an-array-of-choices-2) and [Mint and White](https://blog.etcconnect.com/an-array-of-choices-3); the [US DOE explains color appearance and CRI](https://www1.eere.energy.gov/buildings/publications/pdfs/ssl/led-color-characteristics-factsheet.pdf).

## Run locally

Requires **Node.js 22.18 or later** and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. To check the production build:

```sh
npm test
npm run build
npm run preview
```

`npm run build` checks TypeScript and writes the static website to `dist/`. `npm run preview` serves that build locally; it is not a production server. Python is only needed to regenerate the bundled spectral data, not to run, test or build the app.

## Controls

- Move a light by dragging it with a mouse, pen or touchscreen. In overlaps, the nearest eligible light center is selected. Hover shows its outline and name; pressing hides the hint while dragging. Fixture and Surfaces use a hand cursor over draggable beams. Unlit fixture emitters do not intercept pointer drags.
- For keyboard movement, use **Tab** to focus a light, then the arrow keys: **5 px**, or **20 px with Shift**.
- **Blur** ranges from 0 to 80 px and starts at **20 px**. It softens each beam's intensity falloff. **Reset positions** restores geometry without changing levels or blur.
- In Basic, **Reset** restores all three intensities to 255. Presets include the primaries, secondaries, white and black.
- The **ⓘ button**, at the bottom left, opens instructions, emitter explanations, sources and limitations. Close it with Escape, the close button or a click outside.
- The **? button beside Engine** explains the practical benefits of White, Amber and Mint LEDs, including spectrum, gamut and color rendering. It is available in Fixture and Surfaces.
- The **? button beside Color matching** explains the colored diagram, the Fixture and sRGB outlines, Target/Actual markers, gamut and Δu′v′. It is available in Fixture and Surfaces.

### Fixture and matching

Fixture starts with **RGB matched to D65 white**. RGB can produce white when balanced; equal channel values do not guarantee that balance. Switching **Engine** matches the current target with the selected profile. Adjusting an emitter afterwards switches to Manual.

The canvas uses one shared exposure with smooth highlight compression, keeping the balanced RGB white bright without darkening it to reserve room for every possible extra emitter. Adding White can add output; it is not required to make white. Physical XYZ, target matching and gamut calculations are independent of this display mapping.

Enter a six-digit **Target HEX**, select a point on the CIE xy diagram, or use the numeric x/y inputs. Press **Match target** to calculate a recipe. Changing a target or pressing Enter in the HEX field does not automatically change the levels. Adjusting an emitter after matching keeps the manual mixture; matching again can use every available channel, including ones manually set to zero.

For engines containing W, **White CCT** selects that emitter's nominal temperature: 2700, 3200, 4000, 5600 or **6500 K · D65** (default). It does not set the temperature of the entire mix. Changing it preserves emitter levels and marks the recipe Manual. The default is a teaching reference aligned with the screen-white target, not a claim about the most common white LED in real fixtures. W alone at 255 has D65 chromaticity at the default setting; adding other emitters changes the mixture.

### Reading the diagram

The CIE xy diagram describes chromaticity, **not brightness**. Background colors are approximate screen representations.

| Element | Meaning |
| --- | --- |
| Outer curved boundary | Physical chromaticity domain for the CIE standard observer. Points outside it cannot be selected. |
| Solid green Fixture outline | Chromaticities reachable by mixing the selected profile's emitters. |
| Dashed sRGB triangle | The chromaticity gamut of the sRGB preview. A fixture can produce light outside it that the screen cannot faithfully reproduce. |
| Target / Actual | Requested chromaticity and the result of the current emitter levels. The marker's display color is only an identifier. |
| Δu′v′ | Chromaticity difference; smaller is closer. It does not measure brightness or CRI. |
| Preview HEX | A mapped screen preview, not an unclipped measurement of the emitted light. |

**Outside fixture gamut** means the target cannot be matched exactly by that engine. **Target/Actual outside sRGB** means the preview requires display approximation, including excess luminance. Target/Actual swatches and readouts describe **combined output at full overlap**, independently of beam positions. Local intersections may therefore look different.

### Surfaces

The fixture face fills the available visual area, with color samples below it. A fixed, uniformly lit **D65 reference** stays in a corner PIP. The main face and samples respond to the light at their actual screen positions: move beams onto them, overlap emitters, soften the edges, or move the light away to leave an area dark. A faint footprint on the background helps locate each beam without adding ambient light to the modeled surfaces.

For a controlled comparison, use **Match reference white** and **Overlap beams**. The first matches D65; the second aligns all emitter beams on the face, including channels used by other engines. Switching engines rematches the target while keeping those positions, so different spectra can be compared under the same nominal white.

**Equal illuminance** is enabled by default. It applies one gain to the complete fixture recipe so its incident Y at full coverage equals the reference's Y = 1. This is a comparison normalization, not extra fixture power. It removes overall output as a comparison advantage, without normalizing materials or individual pixels. Partial overlaps and blurred edges still receive less light; moving beams changes local color and brightness. Normalization does not white-balance a manual colored mix. Turn it off to see relative output and channel dimming. Both views retain the same fixed display exposure.

Select **Dark, Medium or Light** to apply measured skin reflectances covering a broad range. Light uses a warmer measured example near the bright end of the dataset. These three examples do not cover every skin tone and imply no demographic categories. The face uses one large, detailed procedural master; the reference PIP is reduced from that same geometry. It is not a photograph of a participant. Red, Orange, Yellow, Green and Blue use measured CIE sample spectra; Gray is an ideal 18% reflector. The reference uses the same selected samples.

## State and privacy

The last selected mode is saved in `localStorage` as `rgb-lab:mode` and restored before the interface appears. This preference belongs to the browser and site origin. A first visit or an unavailable/invalid preference starts in Basic.

Only the mode survives a reload. Levels, positions, blur, engine, White CCT, skin and Equal illuminance return to defaults. Within a session, Basic retains its own state; Fixture and Surfaces share the engine, target, levels, beam positions and blur. Engines remember their White CCT selections during that session, and Surfaces retains its Equal illuminance selection.

The app has no account, backend or analytics. Fonts, images and numerical data are bundled locally; running it makes no external data, font or image requests. The source links in the information dialog open external websites only when selected.

## Scope and accuracy

- **Basic** adds 8-bit display RGB values directly. A channel set to 128 is shown as 128; it is not a calibrated photometric control.
- **Fixture** adds relative emitter contributions in linear XYZ. Profiles share their base emitters; extra channels receive no artificial color-quality bonus. White and Mint lie inside the nominal RGB gamut; Amber expands it.
- **Surfaces** uses nonnegative, **synthetic LED spectra fitted to those same emitter xyY values**, combined with measured surface reflectances. It illustrates spectral effects; it does not predict the performance of a named fixture.
- The screen imposes its own gamut and brightness limits. Light that looks white in a preview need not be an exact physical match or render every material faithfully.
- The face uses a simple matte model. There is no subsurface scattering, specular reflection, 3D light transport, cast-shadow calculation, distance attenuation or volumetric scattering. No CRI/TM-30 scores, real lumens, commercial-fixture calibration or DMX control are provided.

See the [simulation reference](docs/simulation.md) for profile tables, matching, display mapping, exposure, spatial rendering and numerical approximations.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/color.ts`, `src/scene.ts`, `src/canvas.ts` | Basic RGB mixing, geometry and rendering. |
| `src/ui.ts`, `src/about.ts`, `src/mode-preference.ts` | Controls, information dialog and remembered mode. |
| `src/fixture/` | Colorimetry, profiles, solver, beam masks and reflected-light rendering. |
| `src/data/` | Bundled data, original CIE files, metadata and attribution. |
| `public/` | Runtime icons, fonts, font licenses and publication notices. |
| `tests/` | Regression tests for color, geometry, spectral data, rendering helpers and preferences. |
| `scripts/build-surface-data.py` | Reproducible offline-data generation from downloaded source datasets. |
| `.github/workflows/deploy.yml` | Build, test and deploy `dist/` to GitHub Pages. |
| `docs/` | Technical simulation reference. |

## Sources and licenses

The **application source code is MIT-licensed**; see [LICENSE](LICENSE). Third-party data and font licenses remain separate:

- **CIE observer, D65 and sample data:** CC BY-SA 4.0. See [data attribution and transformation details](src/data/README.md).
- **NIST skin reflectance:** attributed US government data, with its source and terms documented in the same data README.
- **Rubik** (logo, Basic HEX and information-dialog title) and **DM Sans** (interface): bundled with their SIL Open Font License notices in `public/fonts/`.

[Publication notices](public/NOTICE.txt) include the application license and third-party attribution and are copied into the built website. The information dialog links to them as well as the original research and explanatory sources.
