import assert from "node:assert/strict";
import test from "node:test";
import { parseCandidate } from "../src/parse-candidate.js";
import { validateOutline } from "../src/geometry.js";

test("SVG-style path recovers geographic coordinates and closes its ring", () => {
  const outline = parseCandidate("M 100,-30 101,-30\n101,-31 100,-31\nZ");
  assert.deepEqual(outline.points, [[100, 30], [101, 30], [101, 31], [100, 31], [100, 30]]);
  assert.equal(validateOutline(outline).valid, true);
  assert.deepEqual(parseCandidate(JSON.stringify(outline)), outline);
  for (const unsupported of ["M 100,-30 L 101,-31 Z", "<path d='M 0,0 Z'/>", "M 100,-30"]) {
    assert.throws(() => parseCandidate(unsupported));
  }
});
