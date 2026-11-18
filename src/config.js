// Fixed benchmark configuration. Distances are kilometres and areas square kilometres.
export const CONFIG = Object.freeze({
  version: '1.0.0',
  earthRadiusKm: 6371.0088,
  standardParallelDegrees: 35,
  centralMeridianDegrees: 105,
  projectionGridDegrees: 1,
  promptVertexLimit: 500,
  maxCandidateVertices: 20000,
  maxReferenceVertices: 20000,
  boundarySamples: 2048,
  // 20 km makes moderate local displacement visible; HD95 and IoU keep
  // widespread errors from being hidden by the mean. Max is diagnostic only.
  meanScaleKm: 20,
  hd95ScaleKm: 75,
  weights: Object.freeze({mean: 0.50, hd95: 0.25, iou: 0.25})
});
