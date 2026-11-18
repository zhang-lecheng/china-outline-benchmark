/** Read legacy outline JSON or a single absolute SVG-style linear geographic path. */
export function parseCandidate(text) {
  const input = text.trim();
  if (!input || input.startsWith("{") || input.startsWith("[")) {
    return JSON.parse(input);
  }
  const sections = input.split(/^(OUTLINE|YANGTZE|YELLOW|CITIES)[ \t]*$/gmu);
  if (sections.length === 1) return outline(readPath(input, true));
  const blocks = new Map();
  if (sections[0].trim()) throw new Error("Start the submission with OUTLINE.");
  for (let i = 1; i < sections.length; i += 2) {
    if (blocks.has(sections[i]))
      throw new Error("Repeated section: " + sections[i]);
    blocks.set(sections[i], sections[i + 1].trim());
  }
  const data = outline(readPath(blocks.get("OUTLINE") ?? "", true));
  data.rivers = {};
  for (const key of ["YANGTZE", "YELLOW"]) {
    if (blocks.has(key)) data.rivers[key] = readPath(blocks.get(key), false);
  }
  if (blocks.has("CITIES")) {
    data.cities = blocks
      .get("CITIES")
      .split(/\r?\n/u)
      .map((line) => {
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
      });
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

function outline(points) {
  return {
    crs: "EPSG:4326",
    region: "mainland_china",
    orientation: "CCW",
    points: [...points, points[0]],
  };
}
