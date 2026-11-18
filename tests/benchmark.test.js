import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateOutline, projectPoint, projectRing, signedArea, intersectionArea } from '../src/geometry.js';
import { sphericalRing, directedBoundaryErrors } from '../src/spherical.js';
import { CONFIG } from '../src/config.js';
import { scoreOutlines } from '../src/score.js';

// This fixture is invented for tests. It is not a real geographic boundary.
const fixture = JSON.parse(readFileSync(new URL('../examples/fictional-mainland.geojson', import.meta.url), 'utf8'));
const ring = fixture.geometry.coordinates[0];
const feature = points => ({ crs: 'EPSG:4326', region: 'mainland_china', orientation: 'CCW', points });
const reference = feature(ring);
const mapRing = fn => feature(ring.map(([x, y], i) => fn(x, y, i)));
const close = points => [...points, [...points[0]]];
const vertices = ring.slice(0, -1);
const shifted = (dx, dy) => mapRing((x, y) => [x + dx, y + dy]);
const scaled = factor => mapRing((x, y) => [103 + (x - 103) * factor, 35 + (y - 35) * factor]);
const rotateStart = offset => close([...vertices.slice(offset), ...vertices.slice(0, offset)]);
const densified = close(vertices.flatMap((p, i) => {
  const q = vertices[(i + 1) % vertices.length];
  return [p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]];
}));
const smooth = close(vertices.map((p, i) => {
  const a = vertices[(i + vertices.length - 1) % vertices.length];
  const b = vertices[(i + 1) % vertices.length];
  return [0.25 * a[0] + 0.5 * p[0] + 0.25 * b[0], 0.25 * a[1] + 0.5 * p[1] + 0.25 * b[1]];
}));
const deletedCoast = close(vertices.filter((_, i) => ![13, 15, 17, 19].includes(i)));
let seed = 0x12345678;
const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32) - 0.5;
const noisy = close(vertices.map(([x, y]) => [x + random() * 0.4, y + random() * 0.4]));
const score = candidate => scoreOutlines(candidate, reference).score;

test('fictional fixture is valid and identical outline scores at the top', () => {
  assert.equal(validateOutline(reference).valid, true);
  const result = scoreOutlines(reference, reference);
  assert.ok(Number.isFinite(result.score));
  assert.equal(result.score, 100);
  assert.equal(result.metrics.iou, 1);
});

test('invalid and degenerate geometries are rejected', () => {
  for (const input of [null, {}, { type: 'Point', coordinates: [1, 2] }, feature([]), feature([[0, 0], [1, 1], [0, 0]]), feature([[0, 0], [1, 0], [1, 1], [NaN, 0], [0, 0]])]) {
    assert.equal(validateOutline(input).valid, false, JSON.stringify(input));
  }
});

test('starting vertex does not change the result and clockwise winding is rejected', () => {
  const baseline = score(reference);
  assert.ok(Math.abs(score(feature(rotateStart(11))) - baseline) < 0.1);
  assert.equal(validateOutline(feature(close([...vertices].reverse()))).valid, false);
});

test('interpolating edges does not materially change the score', () => {
  assert.ok(score(feature(densified)) > 99, `densified score: ${score(feature(densified))}`);
});

test('larger translation and scaling perturbations score worse', () => {
  const perfect = score(reference);
  const smallShift = score(shifted(0.5, 0.5));
  const largeShift = score(shifted(5, 5));
  const smallScale = score(scaled(1.03));
  const largeScale = score(scaled(1.3));
  assert.ok(perfect > smallShift && smallShift > largeShift, `${perfect}, ${smallShift}, ${largeShift}`);
  assert.ok(perfect > smallScale && smallScale > largeScale, `${perfect}, ${smallScale}, ${largeScale}`);
});

test('local deletion, smoothing and seeded noise produce finite, reduced scores', () => {
  for (const [name, points] of [['coast deletion', deletedCoast], ['smoothing', smooth], ['noise', noisy]]) {
    const value = score(feature(points));
    assert.ok(Number.isFinite(value) && value >= 0 && value < score(reference), `${name}: ${value}`);
  }
});


test('projection, distance and overlap have expected basic properties', () => {
  const p = projectPoint([105, 35]);
  assert.ok(p.every(Number.isFinite));
  assert.ok(projectPoint([106, 35])[0] > p[0]);
  assert.ok(projectPoint([105, 36])[1] > p[1]);
  const square = [[0,0],[2,0],[2,2],[0,2],[0,0]];
  assert.equal(intersectionArea(square, square), 4);
  assert.equal(intersectionArea(square, [[1,0],[3,0],[3,2],[1,2],[1,0]]), 2);
  assert.equal(intersectionArea(square, [[3,0],[4,0],[4,1],[3,1],[3,0]]), 0);
});

test('invalid metadata, unclosed ring, crossing edges and malformed JSON are rejected', () => {
  assert.throws(() => JSON.parse('{bad json'));
  for (const bad of [
    {...reference, crs: 'EPSG:3857'}, {...reference, region: 'other'},
    {...reference, points: ring.slice(0,-1)},
    feature([[100,30],[104,34],[100,34],[104,30],[100,30]]),
    feature([[100,30],[104,30],[104,34],[100,34],[100,30],[100,30]])
  ]) {
    assert.equal(validateOutline(bad).valid, false);
    assert.throws(() => scoreOutlines(bad, reference));
  }
});


test('the 500-vertex limit is inclusive and 501 vertices are rejected', () => {
  const circle = n => close(Array.from({length:n}, (_,i) => { const a=2*Math.PI*i/n; return [105+10*Math.cos(a),35+8*Math.sin(a)]; }));
  assert.equal(validateOutline(feature(circle(500))).valid, true);
  assert.equal(validateOutline(feature(circle(501))).valid, false);
});

test('projected rectangle matches analytic spherical equal-area formula', () => {
  const rad=Math.PI/180, r=6371.0088;
  const rectangle=[[100,30],[110,30],[110,40],[100,40],[100,30]];
  const expected=r*r*10*rad*(Math.sin(40*rad)-Math.sin(30*rad));
  const actual=signedArea(projectRing(rectangle));
  assert.ok(Math.abs(actual-expected)/expected < 1e-12, `${actual} vs ${expected}`);
});

test('spherical nearest-arc distance is correct for a point projected onto the equator', () => {
  const source = sphericalRing([[0, 1], [0, 2]]);
  const equator = sphericalRing([[-1, 0], [1, 0]]);
  const result = directedBoundaryErrors(source, equator);
  assert.equal(result.length, CONFIG.boundarySamples);
  const oneDegreeKm = CONFIG.earthRadiusKm * Math.PI / 180;
  assert.ok(Math.abs(result[0].distanceKm - oneDegreeKm) < 1e-10);
  assert.ok(Math.abs(result[1].distanceKm - oneDegreeKm * (1 + 1 / result.length)) < 1e-10);
});
