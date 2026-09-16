# Reviewed ADM1 sources

Four country datasets were reviewed on 2026-09-16 after the catalog audit found differences between upstream metadata and published geometry. Their files are bundled so the verified maps and feature counts do not depend on mutable API responses. `manifest.json` records exact output hashes, source URLs and hashes, source year, original counts, licenses and the transformations below. The audit fails if the bundled bytes or feature counts change without an updated review.

The original geoBoundaries source ZIPs are pinned to commit `5c25134028196d43ce97b5071934fd0cfc92f09f`; their SHA256 hashes were independently matched against Git LFS object IDs at that commit. Published GeoJSON comparison files are pinned to `9469f09`. No boundaries were invented and no geometry was simplified during these repairs. For each map the symmetric difference between the union of the input geometry and the repaired geometry was exactly zero, and all output polygons passed Shapely validity checks.

| Country | Upstream metadata | Published pieces | Reviewed pieces | Source year |
| --- | ---: | ---: | ---: | --- |
| Hungary | 20 | 19 | 20 | 2011 |
| Iran | 33 | 32 | 31 | 2017 |
| Turkmenistan | 6 | 5 | 6 | 2007 |
| Kosovo | 48 | 7 | 7 | 2021 |

## Hungary

[Hungarian Central Statistical Office](https://www.ksh.hu/regional-data) describes the capital and 19 counties. The [original geoBoundaries HUN source](https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/5c25134028196d43ce97b5071934fd0cfc92f09f/sourceData/gbOpen/HUN_ADM1.zip) contains all 20, including Budapest, whereas published full/simplified GeoJSON and TopoJSON contain only 19. All original WGS84 shapefile features were converted to GeoJSON, preserving their ISO codes. The exact source Budapest polygon was subtracted from Pest because the source stores the capital over the county; the two pieces no longer overlap. No other county geometry changed.

Attribution: geoBoundaries gbOpen and Wikimedia Commons. Upstream source license: **CC0 1.0 Universal Public Domain Dedication**. The source identifies [Hungary physical map](https://commons.wikimedia.org/wiki/File:Hungary_physical_map.svg).

## Iran

The [French Treasury country reference](https://www.tresor.economie.gouv.fr/Pays/IR/provinces-iraniennes) lists 31 provinces. The [original source](https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/5c25134028196d43ce97b5071934fd0cfc92f09f/sourceData/gbOpen/IRN_ADM1.zip) has 33 records with repeated Mazandaran and Golestan names. Published GeoJSON already removes one duplicate but represents Mazandaran as two adjacent, non-overlapping features. Their exact union forms one valid polygon. All other published features are unchanged, producing 31 provinces with no repeated province names and unchanged country coverage. The merged feature uses stable identifier `IR-21` from the source ISO code.

Attribution: **© OpenStreetMap contributors**, Wambacher and geoBoundaries gbOpen. Source and derived dataset license: **Open Data Commons Open Database License 1.0**; see [OpenStreetMap copyright and licensing](https://www.openstreetmap.org/copyright) and [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

## Turkmenistan

The [original geoBoundaries TKM source](https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/5c25134028196d43ce97b5071934fd0cfc92f09f/sourceData/gbOpen/TKM_ADM1.zip) contains five velayats plus Ashgabat. The published formats omit Ashgabat. All six original WGS84 shapefile features were restored with their ISO codes. The exact Ashgabat polygon was subtracted from Ahal, and the source spelling `Ahai` was corrected to `Ahal`. The [official census tables](https://www.stat.gov.tm/population-census-pdfs/results/en/6.pdf) list Ashgabat separately from the five velayats. This preserves the dataset's **2007** administrative division; it does not claim to represent the later creation of Arkadag.

Attribution: geoBoundaries gbOpen and Wikimedia Commons. Upstream source license: **Public Domain**. The source identifies [Turkmenistan districts](https://commons.wikimedia.org/wiki/File:Turkmenistan_districts.png).

## Kosovo

The [official administrative code register](https://gzk.rks-gov.net/ActDocumentDetail.aspx?ActID=16114) identifies the seven regions corresponding to the published districts. The [original geoBoundaries source](https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/5c25134028196d43ce97b5071934fd0cfc92f09f/sourceData/gbOpen/XKX_ADM1.zip) contains 48 mixed records: seven districts, 38 municipalities and three protected areas. Published geometry correctly retains the seven districts while its metadata still reports the mixed original count and labels them municipalities. The bundled published geometry is unchanged; the reviewed manifest identifies seven playable districts. The original count 48 remains in provenance and is not treated as a valid ADM1 count.

Attribution: **© OpenStreetMap contributors** and geoBoundaries gbOpen. Upstream `boundaryLicense`: **Creative Commons Attribution-ShareAlike 2.0**; see [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/). Underlying OpenStreetMap attribution and licensing information is available at [OpenStreetMap copyright](https://www.openstreetmap.org/copyright).

## Reproduction and validation

Generation used pyshp 3.1.4 for WGS84 shapefile conversion and Shapely 2.1.2 for exact difference/union and geometric validity checks. Hungary and Turkmenistan start from the pinned source SHP files; Iran and Kosovo start from the pinned published simplified GeoJSON URLs in the manifest. The transformations are specified above and all downloaded source hashes are recorded in the manifest. The regular catalog audit needs only Python's standard library and verifies decoded TopoJSON arcs, polygon rings, finite coordinates, localized names, normalized stable unique IDs, playable counts and reviewed file hashes. Browser tests then place every piece and verify offline restore and layouts.
