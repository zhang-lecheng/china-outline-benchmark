import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { signedArea } from "../src/geometry.js";

const prefix = "/china-outline-benchmark/";
const liveUrl = process.env.BENCHMARK_URL;
const server = liveUrl
  ? null
  : await preview({ base: prefix, preview: { host: "127.0.0.1", port: 0 } });
const url =
  liveUrl ?? `http://127.0.0.1:${server.httpServer.address().port}${prefix}`;
const scratch = await mkdtemp(join(tmpdir(), "outline-smoke-"));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1040 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(url, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  assert.equal(
    await page.locator("h1").innerText(),
    "China Outline Reconstruction Benchmark",
  );
  await page.locator(".map-wrap svg path").first().waitFor();
  assert.match(await page.locator(".scope").innerText(), /Mainland China only/);

  const fixture = JSON.parse(
    await readFile("examples/fictional-mainland.geojson", "utf8"),
  );
  const points = fixture.geometry.coordinates[0];
  if (signedArea(points) < 0) points.reverse();
  fixture.geometry.coordinates[0] = points;
  const model = {
    crs: "EPSG:4326",
    region: "mainland_china",
    orientation: "CCW",
    points,
  };
  const shifted = {
    ...model,
    points: points.map(([lon, lat]) => [lon + 1, lat]),
  };
  const buffer = (value) => Buffer.from(JSON.stringify(value));
  const upload = (name, value) => ({
    name,
    mimeType: "application/json",
    buffer: buffer(value),
  });

  assert.match(await page.locator("#ref-name").textContent(), /Natural Earth/);
  await page.locator("#model-name").fill("Bundled reference smoke");
  const densePoints = Array.from({ length: 632 }, (_, index) => {
    const angle = (2 * Math.PI * index) / 632;
    return [105 + 4 * Math.cos(angle), 34 + 4 * Math.sin(angle)];
  });
  await page.locator("#candidate-json").fill(
    JSON.stringify({
      ...model,
      points: [...densePoints, densePoints[0]],
    }),
  );
  await page.locator("#add-model").click();
  await page.locator("#rows tr").first().waitFor();
  assert.match(await page.locator("#score-detail").textContent(), /632/);
  assert.match(
    await page.locator("#score-detail").textContent(),
    /Sampled maximum boundary error/,
  );
  await page.locator("#feature-overlay").check();
  assert.equal(await page.locator('[data-feature="reference"]').count(), 34);
  await page.locator("#feature-overlay").uncheck();
  await page.locator(".remove").click();

  await page
    .locator("#reference-file")
    .setInputFiles(upload("fictional.geojson", fixture));
  await page.waitForFunction(() =>
    document
      .querySelector("#ref-name")
      .textContent.includes("fictional.geojson"),
  );

  await page.locator("#candidate-json").fill("{");
  await page.locator("#add-model").click();
  assert.match(await page.locator("#error").textContent(), /json/i);
  await page.locator("#model-name").fill("Shifted");
  await page
    .locator("#candidate-file")
    .setInputFiles(upload("shifted.json", shifted));
  await page.waitForFunction(
    (expected) => document.querySelector("#candidate-json").value === expected,
    JSON.stringify(shifted),
  );
  await page.locator("#add-model").click();
  await page.locator("#rows tr").first().waitFor();
  await page.locator("#model-name").fill("Identity");
  await page.locator("#candidate-json").fill(
    "M " +
      points
        .slice(0, -1)
        .map(([lon, lat]) => `${lon},${-lat}`)
        .join(" ") +
      "\nZ",
  );
  await page.locator("#add-model").click();
  await page.waitForFunction(
    () => document.querySelectorAll("#rows tr").length === 2,
  );
  assert.match(
    await page.locator("#rows tr").first().textContent(),
    /Identity.*100/s,
  );

  for (const mode of ["difference", "boundary", "overlay"]) {
    await page.locator(`[data-mode="${mode}"]`).click();
  }
  await page.locator('[data-zoom="in"]').click();
  await page.locator(".map-wrap svg").hover({ position: { x: 240, y: 170 } });
  assert.match(await page.locator(".coords").textContent(), /°/);
  await page.locator(".toggle").first().uncheck();
  await page.locator(".toggle").first().check();

  await page.locator("#model-name").fill("Feature submission");
  await page.locator("#candidate-json").fill(
    "OUTLINE\nM " +
      points
        .slice(0, -1)
        .map(([lon, lat]) => `${lon},${-lat}`)
        .join(" ") +
      " Z\nYANGTZE\nM 91,-34 107,-30 122,-31\nYELLOW\nM 96,-35 110,-38 119,-38\nCITIES\n北京 北京 116.4,-39.9",
  );
  await page.locator("#add-model").click();
  assert.match(
    await page.locator("#score-detail").textContent(),
    /Cities matched 1\/32/,
  );
  assert.match(
    await page.locator("#score-detail").textContent(),
    /Yangtze.*Yellow River/s,
  );
  await page.getByRole("button", { name: "Remove Feature submission" }).click();

  const jsonPromise = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const json = JSON.parse(
    await readFile(await (await jsonPromise).path(), "utf8"),
  );
  const candidatePath = join(scratch, "shifted.json");
  await writeFile(candidatePath, JSON.stringify(shifted));
  const cli = spawnSync(
    process.execPath,
    [
      "scripts/score.mjs",
      "-r",
      "examples/fictional-mainland.geojson",
      candidatePath,
    ],
    {
      input: JSON.stringify(shifted),
      encoding: "utf8",
    },
  );
  assert.equal(cli.status, 0, cli.stderr);
  const cliScore = JSON.parse(cli.stdout).results[0].score;
  assert.ok(
    Math.abs(json.results[1].score - cliScore) <= 1e-8,
    "CLI/browser score mismatch",
  );
  assert.equal(
    json.reference.fingerprint,
    JSON.parse(cli.stdout).referenceFingerprint,
  );
  const csvPromise = page.waitForEvent("download");
  await page.locator("#export-csv").click();
  const csv = await readFile(await (await csvPromise).path(), "utf8");
  assert.match(csv, /Identity/);
  assert.match(csv, /Shifted/);

  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({
      path: `${process.env.SCREENSHOT_DIR}/benchmark-desktop.png`,
      fullPage: true,
    });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Mobile page overflows horizontally",
  );
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({
      path: `${process.env.SCREENSHOT_DIR}/benchmark-mobile.png`,
      fullPage: true,
    });
  await page.locator('[data-language="zh"]').click();
  assert.equal(await page.locator("h1").innerText(), "中国大陆轮廓重建评测");
  assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
  assert.match(await page.locator(".scope").innerText(), /仅中国大陆连续陆地/);
  assert.equal(await page.locator("#rows tr").count(), 2);
  const prompt = await page.locator("#benchmark-prompt").textContent();
  assert.match(prompt, /每行 25 对坐标/);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("#copy-prompt").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#copy-status").textContent === "已复制到剪贴板。",
  );
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    prompt,
  );
  await page.locator('[data-language="en"]').click();
  assert.match(
    await page.locator("#benchmark-prompt").textContent(),
    /25 space-separated coordinate pairs per line/,
  );
  assert.deepEqual(errors, []);
  console.log(
    `Browser smoke passed at ${url}: file/paste, rejection, ranking, map controls, CSV/JSON, mobile, CLI parity, 632 vertices, bilingual map scope, prompt copying.`,
  );
} finally {
  await browser.close();
  await rm(scratch, { recursive: true, force: true });
  if (server) {
    const closed = once(server.httpServer, "close");
    server.httpServer.close();
    await closed;
  }
}
