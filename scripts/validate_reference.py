#!/usr/bin/env python3
"""Smoke-check the reference's topology, bounds, and representative locations."""
import json
import math
from pathlib import Path
from shapely.geometry import Point, shape

path = Path(__file__).resolve().parents[1] / 'data/china-mainland-reference.geojson'
f = json.loads(path.read_text())
assert f['type'] == 'Feature' and f['geometry']['type'] == 'Polygon'
assert len(f['geometry']['coordinates']) == 1
ring = f['geometry']['coordinates'][0]
assert ring[0] == ring[-1] and all(len(p) == 2 and all(math.isfinite(x) for x in p) for p in ring)
g = shape(f['geometry'])
assert g.is_valid and not g.is_empty
for name, xy, expected in [('Aksai Chin', (79.5,35), True), ('eastern disputed sector', (93,28), True), ('Kowloon', (114.17,22.32), True), ('Macau peninsula', (113.54,22.2), True), ('Hainan', (109.5,19.2), False), ('Taiwan', (121,24), False), ('Hong Kong Island', (114.15,22.27), False)]:
    actual = g.covers(Point(*xy))
    assert actual == expected, f'{name}: expected {expected}, got {actual}'
print(f'Valid exterior: {len(ring)} positions, bounds {g.bounds}; 7 location checks passed')
