#!/usr/bin/env python3
"""Download and audit the complete puzzle catalog without touching production state.

Fixtures and audit evidence are written outside the checkout. Every remote ADM1
endpoint is checked; unavailable current APIs fall back to the catalog's pinned
official geoBoundaries URL. A missing/invalid geometry is an error, never a skip.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'site/assets/puzzle/data'


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def raw_url(url):
    # Match production puzzleGeometryUrl. Going directly to the official media
    # host avoids Git LFS pointer responses and an extra request for every map.
    return url.replace('https://github.com/wmgeolab/geoBoundaries/raw/',
                       'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/').replace(
                       'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/',
                       'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/')


def download_json(url, timeout):
    request = Request(raw_url(url), headers={'User-Agent': 'RUDN-puzzle-QA/1.0', 'Accept': 'application/json'})
    with urlopen(request, timeout=timeout) as response:
        body = response.read()
        if body.startswith(b'version https://git-lfs.github.com/spec/v1'):
            media = raw_url(url).replace('https://raw.githubusercontent.com/', 'https://media.githubusercontent.com/media/')
            with urlopen(Request(media, headers={'User-Agent': 'RUDN-puzzle-QA/1.0'}), timeout=timeout) as binary:
                body = binary.read()
                return json.loads(body), {'url': binary.url, 'bytes': len(body),
                                          'sha256': hashlib.sha256(body).hexdigest(), 'status': binary.status, 'gitLfs': True}
        return json.loads(body), {'url': response.url, 'bytes': len(body),
                                  'sha256': hashlib.sha256(body).hexdigest(), 'status': response.status,
                                  'requestedUrl': url}


def finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def topology_features(value):
    """Decode the same object selected by engine.bestTopologyObject; reject bad arcs."""
    objects = value.get('objects') or {}
    if not isinstance(objects, dict) or not objects:
        raise ValueError('Topology has no objects')
    key = max(objects, key=lambda name: len(objects[name].get('geometries', [])))
    selected = objects[key]
    arcs = value.get('arcs')
    if not isinstance(arcs, list) or not arcs:
        raise ValueError('Topology has no arcs')
    transform = value.get('transform')
    if transform is not None:
        if not isinstance(transform, dict) or any(not isinstance(transform.get(field), list) or len(transform[field]) != 2
                or not all(finite_number(n) for n in transform[field]) for field in ('scale', 'translate')):
            raise ValueError('Topology has an invalid transform')
        if not all(transform['scale']):
            raise ValueError('Topology transform has a zero scale')
    decoded = []
    for index, arc in enumerate(arcs):
        if not isinstance(arc, list) or len(arc) < 2:
            raise ValueError(f'Topology arc {index} is empty/short')
        points, x, y = [], 0, 0
        for point in arc:
            if not isinstance(point, list) or len(point) < 2 or not all(finite_number(n) for n in point[:2]):
                raise ValueError(f'Topology arc {index} contains invalid coordinates')
            if transform:
                x += point[0]; y += point[1]
                coordinate = [x * transform['scale'][0] + transform['translate'][0],
                              y * transform['scale'][1] + transform['translate'][1]]
            else:
                coordinate = point[:2]
            if not all(finite_number(n) for n in coordinate):
                raise ValueError(f'Topology arc {index} decodes to non-finite coordinates')
            points.append(coordinate)
        decoded.append(points)
    references = 0

    def ring_from_arcs(indices):
        nonlocal references
        if not isinstance(indices, list) or not indices:
            raise ValueError('Topology has an empty ring reference')
        ring = []
        for reference in indices:
            if not isinstance(reference, int) or isinstance(reference, bool):
                raise ValueError(f'Invalid Topology arc reference {reference!r}')
            index = reference if reference >= 0 else ~reference
            if not 0 <= index < len(decoded):
                raise ValueError(f'Topology arc reference {reference} is out of range')
            points = decoded[index] if reference >= 0 else list(reversed(decoded[index]))
            if ring and ring[-1] != points[0]:
                raise ValueError(f'Topology arc {reference} is disconnected from the preceding arc')
            if ring:
                ring.pop()
            ring.extend(points)
            references += 1
        return ring

    geometries = selected.get('geometries', []) if selected.get('type') == 'GeometryCollection' else [selected]
    features = []
    for index, geometry in enumerate(geometries):
        kind = geometry.get('type')
        if kind not in ('Polygon', 'MultiPolygon'):
            raise ValueError(f'Topology feature {index} has unsupported geometry {kind}')
        polygons = [geometry.get('arcs')] if kind == 'Polygon' else geometry.get('arcs')
        if not isinstance(polygons, list) or not polygons or any(not isinstance(p, list) or not p for p in polygons):
            raise ValueError(f'Topology feature {index} has no polygon rings')
        coordinates = [[ring_from_arcs(ring) for ring in polygon] for polygon in polygons]
        features.append({'type': 'Feature', 'id': geometry.get('id'), 'properties': geometry.get('properties'),
                         'geometry': {'type': kind, 'coordinates': coordinates[0] if kind == 'Polygon' else coordinates}})
    return features, {'selectedObject': key, 'objects': len(objects), 'arcs': len(arcs),
                      'arcReferences': references, 'transformed': transform is not None}


def normalized_names_and_ids(features, mode):
    """Match engine fallbacks, including valid id=0 and duplicate-ID suffixes."""
    common_names = ['name_ru', 'NAME_RU', 'name', 'NAME', 'shapeName', 'ADMIN', 'admin', 'name_en', 'NAME_EN', 'GEOUNIT', 'BRK_NAME']
    language_names = {'ru': ['name_ru', 'NAME_RU', 'name', 'NAME'],
                      'en': ['name_en', 'name:en', 'NAME_EN', 'shapeName', 'ADMIN', 'admin'],
                      'zh': ['name_zh', 'NAME_ZH', 'name_en', 'NAME_EN']}
    id_keys = ['id', 'shapeID', 'iso_3166_2', 'ISO_A3', 'ADM0_A3', 'adm0_a3', 'iso_a3', 'SOV_A3', 'sov_a3', 'GID_1', 'GID_2']
    exclusions, identities, name_sources = [], {}, {}
    raw_missing = duplicates = 0
    for locale, preferred in language_names.items():
        seen, ids, sources, names = set(), [], {}, {}
        for index, feature in enumerate(features):
            properties = feature.get('properties') or {}
            candidates = [(key, properties.get(key)) for key in preferred + common_names] + [('feature.id', feature.get('id'))]
            field, name = next(((key, name.strip()) for key, name in candidates if isinstance(name, str) and name.strip()), (None, None))
            if name is None:
                raise ValueError(f'Feature {index} has no display name for {locale}; engine would show a generic territory label')
            code = next((properties.get(key) for key in ['ADM0_A3', 'adm0_a3', 'ISO_A3', 'iso_a3', 'SOV_A3', 'sov_a3'] if properties.get(key)), '')
            if mode == 'world-countries' and str(code).upper() in ('ATA', 'ATF'):
                if locale == 'ru':
                    exclusions.append({'index': index, 'id': feature.get('id'), 'countryCode': str(code).upper(), 'name': name, 'reason': 'engine-world-code-filter'})
                continue
            values = [feature.get('id')] + [properties.get(key) for key in id_keys]
            candidate = next((candidate for candidate in values if candidate is not None and str(candidate).strip()), None)
            if isinstance(candidate, (dict, list, bool)):
                raise ValueError(f'Feature {index} has an invalid structured/boolean identifier')
            if isinstance(candidate, (float, int)) and not finite_number(candidate):
                raise ValueError(f'Feature {index} has a non-finite identifier')
            identifier = str(int(candidate)) if isinstance(candidate, float) and candidate.is_integer() else str(candidate) if candidate is not None else f'feature-{index + 1}'
            duplicate = identifier in seen
            if duplicate:
                identifier = f'{identifier}-{index + 1}'
            if not identifier.strip() or identifier in seen:
                raise ValueError(f'Feature {index} has a duplicate normalized identifier {identifier!r}')
            seen.add(identifier);ids.append(identifier)
            sources[field] = sources.get(field, 0) + 1
            names[name] = names.get(name, 0) + 1
            if locale == 'ru':
                raw_missing += candidate is None
                duplicates += duplicate
        identities[locale] = ids
        name_sources[locale] = {'fields': sources, 'repeatedNames': {name: count for name, count in names.items() if count > 1}}
    if identities['ru'] != identities['en'] or identities['ru'] != identities['zh']:
        raise ValueError('Locale changes the playable feature set or normalized identities')
    return {'features': len(identities['ru']), 'rawFeatures': len(features), 'excludedFeatures': exclusions,
            'names': {'locales': list(language_names), 'sourceFields': name_sources},
            'identifiers': {'unique': True, 'stableAcrossLocales': True, 'generatedFromIndex': raw_missing,
                            'disambiguatedDuplicates': duplicates,
                            'sha256': hashlib.sha256(json.dumps(identities['ru'], ensure_ascii=False).encode()).hexdigest()}}


def audit_geometry(value, mode=None):
    if value.get('type') == 'Topology':
        features, topology = topology_features(value)
    elif value.get('type') == 'FeatureCollection':
        features, topology = value.get('features', []), None
    else:
        raise ValueError('Expected FeatureCollection or Topology')
    if not isinstance(features, list):
        raise ValueError('Invalid feature collection')
    if len(features) < 1:
        raise ValueError('Map has no pieces')
    vertices = 0
    geometry_types = set()
    for index, feature in enumerate(features):
        if not isinstance(feature, dict) or feature.get('type') != 'Feature':
            raise ValueError(f'Feature {index} is not a GeoJSON Feature')
        if feature.get('properties') is not None and not isinstance(feature['properties'], dict):
            raise ValueError(f'Feature {index} has invalid properties')
        geometry = feature.get('geometry') or {}
        geometry_types.add(geometry.get('type'))
        if geometry.get('type') not in ('Polygon', 'MultiPolygon'):
            raise ValueError(f'Feature {index} has unsupported geometry {geometry.get("type")}')
        polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
        if not polygons:
            raise ValueError(f'Feature {index} has no polygons')
        for polygon in polygons:
            if not polygon:
                raise ValueError(f'Feature {index} has no rings')
            for ring in polygon:
                if len(ring) < 4 or ring[0][:2] != ring[-1][:2]:
                    raise ValueError(f'Feature {index} has an open/short ring')
                for coordinate in ring:
                    if not isinstance(coordinate, list) or len(coordinate) < 2 or not all(finite_number(n) for n in coordinate[:2]):
                        raise ValueError(f'Feature {index} contains non-finite coordinates')
                    vertices += 1
                if len({tuple(point[:2]) for point in ring}) < 3:
                    raise ValueError(f'Feature {index} has a degenerate ring with fewer than three distinct positions')
    normalized = normalized_names_and_ids(features, mode)
    if normalized['features'] < 1:
        raise ValueError('No playable features remain after engine normalization')
    return {**normalized, 'singlePiece': normalized['features'] == 1, 'vertices': vertices, 'format': value['type'],
            'geometryTypes': sorted(geometry_types), **({'topology': topology} if topology else {})}


def verify_auditor():
    """Negative cases keep the catalog gate from silently accepting corrupt input."""
    feature = {'type': 'Feature', 'id': 0, 'properties': {'name': 'Named territory'},
               'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [2, 0], [0, 2], [0, 0]]]}}
    valid = {'type': 'FeatureCollection', 'features': [feature]}
    assert audit_geometry(valid)['identifiers']['generatedFromIndex'] == 0
    generated = deepcopy(valid);del generated['features'][0]['id']
    assert audit_geometry(generated)['identifiers']['generatedFromIndex'] == 1
    duplicate = deepcopy(valid);duplicate['features'].append(deepcopy(feature))
    assert audit_geometry(duplicate)['identifiers']['disambiguatedDuplicates'] == 1
    topology = {'type': 'Topology', 'transform': {'scale': [0.5, 0.5], 'translate': [10, 20]},
                'objects': {'land': {'type': 'GeometryCollection', 'geometries': [
                    {'type': 'Polygon', 'id': 0, 'properties': {'name': 'Territory'}, 'arcs': [[-1]]}]}},
                'arcs': [[[0, 0], [2, 0], [-2, 2], [0, -2]]]}
    assert audit_geometry(topology)['topology']['transformed']
    converted, _ = topology_features(topology)
    assert converted[0]['geometry']['coordinates'][0] == [[10, 20], [10, 21], [11, 20], [10, 20]]
    invalid = []
    broken = deepcopy(valid);broken['features'][0]['geometry']['coordinates'][0][-1] = [8, 8];invalid.append(broken)
    broken = deepcopy(valid);broken['features'][0]['geometry']['coordinates'][0][1] = [float('nan'), 1];invalid.append(broken)
    broken = deepcopy(valid);broken['features'][0]['properties'] = {};invalid.append(broken)
    broken = deepcopy(valid);broken['features'] = [deepcopy(feature) for _ in range(3)]
    for item, identifier in zip(broken['features'], ['same-3', 'same', 'same']):item['id'] = identifier
    invalid.append(broken)
    broken = deepcopy(topology);broken['objects']['land']['geometries'][0]['arcs'] = [[99]];invalid.append(broken)
    broken = deepcopy(topology);broken['transform']['scale'][0] = float('inf');invalid.append(broken)
    broken = deepcopy(topology);broken['arcs'].append([[9, 9], [1, 1]])
    broken['objects']['land']['geometries'][0]['arcs'] = [[0, 1]];invalid.append(broken)
    for index, broken in enumerate(invalid):
        try:
            audit_geometry(broken)
        except (ValueError, TypeError):
            continue
        raise AssertionError(f'Auditor accepted corrupt fixture {index}')


def build_catalog(*, include_legacy=False):
    municipal = read_json(DATA / 'municipal/catalog.json')
    local_adm = {entry['iso']: entry for entry in read_json(DATA / 'adm1/manifest.json')}
    catalog = read_json(DATA / 'geoboundaries_adm1_catalog.json')
    maps = [
        {'id': 'russia-subjects', 'mode': 'russia-subjects', 'selection': None,
         'localPath': 'russia_subjects_89.topojson', 'expectedFeatures': 89},
        {'id': 'world-countries', 'mode': 'world-countries', 'selection': None,
         'localPath': 'world_countries_50m.geojson', 'expectedFeatures': 240},
    ]
    for item in municipal['subjects']:
        maps.append({'id': f'municipal-{item["id"]}', 'mode': 'russia-municipalities',
                     'selection': str(item['id']), 'localPath': f'municipal/subject-{item["id"]}.geojson',
                     'expectedFeatures': item.get('units')})
    seen = set()
    for item in catalog:
        iso = item['boundaryISO']
        if iso in seen:
            raise ValueError(f'Duplicate ADM1 country {iso}: remove invalid catalog row')
        seen.add(iso)
        # Russia now selects the author-provided 89-subject map above. The old
        # external RUS entry remains shipped only to restore existing attempts.
        if iso == 'RUS' and not include_legacy:
            continue
        entry = {'legacyOnly': iso == 'RUS', 'id': f'adm1-{iso}', 'mode': 'country-regions', 'selection': iso, 'catalogMetadata': item}
        if iso == 'USA':
            entry.update(localPath='usa_states.geojson', expectedFeatures=51)
        elif iso in local_adm:
            entry.update(localPath=f'adm1/{iso}.geojson', expectedFeatures=local_adm[iso].get('features'))
            if local_adm[iso].get('sha256'):
                entry['expectedSha256'] = local_adm[iso]['sha256']
            if local_adm[iso].get('provenance'):
                entry['sourceReview'] = local_adm[iso]['provenance']
        else:
            entry['apiUrl'] = f'https://www.geoboundaries.org/api/current/gbOpen/{iso}/ADM1/'
        maps.append(entry)
    return maps


def provenance(result):
    if result.get('source') == 'bundled':
        return {'apiAvailability': 'not-required', 'geometrySource': 'bundled'}
    api = result.get('api', {})
    return {'apiAvailability': 'available' if api.get('status') == 200 and not api.get('error') else 'unavailable',
            'apiCheckedAt': result.get('sourceCheckedAt', result.get('checkedAt')),
            'geometrySource': result.get('source'),
            'fallbackReason': result.get('fallbackReason', 'not-recorded-in-existing-evidence') if result.get('source') == 'pinned-catalog' else None}


def prepare(entry, output, timeout, refresh, reuse_only=False):
    started = time.monotonic()
    result = {**entry, 'checkedAt': datetime.now(timezone.utc).isoformat(), 'status': 'failed'}
    try:
        if entry.get('localPath'):
            path = DATA / entry['localPath']
            value = read_json(path)
            result.update(geometryPath=str(path), source='bundled', audit=audit_geometry(value, entry['mode']),
                          sha256=hashlib.sha256(path.read_bytes()).hexdigest())
            if entry.get('expectedSha256') and result['sha256'] != entry['expectedSha256']:
                raise ValueError('Reviewed bundled geometry differs from its verified manifest SHA256')
        else:
            fixture = output / 'fixtures' / f'{entry["selection"]}.geojson'
            metadata_path = output / 'fixtures' / f'{entry["selection"]}.metadata.json'
            evidence_path = output / 'fixtures' / f'{entry["selection"]}.evidence.json'
            if not refresh and fixture.exists() and metadata_path.exists() and evidence_path.exists():
                previous = read_json(evidence_path)
                result.update(previous, checkedAt=datetime.now(timezone.utc).isoformat(),
                              sourceCheckedAt=previous.get('sourceCheckedAt', previous.get('checkedAt')),
                              geometryPath=str(fixture), metadataPath=str(metadata_path),
                              audit=audit_geometry(read_json(fixture), entry['mode']), reused=True)
                metadata = read_json(metadata_path)
                if metadata.get('boundaryISO') != entry['selection'] or metadata.get('boundaryType') != 'ADM1':
                    raise ValueError('Cached metadata does not identify the requested ADM1 country')
                expected = metadata.get('admUnitCount')
                if expected is not None and int(expected) != result['audit']['features']:
                    raise ValueError(f'Fixture count {result["audit"]["features"]} does not match metadata {expected}')
                result.update(status='passed', provenance=provenance(result),
                              fixtureSha256=hashlib.sha256(fixture.read_bytes()).hexdigest(),
                              metadataSha256=hashlib.sha256(metadata_path.read_bytes()).hexdigest(),
                              seconds=round(time.monotonic() - started, 3))
                result.pop('error', None)
                return result
            if reuse_only:
                raise ValueError('Required existing fixture, metadata or source evidence is missing; downloads disabled')
            metadata = entry['catalogMetadata']
            try:
                current, evidence = download_json(entry['apiUrl'], min(timeout, 8))
                if not isinstance(current, dict) or current.get('boundaryISO') != entry['selection'] or current.get('boundaryType') != 'ADM1':
                    raise ValueError('Current API returned invalid ADM1 metadata')
                metadata = current
                result.update(api=evidence, source='current-api')
                api_path = output / 'fixtures' / f'{entry["selection"]}.api-metadata.json'
                write_json(api_path, current)
                result['apiMetadataPath'] = str(api_path)
            except Exception as error:
                result.update(api={'url': entry['apiUrl'], 'error': str(error)}, source='pinned-catalog', fallbackReason='current-api-unavailable-or-invalid')
            candidates = [metadata.get('simplifiedGeometryGeoJSON'), metadata.get('gjDownloadURL')]
            if metadata != entry['catalogMetadata']:
                candidates += [entry['catalogMetadata'].get('simplifiedGeometryGeoJSON'), entry['catalogMetadata'].get('gjDownloadURL')]
            failures = []
            for url in dict.fromkeys(url for url in candidates if url):
                try:
                    value, evidence = download_json(url, timeout)
                    audit = audit_geometry(value, entry['mode'])
                    result.update(geometry=evidence, audit=audit, geometryPath=str(fixture), metadataPath=str(metadata_path))
                    if url not in (metadata.get('simplifiedGeometryGeoJSON'), metadata.get('gjDownloadURL')):
                        metadata = entry['catalogMetadata']
                        result['source'] = 'pinned-catalog'
                        result['fallbackReason'] = 'current-geometry-download-failed' if failures else 'current-api-has-no-geometry-url'
                    if metadata.get('admUnitCount') is not None and int(metadata['admUnitCount']) != audit['features']:
                        raise ValueError(f'Geometry count {audit["features"]} does not match metadata {metadata["admUnitCount"]}')
                    write_json(fixture, value)
                    write_json(metadata_path, metadata)
                    result.update(fixtureSha256=hashlib.sha256(fixture.read_bytes()).hexdigest(),
                                  metadataSha256=hashlib.sha256(metadata_path.read_bytes()).hexdigest())
                    break
                except Exception as error:
                    failures.append({'url': url, 'error': str(error)})
            else:
                raise ValueError(f'No valid geometry: {failures}')
            if failures:
                result['downloadFailures'] = failures
        expected = entry.get('expectedFeatures')
        if expected is not None and int(expected) != result['audit']['features']:
            raise ValueError(f'Feature count {result["audit"]["features"]} does not match catalog {expected}')
        result['status'] = 'passed'
    except Exception as error:
        result.update(status='failed', error=str(error))
    result['provenance'] = provenance(result)
    result['seconds'] = round(time.monotonic() - started, 3)
    if not entry.get('localPath'):
        write_json(output / 'fixtures' / f'{entry["selection"]}.evidence.json', result)
    return result


def main():
    verify_auditor()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--workers', type=int, default=8)
    parser.add_argument('--timeout', type=float, default=20)
    parser.add_argument('--refresh', action='store_true', help='Recheck API and geometry even with valid fixtures')
    parser.add_argument('--reuse-only', action='store_true', help='Audit existing fixtures only; missing source evidence fails without any network request')
    parser.add_argument('--only', help='Comma-separated map IDs for development; never reported as full coverage')
    args = parser.parse_args()
    if args.refresh and args.reuse_only:
        parser.error('--refresh and --reuse-only are mutually exclusive')
    args.output = args.output.resolve()
    if args.output.is_relative_to(ROOT):
        parser.error('QA fixtures must be outside the repository')
    args.output.mkdir(parents=True, exist_ok=True)
    maps = build_catalog(include_legacy=True)
    selected = set(args.only.split(',')) if args.only else None
    if selected:
        unknown = selected - {item['id'] for item in maps}
        if unknown:
            parser.error(f'Unknown map IDs: {sorted(unknown)}')
        maps = [item for item in maps if item['id'] in selected]
    results = []
    with ThreadPoolExecutor(max_workers=max(1, min(16, args.workers))) as pool:
        futures = {pool.submit(prepare, entry, args.output, args.timeout, args.refresh, args.reuse_only): entry for entry in maps}
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            print(f'{len(results):03d}/{len(maps)} {result["id"]} {result["status"]} {result.get("source", "")} {result.get("audit", {}).get("features", "")} {result.get("error", "")}', flush=True)
            report = {'schemaVersion': 2, 'partial': bool(selected), 'expectedMaps': len(maps), 'selectableMaps':len(build_catalog()), 'legacyMaps':['adm1-RUS'],
                      'passed': sum(item['status'] == 'passed' for item in results),
                      'failed': sum(item['status'] != 'passed' for item in results),
                      'apiUnavailable': sorted(item['id'] for item in results if item.get('provenance', {}).get('apiAvailability') == 'unavailable'),
                      'pinnedGeometry': sorted(item['id'] for item in results if item.get('source') == 'pinned-catalog'),
                      'maps': sorted(results, key=lambda item: item['id'])}
            write_json(args.output / 'catalog-audit.json', report)
    return 1 if report['failed'] else 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
