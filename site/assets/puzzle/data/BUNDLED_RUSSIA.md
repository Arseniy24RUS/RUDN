# Compact fallback for the Russia puzzle geometry

The graded map has a same-origin compact TopoJSON fallback,
`russia_subjects_89.compact.json`, served with a conventional `.json` extension.
The original `russia_subjects_89.topojson` remains unchanged and is still the
primary data source. The fallback is intended only for an unavailable or timed
out primary geometry request. The puzzle HTML does not contain map geometry.

Rebuild with `node scripts/build-puzzle-map.mjs`. Verify committed output with
`node scripts/build-puzzle-map.mjs --check`. The builder uses Node built-ins only.
The generated `.meta.json` records both SHA-256 hashes, byte counts, the coordinate
error measured over every vertex, and the complete geometry counts.

Coordinates are encoded on a fixed 0.0000001-degree grid with integer deltas,
TopoJSON `transform.scale = [1e-7, 1e-7]`, and `translate = [0, 0]`. Every vertex
and its order are retained, including duplicate points and zero-length deltas.
No simplification is performed. The 89 subjects' properties, IDs, polygon/ring
references, arc counts and original bounds are unchanged.

The existing source already lies on this grid apart from floating-point
representation noise. The builder measures reconstruction using the same
integer accumulation and multiplication as TopoJSON-client and rejects any
source coordinate whose reconstruction error exceeds 1e-12 degrees per axis.
The measured maximum for the current source is 8.526512829121202e-14 degrees per
axis, corresponding to floating-point representation noise. Conservatively
using 111,700 metres per degree on both axes, the maximum measured point
displacement is 1.003929852006445e-8 metres. Non-finite points, unsafe integers,
changed subject counts, unsupported geometry types, and reconstruction errors
above the bound fail the build. A future source with more decimal precision
therefore requires an explicit encoding revision instead of silent rounding.

Only the compact encoding is added. Existing dataset identifiers and feature
properties remain suitable for matching previously saved attempts.
