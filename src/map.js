const NS = "http://www.w3.org/2000/svg";
export const COLORS = [
  "#c17555",
  "#6c86a5",
  "#b69b53",
  "#9c78a2",
  "#6c9c83",
  "#bf7c82",
];
export function ringsOf(input) {
  if (!input) return [];
  if (input.type === "FeatureCollection")
    return input.features.flatMap(ringsOf);
  if (input.type === "Feature") return ringsOf(input.geometry);
  if (input.type === "Polygon") return input.coordinates;
  if (input.type === "MultiPolygon") return input.coordinates.flat();
  if (input.type === "LineString") return [input.coordinates];
  if (Array.isArray(input)) {
    if (typeof input[0]?.[0] === "number") return [input];
    return input.flatMap(ringsOf);
  }
  if (input.coordinates) return ringsOf(input.coordinates);
  if (input.points) return ringsOf(input.points);
  if (input.vertices) return ringsOf(input.vertices);
  return [];
}
const el = (name, attrs = {}) => {
  let n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
export function createMap(container, reference, getModels) {
  const svg = el("svg", {
    viewBox: "0 0 1000 410",
    role: "img",
    "aria-label":
      "Interactive outline comparison map. Use plus and minus buttons to zoom.",
  });
  container.prepend(svg);
  let mode = "overlay",
    zoom = 1,
    dx = 0,
    dy = 0,
    drag = null,
    bounds = [72, 134, 15, 55];
  function projection(p) {
    let [xmin, xmax, ymin, ymax] = bounds;
    const sx = 850 / (xmax - xmin),
      sy = 330 / (ymax - ymin),
      scale = Math.min(sx, sy);
    return [
      500 + (p[0] - (xmin + xmax) / 2) * scale,
      205 - (p[1] - (ymin + ymax) / 2) * scale,
    ];
  }
  function path(rings) {
    return rings
      .map(
        (r) =>
          r
            .filter(
              (p) =>
                Array.isArray(p) &&
                Number.isFinite(+p[0]) &&
                Number.isFinite(+p[1]),
            )
            .map((p, i) => {
              let [x, y] = projection(p);
              return `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
            })
            .join(" ") + " Z",
      )
      .join(" ");
  }
  function draw() {
    svg.replaceChildren();
    let grid = el("g", {
      transform: `translate(${dx} ${dy}) translate(500 205) scale(${zoom}) translate(-500 -205)`,
    });
    svg.append(grid);
    for (let lon = 70; lon <= 140; lon += 10) {
      let [x] = projection([lon, 30]);
      grid.append(
        el("line", {
          x1: x,
          y1: -500,
          x2: x,
          y2: 900,
          stroke: "#dcebe0",
          "stroke-width": ".7",
        }),
      );
      let t = el("text", {
        x: x + 3,
        y: 398,
        fill: "#b3c8b7",
        "font-size": "9",
        "font-family": "monospace",
      });
      t.textContent = lon + "°E";
      grid.append(t);
    }
    for (let lat = 10; lat <= 60; lat += 10) {
      let [, y] = projection([100, lat]);
      grid.append(
        el("line", {
          x1: -500,
          y1: y,
          x2: 1500,
          y2: y,
          stroke: "#dcebe0",
          "stroke-width": ".7",
        }),
      );
      let t = el("text", {
        x: 10,
        y: y - 4,
        fill: "#b3c8b7",
        "font-size": "9",
        "font-family": "monospace",
      });
      t.textContent = lat + "°N";
      grid.append(t);
    }
    let rr = ringsOf(reference());
    if (rr.length)
      grid.append(
        el("path", {
          d: path(rr),
          fill: "#dbeee1",
          stroke: "#337b62",
          "stroke-width": 2,
          "vector-effect": "non-scaling-stroke",
          "fill-rule": "evenodd",
        }),
      );
    getModels()
      .filter((m) => m.visible)
      .forEach((m) => {
        const rs = ringsOf(m.data);
        if (rs.length) {
          if (mode === "difference" && rr.length)
            grid.append(
              el("path", {
                d: path(rr) + " " + path(rs),
                fill: m.color,
                "fill-opacity": ".25",
                "fill-rule": "evenodd",
                stroke: "none",
              }),
            );
          grid.append(
            el("path", {
              d: path(rs),
              fill: "none",
              stroke: m.color,
              "stroke-width": 2,
              "stroke-dasharray": "6 4",
              "vector-effect": "non-scaling-stroke",
            }),
          );
          if (mode === "boundary")
            (m.result.geometry.candidateErrors || [])
              .filter((_, i) => i % 8 === 0)
              .forEach((sample) => {
                let [x, y] = projection(sample.point);
                grid.append(
                  el("circle", {
                    cx: x,
                    cy: y,
                    r: Math.min(7, 2 + sample.distanceKm / 100),
                    fill: m.color,
                    "fill-opacity": ".65",
                    stroke: "white",
                    "stroke-width": ".6",
                    "vector-effect": "non-scaling-stroke",
                  }),
                );
              });
        }
      });
  }
  function change(factor) {
    zoom = Math.min(8, Math.max(0.6, zoom * factor));
    draw();
  }
  container.querySelector('[data-zoom="in"]').onclick = () => change(1.3);
  container.querySelector('[data-zoom="out"]').onclick = () => change(1 / 1.3);
  container.querySelector('[data-zoom="reset"]').onclick = () => {
    zoom = 1;
    dx = dy = 0;
    draw();
  };
  const svgPoint = (e) => {
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  };
  svg.addEventListener("pointerdown", (e) => {
    const p = svgPoint(e);
    drag = [p.x, p.y, dx, dy];
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointerup", () => (drag = null));
  svg.addEventListener("pointercancel", () => (drag = null));
  svg.addEventListener("pointermove", (e) => {
    if (drag) {
      const p = svgPoint(e);
      dx = drag[2] + p.x - drag[0];
      dy = drag[3] + p.y - drag[1];
      draw();
    }
    const p = svgPoint(e),
      x = (p.x - dx - 500) / zoom + 500,
      y = (p.y - dy - 205) / zoom + 205;
    let [xmin, xmax, ymin, ymax] = bounds,
      scale = Math.min(850 / (xmax - xmin), 330 / (ymax - ymin));
    let lon = (x - 500) / scale + (xmin + xmax) / 2,
      lat = (205 - y) / scale + (ymin + ymax) / 2;
    container.parentElement.querySelector(".coords").textContent =
      `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}  /  ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "E" : "W"}`;
  });
  draw();
  return {
    draw,
    setMode(m) {
      mode = m;
      draw();
    },
    setBounds(b) {
      bounds = b;
      draw();
    },
  };
}
