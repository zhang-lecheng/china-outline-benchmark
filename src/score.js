import { CONFIG } from "./config.js";
import {
  validateOutline,
  projectRing,
  signedArea,
  intersectionArea,
  unprojectPoint,
} from "./geometry.js";
import { sphericalRing, directedBoundaryErrors } from "./spherical.js";

/** Score fixed geographic coordinates. No alignment or fitting is performed. */
export function scoreOutlines(candidate, reference) {
  const candidateValidation = validateOutline(candidate);
  if (!candidateValidation.valid) {
    throw new Error("Candidate: " + candidateValidation.errors.join(" "));
  }
  const referenceValidation = validateOutline(reference, {
    maxVertices: CONFIG.maxReferenceVertices,
  });
  if (!referenceValidation.valid) {
    throw new Error("Reference: " + referenceValidation.errors.join(" "));
  }

  const candidateProjected = projectRing(candidate.points);
  const referenceProjected = projectRing(reference.points);
  const identical =
    candidateProjected.length === referenceProjected.length &&
    candidateProjected.every(
      ([x, y], i) =>
        x === referenceProjected[i][0] && y === referenceProjected[i][1],
    );
  const candidateRing = sphericalRing(candidateProjected.map(unprojectPoint));
  const referenceRing = identical
    ? candidateRing
    : sphericalRing(referenceProjected.map(unprojectPoint));
  const candidateErrors = directedBoundaryErrors(
    candidateRing,
    referenceRing,
    identical,
  );
  const referenceErrors = identical
    ? candidateErrors
    : directedBoundaryErrors(referenceRing, candidateRing);
  const distances = [...candidateErrors, ...referenceErrors].map(
    (sample) => sample.distanceKm,
  );
  distances.sort((a, b) => a - b);
  const meanDistanceKm =
    distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
  const hd95Km = distances[Math.ceil(distances.length * 0.95) - 1];
  const maxDistanceKm = distances.at(-1);

  const candidateAreaKm2 = Math.abs(signedArea(candidateProjected));
  const referenceAreaKm2 = Math.abs(signedArea(referenceProjected));
  const intersectionAreaKm2 = identical
    ? candidateAreaKm2
    : Math.min(
        candidateAreaKm2,
        referenceAreaKm2,
        intersectionArea(candidateProjected, referenceProjected),
      );
  const unionAreaKm2 =
    candidateAreaKm2 + referenceAreaKm2 - intersectionAreaKm2;
  const iou = intersectionAreaKm2 / unionAreaKm2;
  const { weights, meanScaleKm, hd95ScaleKm } = CONFIG;
  const score =
    100 *
    (weights.mean * Math.exp(-meanDistanceKm / meanScaleKm) +
      weights.hd95 * Math.exp(-hd95Km / hd95ScaleKm) +
      weights.iou * iou);

  return {
    score: Math.max(0, Math.min(100, score)),
    metrics: {
      meanDistanceKm,
      hd95Km,
      maxDistanceKm,
      iou,
      candidateAreaKm2,
      referenceAreaKm2,
      intersectionAreaKm2,
      unionAreaKm2,
      candidateOnlyKm2: Math.max(0, candidateAreaKm2 - intersectionAreaKm2),
      referenceOnlyKm2: Math.max(0, referenceAreaKm2 - intersectionAreaKm2),
      symmetricDifferenceKm2: Math.max(0, unionAreaKm2 - intersectionAreaKm2),
    },
    geometry: {
      candidate: candidate.points,
      reference: reference.points,
      candidateErrors,
      referenceErrors,
    },
  };
}
