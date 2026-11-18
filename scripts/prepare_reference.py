#!/usr/bin/env python3
"""Build the approximate mainland-only benchmark from Natural Earth 5.1.1.

Requires GDAL's ogr2ogr and Shapely 1.8+; download the pinned ZIP separately.
"""
import argparse
import hashlib
import json
import subprocess
import tempfile
import zipfile
from pathlib import Path

from shapely.geometry import LineString, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import nearest_points, unary_union

SHA256 = '16e7589083527d01208b9f645fc8643c767170258e9d13b59d37bc5a1f6a8758'
NAMES = ('China', 'Hong Kong S.A.R.', 'Macao S.A.R')

def largest(g):
    return max(g.geoms, key=lambda x: x.area) if g.geom_type == 'MultiPolygon' else g

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('archive', type=Path, help='Natural Earth 10m countries China POV ZIP, version 5.1.1')
    ap.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'data/china-mainland-reference.geojson')
    args = ap.parse_args()
    digest = hashlib.sha256(args.archive.read_bytes()).hexdigest()
    if digest != SHA256:
        raise SystemExit(f'Unexpected archive SHA-256: {digest}')
    with tempfile.TemporaryDirectory() as td:
        with zipfile.ZipFile(args.archive) as z:
            # Extract only the expected shapefile sidecars.
            for name in z.namelist():
                if Path(name).name.startswith('ne_10m_admin_0_countries_chn.') and not Path(name).is_absolute() and '..' not in Path(name).parts:
                    z.extract(name, td)
        shp = next(Path(td).rglob('ne_10m_admin_0_countries_chn.shp'))
        out = Path(td) / 'all.geojson'
        subprocess.run(['ogr2ogr', '-f', 'GeoJSON', str(out), str(shp)], check=True)
        features = json.loads(out.read_text())['features']
    records = {f['properties']['ADMIN']: shape(f['geometry']) for f in features if f['properties']['ADMIN'] in NAMES}
    if set(records) != set(NAMES):
        raise SystemExit(f'Missing expected features: {set(NAMES) - set(records)}')
    mainland = largest(records['China'])
    hong_kong = largest(records['Hong Kong S.A.R.'])
    macao_parts = records['Macao S.A.R']
    macao = min(macao_parts.geoms, key=lambda x: x.distance(mainland))
    joined = unary_union([mainland, hong_kong])
    joined = largest(joined)
    p, q = nearest_points(joined, macao)
    # NE's Macao peninsula is separated by a ~0.00074-degree digitization gap.
    # A 0.0005-degree radius bridge deliberately closes only that gap.
    if not 0 < p.distance(q) < 0.001:
        raise SystemExit(f'Unexpected Macao gap: {p.distance(q)} degrees')
    bridge = LineString([p, q]).buffer(0.0005)
    merged = unary_union([joined, macao, bridge])
    if merged.geom_type != 'Polygon' or not merged.is_valid:
        raise SystemExit('Expected one valid connected mainland polygon')
    # Exterior only: exclude holes and all disconnected islands.
    merged = orient(merged, sign=1.0)
    feature = {'type': 'Feature', 'properties': {'name': 'China mainland (approximate)', 'source': 'Natural Earth 1:10m Admin 0 Countries China POV 5.1.1', 'status': 'Approximation; not an official 2023 PRC standard map'}, 'geometry': {'type': 'Polygon', 'coordinates': [mapping(merged)['coordinates'][0]]}}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(feature, separators=(',', ':')) + '\n')
    print(f'{args.output}: {len(feature["geometry"]["coordinates"][0])} coordinates; Macao bridge {p.distance(q):.8f} degrees')

if __name__ == '__main__':
    main()
