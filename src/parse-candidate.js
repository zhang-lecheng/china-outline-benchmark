/** Read legacy outline JSON or a single absolute SVG-style linear geographic path. */
export function parseCandidate(text, diagnostics) {
  const input = text.trim();
  if (!input || input.startsWith("{") || input.startsWith("[")) {
    return JSON.parse(input);
  }
  const sections = input.split(/^(OUTLINE|YANGTZE|YELLOW|CITIES)[ \t]*$/gmu);
  if (sections.length === 1) return outline(readOutline(input, diagnostics));
  const blocks = new Map();
  if (sections[0].trim()) throw new Error("Start the submission with OUTLINE.");
  for (let i = 1; i < sections.length; i += 2) {
    if (blocks.has(sections[i]))
      throw new Error("Repeated section: " + sections[i]);
    blocks.set(sections[i], sections[i + 1].trim());
  }
  let data;
  try {
    data = outline(readOutline(blocks.get("OUTLINE") ?? "", diagnostics));
  } catch (error) {
    if (!diagnostics) throw error;
    diagnostics.outlineError = error.message;
    data = {};
  }
  data.rivers = {};
  for (const key of ["YANGTZE", "YELLOW"]) {
    if (!blocks.has(key)) continue;
    try {
      data.rivers[key] = readPath(blocks.get(key), false);
    } catch (error) {
      if (!diagnostics) throw error;
      diagnostics.featureIssues.push(key + ": " + error.message);
    }
  }
  if (blocks.has("CITIES")) {
    const cities = blocks
      .get("CITIES")
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line) => {
        try {
          const fields = line.trim().split(/\s+/u);
          if (fields.length < 3)
            throw new Error(
              "Write each city as region city longitude,negative-latitude.",
            );
          return {
            region: fields[0],
            city: fields.slice(1, -1).join(" "),
            point: readPoint(fields.at(-1)),
          };
        } catch (error) {
          if (!diagnostics) throw error;
          diagnostics.featureIssues.push("CITIES: " + error.message);
          return null;
        }
      });
    data.cities = cities.filter(Boolean);
  }
  return data;
}

const number = "[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
const pairPattern = new RegExp(`^(${number}),(${number})$`, "u");

function readPoint(pair) {
  const coordinates = pairPattern.exec(pair);
  if (!coordinates)
    throw new Error("Write each point as longitude,negative-latitude.");
  const point = [Number(coordinates[1]), -Number(coordinates[2])];
  if (Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90)
    throw new Error("Point is outside WGS84 coordinate bounds.");
  return point;
}

function readPath(input, closed) {
  const path = (closed ? /^M\s*([\s\S]+?)\s*Z$/u : /^M\s*([\s\S]+)$/u).exec(
    input,
  );
  if (!path)
    throw new Error(
      closed
        ? "Use outline JSON or an M … Z path."
        : "Use an open M path for each river.",
    );
  const points = path[1].trim().split(/\s+/u).map(readPoint);
  if (!closed && points.length < 2)
    throw new Error("A river must have at least two points.");
  return points;
}

function readOutline(input, diagnostics) {
  if (diagnostics && /^M[\s\S]+\d$/u.test(input)) {
    const points = readPath(input, false);
    diagnostics.missingClosure = true;
    diagnostics.repairs.push([
      "Added the missing Z closure.",
      "已补上缺失的 Z 闭合指令。",
    ]);
    return points;
  }
  return readPath(input, true);
}

function outline(points) {
  return {
    crs: "EPSG:4326",
    region: "mainland_china",
    orientation: "CCW",
    points:
      points.at(-1)[0] === points[0][0] && points.at(-1)[1] === points[0][1]
        ? points
        : [...points, points[0]],
  };
}
