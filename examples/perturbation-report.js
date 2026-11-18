// Reproducible, illustrative algorithm check using an invented outline.
import { readFileSync } from 'node:fs';
import { scoreOutlines } from '../src/score.js';
const fixture = JSON.parse(readFileSync(new URL('./fictional-mainland.geojson', import.meta.url), 'utf8'));
const ring = fixture.geometry.coordinates[0];
const v = ring.slice(0, -1);
const close = p => [...p, [...p[0]]];
const outline = points => ({ crs: 'EPSG:4326', region: 'mainland_china', orientation: 'CCW', points });
const ref = outline(ring);
let seed = 0x12345678;
const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32) - .5;
const noise = v.map(() => [random(), random()]);
const cases = {
  identical: ring,
  'shift 0.5° east/north': ring.map(([x,y]) => [x+.5,y+.5]),
  'shift 5° east/north': ring.map(([x,y]) => [x+5,y+5]),
  'scale 1.03 around 103°E, 35°N': ring.map(([x,y]) => [103+(x-103)*1.03,35+(y-35)*1.03]),
  'scale 1.30 around 103°E, 35°N': ring.map(([x,y]) => [103+(x-103)*1.3,35+(y-35)*1.3]),
  'delete four coastal vertices': close(v.filter((_,i) => ![13,15,17,19].includes(i))),
  'smooth once': close(v.map((p,i) => {const a=v[(i+v.length-1)%v.length],b=v[(i+1)%v.length];return [.25*a[0]+.5*p[0]+.25*b[0],.25*a[1]+.5*p[1]+.25*b[1]];})),
  'seeded noise ±0.1°': close(v.map(([x,y],i) => [x+noise[i][0]*.2,y+noise[i][1]*.2])),
  'seeded noise ±0.2°': close(v.map(([x,y],i) => [x+noise[i][0]*.4,y+noise[i][1]*.4]))
};
console.log('Case | Score | Mean distance (km) | HD95 (km) | IoU');
console.log('--- | ---: | ---: | ---: | ---:');
for (const [name,points] of Object.entries(cases)) {
  const {score, metrics:m}=scoreOutlines(outline(points), ref);
  console.log(`${name} | ${score.toFixed(2)} | ${m.meanDistanceKm.toFixed(2)} | ${m.hd95Km.toFixed(2)} | ${m.iou.toFixed(4)}`);
}
