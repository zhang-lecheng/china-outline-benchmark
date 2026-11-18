import { CONFIG } from "./config.js";

import { orient2d } from "robust-predicates";

const cross = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const orientation = (a, b, c) => orient2d(a[0], a[1], b[0], b[1], c[0], c[1]);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const between = (a, b, c) =>
  b[0] >= Math.min(a[0], c[0]) &&
  b[0] <= Math.max(a[0], c[0]) &&
  b[1] >= Math.min(a[1], c[1]) &&
  b[1] <= Math.max(a[1], c[1]);
function intersects(a, b, c, d) {
  if (
    Math.max(a[0], b[0]) < Math.min(c[0], d[0]) ||
    Math.max(c[0], d[0]) < Math.min(a[0], b[0]) ||
    Math.max(a[1], b[1]) < Math.min(c[1], d[1]) ||
    Math.max(c[1], d[1]) < Math.min(a[1], b[1])
  )
    return false;
  const x = orientation(a, b, c),
    y = orientation(a, b, d),
    z = orientation(c, d, a),
    w = orientation(c, d, b);
  if (
    ((x > 0 && y < 0) || (x < 0 && y > 0)) &&
    ((z > 0 && w < 0) || (z < 0 && w > 0))
  )
    return true;
  return (
    (x === 0 && between(a, c, b)) ||
    (y === 0 && between(a, d, b)) ||
    (z === 0 && between(c, a, d)) ||
    (w === 0 && between(c, b, d))
  );
}
export function signedArea(points) {
  let area = 0;
  const origin = points[0];
  for (let i = 1; i < points.length - 1; i++)
    area += cross(origin, points[i], points[i + 1]);
  return area / 2;
}
export function validateOutline(input, { maxVertices = CONFIG.maxCandidateVertices } = {}) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { valid: false, errors: ["Expected a JSON object."] };
  if (input.crs !== "EPSG:4326") errors.push("crs must be EPSG:4326.");
  if (input.region !== "mainland_china")
    errors.push("region must be mainland_china.");
  if (input.orientation !== "CCW") errors.push("orientation must be CCW.");
  const p = input.points;
  if (!Array.isArray(p))
    return { valid: false, errors: [...errors, "points must be an array."] };
  if (p.length < 4 || p.length > maxVertices + 1)
    errors.push(`Provide 3–${maxVertices} vertices plus one closing point.`);
  const good = p.every(
    (q) =>
      Array.isArray(q) &&
      q.length === 2 &&
      q.every(Number.isFinite) &&
      q[0] >= -180 &&
      q[0] <= 180 &&
      q[1] >= -90 &&
      q[1] <= 90,
  );
  if (!good)
    return {
      valid: false,
      errors: [
        ...errors,
        "Each point must contain finite longitude and latitude in WGS84 ranges.",
      ],
    };
  if (p.length < 4) return { valid: false, errors };
  if (!same(p[0], p[p.length - 1]))
    errors.push("The ring must be explicitly closed.");
  const body = p.slice(0, -1),
    keys = new Set(body.map((q) => `${q[0]},${q[1]}`));
  if (keys.size !== body.length)
    errors.push("Vertices must be unique; only the closing point may repeat.");
  if (keys.size < 3)
    errors.push("At least three unique vertices are required.");
  if (signedArea(p) <= 0)
    errors.push("The ring must have nonzero area and run counterclockwise.");
  if (errors.length) return { valid: false, errors };
  let hit = false;
  const edges = body
    .map((point, index) => ({
      index,
      minX: Math.min(point[0], p[index + 1][0]),
      maxX: Math.max(point[0], p[index + 1][0]),
      minY: Math.min(point[1], p[index + 1][1]),
      maxY: Math.max(point[1], p[index + 1][1]),
    }))
    .sort((a, b) => a.minX - b.minX);
  for (let i = 0; i < edges.length && !hit; i++) {
    const a = edges[i];
    for (let j = i + 1; j < edges.length && edges[j].minX <= a.maxX; j++) {
      const b = edges[j];
      if (
        Math.abs(a.index - b.index) === 1 ||
        Math.abs(a.index - b.index) === body.length - 1 ||
        a.maxY < b.minY ||
        b.maxY < a.minY
      )
        continue;
      if (intersects(p[a.index], p[a.index + 1], p[b.index], p[b.index + 1])) {
        hit = true;
        break;
      }
    }
  }
  // Adjacent edges that reverse and overlap are invalid too.
  for (let i = 0; i < body.length && !hit; i++) {
    const a = body[(i + body.length - 1) % body.length],
      b = body[i],
      c = body[(i + 1) % body.length];
    if (orientation(a, b, c) === 0 && !between(a, b, c)) hit = true;
  }
  if (hit)
    errors.push(
      "The ring must be simple, without self-intersections or overlapping edges.",
    );
  return { valid: errors.length === 0, errors };
}

// Remove points that merely subdivide an existing lon/lat line segment. This
// makes representation changes and cyclic changes of starting point harmless.
function canonical(points) {
  let p = points.slice(0, -1).map((q) => q.slice()),
    changed = true;
  while (changed && p.length > 3) {
    changed = false;
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length],
        b = p[i],
        c = p[(i + 1) % p.length];
      if (
        Math.abs(cross(a, b, c)) <=
          1e-12 * ((c[0] - a[0]) ** 2 + (c[1] - a[1]) ** 2) &&
        between(a, b, c)
      ) {
        changed = true;
      } else q.push(b);
    }
    if (q.length < 3) break;
    p = q;
  }
  let k = 0;
  for (let i = 1; i < p.length; i++)
    if (p[i][0] < p[k][0] || (p[i][0] === p[k][0] && p[i][1] < p[k][1])) k = i;
  p = p.slice(k).concat(p.slice(0, k));
  return [...p, p[0]];
}
export function projectPoint([lon, lat]) {
  const r = CONFIG.earthRadiusKm,
    rad = Math.PI / 180,
    c = Math.cos(CONFIG.standardParallelDegrees * rad);
  return [
    r * (lon - CONFIG.centralMeridianDegrees) * rad * c,
    (r * Math.sin(lat * rad)) / c,
  ];
}
export function projectRing(points) {
  const p = canonical(points),
    out = [];
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i],
      b = p[i + 1];
    out.push(projectPoint(a));
    // Split on fixed longitude/latitude grid, approximating the curved image of
    // straight geographic edges while remaining invariant to input subdivision.
    const ts = [];
    for (let axis = 0; axis < 2; axis++) {
      let lo = Math.min(a[axis], b[axis]),
        hi = Math.max(a[axis], b[axis]);
      for (
        let v =
          Math.floor(lo / CONFIG.projectionGridDegrees + 1) *
          CONFIG.projectionGridDegrees;
        v < hi - 1e-12;
        v += CONFIG.projectionGridDegrees
      )
        ts.push((v - a[axis]) / (b[axis] - a[axis]));
    }
    ts.sort((x, y) => x - y);
    let last = -1;
    for (const t of ts)
      if (t - last > 1e-10) {
        out.push(
          projectPoint([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]),
        );
        last = t;
      }
  }
  out.push(out[0]);
  return out;
}
export function unprojectPoint([x, y]) {
  const r = CONFIG.earthRadiusKm,
    rad = Math.PI / 180,
    c = Math.cos(CONFIG.standardParallelDegrees * rad);
  return [
    x / (r * c) / rad + CONFIG.centralMeridianDegrees,
    Math.asin(Math.max(-1, Math.min(1, (y * c) / r))) / rad,
  ];
}
// Cross-sectional integration: at each slab, both rings' intersection intervals
// change linearly. Splitting at all edge crossings makes trapezoids exact for
// the projected polylines, including disjoint and multiply overlapping shapes.
export function intersectionArea(a, b) {
  const edges = (p) =>
    p
      .slice(0, -1)
      .map((v, i) => [v, p[i + 1]])
      .filter(([u, v]) => u[1] !== v[1]);
  const ea = edges(a),
    eb = edges(b),
    ys = [
      ...a.slice(0, -1).map((p) => p[1]),
      ...b.slice(0, -1).map((p) => p[1]),
    ];
  for (const [p, q] of ea)
    for (const [r, s] of eb) {
      if (
        Math.max(Math.min(p[1], q[1]), Math.min(r[1], s[1])) >=
        Math.min(Math.max(p[1], q[1]), Math.max(r[1], s[1]))
      )
        continue;
      const dx = q[0] - p[0],
        dy = q[1] - p[1],
        ex = s[0] - r[0],
        ey = s[1] - r[1],
        den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((r[0] - p[0]) * ey - (r[1] - p[1]) * ex) / den,
        u = ((r[0] - p[0]) * dy - (r[1] - p[1]) * dx) / den;
      if (t > 0 && t < 1 && u > 0 && u < 1) ys.push(p[1] + t * dy);
    }
  ys.sort((x, y) => x - y);
  const unique = ys.filter((v, i) => i === 0 || v - ys[i - 1] > 1e-9);
  // Slabs are visited in ascending y, so keep only edges that cross the
  // current scan line instead of rescanning the entire reference each time.
  function intervalScanner(edges) {
    const sorted = edges
      .map(([p, q]) => ({
        p,
        q,
        low: Math.min(p[1], q[1]),
        high: Math.max(p[1], q[1]),
      }))
      .sort((a, b) => a.low - b.low);
    let next = 0,
      active = [];
    return (y) => {
      while (next < sorted.length && sorted[next].low < y)
        active.push(sorted[next++]);
      active = active.filter((e) => e.high > y);
      const xs = active
        .map(({ p, q }) => p[0] + ((q[0] - p[0]) * (y - p[1])) / (q[1] - p[1]))
        .sort((a, b) => a - b);
      const intervals = [];
      for (let i = 0; i + 1 < xs.length; i += 2)
        intervals.push([xs[i], xs[i + 1]]);
      return intervals;
    };
  }
  const scanA = intervalScanner(ea),
    scanB = intervalScanner(eb);
  function width(y) {
    const x = scanA(y),
      z = scanB(y);
    let i = 0,
      j = 0,
      sum = 0;
    while (i < x.length && j < z.length) {
      sum += Math.max(
        0,
        Math.min(x[i][1], z[j][1]) - Math.max(x[i][0], z[j][0]),
      );
      if (x[i][1] < z[j][1]) i++;
      else j++;
    }
    return sum;
  }
  let sum = 0;
  for (let i = 0; i < unique.length - 1; i++) {
    const lo = unique[i],
      hi = unique[i + 1],
      d = hi - lo;
    if (d > 0) sum += (d * (width(lo + d * 0.25) + width(lo + d * 0.75))) / 2;
  }
  return Math.max(0, sum);
}
