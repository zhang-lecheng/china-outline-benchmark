# Synthetic perturbation report

This is a deterministic check of the scoring implementation, using an invented outline in East Asian coordinate ranges. It exercises algorithm behavior on controlled shapes. Scores reflect the configured scales and weights; they are not calibrated human grades. The starting vertex and straight-edge subdivision are tested separately. Run `node examples/perturbation-report.js` to reproduce.

Case | Score | Mean distance (km) | HD95 (km) | IoU
--- | ---: | ---: | ---: | ---:
identical | 100.00 | 0.00 | 0.00 | 1.0000
shift 0.5° east/north | 37.33 | 47.84 | 74.33 | 0.9392
shift 5° east/north | 14.49 | 409.75 | 731.03 | 0.5795
scale 1.03 around 103°E, 35°N | 39.20 | 45.41 | 65.41 | 0.9435
scale 1.30 around 103°E, 35°N | 14.94 | 474.61 | 644.68 | 0.5976
delete four coastal vertices | 51.44 | 16.12 | 127.07 | 0.9808
smooth once | 38.49 | 40.52 | 84.70 | 0.9525
seeded noise ±0.1° | 88.41 | 3.82 | 8.86 | 0.9950
seeded noise ±0.2° | 78.70 | 7.61 | 17.58 | 0.9901

The larger translation, scale and seeded-noise changes score below the smaller changes in this example. Local deletion and smoothing reduce the score, but no general ordering between different kinds of perturbation is implied. Distances use nearest points on spherical arcs; HD95 is the 95th percentile of the combined directed boundary samples.
