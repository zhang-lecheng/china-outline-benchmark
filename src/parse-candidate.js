/** Read legacy outline JSON or a single absolute SVG-style linear geographic path. */
export function parseCandidate(text) {
  const input = text.trim();
  if (!input || input.startsWith("{") || input.startsWith("[")) {
    return JSON.parse(input);
  }
  const path = /^M\s*([\s\S]+?)\s*Z$/u.exec(input);
  const number = "[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
  const pairPattern = new RegExp(`^(${number}),(${number})$`, "u");
  if (!path) throw new Error("Use outline JSON or an M … Z path.");
  const points = path[1].split(/\s+/u).map((pair) => {
    const coordinates = pairPattern.exec(pair);
    if (!coordinates) throw new Error("Write each path point as longitude,negative-latitude.");
    return [Number(coordinates[1]), -Number(coordinates[2])];
  });
  return {
    crs: "EPSG:4326",
    region: "mainland_china",
    orientation: "CCW",
    points: [...points, points[0]],
  };
}
