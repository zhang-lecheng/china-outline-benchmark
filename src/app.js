import "./styles.css";
import { validateOutline } from "./geometry.js";
import { scoreOutlines } from "./score.js";
import { createMap, COLORS } from "./map.js";
import { referenceOutline, referenceFingerprint } from "./reference-id.js";
import { CONFIG } from "./config.js";
import bundledReference from "../data/china-mainland-reference.geojson?raw";

const app = document.querySelector("#app");
app.innerHTML = `<div class="shell"><header class="topbar"><div class="brand"><span class="brandmark">◈</span> Outline Benchmark</div><div class="topright"><a href="https://github.com/zhang-lecheng/china-outline-benchmark/blob/main/docs/data-provenance.md">Source ↗</a> &nbsp; / &nbsp; <a href="https://github.com/zhang-lecheng/china-outline-benchmark/blob/main/docs/methodology.md">Methodology ↗</a></div></header>
<section class="hero"><div><h1>China Outline Reconstruction Benchmark</h1><p>How accurately can language models reconstruct China’s mainland geography from memory?</p></div></section>
<div class="layout"><aside class="panel sidebar"><div><div class="section-head"><h2>Submit an outline</h2></div><p class="desc">Add a model’s reconstructed boundary to compare it against the active reference.</p><label class="field-label" for="model-name">Model name</label><input id="model-name" type="text" placeholder="e.g. Model A"><label class="field-label" for="candidate-file">Outline JSON</label><label class="upload">↑ &nbsp; Choose a JSON file<input id="candidate-file" type="file" accept=".json,application/json"></label><div id="candidate-file-name" class="file-name"></div><div class="or">— OR PASTE JSON —</div><textarea id="candidate-json" aria-label="Paste outline JSON" spellcheck="false" placeholder='{"crs":"EPSG:4326", "region":"mainland_china", "orientation":"CCW", "points":[...]}'></textarea><button class="button full" id="add-model">Evaluate &nbsp; →</button><div id="error" class="error" role="alert"></div><p class="small">WGS84 longitude/latitude pairs. Provide one simple, counterclockwise closed ring with 3–500 vertices. Data is evaluated as submitted.</p></div><div class="divider"></div><div><div class="section-head"><h2>Reference boundary</h2></div><div class="reference-status"><span class="dot"></span><div><strong id="ref-name">Approximate reference · Natural Earth</strong><span id="ref-desc">Natural Earth 1:10m Admin 0, China POV 5.1.1. Approximation; not an official 2023 PRC standard map.</span></div></div><label class="upload">↑ &nbsp; Load reference GeoJSON or JSON<input id="reference-file" type="file" accept=".geojson,.json,application/geo+json,application/json"></label><button class="button secondary full" id="demo-button">Use fictional synthetic demo</button><button class="button outline full" id="default-reference">Use Natural Earth reference</button><label class="small"><input type="checkbox" id="reference-visible" checked> Show reference on map</label><p class="small">Import a GeoJSON Polygon or use the outline JSON format. Keep the same reference for all compared models.</p></div></aside>
<main class="main"><section class="panel map-panel"><div class="map-top"><div><h2>Boundary comparison</h2><p>Drag to pan · Use controls to zoom · Hover for coordinates</p></div><div class="tabs" id="view-mode" aria-label="Map display mode"><button data-mode="overlay" class="active">Overlay</button><button data-mode="difference">Difference</button><button data-mode="boundary">Boundary error</button></div><span class="tag" id="map-tag">APPROXIMATE REFERENCE</span></div><div class="map-wrap"><div class="map-controls"><button data-zoom="in" aria-label="Zoom in">+</button><button data-zoom="out" aria-label="Zoom out">−</button><button data-zoom="reset" aria-label="Reset map view">⌂</button></div></div><div class="map-foot"><div class="legend" id="legend"></div><div class="coords">MOVE OVER MAP FOR COORDINATES</div></div></section>
<div class="toolbar"><div><h2>Model comparison</h2><p>Sorted by overall score · Higher is better</p></div><div class="actions"><button class="button outline" id="export-csv">↓ &nbsp; Export CSV</button><button class="button outline" id="export-json">↓ &nbsp; Export JSON</button></div></div><section class="panel results"><table><thead><tr><th>Rank</th><th>Model / overlay</th><th>Score / 100</th><th>Mean error</th><th>95th % error</th><th>Area IoU</th><th></th></tr></thead><tbody id="rows"></tbody></table><div class="empty" id="empty">No outlines yet. Add a model to start comparing.</div></section>
<section class="panel score-detail" id="score-detail"><h3>Selected model details</h3><p>Select a model row to inspect its diagnostics.</p></section><div class="method"><article class="panel"><h3>Reading the map</h3><p>Difference shades the symmetric difference between each visible outline and the reference. Boundary error shows sampled candidate-boundary points sized by distance from the reference; distance statistics appear in the table. Multiple visible differences may overlap.</p></article><article class="panel"><h3>About the score</h3><p>Compares absolute geographic position and shape using symmetric boundary distances and area intersection over union. No alignment or fitting is applied. Scores are meaningful only for the same reference.</p></article></div></main></div></div>`;
const $ = (s) => document.querySelector(s);
// Fictional geometry intentionally bears no geographic resemblance to mainland China.
const demo = {
  crs: "EPSG:4326",
  region: "mainland_china",
  orientation: "CCW",
  points: [
    [88, 25],
    [108, 23],
    [120, 30],
    [116, 42],
    [102, 46],
    [90, 39],
    [88, 25],
  ],
};
const natural = referenceOutline(JSON.parse(bundledReference));
let reference = natural,
  referenceName = "Approximate reference · Natural Earth",
  models = [],
  fingerprint = "pending",
  selectedId = null,
  referenceVisible = true;
const map = createMap(
  $(".map-wrap"),
  () => (referenceVisible ? reference : null),
  () => models,
);
async function updateFingerprint() {
  const current = reference;
  fingerprint = "pending";
  try {
    const value = await referenceFingerprint(current.points);
    if (reference === current) fingerprint = value;
  } catch {
    if (reference === current) fingerprint = "unavailable";
  }
}
updateFingerprint();
function escapeHTML(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function render() {
  models.sort((a, b) => b.result.score - a.result.score);
  $("#rows").innerHTML = models
    .map(
      (m, i) =>
        `<tr data-id="${m.id}" tabindex="0"><td class="rank">${String(i + 1).padStart(2, "0")}</td><td><div class="model-cell"><span class="model-dot" style="background:${m.color}"></span><strong>${escapeHTML(m.name)}</strong></div></td><td><span class="score">${m.result.score.toFixed(2)}</span></td><td>${m.result.metrics.meanDistanceKm.toFixed(1)} km</td><td>${m.result.metrics.hd95Km.toFixed(1)} km</td><td>${(m.result.metrics.iou * 100).toFixed(1)}%</td><td><label><input class="toggle" type="checkbox" data-id="${m.id}" ${m.visible ? "checked" : ""} aria-label="Show ${escapeHTML(m.name)} on map"> Show</label> &nbsp; <button class="remove button outline" data-id="${m.id}" aria-label="Remove ${escapeHTML(m.name)}">×</button></td></tr>`,
    )
    .join("");
  $("#empty").hidden = !!models.length;
  $("#legend").innerHTML =
    `<span class="legend-item"><span class="swatch"></span> Reference</span>` +
    models
      .filter((m) => m.visible)
      .map(
        (m) =>
          `<span class="legend-item"><span class="swatch" style="background:${m.color}"></span>${escapeHTML(m.name)}</span>`,
      )
      .join("");
  map.draw();
  const selected = models.find((m) => m.id === selectedId);
  $("#score-detail").innerHTML = selected
    ? `<h3>${escapeHTML(selected.name)} · diagnostics</h3><p>Sampled maximum boundary error: <strong>${selected.result.metrics.maxDistanceKm.toFixed(1)} km</strong> · Submitted vertices: <strong>${selected.data.points.length - 1}</strong> · Topology: <strong>valid simple closed ring</strong></p>`
    : "<h3>Selected model details</h3><p>Select a model row to inspect its diagnostics.</p>";
}
function check(data, isReference = false) {
  const v = validateOutline(data, isReference ? { maxVertices: CONFIG.maxReferenceVertices } : {});
  if (!v.valid) throw Error(v.errors.join(" "));
  return data;
}
function setReference(data, name, isDemo = false) {
  data = referenceOutline(data);
  check(data, true);
  const rescored = models.map((m) => ({
    ...m,
    result: scoreOutlines(m.data, data),
  }));
  reference = data;
  referenceName = name;
  models = rescored;
  $("#ref-name").textContent = name;
  $("#ref-desc").textContent = isDemo
    ? "Fictional geometry, not a map of China. Results are illustrative only."
    : data === natural
      ? "Natural Earth 1:10m Admin 0, China POV 5.1.1. Approximation; not an official 2023 PRC standard map."
      : "User-supplied reference. Verify its source and geographic scope.";
  $("#map-tag").textContent = isDemo
    ? "SYNTHETIC DEMO"
    : data === natural
      ? "APPROXIMATE REFERENCE"
      : "USER-SUPPLIED REFERENCE";
  updateFingerprint();
  render();
}
$("#candidate-file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    check(JSON.parse(text));
    $("#candidate-json").value = text;
    $("#candidate-file-name").textContent = file.name;
    $("#error").textContent = "";
  } catch (err) {
    $("#error").textContent = "Candidate: " + err.message;
    e.target.value = "";
  }
};
$("#add-model").onclick = () => {
  try {
    let data = check(JSON.parse($("#candidate-json").value)),
      name = $("#model-name").value.trim() || `Model ${models.length + 1}`;
    models.push({
      id: crypto.randomUUID(),
      name,
      data,
      color: COLORS[models.length % COLORS.length],
      visible: true,
      result: scoreOutlines(data, reference),
    });
    selectedId = models.at(-1).id;
    $("#error").textContent = "";
    $("#candidate-json").value = "";
    $("#model-name").value = "";
    $("#candidate-file").value = "";
    $("#candidate-file-name").textContent = "";
    render();
  } catch (e) {
    $("#error").textContent =
      e instanceof SyntaxError ? "Invalid JSON: " + e.message : e.message;
  }
};
$("#reference-file").onchange = async (e) => {
  try {
    let file = e.target.files[0];
    if (file) setReference(JSON.parse(await file.text()), file.name);
    $("#error").textContent = "";
  } catch (err) {
    $("#error").textContent = "Reference: " + err.message;
  }
  e.target.value = "";
};
$("#demo-button").onclick = () =>
  setReference(demo, "Synthetic demonstration", true);
$("#default-reference").onclick = () =>
  setReference(natural, "Approximate reference · Natural Earth");
$("#reference-visible").onchange = (e) => {
  referenceVisible = e.target.checked;
  map.draw();
};
$("#rows").onkeydown = (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr")) {
    e.preventDefault();
    selectedId = e.target.dataset.id;
    render();
  }
};
$("#rows").onchange = (e) => {
  if (e.target.matches(".toggle")) {
    let m = models.find((x) => x.id === e.target.dataset.id);
    if (m) m.visible = e.target.checked;
    render();
  }
};
$("#rows").onclick = (e) => {
  let b = e.target.closest(".remove");
  if (b) {
    models = models.filter((x) => x.id !== b.dataset.id);
    if (selectedId === b.dataset.id) selectedId = null;
    render();
    return;
  }
  let row = e.target.closest("tr");
  if (row && !e.target.closest("label")) {
    selectedId = row.dataset.id;
    render();
  }
};
$("#view-mode").onclick = (e) => {
  let b = e.target.closest("[data-mode]");
  if (b) {
    document
      .querySelectorAll("[data-mode]")
      .forEach((x) => x.classList.toggle("active", x === b));
    map.setMode(b.dataset.mode);
  }
};
function download(name, data, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("#export-json").onclick = async () => {
  await updateFingerprint();
  download(
    "benchmark-results.json",
    JSON.stringify(
      {
        scoringVersion: CONFIG.version,
        reference: {
          name: referenceName,
          fingerprint,
          geometry: reference,
          synthetic: reference === demo,
        },
        results: models.map(({ name, data, result }) => ({
          name,
          input: data,
          ...result,
        })),
      },
      null,
      2,
    ),
    "application/json",
  );
};
$("#export-csv").onclick = async () => {
  await updateFingerprint();
  const q = (x) => {
    let v = String(x);
    if (/^[\s]*[=+@\-\t\r]/.test(v)) v = "'" + v;
    return '"' + v.replace(/"/g, '""') + '"';
  };
  let rows = [
    [
      "rank",
      "model",
      "score",
      "mean_distance_km",
      "hd95_km",
      "max_distance_km",
      "area_iou",
      "symmetric_difference_km2",
      "reference",
      "reference_fingerprint",
      "synthetic_reference",
      "scoring_version",
    ],
    ...models.map((m, i) => [
      i + 1,
      m.name,
      m.result.score,
      m.result.metrics.meanDistanceKm,
      m.result.metrics.hd95Km,
      m.result.metrics.maxDistanceKm,
      m.result.metrics.iou,
      m.result.metrics.symmetricDifferenceKm2,
      referenceName,
      fingerprint,
      reference === demo,
      CONFIG.version,
    ]),
  ];
  download(
    "benchmark-results.csv",
    rows.map((r) => r.map(q).join(",")).join("\n"),
    "text/csv",
  );
};
render();
