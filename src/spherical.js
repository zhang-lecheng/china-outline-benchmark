import { CONFIG } from "./config.js";

const radians = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const chordSquared = (a, b) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function toVector([longitude, latitude]) {
  const lon = longitude * radians;
  const lat = latitude * radians;
  const cos = Math.cos(lat);
  return [Math.cos(lon) * cos, Math.sin(lon) * cos, Math.sin(lat)];
}

function toCoordinates([x, y, z]) {
  return [
    Math.atan2(y, x) / radians,
    Math.atan2(z, Math.hypot(x, y)) / radians,
  ];
}

export function sphericalRing(points) {
  const vertices = points.map(toVector);
  const segments = [];
  let length = 0;

  for (let i = 1; i < vertices.length; i++) {
    const start = vertices[i - 1];
    const end = vertices[i];
    const normal = cross(start, end);
    const magnitude = Math.hypot(...normal);
    if (magnitude < 1e-15) continue;
    const unitNormal = normal.map((component) => component / magnitude);
    const angle = Math.atan2(magnitude, dot(start, end));
    segments.push({
      start,
      end,
      unitNormal,
      forward: cross(unitNormal, start),
      backward: cross(end, unitNormal),
      offset: length,
      angle,
    });
    length += angle;
  }

  return { segments, length };
}

export function sphericalSamples(
  { segments, length },
  count = CONFIG.boundarySamples,
) {
  const samples = [];
  let index = 0;

  for (let i = 0; i < count; i++) {
    const position = (length * i) / count;
    while (
      index < segments.length - 1 &&
      position >= segments[index + 1].offset
    )
      index++;
    const { start, forward, offset } = segments[index];
    const theta = position - offset;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    samples.push(
      start.map((component, axis) => component * cos + forward[axis] * sin),
    );
  }

  return samples;
}

function distanceToRing(query, { segments }) {
  let best = 4;
  for (const { start, end, unitNormal, forward, backward } of segments) {
    if (dot(query, forward) >= 0 && dot(query, backward) >= 0) {
      // The closest point on the great circle lies on the minor arc.
      const normalSquared = Math.min(1, dot(query, unitNormal) ** 2);
      const chord = (2 * normalSquared) / (1 + Math.sqrt(1 - normalSquared));
      best = Math.min(best, chord);
    } else {
      best = Math.min(
        best,
        chordSquared(query, start),
        chordSquared(query, end),
      );
    }
  }
  return 2 * CONFIG.earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(best) / 2));
}

export function directedBoundaryErrors(source, target, identical = false) {
  return sphericalSamples(source).map((sample) => ({
    point: toCoordinates(sample),
    distanceKm: identical ? 0 : distanceToRing(sample, target),
  }));
}
