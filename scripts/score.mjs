import { scoreFeatures } from "../src/score-features.js";
import { parseCandidate } from "../src/parse-candidate.js";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { referenceFingerprint, referenceOutline } from "../src/reference-id.js";
import { CONFIG } from "../src/config.js";
import { validateOutline } from "../src/geometry.js";
import { scoreOutlines } from "../src/score.js";

const help = `Usage: npm run score -- --reference FILE [--format json|csv] [--label NAME ...] PREDICTION [...]
Specify one label per prediction or omit labels to use filenames. At least one rejected input exits with status 2 while still exporting every result.`;

function featureMetrics(candidate, format) {
  const result = scoreFeatures(candidate);
  if (!result) return {};
  if (format === "json") return { features: result };
  return {
    featureReferenceVersion: result.referenceVersion,
    citiesMatched: result.cities.matched,
    cityMeanKm: result.cities.meanKm,
    ...Object.fromEntries(
      Object.entries(result.rivers).flatMap(([name, metrics]) =>
        Object.entries(metrics).map(([key, value]) => [
          name + "_" + key,
          value,
        ]),
      ),
    ),
  };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      reference: { type: "string", short: "r" },
      format: { type: "string", default: "json" },
      label: { type: "string", multiple: true },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return console.log(help);
  if (
    !values.reference ||
    !positionals.length ||
    !["json", "csv"].includes(values.format)
  )
    throw new Error(help);
  if (values.label && values.label.length !== positionals.length)
    throw new Error("Supply one --label per prediction.");

  const source = JSON.parse(await readFile(values.reference, "utf8"));
  const reference = referenceOutline(source);
  const validation = validateOutline(reference, {
    maxVertices: CONFIG.maxReferenceVertices,
  });
  if (!validation.valid)
    throw new Error("Reference: " + validation.errors.join(" "));
  const fingerprint = await referenceFingerprint(reference.points);
  const results = [];
  for (const [index, path] of positionals.entries()) {
    const label = values.label?.[index] ?? basename(path, ".json");
    try {
      const candidate = parseCandidate(await readFile(path, "utf8"));
      const { score, metrics } = scoreOutlines(candidate, reference);
      results.push({
        label,
        valid: true,
        vertices: candidate.points.length - 1,
        ...featureMetrics(candidate, values.format),
        score,
        ...metrics,
      });
    } catch (error) {
      results.push({ label, valid: false, error: error.message });
    }
  }
  results.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const metadata = {
    scoringVersion: CONFIG.version,
    referenceFingerprint: fingerprint,
    referenceName: source.properties?.name ?? basename(values.reference),
  };
  if (values.format === "json") {
    console.log(JSON.stringify({ ...metadata, results }, null, 2));
  } else {
    const escape = (value, field) => {
      if (value == null) return "";
      if (typeof value === "number" || typeof value === "boolean") return value;
      if (
        (field === "label" || field === "referenceName") &&
        /^[\s]*[=+@\-\t\r\n]/u.test(value)
      )
        value = "'" + value;
      return '"' + String(value).replaceAll('"', '""') + '"';
    };
    const fields = [
      ...new Set([
        "label",
        "valid",
        "score",
        "vertices",
        ...Object.keys(metadata),
        ...results.flatMap(Object.keys),
      ]),
    ];
    console.log(fields.join(","));
    for (const result of results) {
      const row = { ...metadata, ...result };
      console.log(fields.map((field) => escape(row[field], field)).join(","));
    }
  }
  if (results.some((result) => !result.valid)) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
