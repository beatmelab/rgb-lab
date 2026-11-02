# CIE reference data

International Commission on Illumination (CIE), 2019. *Colour-matching functions of CIE 1931 standard colorimetric observer*.

- Dataset: https://doi.org/10.25039/CIE.DS.xvudnb9b
- Source: https://files.cie.co.at/Publications-datasets/CIE_xyz_1931_2deg.csv
- License: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/).
- Original MD5: `17cca777db64b17170f06f67ce9d3ab7`.

The original CSV and metadata are unmodified. `spectral-locus.ts` is a derived dataset: XYZ columns are normalized to xy, restricted to 380–780 nm at the original 1 nm interval, and rounded to ten decimal places. This derived data is also licensed under CC BY-SA 4.0. The original metadata records the license, citation and checksums. This data license does not describe the application source code.

## Surface comparison data

`surface-data.ts` bundles a derived 380–780 nm / 5 nm observer, D65 reference spectrum, selected surface reflectances and synthetic LED spectra. CIE-derived arrays are licensed under **CC BY-SA 4.0**. Sources are credited here and in the information modal. Original CIE datasets and metadata are included without modification; the larger NIST download is represented by selected, interpolated curves and its SHA-256 in the derived file.

### D65 and colored surfaces

- CIE 2019, *CIE standard illuminant D65*, [DOI 10.25039/CIE.DS.hjfjmt59](https://doi.org/10.25039/CIE.DS.hjfjmt59). Source: https://files.cie.co.at/Publications-datasets/CIE_std_illum_D65.csv. MD5: `03d4eb9b837c60671627c946fb534deb`. Sampled at 5 nm and normalized to Y=1 with the bundled observer and trapezoidal quadrature. The finite spectral range introduces a small white-point difference from full-range D65.
- CIE 2017, *Spectral radiance factors of 99 test samples for the CIE colour fidelity index calculation*, [DOI 10.25039/CIE.DS.wi5idbqu](https://doi.org/10.25039/CIE.DS.wi5idbqu). Source: https://files.cie.co.at/Publications-datasets/CIE_srf_cfi.csv. MD5: `11ef0bcbfaea43f1143ac40fbf52d7ff`. Despite the dataset landing page's 1 nm description, this file and its metadata specify **5 nm**. The matching local metadata is authoritative for this file.
- License for both: [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- Selected CIE samples: **Red CES 12, Orange CES 20, Yellow CES 32, Green CES 52, Blue CES 78**. Reflectances are retained unchanged. Names are descriptive viewing labels, not material identifications. The generator chooses the closest normalized D65 linear RGB direction to documented hue targets, independently of fixture spectra; samples were not selected to reward W/A/M.
- Gray is an explicitly synthetic, wavelength-independent reflectance of 0.18.

### Skin

Cooksey, C. C., Allen, D. W. and Tsai, B. K. (2017), *Reference Data Set of Human Skin Reflectance*, Journal of Research of NIST 122. [Article DOI 10.6028/jres.122.026](https://doi.org/10.6028/jres.122.026); [data DOI 10.18434/M38597](https://doi.org/10.18434/M38597).

- Original data: https://opendata.nist.gov/1832_Data_JResNIST_skinrefl%20v3.txt.
- Original SHA-256: `ce9aac735d9d83b4b874b98d45f1ebda682cdc0e652f804efe00ab2fce0c25d9` (verified by the generator).
- US government/NIST data; see the publication's [NIST licensing terms](https://www.nist.gov/director/licensing). Attribution does not imply NIST endorsement.
- The source provides R1/R2/R3 and their average for 100 subjects. We use the **Average** columns and linearly interpolate the original 3 nm grid to 5 nm, without a color-space reconstruction or smoothing.
- Subjects are ranked by their D65-weighted Y. **Dark** is subject 44 (rank 1), **Medium** is subject 70 (rank 9), and **Light** is subject 22 (rank 91). Medium is nearest the midpoint of the full dataset’s D65 CIELAB L* range, avoiding its uneven population median. Light is the sample with the greatest D65 a* (redward chroma) among those within 3 L* of the brightest sample: it is a warmer measured example near the bright end, rather than the absolute brightest one. Their relative Y values are approximately 0.133, 0.275 and 0.425, with L* approximately 43.2, 59.4 and 71.2. Spectra are not recolored, scaled or normalized per sample. The generator records the selection method, tolerance and ranks in `surface-data.ts`.
- Dark/Medium/Light describe these three examples within the dataset, not demographic or clinical categories. The dataset does not cover every skin tone, and three examples do not represent the full diversity or within-person variability of skin. No age, sex or ethnicity is inferred.
- These measured surface spectra are applied uniformly to illustrative geometry. They are not measured facial maps or photographs of participants.

### Synthetic LED models and regeneration

The emitter spectra in the derived file are **authored synthetic models, not measurements**. Gaussian starting spectra: Red center/sigma 630/10 nm, Green 530/12 nm, Blue 450/9 nm, Amber 590/14 nm. White base: `0.8 G(450,10) + G(570,65) + 0.3 G(620,40)`. Mint base: `0.25 G(450,10) + G(540,55)`. All bases undergo a positive exponential tilt to match the two xy moments, then normalization to the profile's maximum Y. This preserves positivity and the original color engine; it is one possible SPD for each chromaticity, not a unique physical reconstruction. White bases are fitted separately to each supported CCT preset. Synthetic fitting does not optimize a CRI, TM-30 or surface-rendering score.

To regenerate, download the two CIE CSVs and their `_metadata_v2.json` files, and the NIST text file into a directory under these names:

```text
rgb-lab-d65.csv
rgb-lab-d65-metadata.json
rgb-lab-materials.csv
rgb-lab-materials-metadata.json
rgb-lab-skin.txt
```

Run `python3 scripts/build-surface-data.py /path/to/inputs`. The script verifies the original CIE checksums, checks fitted xy, writes the derived arrays and copies the unchanged CIE originals and metadata. It uses the existing local CIE observer. Run `npm test` afterwards to check emitter integration, physical linearity, data integrity, equal illuminance, black and metameric surface differences.
