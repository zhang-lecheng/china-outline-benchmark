import reference from "../data/china-feature-reference.json" with { type: "json" };
import { directedBoundaryErrors, sphericalRing } from "./spherical.js";
import { CONFIG } from "./config.js";

export const featureReference = reference;
const mean = (values) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const radians = Math.PI / 180;
function distance([lon, lat], [targetLon, targetLat]) {
  const h =
    Math.sin(((lat - targetLat) * radians) / 2) ** 2 +
    Math.cos(lat * radians) *
      Math.cos(targetLat * radians) *
      Math.sin(((lon - targetLon) * radians) / 2) ** 2;
  return 2 * CONFIG.earthRadiusKm * Math.asin(Math.sqrt(Math.min(1, h)));
}
const regionSuffix =
  /(?:特别行政区|维吾尔自治区|回族自治区|壮族自治区|自治区|省|市)$/u;
const cityKey = (value) =>
  value.normalize("NFKC").toLowerCase().replace(/市$/u, "");

function validPoint(point) {
  return (
    Array.isArray(point) &&
    point.length === 2 &&
    point.every(Number.isFinite) &&
    Math.abs(point[0]) <= 180 &&
    Math.abs(point[1]) <= 90
  );
}

export function scoreFeatures(data) {
  if (!data.rivers && !data.cities) return null;
  if (
    data.rivers !== undefined &&
    (!data.rivers ||
      typeof data.rivers !== "object" ||
      Array.isArray(data.rivers) ||
      Object.keys(data.rivers).some(
        (name) => !Object.hasOwn(reference.rivers, name),
      ))
  ) {
    throw new Error("Rivers must use the YANGTZE and YELLOW names.");
  }
  if (
    data.cities !== undefined &&
    (!Array.isArray(data.cities) ||
      data.cities.length > reference.cities.length)
  ) {
    throw new Error("Cities must be a list of up to 32 entries.");
  }
  const rivers = {};
  for (const [name, points] of Object.entries(reference.rivers)) {
    const candidate = data.rivers?.[name];
    if (candidate === undefined) continue;
    if (
      !Array.isArray(candidate) ||
      candidate.length < 2 ||
      candidate.length > 20000 ||
      !candidate.every(validPoint)
    )
      throw new Error("Invalid " + name + " river coordinates.");
    const a = sphericalRing(candidate);
    const b = sphericalRing(points);
    if (!a.length) throw new Error(name + " has no measurable river length.");
    const errors = [
      ...directedBoundaryErrors(a, b),
      ...directedBoundaryErrors(b, a),
    ]
      .map(({ distanceKm }) => distanceKm)
      .sort((x, y) => x - y);
    rivers[name] = {
      meanKm: mean(errors),
      hd95Km: errors[Math.ceil(errors.length * 0.95) - 1],
      sourceKm: distance(candidate[0], points[0]),
      mouthKm: distance(candidate.at(-1), points.at(-1)),
    };
  }
  const cities = data.cities ?? [];
  const submitted = new Map();
  const expected = new Map(reference.cities.map((city) => [city.region, city]));
  for (const entry of cities) {
    if (
      !entry ||
      typeof entry.region !== "string" ||
      typeof entry.city !== "string" ||
      !validPoint(entry.point)
    ) {
      throw new Error("Invalid city name or coordinates.");
    }
    const region = entry.region.replace(regionSuffix, "");
    if (!expected.has(region))
      throw new Error("Unknown or excluded region: " + entry.region);
    if (submitted.has(region))
      throw new Error("Repeated city region: " + entry.region);
    submitted.set(region, entry);
  }
  const cityResults = reference.cities.map(({ region, city, name, point }) => {
    const entry = submitted.get(region);
    const correct =
      entry && [cityKey(city), cityKey(name)].includes(cityKey(entry.city));
    return {
      region,
      city,
      status: !entry ? "missing" : correct ? "matched" : "wrong-city",
      distanceKm: correct ? distance(entry.point, point) : null,
    };
  });
  const distances = cityResults.flatMap((row) =>
    row.distanceKm === null ? [] : [row.distanceKm],
  );
  return {
    referenceVersion: reference.version,
    rivers,
    cities: {
      matched: distances.length,
      expected: reference.cities.length,
      meanKm: distances.length ? mean(distances) : null,
      details: cityResults,
    },
  };
}
