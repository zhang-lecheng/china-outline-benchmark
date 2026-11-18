# China Outline Reconstruction Benchmark

[Open the benchmark](https://zhang-lecheng.github.io/china-outline-benchmark/)

A browser and command-line tool for comparing mainland outlines reconstructed by language models from memory. Both call the same JavaScript scoring module. The website processes files locally in the browser.

**Reference status.** The bundled outline uses Natural Earth 1:10m Admin 0 Countries China POV v5.1.1 (public domain). It is a generalized approximation. Agreement with the Ministry of Natural Resources' 2023 standard map has not been established. The website also accepts a separately sourced reference without uploading it. See [data provenance](docs/data-provenance.md) for scope, licensing, generation and the small synthetic connector at Macao.

## Evaluate outlines

The website has [English](https://zhang-lecheng.github.io/china-outline-benchmark/) and [简体中文](https://zhang-lecheng.github.io/china-outline-benchmark/?lang=zh) interfaces. The bottom of the page offers a one-click copy of the [Chinese benchmark prompt](docs/benchmark-prompt-zh.md) or its [English translation](docs/benchmark-prompt-en.md).

1. Open the benchmark and choose the reference. Use the same reference for every prediction in a comparison.
2. Enter the model name, then upload a path text file or a JSON file, or paste the outline. Select **Evaluate** and repeat for each model.
3. Select a row to inspect metrics. Use **Overlay**, **Difference** or **Boundary error** to examine the shape and location of discrepancies. Export CSV or JSON to keep the reference fingerprint and scores together.

Model names are display labels. Keep rejected submissions in your experimental record and report the pass rate separately. The task prompt asks models for at most 20 lines of 25 distinct vertices. The evaluator accepts longer simple rings up to a 20,000-vertex processing limit. Compare submission lengths alongside scores when evaluating adherence to the original task. The repository examples and perturbation report are synthetic.

### SVG-style input

Paste a single absolute linear path using WGS84 longitude and **negative** latitude. One coordinate pair follows another, separated by whitespace. End with `Z` for closure. The evaluator also accepts this format from a `.txt` file. This square illustrates the syntax:

```text
M 100,-30 101,-30 101,-31 100,-31
Z
```

### Input JSON

```json
{
  "crs": "EPSG:4326",
  "region": "mainland_china",
  "orientation": "CCW",
  "points": [[100, 30], [101, 30], [101, 31], [100, 31], [100, 30]]
}
```

The square illustrates formatting. Use finite WGS84 longitude/latitude pairs, one simple counterclockwise exterior, 3–20,000 distinct vertices, and an exact copy of the first point at the end. Holes, repeated interior vertices, self-intersections and overlapping edges are rejected. Reference files can also be GeoJSON with a single CCW Polygon exterior and up to 20,000 distinct vertices.

## Run locally

Use Node.js 22.12 or newer. CI runs Node.js 24.

```sh
npm ci
npm test
npm run dev
npm run build
npm run preview
```

Batch scoring against the bundled approximation:

```sh
npm run --silent score -- --reference data/china-mainland-reference.geojson \
  --label 'GPT-6.2 Sol' --label 'GPT-6.2 Astra' sol.json astra.json
```

Add `--format csv` for CSV. Invalid candidates appear with an error and no score. Exit codes are 0 for a fully valid batch, 1 for an invalid invocation or reference and 2 for one or more rejected candidates. Invoke `scoreOutlines(candidate, reference)` from [src/score.js](src/score.js) to use the same core independently. The [fictional input](examples/input-example.json) scores 100 against [its fictional reference](examples/fictional-mainland.geojson).

## Scoring v1.0.0

```text
Score = 100 × [0.50 exp(-mean / 20 km) + 0.25 exp(-HD95 / 75 km) + 0.25 IoU]
IoU   = area(intersection) / area(union)
```

Area is calculated in a spherical equal-area projection. To measure boundary error, each ring contributes 2,048 evenly spaced arclength samples. Each sample is measured against the closest point on the other ring's piecewise spherical boundary. `mean` and `HD95` are the mean and the nearest-rank 95th percentile of the combined distances. The sampled maximum is a diagnostic. There is no registration, coordinate fitting or bonus for more vertices.

See [methodology](docs/methodology.md), [fixed configuration](src/config.js) and [synthetic validation](docs/synthetic-report.md). The reference's source scale and coastal generalization limit the geographic interpretation of small distance differences. Synthetic tests check the behavior of the metric. Measuring separation between model variants requires valid, independently collected model outputs.

## Browser and deployment checks

Run `npx playwright-core install chromium` once and use `npm run test:browser` after building. Set `CHROMIUM_PATH` to use a system Chromium or `BENCHMARK_URL` to test the live site. GitHub Actions runs unit tests, builds the site, and exercises the production build under a project subpath before deploying the default branch. To deploy a fork, set **Settings → Pages → Source → GitHub Actions**.

Code is MIT-licensed. Data licensing is documented separately in [data provenance](docs/data-provenance.md).

### Rivers and provincial-level centers

Paste a four-section answer from the current benchmark prompt, or save it as a text file for the CLI. River mean error, HD95, source and mouth error, city coverage, and matched-city mean distance appear alongside the outline results. The outline score uses its existing formula. Use the map's river and city checkbox to see the references and submitted layers. See [source downloads and reproduction](docs/data-provenance.md#rivers-and-provincial-level-centers).
