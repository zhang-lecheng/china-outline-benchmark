import { parseCandidate } from "./parse-candidate.js";
import "./styles.css";
import { validateOutline } from "./geometry.js";
import { scoreOutlines } from "./score.js";
import { createMap, COLORS } from "./map.js";
import { referenceOutline, referenceFingerprint } from "./reference-id.js";
import { CONFIG } from "./config.js";
import bundledReference from "../data/china-mainland-reference.geojson?raw";

import promptZh from "../docs/benchmark-prompt-zh.md?raw";
import promptEn from "../docs/benchmark-prompt-en.md?raw";

const app = document.querySelector("#app");
const bilingual = (en, zh) =>
  `<span class="lang-en" lang="en">${en}</span><span class="lang-zh" lang="zh-CN">${zh}</span>`;
let language =
  new URLSearchParams(location.search).get("lang") === "zh" ? "zh" : "en";
const translate = (en, zh) => (language === "zh" ? zh : en);
app.innerHTML = `<div class="shell"><header class="topbar"><div class="brand"><span class="brandmark">◈</span>${bilingual("Outline Benchmark", "轮廓重建评测")}</div><div class="topright"><a href="https://github.com/zhang-lecheng/china-outline-benchmark/blob/main/docs/data-provenance.md">${bilingual("Source ↗", "数据来源 ↗")}</a> &nbsp; / &nbsp; <a href="https://github.com/zhang-lecheng/china-outline-benchmark/blob/main/docs/methodology.md">${bilingual("Methodology ↗", "评分方法 ↗")}</a><div class="languages" aria-label="Language / 语言"><button type="button" data-language="zh" lang="zh-CN">中文</button><button type="button" data-language="en" lang="en">English</button></div></div></header>
<section class="hero"><div><h1>${bilingual("China Outline Reconstruction Benchmark", "中国大陆轮廓重建评测")}</h1><p>${bilingual("How accurately can language models reconstruct China’s mainland geography from memory?", "语言模型仅凭记忆，能多准确地重建中国大陆的轮廓？")}</p></div></section>
<div class="scope"><strong>${bilingual("Mainland China only", "仅中国大陆连续陆地")}</strong><p>${bilingual("The default map traces the contiguous mainland landmass. Taiwan, Hainan and other offshore islands are outside this benchmark’s map scope.", "默认地图仅绘制中国大陆连续陆地外轮廓，台湾岛、海南岛及其他离岛不在本评测地图范围内。")}</p></div>
<div class="layout"><aside class="panel sidebar"><div><div class="section-head"><h2>${bilingual("Submit an outline", "提交轮廓")}</h2></div><p class="desc">${bilingual("Add a model’s reconstructed boundary to compare it against the active reference.", "提交模型重建的轮廓，与当前参考边界比较。")}</p><label class="field-label" for="model-name">${bilingual("Model name", "模型名称")}</label><input id="model-name" type="text" placeholder="e.g. Model A"><label class="field-label" for="candidate-file">${bilingual("Outline path or JSON", "轮廓路径或 JSON")}</label><label class="upload">${bilingual("↑ &nbsp; Choose an outline file", "↑ &nbsp; 选择轮廓文件")}<input id="candidate-file" type="file" accept=".json,.txt,application/json,text/plain"></label><div id="candidate-file-name" class="file-name"></div><div class="or">${bilingual("— OR PASTE AN OUTLINE —", "或粘贴轮廓")}</div><textarea id="candidate-json" aria-label="Paste outline JSON" spellcheck="false" placeholder="M 100,-30 101,-30 101,-31 100,-31&#10;Z"></textarea><button class="button full" id="add-model">${bilingual("Evaluate &nbsp; →", "评分 &nbsp; →")}</button><div id="error" class="error" role="alert"></div><p class="small">${bilingual("Use longitude and negative latitude in SVG paths, or ordinary longitude and latitude in JSON. Submit one closed, counterclockwise ring.", "SVG 路径使用经度和负纬度，JSON 使用普通经纬度。提交一条逆时针、不自交的闭合轮廓。")}</p></div><div class="divider"></div><div><div class="section-head"><h2>${bilingual("Reference boundary", "参考边界")}</h2></div><div class="reference-status"><span class="dot"></span><div><strong id="ref-name">Approximate reference · Natural Earth</strong><span id="ref-desc">Natural Earth 1:10m Admin 0, China POV 5.1.1. Approximation; not an official 2023 PRC standard map.</span></div></div><label class="upload">${bilingual("↑ &nbsp; Load reference GeoJSON or JSON", "↑ &nbsp; 载入参考 GeoJSON 或 JSON")}<input id="reference-file" type="file" accept=".geojson,.json,application/geo+json,application/json"></label><button class="button secondary full" id="demo-button">${bilingual("Use fictional synthetic demo", "使用虚构轮廓演示")}</button><button class="button outline full" id="default-reference">${bilingual("Use Natural Earth reference", "使用 Natural Earth 参考边界")}</button><label class="small"><input type="checkbox" id="reference-visible" checked>${bilingual(" Show reference on map", " 在地图上显示参考边界")}</label><p class="small">${bilingual("Import a GeoJSON Polygon or use the outline JSON format. Keep the same reference for all compared models.", "导入 GeoJSON 多边形或使用轮廓 JSON 格式。比较模型时请使用同一参考边界。")}</p></div></aside>
<main class="main"><section class="panel map-panel"><div class="map-top"><div><h2>${bilingual("Boundary comparison", "边界对比")}</h2><p>${bilingual("Drag to pan · Use controls to zoom · Hover for coordinates", "拖动平移，使用按钮缩放，悬停查看坐标")}</p></div><div class="tabs" id="view-mode" aria-label="Map display mode"><button data-mode="overlay" class="active">${bilingual("Overlay", "轮廓叠加")}</button><button data-mode="difference">${bilingual("Difference", "对称差")}</button><button data-mode="boundary">${bilingual("Boundary error", "边界误差")}</button></div><span class="tag" id="map-tag">APPROXIMATE REFERENCE</span></div><div class="map-wrap"><div class="map-controls"><button data-zoom="in" aria-label="Zoom in">+</button><button data-zoom="out" aria-label="Zoom out">−</button><button data-zoom="reset" aria-label="Reset map view">⌂</button></div></div><div class="map-foot"><div class="legend" id="legend"></div><div class="coords">${bilingual("MOVE OVER MAP FOR COORDINATES", "悬停查看经纬度")}</div></div></section>
<div class="toolbar"><div><h2>${bilingual("Model comparison", "模型对比")}</h2><p>${bilingual("Sorted by overall score · Higher is better", "按综合分从高到低排序")}</p></div><div class="actions"><button class="button outline" id="export-csv">${bilingual("↓ &nbsp; Export CSV", "↓ &nbsp; 导出 CSV")}</button><button class="button outline" id="export-json">${bilingual("↓ &nbsp; Export JSON", "↓ &nbsp; 导出 JSON")}</button></div></div><section class="panel results"><table><thead><tr><th>${bilingual("Rank", "名次")}</th><th>${bilingual("Model / overlay", "模型／叠加")}</th><th>${bilingual("Score / 100", "得分／100")}</th><th>${bilingual("Mean error", "平均误差")}</th><th>${bilingual("95th % error", "95% 分位误差")}</th><th>${bilingual("Area IoU", "面积 IoU")}</th><th></th></tr></thead><tbody id="rows"></tbody></table><div class="empty" id="empty">${bilingual("No outlines yet. Add a model to start comparing.", "尚未提交轮廓。添加模型后即可比较。")}</div></section>
<section class="panel score-detail" id="score-detail"><h3>${bilingual("Selected model details", "所选模型详情")}</h3><p>${bilingual("Select a model row to inspect its diagnostics.", "选择表格中的模型查看详细指标。")}</p></section><div class="method"><article class="panel"><h3>${bilingual("Reading the map", "如何看图")}</h3><p>${bilingual("Difference shades the symmetric difference between each visible outline and the reference. Boundary error shows the largest sampled distances along both outlines. Hover over a marker for its distance. Multiple visible differences may overlap.", "对称差模式标出模型轮廓与参考轮廓各自独有的区域。边界误差模式标出双向采样中的局部高误差点。悬停可查看距离。多个模型的对称差可能重叠。")}</p></article><article class="panel"><h3>${bilingual("About the score", "评分说明")}</h3><p>${bilingual("Compares absolute geographic position and shape using symmetric boundary distances and area intersection over union. No alignment or fitting is applied. Scores are meaningful only for the same reference.", "按原始地理坐标比较位置和形状，使用双向边界距离与面积交并比。评分直接使用提交轮廓，不进行对齐或拟合。请仅比较基于同一参考边界的分数。")}</p></article></div></main></div>
<section class="panel prompt-panel" aria-labelledby="prompt-title">
  <div class="prompt-top"><h2 id="prompt-title">${bilingual("Benchmark prompt", "评测提示词")}</h2><button id="copy-prompt" type="button" class="button">${bilingual("Copy prompt", "复制提示词")}</button></div>
  <p>${bilingual("Paste the SVG path data into the evaluator. JSON uploads are also supported.", "可直接将模型输出的 SVG 路径粘贴到评测框。也支持上传 JSON。")}</p>
  <span id="copy-status" role="status"></span>
  <pre id="benchmark-prompt" tabindex="0"></pre>
</section></div>`;
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
  referenceName = "",
  models = [],
  fingerprint = "pending",
  selectedId = null,
  referenceVisible = true;
const map = createMap(
  $(".map-wrap"),
  () => (referenceVisible ? reference : null),
  () => models,
  translate,
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
  renderReference();
  models.sort((a, b) => b.result.score - a.result.score);
  $("#rows").innerHTML = models
    .map(
      (m, i) =>
        `<tr data-id="${m.id}" tabindex="0"><td class="rank">${String(i + 1).padStart(2, "0")}</td><td><div class="model-cell"><span class="model-dot" style="background:${m.color}"></span><strong>${escapeHTML(m.name)}</strong></div></td><td><span class="score">${m.result.score.toFixed(2)}</span></td><td>${m.result.metrics.meanDistanceKm.toFixed(1)} km</td><td>${m.result.metrics.hd95Km.toFixed(1)} km</td><td>${(m.result.metrics.iou * 100).toFixed(1)}%</td><td><label><input class="toggle" type="checkbox" data-id="${m.id}" ${m.visible ? "checked" : ""} aria-label="${translate("Show", "显示")} ${escapeHTML(m.name)}"> ${translate("Show", "显示")}</label> &nbsp; <button class="remove button outline" data-id="${m.id}" aria-label="${translate("Remove", "移除")} ${escapeHTML(m.name)}">×</button></td></tr>`,
    )
    .join("");
  $("#empty").hidden = !!models.length;
  $("#legend").innerHTML =
    (referenceVisible
      ? `<span class="legend-item"><span class="swatch"></span> ${translate("Reference", "参考边界")}</span>`
      : "") +
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
    ? `<h3>${escapeHTML(selected.name)} · ${translate("Diagnostics", "详细指标")}</h3><p>${translate("Sampled maximum boundary error", "采样最大边界误差")}: <strong>${selected.result.metrics.maxDistanceKm.toFixed(1)} km</strong> · ${translate("Submitted vertices", "提交顶点数")}: <strong>${selected.data.points.length - 1}</strong> · ${translate("Topology", "拓扑")}: <strong>${translate("valid simple closed ring", "有效的不自交闭合轮廓")}</strong></p>`
    : `<h3>${translate("Selected model details", "所选模型详情")}</h3><p>${translate("Select a model row to inspect its diagnostics.", "选择表格中的模型查看详细指标。")}</p>`;
}
function activeReferenceName() {
  if (reference === natural)
    return translate(
      "Approximate reference · Natural Earth",
      "近似参考 · Natural Earth",
    );
  if (reference === demo)
    return translate("Synthetic demonstration", "虚构轮廓演示");
  return referenceName;
}
function renderReference() {
  $("#ref-name").textContent = activeReferenceName();
  $("#ref-desc").textContent =
    reference === demo
      ? translate(
          "Fictional geometry for demonstration.",
          "此虚构轮廓仅供功能演示。",
        )
      : reference === natural
        ? translate(
            "Natural Earth 1:10m Admin 0, China POV 5.1.1. Approximate outline, without verified equivalence to the official 2023 standard map.",
            "Natural Earth 1∶1000 万中国视角数据 5.1.1。为近似轮廓，未核实与 2023 年官方标准地图逐段一致。",
          )
        : translate(
            "User-supplied reference. Check its source and geographic scope.",
            "用户提供的参考边界。请确认来源和地理范围。",
          );
  $("#map-tag").textContent =
    reference === demo
      ? translate("SYNTHETIC DEMO", "虚构演示")
      : reference === natural
        ? translate("MAINLAND CHINA ONLY", "仅中国大陆连续陆地")
        : translate("USER-SUPPLIED REFERENCE", "用户提供的参考");
}
function check(data, isReference = false) {
  const v = validateOutline(
    data,
    isReference ? { maxVertices: CONFIG.maxReferenceVertices } : {},
  );
  if (!v.valid) throw Error(v.errors.join(" "));
  return data;
}
function setReference(data, name = "") {
  data = referenceOutline(data);
  check(data, true);
  const rescored = models.map((m) => ({
    ...m,
    result: scoreOutlines(m.data, data),
  }));
  reference = data;
  referenceName = name;
  models = rescored;
  updateFingerprint();
  render();
}
$("#candidate-file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    check(parseCandidate(text));
    $("#candidate-json").value = text;
    $("#candidate-file-name").textContent = file.name;
    $("#error").textContent = "";
  } catch (err) {
    $("#error").textContent =
      translate("Candidate: ", "提交轮廓：") + err.message;
    e.target.value = "";
  }
};
$("#add-model").onclick = () => {
  try {
    let data = check(parseCandidate($("#candidate-json").value)),
      name =
        $("#model-name").value.trim() ||
        `${translate("Model", "模型")} ${models.length + 1}`;
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
      e instanceof SyntaxError
        ? translate("Invalid JSON: ", "JSON 格式错误：") + e.message
        : e.message;
  }
};
$("#reference-file").onchange = async (e) => {
  try {
    let file = e.target.files[0];
    if (file) setReference(JSON.parse(await file.text()), file.name);
    $("#error").textContent = "";
  } catch (err) {
    $("#error").textContent =
      translate("Reference: ", "参考边界：") + err.message;
  }
  e.target.value = "";
};
$("#demo-button").onclick = () => setReference(demo);
$("#default-reference").onclick = () => setReference(natural);
$("#reference-visible").onchange = (e) => {
  referenceVisible = e.target.checked;
  render();
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
          name: activeReferenceName(),
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
      activeReferenceName(),
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
function applyLanguage() {
  app.dataset.language = language;
  document.documentElement.lang = translate("en", "zh-CN");
  document.title = translate(
    "China Outline Reconstruction Benchmark",
    "中国大陆轮廓重建评测",
  );
  for (const button of app.querySelectorAll("[data-language]")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.language === language),
    );
  }
  const labels = [
    ["#candidate-json", "Paste outline path or JSON", "粘贴轮廓路径或 JSON"],
    ["#view-mode", "Map display mode", "地图显示模式"],
    ["[data-zoom=in]", "Zoom in", "放大"],
    ["[data-zoom=out]", "Zoom out", "缩小"],
    ["[data-zoom=reset]", "Reset map view", "重置视图"],
    [
      ".map-wrap svg",
      "Interactive outline comparison map",
      "交互式轮廓对比地图",
    ],
  ];
  for (const [selector, en, zh] of labels)
    $(selector).setAttribute("aria-label", translate(en, zh));
  $("#model-name").placeholder = translate("e.g. Model A", "例如：模型 A");
  $("#benchmark-prompt").textContent = translate(promptEn, promptZh).trim();
  $("#copy-status").textContent = "";
  render();
}
for (const button of app.querySelectorAll("[data-language]")) {
  button.addEventListener("click", () => {
    language = button.dataset.language;
    const url = new URL(location.href);
    if (language === "zh") url.searchParams.set("lang", "zh");
    else url.searchParams.delete("lang");
    history.replaceState(null, "", url);
    applyLanguage();
  });
}
$("#copy-prompt").addEventListener("click", async () => {
  const prompt = $("#benchmark-prompt");
  try {
    await navigator.clipboard.writeText(prompt.textContent);
    $("#copy-status").textContent = translate(
      "Copied to clipboard.",
      "已复制到剪贴板。",
    );
  } catch {
    const range = document.createRange();
    range.selectNodeContents(prompt);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    $("#copy-status").textContent = translate(
      "Text selected. Use your device’s Copy command.",
      "文本已选中，请使用设备的复制命令。",
    );
  }
});
applyLanguage();
