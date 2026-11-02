"""Rebuild surface-data.ts using downloaded CIE/NIST inputs; Python stdlib only.

Usage: python3 scripts/build-surface-data.py /path/to/downloaded-inputs
See src/data/README.md for original URLs, names, attribution and assumptions.
"""
import bisect
import csv
import hashlib
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1])
WAVES = list(range(380, 781, 5))


def rows(path):
    return list(csv.reader(path.read_text(encoding='cp1252').splitlines()))


def verified(name, md5):
    path = SOURCE / name
    assert hashlib.md5(path.read_bytes()).hexdigest() == md5, name
    return path


cmf_rows = {int(r[0]): list(map(float, r[1:])) for r in rows(ROOT / 'src/data/CIE_xyz_1931_2deg.csv')}
cmf = [cmf_rows[w] for w in WAVES]
weights = [2.5 if i in (0, 80) else 5 for i in range(81)]
totals = [sum(row) for row in cmf]
coords = [(row[0] / total, row[1] / total) for row, total in zip(cmf, totals)]


def integrate(spd):
    return [sum(s * c[axis] * weight for s, c, weight in zip(spd, cmf, weights)) for axis in range(3)]


def unit_y(spd, y=1):
    scale = y / integrate(spd)[1]
    return [s * scale for s in spd]


def gaussian(w, center, sigma):
    return math.exp(-0.5 * ((w - center) / sigma) ** 2)


def fit_spectrum(base, x, y, luminance):
    """Positive exponential tilt of a synthetic base, matching its CIE xy moments.

    Minimize relative entropy to the base distribution under the two xy moment
    constraints. Newton covariance Hessian + backtracking; no negative power.
    """
    logs = [math.log(max(1e-100, b * c * weight)) for b, c, weight in zip(base, totals, weights)]
    a = b = 0.0

    def distribution(a, b):
        values = [log + a * cx + b * cy for log, (cx, cy) in zip(logs, coords)]
        offset = max(values)
        exp = [math.exp(v - offset) for v in values]
        total = sum(exp)
        p = [v / total for v in exp]
        return p, offset + math.log(total) - a * x - b * y

    for _ in range(200):
        p, cost = distribution(a, b)
        mx = sum(q * xy[0] for q, xy in zip(p, coords))
        my = sum(q * xy[1] for q, xy in zip(p, coords))
        gx, gy = mx - x, my - y
        if math.hypot(gx, gy) < 1e-12:
            break
        xx = sum(q * (xy[0] - mx) ** 2 for q, xy in zip(p, coords)) + 1e-14
        yy = sum(q * (xy[1] - my) ** 2 for q, xy in zip(p, coords)) + 1e-14
        cross = sum(q * (xy[0] - mx) * (xy[1] - my) for q, xy in zip(p, coords))
        determinant = xx * yy - cross * cross
        da = (yy * gx - cross * gy) / determinant
        db = (xx * gy - cross * gx) / determinant
        step = min(1, 100 / max(1, abs(da), abs(db)))
        while step > 1e-10:
            if distribution(a - step * da, b - step * db)[1] <= cost + 1e-14:
                break
            step *= 0.5
        a -= step * da
        b -= step * db
    p, _ = distribution(a, b)
    spd = unit_y([q / (c * weight) for q, c, weight in zip(p, totals, weights)], luminance)
    xyz = integrate(spd)
    assert abs(xyz[0] / sum(xyz) - x) < 1e-8
    assert abs(xyz[1] / sum(xyz) - y) < 1e-8
    return [float(f'{v:.12g}') for v in spd]


d65_path = verified('rgb-lab-d65.csv', '03d4eb9b837c60671627c946fb534deb')
d65_rows = {int(r[0]): float(r[1]) for r in rows(d65_path)}
d65 = unit_y([d65_rows[w] for w in WAVES])
materials_path = verified('rgb-lab-materials.csv', '11ef0bcbfaea43f1143ac40fbf52d7ff')
material_rows = rows(materials_path)
assert [int(r[0]) for r in material_rows] == WAVES


def linear_rgb(xyz):
    x, y, z = xyz
    return [3.2409699419045226*x-1.537383177570094*y-0.4986107602930034*z,
            -0.9692436362808796*x+1.8759675015077202*y+0.0415550574071756*z,
            0.0556300796969937*x-0.2039769588889765*y+1.0569715142428786*z]


candidates = []
for col in range(1, 100):
    spectrum = [float(r[col]) for r in material_rows]
    rgb = linear_rgb(integrate([s*r for s, r in zip(d65, spectrum)]))
    normalized = [max(0, v) / max(rgb) for v in rgb]
    candidates.append((col, spectrum, normalized))
materials = []
for name, target in [('Red', [1, 0.04, 0.03]), ('Orange', [1, 0.3, 0.03]), ('Yellow', [1, 0.8, 0.04]), ('Green', [0.07, 1, 0.09]), ('Blue', [0.03, 0.09, 1])]:
    chosen = min(candidates, key=lambda c: sum((a-b)**2 for a, b in zip(c[2], target)))
    col, spectrum, _ = chosen
    materials.append({'id': f'ces-{col}', 'name': name, 'source': f'CIE CES {col:02}', 'reflectance': spectrum})
    candidates.remove(chosen)
materials.append({'id': 'gray', 'name': 'Gray', 'source': 'Ideal 18% reflector', 'reflectance': [0.18]*81})

skin_path = SOURCE / 'rgb-lab-skin.txt'
assert hashlib.sha256(skin_path.read_bytes()).hexdigest() == 'ce9aac735d9d83b4b874b98d45f1ebda682cdc0e652f804efe00ab2fce0c25d9', 'NIST source checksum'
skin_rows = [r for r in rows(skin_path)[8:] if r and r[0].strip()]
skin_waves = [float(r[0]) for r in skin_rows]


def interpolate_skin(w, column):
    j = bisect.bisect_left(skin_waves, w)
    if skin_waves[j] == w:
        return float(skin_rows[j][column])
    t = (w - skin_waves[j-1]) / (skin_waves[j] - skin_waves[j-1])
    return float(skin_rows[j-1][column])*(1-t) + float(skin_rows[j][column])*t


skins = []
for subject in range(1, 101):
    spectrum = [interpolate_skin(w, subject*4) for w in WAVES]
    luminance = integrate([s*r for s, r in zip(d65, spectrum)])[1]
    skins.append((luminance, subject, spectrum))
skins.sort()
selected_skins = []
# Keep a wide measured range, with a warmer example near the light end.
# Choose the middle example by perceptual lightness, not the population median:
# the measured cohort is unevenly distributed in reflectance.
def lightness(sample):
    return 116 * sample[0] ** (1 / 3) - 16


midpoint = (lightness(skins[0]) + lightness(skins[-1])) / 2
middle = min(range(len(skins)), key=lambda i: abs(lightness(skins[i]) - midpoint))
reference_white = integrate(d65)


def redness(sample):
    xyz = integrate([s * r for s, r in zip(d65, sample[2])])
    return 500 * ((xyz[0] / reference_white[0]) ** (1 / 3) - (xyz[1] / reference_white[1]) ** (1 / 3))


# Among measured examples within 3 L* of the brightest one, choose the largest
# D65 a* (redward chroma). Do not tint or rescale any measured spectrum.
light_max_delta_l = 3
light_candidates = [i for i, sample in enumerate(skins) if lightness(sample) >= lightness(skins[-1]) - light_max_delta_l]
light = max(light_candidates, key=lambda i: redness(skins[i]))
skin_ranks = [0, middle, light]
for label, index in zip(['Dark', 'Medium', 'Light'], skin_ranks):
    _, subject, spectrum = skins[index]
    selected_skins.append({'id': f'nist-{subject}', 'name': label, 'source': f'NIST subject {subject}, average', 'reflectance': [round(v, 8) for v in spectrum]})

emitters = {}
for key, center, sigma, x, y, luminance in [
    ('red', 630, 10, .69, .305, .22), ('green', 530, 12, .17, .72, .70),
    ('blue', 450, 9, .145, .045, .08), ('amber', 590, 14, .565, .425, .45),
]:
    emitters[key] = fit_spectrum([gaussian(w, center, sigma) for w in WAVES], x, y, luminance)
white_base = [0.8*gaussian(w, 450, 10)+gaussian(w, 570, 65)+0.3*gaussian(w, 620, 40) for w in WAVES]
mint_base = [0.25*gaussian(w, 450, 10)+gaussian(w, 540, 55) for w in WAVES]
emitters['mint'] = fit_spectrum(mint_base, .385, .52, .8)
for kelvin, x, y in [(2700, .4593, .4107), (3200, .4232, .3991), (4000, .3805, .3767), (5600, .3302, .3457), (6500, .3127, .3290)]:
    emitters[f'white-{kelvin}'] = fit_spectrum(white_base, x, y, 1)

data = {'start': 380, 'step': 5, 'cmf': cmf, 'd65': [float(f'{v:.12g}') for v in d65], 'emitters': emitters, 'skins': selected_skins, 'materials': materials,
        'skinSourceSHA256': hashlib.sha256(skin_path.read_bytes()).hexdigest(),
        'skinSelection': {'method': 'Dark: minimum D65 L*; Medium: nearest full-range L* midpoint; Light: maximum a* near bright end',
                          'lightMaxDeltaL': light_max_delta_l, 'ranks': [i + 1 for i in skin_ranks]}}
out = '// Generated by scripts/build-surface-data.py. See README.md for data licenses.\n'
out += 'export const SURFACE_DATA = '+json.dumps(data, separators=(',', ':'))+';\n'
(ROOT / 'src/data/surface-data.ts').write_text(out)
for name, path in [('CIE_std_illum_D65.csv', d65_path), ('CIE_srf_cfi.csv', materials_path)]:
    (ROOT / 'src/data' / name).write_bytes(path.read_bytes())
for source, target in [('rgb-lab-d65-metadata.json', 'CIE_std_illum_D65.csv_metadata.json'), ('rgb-lab-materials-metadata.json', 'CIE_srf_cfi.csv_metadata.json')]:
    (ROOT / 'src/data' / target).write_bytes((SOURCE / source).read_bytes())
print('Materials:', [(m['name'], m['source']) for m in materials])
print('Skins:', [(s['name'], s['source']) for s in selected_skins])
print('Generated spectral models:', list(emitters))
