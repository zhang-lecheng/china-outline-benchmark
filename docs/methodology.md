# Scoring methodology v1.0.0

## Geometry and coordinate conventions

Inputs are WGS84 longitude/latitude pairs. Edges are interpreted as straight in the supplied longitude/latitude coordinate plane. They are sampled at crossings with integer-degree parallel and meridian lines before area projection or spherical distance calculation. An antimeridian-spanning input follows the supplied planar coordinates. This convention is designed for mainland China, which does not cross the antimeridian.

Validation checks the metadata, coordinate ranges, vertex count, closure, uniqueness, winding and simplicity. A robust orientation predicate distinguishes crossings and touching edges. Scoring uses a deterministic starting vertex and collapses collinear subdivisions within numerical tolerance. Original input coordinates remain available for display and export. The system does not translate, rotate or scale geometries.

## Area overlap

Let `λ` and `φ` be longitude and latitude in radians. The spherical cylindrical equal-area projection uses radius `R = 6371.0088 km`, central longitude `λ₀ = 105°E` and standard parallel `φ₀ = 35°N`:

```text
x = R (λ − λ₀) cos φ₀
y = R sin φ / cos φ₀
IoU = area(P ∩ R) / area(P ∪ R)
```

The projected geometry is piecewise linear after densification. Area of intersection integrates overlapping horizontal intervals between vertex heights and edge-crossing heights. Width is linear within each such interval. The implementation integrates that width using two interior samples. CEA preserves spherical surface area in the continuous limit. Remaining area error comes from linearizing the projected edges and using a sphere for WGS84 positions.

## Boundary location

After densification, each edge is a minor great-circle arc on the same sphere. Each ring contributes 2,048 samples at distances `i L / 2048` from its deterministic start. Here `L` is the sum of spherical arc lengths and `i = 0 … 2047`. For each sample, the other ring's nearest point is the spherical perpendicular foot when it lies on an arc, or the closest endpoint. Both directions receive equal total weight even when ring perimeters differ.

**Mean** is the arithmetic average of the 4,096 distances. **HD95** is their nearest-rank 95th percentile. **Maximum** is the largest sample distance and approximates the continuous Hausdorff distance. Errors occupying less than 5% of the pooled sample support can be largely absent from HD95. The average and map still describe the errors that the sampling grid reaches.

## Composite

```text
S = 100 × (0.50 exp(−mean / 20 km) + 0.25 exp(−HD95 / 75 km) + 0.25 IoU)
```

The mean receives half the weight because it measures displacement directly and makes missing coastal features visible even where the overlap area is high. The HD95 assigns a smaller weight to sustained local outliers, with a broader distance scale. IoU weights coverage independently of where boundary samples fall. Both distance terms are related, so the weighting leaves the maximum outside the composite. These are fixed, interpretable design choices, without calibration to model outputs. Distances at the chosen scales contribute about 37% of their individual maximum. An exact match returns 100.

Boundary features below the reference's effective resolution, sampling spacing or the prediction's 500-vertex budget have limited representation. Difference mode renders the symmetric difference of the displayed coordinate-plane polygons. Boundary error mode displays the spherical sample distances computed by the scoring core. A rank is meaningful only when the reference fingerprint and scoring version match. Higher score indicates greater agreement with that reference under this formula.

## Checks

Use `npm test` and `node examples/perturbation-report.js` to reproduce the automated and synthetic checks. The browser smoke compares its export with the CLI using an absolute score tolerance of `1e-8` and checks input upload, map interactions, downloads and a mobile viewport.

## Rivers and cities

The four-section submission adds optional diagnostics. The outline keeps its original formula. River errors compare the open source-to-mouth centerlines. We report the symmetric mean, HD95 and errors at the two ordered endpoints, in kilometers. Each direction contributes 2,048 equally spaced samples by spherical arc length. City diagnostics match by administrative region and expected city name, then report great-circle distance and coverage. Missing and wrong-city rows are excluded from the mean and listed separately. JSON exports include the feature reference version and city-level details.
