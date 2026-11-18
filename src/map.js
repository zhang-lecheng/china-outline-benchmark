const NS = "http://www.w3.org/2000/svg";
export const COLORS = [
  "#c17555",
  "#6c86a5",
  "#b69b53",
  "#9c78a2",
  "#6c9c83",
  "#bf7c82",
];
const el = (name, attrs = {}) => {
  let n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
export function createMap(container, reference, getModels, translate) {
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
    grid;
  const scale = 8.25;
  function projection([lon, lat]) {
    return [500 + (lon - 104) * scale, 205 - (lat - 35) * scale];
  }
  function path(points) {
    return (
      points
        .map((point, index) => {
          const [x, y] = projection(point);
          return `${index ? "L" : "M"}${x.toFixed(5)},${y.toFixed(5)}`;
        })
        .join(" ") + " Z"
    );
  }
  function moveGrid() {
    grid.setAttribute(
      "transform",
      `translate(${dx} ${dy}) translate(500 205) scale(${zoom}) translate(-500 -205)`,
    );
  }
  function draw() {
    svg.replaceChildren();
    grid = el("g");
    moveGrid();
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
      t.textContent = lon + translate("°E", "°东");
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
      t.textContent = lat + translate("°N", "°北");
      grid.append(t);
    }
    const activeReference = reference();
    const referencePath = activeReference ? path(activeReference.points) : "";
    if (referencePath) {
      grid.append(
        el("path", {
          d: referencePath,
          fill: "#80be9c",
          "fill-opacity": ".28",
          stroke: "#337b62",
          "stroke-width": 2,
          "vector-effect": "non-scaling-stroke",
        }),
      );
    }
    for (const model of getModels().filter((item) => item.visible)) {
      const predictedPath = path(model.data.points);
      if (mode === "difference" && referencePath) {
        grid.append(
          el("path", {
            d: referencePath + " " + predictedPath,
            fill: model.color,
            "fill-opacity": ".40",
            "fill-rule": "evenodd",
          }),
        );
      }
      grid.append(
        el("path", {
          d: predictedPath,
          fill: mode === "overlay" ? model.color : "none",
          "fill-opacity": ".22",
          stroke: model.color,
          "stroke-width": 2,
          "stroke-dasharray": "6 4",
          "vector-effect": "non-scaling-stroke",
        }),
      );
      if (mode === "boundary") {
        const { candidateErrors, referenceErrors } = model.result.geometry;
        drawErrors(model, candidateErrors, "Prediction");
        if (referencePath) drawErrors(model, referenceErrors, "Reference");
      }
    }
  }
  function drawErrors(model, samples, side) {
    // Display the largest sampled distance in each eight-sample window.
    for (let i = 0; i < samples.length; i += 8) {
      const sample = samples
        .slice(i, i + 8)
        .reduce((largest, item) =>
          item.distanceKm > largest.distanceKm ? item : largest,
        );
      if (sample.distanceKm < 0.05) continue;
      const [cx, cy] = projection(sample.point);
      const severity = Math.min(1, sample.distanceKm / 100);
      const marker = el("circle", {
        cx,
        cy,
        r: 1.5 + 4 * severity,
        fill: model.color,
        "fill-opacity": 0.25 + 0.65 * severity,
        stroke: side === "Reference" ? "#19332f" : "white",
        "stroke-width": ".7",
        "vector-effect": "non-scaling-stroke",
      });
      const title = el("title");
      title.textContent = `${model.name} · ${side === "Reference" ? translate("Reference", "参考边界") : translate("Prediction", "模型预测")} · ${sample.distanceKm.toFixed(2)} km`;
      marker.append(title);
      grid.append(marker);
    }
  }
  function change(factor) {
    zoom = Math.min(8, Math.max(0.6, zoom * factor));
    moveGrid();
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
      moveGrid();
    }
    const p = svgPoint(e),
      x = (p.x - dx - 500) / zoom + 500,
      y = (p.y - dy - 205) / zoom + 205;
    const lon = (x - 500) / scale + 104;
    const lat = (205 - y) / scale + 35;
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
  };
}
