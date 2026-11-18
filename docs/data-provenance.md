# Reference geometry provenance

The bundled reference is an **approximate, third-party China-POV mainland outline**, not an official PRC standard map or a verified representation of the 2023 standard map. The 2023 official standard maps were released by China's Ministry of Natural Resources, as documented by the [China Geological Survey](https://m.cgs.gov.cn/ddyw/202308/t20230829_741862.html). The [standard map service](http://bzdt.ch.mnr.gov.cn/) provides official maps for public download; guidance says direct use requires the map review number. We have not established permission to redistribute an extracted or altered official vector, and no such data is bundled. A user-supplied official vector may be used locally only if the user has the necessary rights; review its specific terms and any applicable map-review requirements before distribution or publication.

## Public fallback

The bundled geometry derives from [Natural Earth 1:10m Admin 0 Countries, China POV, version 5.1.1](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/), [released May 13, 2022](https://github.com/nvkelso/natural-earth-vector/releases/tag/v5.1.1). The source archive contains an ESRI Shapefile in WGS84 longitude/latitude. Natural Earth describes the POV layers as its country-viewpoint variants; these are not certified official boundaries. Natural Earth states that its map data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). Source archive: https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_0_countries_chn.zip; SHA-256: `16e7589083527d01208b9f645fc8643c767170258e9d13b59d37bc5a1f6a8758`.

The largest China land polygon is combined with the mainland-connected Hong Kong component and the nearest Macao peninsula component. All other disconnected components, including Hainan, Taiwan, Hong Kong Island and the Macao islands, are excluded. Only the exterior ring is retained, so inland holes are filled. Natural Earth's mainland and Macao features have a 0.00074028° gap; a small artificial bridge joins the closest points, buffered by 0.0005°. Its bounds are approximately 113.526231–113.527854° E and 22.206647–22.208046° N; the newly filled area is approximately 0.0000009044 square degrees (roughly 10,000 m² at that latitude). This is a deliberate approximation for a single connected benchmark silhouette, not a claim about actual shoreline. The source is generalized at 1:10m and does not establish survey accuracy or exact 2023 conformity.

Representative point tests include Aksai Chin, the eastern disputed sector, Kowloon and Macao peninsula; Hainan, Taiwan and Hong Kong Island are excluded. These are smoke tests only: they do not verify every border segment or legal status. Boundary claims remain contested and this dataset is unsuitable as authoritative evidence of sovereignty, legal boundaries, or navigational accuracy.

## Reproduce

Install GDAL's `ogr2ogr` and Python Shapely, download the exact archive, then run:

```sh
python scripts/prepare_reference.py /path/to/ne_10m_admin_0_countries_chn.zip
python scripts/validate_reference.py
```

The preparation script checks the archive hash, chooses the source features by name, bridges the small Macao gap, and writes the single exterior to `data/china-mainland-reference.geojson`. The regenerated file matched the bundled GeoJSON byte for byte (SHA-256 `9a872d354073a33aeb12d3f0f45fb78a753419eec3cb23e5d5dfac5049543073`). The bundled file is derived data, and its `status` property preserves the approximation warning.

## Using a separately obtained official source locally

Obtain a 2023 standard-map source from the official service and check its license, review number, coordinate reference system, and whether a usable vector is actually supplied. If authorized and a polygon vector is available, use a GIS tool locally to reproject to longitude/latitude (WGS 84), merge the mainland-connected parts, remove disconnected islands and interior holes, validate topology, and export a GeoJSON Feature containing a single counterclockwise exterior Polygon ring. Compare the result with the official source, especially disputed border segments and any coastal joins; do not assume the smoke tests above establish conformity. This process changes the map and does not by itself preserve its approval or grant redistribution rights. The bundled preparation script is specifically pinned to Natural Earth and does not automate this official-source workflow.
