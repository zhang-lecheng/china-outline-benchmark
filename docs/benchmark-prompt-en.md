# Task: Reconstruct the outline of mainland China from memory

Use only geographic knowledge acquired during training. Reconstruct the two-dimensional outline of mainland China as accurately as possible and output an ordered set of coordinates suitable for an SVG map.

Do not search the web, read local maps, query geographic databases, use stored administrative boundaries, or consult other external geographic sources.

## Geographic scope

1. Trace the complete exterior of the contiguous mainland landmass, including the land border and coastline.
2. Follow the People's Republic of China's official position on borders and disputed areas, using the Ministry of Natural Resources' 2023 standard map and relevant boundary depiction rules as the target convention.
3. Include mainland-connected parts of Hong Kong and Macao.
4. Exclude Taiwan, Hainan and all other disconnected islands.
5. Omit provincial boundaries, rivers, lakes and other internal geographic features.
6. Omit dashed maritime lines. Output one contiguous mainland outline.

## Coordinates and ring rules

1. Use WGS84 (EPSG:4326) coordinates in [longitude, latitude] order, in decimal degrees.
2. List vertices counterclockwise, starting at the westernmost vertex. Break ties by choosing the lowest latitude.
3. Repeat the first point exactly at the end. Do not repeat any other vertex or produce a self-intersecting ring.
4. Output at most 500 distinct vertices, excluding the repeated closing point.
5. Within the vertex budget, reproduce the overall shape and prominent border turns, peninsulas, bays and coastline as accurately as possible.

## Output format

Output only one valid JSON object. Omit Markdown fences, explanations and any other text. Use the keys below. The sample coordinates illustrate the format.

{
  "crs": "EPSG:4326",
  "region": "mainland_china",
  "orientation": "CCW",
  "points": [[73.5, 39.4], [74.1, 40.2], [74.0, 41.0], [73.5, 39.4]]
}
