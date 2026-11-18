import assert from "node:assert/strict";
import test from "node:test";
import { parseCandidate } from "../src/parse-candidate.js";
import { validateOutline } from "../src/geometry.js";

test("SVG-style path recovers geographic coordinates and closes its ring", () => {
  const outline = parseCandidate("M 100,-30 101,-30\n101,-31 100,-31\nZ");
  assert.deepEqual(outline.points, [
    [100, 30],
    [101, 30],
    [101, 31],
    [100, 31],
    [100, 30],
  ]);
  assert.equal(validateOutline(outline).valid, true);
  assert.deepEqual(parseCandidate(JSON.stringify(outline)), outline);
  for (const unsupported of [
    "M 100,-30 L 101,-31 Z",
    "<path d='M 0,0 Z'/>",
    "M 100,-30",
  ]) {
    assert.throws(() => parseCandidate(unsupported));
  }
});

test("four-section benchmark scores both rivers and all 32 labeled city centers", async () => {
  const { featureReference, scoreFeatures } =
    await import("../src/score-features.js");
  const path = (points) =>
    "M " + points.map(([lon, lat]) => `${lon},${-lat}`).join(" ");
  const cities = featureReference.cities
    .map(
      ({ region, city, point }) => `${region} ${city} ${point[0]},${-point[1]}`,
    )
    .join("\n");
  const submission = parseCandidate(`OUTLINE
M 100,-30 101,-30 101,-31 100,-31 Z
YANGTZE
${path(featureReference.rivers.YANGTZE)}
YELLOW
${path(featureReference.rivers.YELLOW)}
CITIES
${cities}`);
  const result = scoreFeatures(submission);
  assert.equal(result.cities.matched, 32);
  assert.equal(result.cities.meanKm, 0);
  for (const river of Object.values(result.rivers)) {
    assert.ok(river.meanKm < 1e-6);
    assert.equal(river.sourceKm, 0);
    assert.equal(river.mouthKm, 0);
  }
  assert.equal(
    scoreFeatures({ cities: [submission.cities[0]] }).cities.matched,
    1,
  );
});

test("recovers clockwise, unclosed, and self-crossing outlines with diagnostics", async () => {
  const { readSubmission, evaluateOutline } =
    await import("../src/evaluate-candidate.js");
  const reference = parseCandidate("M 100,-30 101,-30 101,-31 100,-31 Z");
  const clockwise = readSubmission("M 100,-30 100,-31 101,-31 101,-30");
  const corrected = evaluateOutline(clockwise, reference);
  assert.equal(corrected.score, 100);
  assert.equal(corrected.originalValid, false);
  assert.equal(corrected.valid, true);
  assert.equal(clockwise.repairs.length, 2);
  const crossed = evaluateOutline(
    readSubmission("M 100,-30 101,-31 100,-31 101,-30 Z"),
    reference,
  );
  assert.equal(crossed.valid, true);
  assert.equal(crossed.originalValid, false);
  assert.ok(crossed.score > 0 && crossed.score < 100);
  const broken = readSubmission(
    "OUTLINE\nM incomplete\nCITIES\n北京 北京 116.4,-39.9",
  );
  assert.equal(evaluateOutline(broken, reference).score, 0);
  assert.equal(broken.features.cities.matched, 1);
});
