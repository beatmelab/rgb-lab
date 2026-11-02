# Simulation reference

[Back to RGB Lab](../README.md) · [Data sources and licenses](../src/data/README.md)

This reference describes the implemented models, controls and numerical approximations. For a short introduction, see the README or the in-app information dialog.

## Basic simulation

Each circle emits only its primary channel. Canvas writes opaque pixels using `R = red intensity × red coverage`, `G = green intensity × green coverage`, `B = blue intensity × blue coverage`. Coverage is either 0 or 1, except along antialiased edges. Colored layers are never mixed using transparency. With no blur, the RGB value inside the overlap of all three circles exactly matches the three intensity controls.

Drag each light with a mouse, pen or touchscreen. Where lights overlap, the light whose center is closest to the pointer is selected. Lights stay within the simulation area. Use Tab to focus a light and the arrow keys to move it: 5 px per keypress, or 20 px while holding Shift. **Reset positions** restores the initial arrangement without changing intensity or blur.

The **Blur** control applies a Gaussian filter from 0 to 80 px, starting at 20 px. Each RGB channel is filtered independently; with one light per channel, blurring the composite image is equivalent to blurring each light before adding them. The panel and logo remain sharp. The RGB/HEX swatch represents the sum of the selected intensities, independently of position and blur.

In Basic, Fixture and Surfaces, hovering a circle outlines the exact light that the next drag will select and shows its emitter name, independently of blur. Pressing hides the hint throughout the drag so the light mixture stays unobstructed; releasing restores the hover hint. It also disappears on leaving the lights or changing modes. Touch drags have no overlay. The overlay never changes simulation pixels or intercepts pointer events.

The controls represent 8-bit RGB output values for a display, rather than photometric units or radiometric power. No gamma correction is applied to these values: a channel set to 128 is displayed as 128.

All three lights start at 255; **Reset** restores those intensities. Simulation and swatch transitions respect `prefers-reduced-motion`. Numeric readouts show the selected target immediately.

Rubik (logo, Basic HEX value and information-dialog title) and DM Sans (interface) are included in `public/fonts/` with their OFL licenses. CSS loads from the document head, and the interface appears once local fonts, controls and the first Canvas frame are ready, preventing unstyled flashes on reload. The app works without external services.

## Remembered mode

Selecting Basic, Fixture or Surfaces immediately saves `rgb-lab:mode` in localStorage. The next visit, reload or browser restart restores that mode before the interface becomes visible. No server or account is involved; the preference belongs to this browser and origin. This persists **only the mode**, not levels, positions, blur, engine, White CCT, skin selection or Equal illuminance. A missing or invalid value defaults to Basic. Storage restrictions or write failures never prevent startup or switching modes.

## Fixture mode

Select **Fixture**, choose an engine, and enter a six-digit target HEX or select a point on the CIE xy diagram. The numerical x/y inputs provide a keyboard-accessible alternative to the diagram. Fixture starts **Matched** to D65 white, using a balanced RGB recipe (approximately R 255 / G 198 / B 141). Selecting another engine matches the current target using its emitters; changing the target or pressing Enter in its HEX field does not adjust emitter levels. Basic and Fixture retain their own levels, positions and blur settings when switching modes.

Fixture draws one draggable circle per emitter in the selected engine, using the same initial RGB arrangement as Basic and additional positions for White, Amber and Mint. Each component moves independently with pointer or keyboard input. Positions are stored by emitter ID, so changing profiles preserves the positions of shared components. **Reset positions** restores the initial layout without changing emitter levels, target or blur. Unlit components remain keyboard-accessible but do not intercept drags on visible components.

Blur starts at 20 px and is applied to a cached, floating-point linear intensity mask for each component. Three normalized box convolutions approximate the Gaussian. At every pixel, spatially weighted emitter contributions are summed in linear color space before any display mapping or sRGB encoding. XYZ-to-linear-RGB is a linear transform, so signed linear RGB fields are accumulated equivalently for rendering; negative components are retained until the full sum is complete. A 14-bit encoding lookup limits dark-edge banding. Encoded component colors are never layered using transparency. Keyboard movement uses the same 5 px / Shift+20 px steps as Basic.

The Canvas uses one shared exposure of 1 across engines, temperatures and control values. Balanced RGB white is therefore luminous without reserving headroom for every possible emitter at full output. Signed linear RGB contributions are summed before display mapping. Each channel has a smooth low-end toe below 0.02 and a C1 exponential highlight shoulder above 0.85: `0.85 + 0.15 × (1 − exp(−(v − 0.85)/0.15))`. This is a display approximation; high values are compressed toward 1. The lookup covers linear values from 0 to 8 with 16384 steps per unit, retaining dark-edge precision. Physical XYZ, gamut calculations and the matcher remain unclipped and unchanged.

There is no per-pixel peak normalization or automatic exposure change on profile switches. Equal RGB contributions therefore look identical in every engine when extra channels are off. Adding D65 White increases the physical linear channels and cannot dim the existing RGB display contribution. The shoulder can compress the displayed differences in bright highlights and shift saturated display colors; it does not claim an exact screen reproduction of arbitrary emitted light.

The Target/Actual swatches and CIE diagram describe the combined emitter output at full spatial overlap, independently of the circles' positions. The Canvas shows the local mixtures where their blurred light fields intersect.

### Synthetic teaching profiles

The available profiles are RGB, RGBW, RGBWA and RGBWAM. Each letter identifies an emitter: **R = Red, G = Green, B = Blue, W = White, A = Amber, M = Mint**. All profiles share the same base emitter definitions; the White emitter temperature can be configured independently for each profile that includes W.

These are **synthetic nominal assumptions, not manufacturer measurements or calibrated fixture models**. Output is relative, not lumens. No CRI or TM-30 score is calculated; the surface comparison illustrates rendering under synthetic spectra rather than predicting commercial-fixture performance.

| Emitter | x | y | Maximum relative Y |
| --- | ---: | ---: | ---: |
| Red | 0.6900 | 0.3050 | 0.22 |
| Green | 0.1700 | 0.7200 | 0.70 |
| Blue | 0.1450 | 0.0450 | 0.08 |
| White, nominal 6500 K / D65 reference | 0.3127 | 0.3290 | 1.00 |
| Amber | 0.5650 | 0.4250 | 0.45 |
| Mint | 0.3850 | 0.5200 | 0.80 |

### White emitter configuration

**White CCT** configures the W emitter, not the color temperature of the entire mixed output. It is available for RGBW, RGBWA and RGBWAM, and hidden for RGB. Each profile starts at **6500 K · D65** and remembers its selection during the session, including when switching modes or profiles. Resetting positions does not change it.

| Nominal white reference | x | y |
| --- | ---: | ---: |
| 2700 K | 0.4593 | 0.4107 |
| 3200 K | 0.4232 | 0.3991 |
| 4000 K | 0.3805 | 0.3767 |
| 5600 K | 0.3302 | 0.3457 |
| 6500 K · D65 | 0.3127 | 0.3290 |

These are explicit nominal chromaticity presets, not measurements of particular LEDs. Changing White CCT updates the W emitter definition used by the color engine, Canvas, swatches and gamut calculations. Maximum relative Y, positions, other emitter definitions and blur remain unchanged.

- **Temperature changes:** the app preserves every emitter level and marks the recipe as Manual, making the effect of changing the W emitter directly visible. Click Match target to calculate a new recipe if needed.
- **Profile changes:** each engine remembers its own White CCT selection during the session; selecting an engine matches the current target with that configuration.
- **Reload:** White CCT returns to the 6500 K default. The setting is not saved to browser storage.

#### Why 6500 K is the default

The **6500 K · D65** default aligns the W emitter with the app's sRGB white target, `#FFFFFF`. It is a teaching reference, not a fixture standard. The warmer 4000 K reference remains one of the available presets.

RGBW names an emitter combination; it does not specify the white LED's temperature or a calibration policy. Actual products use different white emitters and color engines. For example, [Color Kinetics describes a 4000 K white emitter in IntelliHue Pro and separate 2700 K / 6500 K emitters in RGBiW](https://colorkinetics.helpdocs.io/article/kl15e2z6vd-led-mix-descriptions). The app's 6500 K default is a design choice, not a claim about the most common temperature across all fixtures.

#### White CCT, white point and spectrum

**CCT** means correlated color temperature, expressed in kelvin. It describes the approximate warm-to-cool appearance of a white source, not its physical operating temperature. A 3200 K white and a 6500 K white are both white; they simply have different chromaticities. Neither is inherently a more correct or higher-quality white.

CCT alone does not uniquely determine chromaticity, green–magenta tint or spectral composition. These presets therefore specify explicit **xy coordinates** as well as nominal temperatures. The 6500 K option deliberately uses the D65 chromaticity, `x = 0.3127`, `y = 0.3290`; it does not assert that every LED sold as 6500 K has those exact coordinates. Surfaces assigns it a synthetic spectrum fitted to the configured xyY. That illustrative spectrum is not a measurement of a real LED, and its rendering differences do not establish a product's color-rendering quality.

#### Does RGBW at 100% always produce white?

No particular white point is guaranteed by setting every emitter to 255. In Fixture mode, 255 means that emitter's maximum relative output. The final color depends on the emitters' chromaticities and relative contributions, rather than their control values being equal. Turning W up also does not make a colored RGB mix automatically neutral.

This differs from Basic mode's ideal display RGB model, where R = G = B = 255 is exactly `#FFFFFF`. A calibrated physical fixture can calculate a recipe to hit a defined white point; direct emitter control exposes the underlying mix. [ETC explains the distinction between calibrated color control and Direct mode](https://support.etcconnect.com/ETC/Fixtures/LED_Fixtures_General_Topics/LED_Fixture_Color_Calibration_and_Matching).

In this model, **W = 255 with R = G = B = A = M = 0** matches the D65 white target when White CCT is set to **6500 K · D65**. At 4000 K, the same White-only recipe produces the selected warmer white instead. Adding the other emitters changes that result according to their contributions.

#### Why switching Amber or Mint off can change a matched white

**Match target** can use all emitters available in the selected profile. A white recipe may include Amber or Mint alongside RGB and White. Turning those channels off manually changes that recipe without compensating the remaining channels, so the result can develop a color cast.

That does not make Amber or Mint essential for white. With the current nominal profiles, RGB alone can approximate the D65 target, and the default W emitter can reproduce it on its own. RGBW offers other valid recipes. The matching algorithm does not treat channels manually set to zero as locked or excluded: running Match target can turn them on again.

To see the effect of White CCT directly:

1. Select **Fixture → RGBW** and **White CCT → 6500 K · D65**.
2. Set **R, G and B to 0**, and **W to 255**. The combined output is the D65 reference white.
3. Select **3200 K**. Since the recipe is now manual, the levels stay unchanged and the output becomes warmer.
4. Keep the target at `#FFFFFF` and click **Match target**. The app rebalances the available emitters toward that target; this does not change the configured W temperature.

The swatches and xy readouts describe combined emitter output. The Canvas may show a different color at a particular point because each circle has its own position and blurred intensity field, and uses a fixed scene exposure rather than the swatches' independently normalized previews. Also, Preview HEX is a mapped screen representation: use xy and Δu′v′ to compare chromaticity rather than treating a white-looking preview as proof of an exact physical match.

### Color calculations and display limits

Each emitter's xyY is converted to XYZ and scaled linearly by its 8-bit level. Contributions are added without clipping. The physical gamut is the convex hull of the emitters: in these profiles White and Mint lie inside the existing hull, while Amber extends it. Additional channels are never given arbitrary color-quality bonuses.

HEX input is decoded from sRGB into linear XYZ. Choosing xy preserves the previous target luminance, using Y=1 after black. For targets outside the fixture hull, the closest point on its boundary is found in CIE 1976 u′v′. A deterministic nonnegative least-squares solver enumerates the active emitter sets, with minimum-norm regularization of 1e-7. If a level exceeds 1, all levels are scaled together; the recipe is then quantized to 0–255. Actual chromaticity and Δu′v′ are recalculated from those quantized levels. Black has no chromaticity or chromaticity difference.

XYZ-to-sRGB preview conversion clips negative linear RGB components, scales all components together when their maximum exceeds 1, then applies sRGB encoding. **Outside fixture gamut** refers to the target's physical reachability; **Target/Actual outside sRGB** refers to display approximation, including excess luminance. All gamut and difference calculations use the original XYZ values, not the mapped preview. Diagram colors are orientation aids, not a calibrated reproduction of spectral colors. **Preview HEX** describes only the screen preview.

The diagram uses the [CIE 1931 2-degree observer](https://doi.org/10.25039/CIE.DS.xvudnb9b), locally bundled and restricted to 380–780 nm at 1 nm intervals for the spectral boundary. Invalid points outside the visible boundary are rejected. See [the data attribution](../src/data/README.md) for the CC BY-SA 4.0 terms and transformation details.

### Faces and materials

The selector has three modes: **Basic**, **Fixture** and **Surfaces**. Basic is the default on a first visit. The last selected mode is restored from browser localStorage on subsequent visits, before the app is revealed. Fixture always shows the draggable emitter circles. Surfaces fills the available visual area with the fixture face, keeps its material samples along the bottom, and places the fixed **Reference · D65** face and mini swatches in a corner PIP. On mobile, the main face fills the area above the control panel. Beams are draggable directly across the main face and material samples. The fixture surfaces react to the local beam coverage; areas outside all beams are black. The D65 reference stays uniformly illuminated and unchanged. The main view has no opaque card background, so beam footprints remain visible around the face and during dragging, while the physical surface colors remain independent of this guide layer. The background shows only a faint, 16%-opacity footprint to help locate the beams; that footprint adds no ambient light to the modeled surfaces. Hover/focus outlines are sharp and remain above the faces; pressing hides the pointer hint throughout the drag. Position reset and blur controls remain available. Fixture and Surfaces share the engine, levels, target, White CCT, circle positions and blur; changing the mode alone does not alter them. The selected skin survives mode switches during the session. Reload preserves only the last mode; skin, levels, positions, blur, engine and White CCT return to their defaults.

Three measured NIST skin spectra are applied to the same illustrative matte face geometry. They are labeled Dark, Medium and Light, using the lowest D65 reflectance, the sample nearest the full-range CIELAB L* midpoint, and a warmer light sample selected for maximum D65 a* within 3 L* of the dataset’s brightest sample. The spectra retain their measured brightness. This widens the example range without implying demographic categories or coverage of all human skin tones; see the data README for exact subjects and selection ranks. The face is procedural Canvas geometry, not a photograph of a participant or a prediction of a real person's appearance. Its entire surface uses one skin spectrum; its modeled eyes, mouth and nose are shape/shadow cues, without separately measured eye, lip or hair materials. No subsurface scattering or specular reflection is modeled.

The face is rendered from a large procedural master of at least 1440 × 1680 pixels, growing with the main view at its device density (up to 3×) up to a 12-million-pixel budget. The main view determines this resolution; the D65 reference uses the same geometry rendered at master resolution and is then downsampled into its PIP with high-quality filtering. The silhouette is a native Canvas vector path with fractional alpha coverage preserved, rather than a binary color mask combined with a separate CSS clip. Head/ear/neck joins receive subpixel shading. Surface normals and compact lid/lip creases are evaluated at master resolution, without an enlarged low-resolution shading bitmap. Cached geometry, reusable image buffers and separable linear-light grid interpolation limit work while dragging beams.

Six paired swatches show Red, Orange, Yellow, Green, Blue and Gray. Five use selected CIE colour-evaluation sample spectra; Gray is an ideal, wavelength-independent 18% reflector. The colored samples are identified by their CIE source IDs in tooltips. No particular textile, paint or product is claimed.

At each fixture-surface pixel, the renderer computes `Σ coverageᵢ(x,y) × levelᵢ × ∫ SPDᵢ(λ) × reflectance(λ) × CIE XYZ observer(λ) dλ`, using trapezoidal quadrature from 380–780 nm at 5 nm intervals. Reflectance integrals are precomputed per emitter/material; the independently positioned, blurred beam masks weight these contributions in linear light. The masks and their subpixel placement are shared with Fixture, with bilinear sampling at the actual displayed surface coordinates, including Canvas object-fit letterboxing. Blur therefore softens the illumination itself before display encoding. Moving a beam changes both the local chromaticity and received intensity. Material swatches are spatially rendered too, rather than assigned one flat color.

For smooth beams, the face's summed signed linear RGB irradiance is evaluated on a separate grid with spacing no greater than 3 CSS pixels or one quarter of the blur value, then bilinearly reconstructed before shading and sRGB encoding. This bounds repeated spectral-mask work independently of silhouette resolution. It is a numerical resampling approximation; it does not interpolate encoded colors or alter the model's spectra. Zero blur and cases where a grid would offer little reduction retain direct per-pixel mask evaluation. Material swatches also retain direct evaluation.

**Equal illuminance** is enabled by default in Surfaces. The complete source spectrum is integrated to obtain incident Y, and a single gain `1/Y` scales every emitter's reflected contribution before spatial mask sampling. At full overlap the combined incident Y at unit coverage therefore equals the fixed D65 reference's Y = 1 before beam falloff. Each material retains its reflectance and each beam retains its local coverage; there is no per-pixel or per-material normalization. Partial overlaps, uncovered areas and beam falloff remain visible. All-off stays black with gain 0 and no division by zero. Turn the control off for unnormalized relative output (gain 1), where dimming all emitters dims the surfaces. Normalization alone does not match chromaticity or white-balance a colored recipe.

**Match reference white** sets the target to `#FFFFFF` and computes a quantized white recipe using the existing matcher. **Overlap beams** separately aligns every emitter, including currently inactive ones, at the face's head center subject to the scene bounds. Shared positions persist when switching engines, which rematches the target. Use these actions together with Equal illuminance for a comparison at the same nominal white and incident illuminance; quantization can leave a small chromaticity error. The Target/Actual readouts continue to describe the raw combined emitter output before this Surfaces-only gain. Moving a beam then explores a different local mixture. Reset positions restores the separated layout, and ordinary mode switches preserve the selected levels and positions.

Beam circles remain a 2D projection model with fixed matte shading; the app does not calculate 3D light directions, cast shadows, distance attenuation, optical lenses or volumetric scattering.

LED SPDs are **synthetic examples**, not uniquely recoverable from xy or measured from hardware. The generator starts from Gaussian RGB/Amber peaks and broad blue-pump/phosphor-like White/Mint bases, then fits nonnegative SPDs to the existing emitter xyY through a positive exponential tilt (relative-entropy fitting). Every emitter, including all White CCT presets, integrates back to the original engine's XYZ within numerical tolerance. Shared RGB spectra do not change with the engine. Matching still optimizes chromaticity, not a color-rendering score; extra channels receive no guaranteed advantage.

Reference and fixture surfaces use one shared, fixed display exposure of 0.8. The same geometric shading is applied in linear light before sRGB encoding. Negative display components and values above 1 are clipped and reported as a screen approximation; no surface or pixel is independently peak-normalized. A screen cannot reproduce arbitrary reflected spectra. Skin/material differences, including improvements or regressions, follow the local beam mixture, synthetic SPDs and measured reflectances. They do not establish a CRI score, predict cameras or prove one commercial engine better than another.

Sources, licenses, selected sample IDs and regeneration instructions are in [the data README](../src/data/README.md). Data ships locally; using the app makes no remote data or image requests.

No DMX or commercial-fixture import is implemented.
