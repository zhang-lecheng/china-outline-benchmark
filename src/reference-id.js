export async function referenceFingerprint(points) {
  const vertices = points.slice(0, -1)
  let anchor = 0
  for (let i = 1; i < vertices.length; i++) {
    const [x, y] = vertices[i]
    const [minX, minY] = vertices[anchor]
    if (x < minX || (x === minX && y < minY)) anchor = i
  }
  const ordered = vertices.slice(anchor).concat(vertices.slice(0, anchor))
  const [nextX, nextY] = ordered[1]
  const [lastX, lastY] = ordered.at(-1)
  if (lastX < nextX || (lastX === nextX && lastY < nextY)) {
    ordered.splice(1, ordered.length - 1, ...ordered.slice(1).reverse())
  }
  const bytes = new TextEncoder().encode(JSON.stringify(ordered))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return 'sha256:' + Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('')
}

export function referenceOutline(value) {
  if (value?.points) return value
  if (value?.type === 'FeatureCollection' && value.features?.length === 1) value = value.features[0]
  const geometry = value?.type === 'Feature' ? value.geometry : value
  if (geometry?.type !== 'Polygon' || geometry.coordinates?.length !== 1) {
    throw new Error('Reference must contain one Polygon with one exterior ring and no holes.')
  }
  return { crs: 'EPSG:4326', region: 'mainland_china', orientation: 'CCW', points: geometry.coordinates[0] }
}
