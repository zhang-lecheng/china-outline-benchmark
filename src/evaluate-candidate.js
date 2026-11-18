import polygonClipping from "polygon-clipping";
import { CONFIG } from "./config.js";
import { signedArea, validateOutline } from "./geometry.js";
import { scoreOutlines } from "./score.js";
import { scoreFeatures } from "./score-features.js";
import { parseCandidate } from "./parse-candidate.js";

const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
const validPair = (p) =>
  Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

export function readSubmission(text) {
  const repairs = [];
  let input = text.trim();
  const fenced = /^\x60{3}[^\n]*\r?\n([\s\S]*?)\r?\n\x60{3}$/u.exec(input);
  if (fenced) {
    input = fenced[1].trim();
    repairs.push([
      "Removed Markdown code fences.",
      "已移除 Markdown 代码围栏。",
    ]);
  }
  if (/\\[ \t]*\r?$/mu.test(input)) {
    input = input.replace(/\\[ \t]*(?=\r?$)/gmu, "");
    repairs.push([
      "Removed Markdown line-break markers.",
      "已移除 Markdown 行尾换行标记。",
    ]);
  }
  const diagnostics = { outlineError: null, featureIssues: [], repairs };
  let data = {};
  try {
    data = parseCandidate(input, diagnostics);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Expected a JSON object or map paths.");
    }
  } catch (error) {
    diagnostics.outlineError = error.message;
    data = {};
  }

  const raw = data.points;
  const explicitlyClosed =
    Array.isArray(raw) &&
    raw.length > 1 &&
    validPair(raw[0]) &&
    validPair(raw.at(-1)) &&
    samePoint(raw[0], raw.at(-1));
  const submittedVertices = Array.isArray(raw)
    ? raw.length - Number(explicitlyClosed)
    : null;
  const original = validateOutline(data);
  const originalError =
    diagnostics.outlineError ??
    ([
      ...original.errors,
      ...(diagnostics.missingClosure
        ? ["The outline was missing its Z closure."]
        : []),
    ].join(" ") ||
      null);
  if (
    Array.isArray(data.points) &&
    data.points.length > 0 &&
    data.points.every(validPair)
  ) {
    const points = data.points.filter(
      (point, index, values) =>
        index === 0 || !samePoint(point, values[index - 1]),
    );
    if (points.length !== data.points.length) {
      repairs.push([
        "Removed consecutive duplicate vertices.",
        "已移除连续重复点。",
      ]);
    }
    if (!samePoint(points[0], points.at(-1))) {
      points.push(points[0]);
      repairs.push(["Closed the outline ring.", "已闭合轮廓。"]);
    }
    if (signedArea(points) < 0) {
      points.reverse();
      repairs.push([
        "Reversed clockwise winding.",
        "已将顺时针轮廓反转为逆时针。",
      ]);
    }
    data = { ...data, points };
    if (data.orientation === "CW") {
      data.orientation = "CCW";
      repairs.push([
        "Normalized the winding label to CCW.",
        "已将方向标签更新为逆时针。",
      ]);
    }
  }
  const validation = validateOutline(data);
  if (
    !validation.valid &&
    Array.isArray(data.points) &&
    data.points.length >= 4 &&
    data.points.length <= CONFIG.maxCandidateVertices + 1 &&
    data.points.every(validPair)
  ) {
    try {
      const polygons = polygonClipping.union([data.points]);
      const largest = polygons.reduce(
        (best, polygon) =>
          !best || signedArea(polygon[0]) > signedArea(best[0])
            ? polygon
            : best,
        null,
      );
      if (largest) {
        const repaired = { ...data, points: largest[0] };
        if (validateOutline(repaired).valid) {
          data = repaired;
          repairs.push([
            `Polygonized the outline and kept the largest exterior (${polygons.length} component(s); holes omitted).`,
            `已将轮廓多边形化，取最大外环（共 ${polygons.length} 个区域，忽略内环）。`,
          ]);
        }
      }
    } catch {
      // Keep the input and surface the validation error if polygonization fails.
    }
  }
  let features = null;
  let featureError = diagnostics.featureIssues.join(" ") || null;
  try {
    features = scoreFeatures(data);
  } catch (error) {
    featureError = [featureError, error.message].filter(Boolean).join(" ");
  }
  return {
    data,
    ...diagnostics,
    originalError,
    submittedVertices,
    features,
    featureError,
  };
}

export function evaluateOutline(
  { data, outlineError, originalError, submittedVertices },
  reference,
) {
  const validation = outlineError
    ? { valid: false, errors: [outlineError] }
    : validateOutline(data);
  const points = data.points;
  let warning = null;
  if (Array.isArray(points) && points.every(validPair)) {
    let south = 90,
      east = -180;
    for (const [lon, lat] of points) {
      south = Math.min(south, lat);
      east = Math.max(east, lon);
    }
    if (south < 0 || east > 145) {
      warning = `Outline extends far outside mainland China (minimum latitude ${south}°, maximum longitude ${east}°).`;
    }
  }
  const count = {
    vertices: submittedVertices,
    vertexLimit: CONFIG.promptVertexLimit,
    overVertexLimit:
      submittedVertices === null
        ? null
        : submittedVertices > CONFIG.promptVertexLimit,
  };
  const status = { originalValid: !originalError, originalError, warning };
  if (validation.valid) {
    const scored = scoreOutlines(data, reference);
    return {
      valid: true,
      ...scored,
      scoredVertices: scored.vertices,
      ...count,
      ...status,
    };
  }
  return {
    valid: false,
    score: 0,
    error: validation.errors.join(" "),
    metrics: null,
    geometry: null,
    ...count,
    ...status,
  };
}
