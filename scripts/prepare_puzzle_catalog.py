#!/usr/bin/env python3
"""Download and audit the complete puzzle catalog without touching production state.

Fixtures and audit evidence are written outside the checkout. Every remote ADM1
endpoint is checked; unavailable current APIs fall back to the catalog's pinned
official geoBoundaries URL. A missing/invalid geometry is an error, never a skip.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
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
    return url.replace('https://github.com/wmgeolab/geoBoundaries/raw/',
                       'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/')


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
                                  'sha256': hashlib.sha256(body).hexdigest(), 'status': response.status}


def audit_geometry(value):
    if value.get('type') == 'Topology':
        objects = list(value.get('objects', {}).values())
        count = max((len(obj.get('geometries', [])) for obj in objects), default=0)
        if count < 1:
            raise ValueError('Topology has no pieces')
        return {'features': count, 'format': 'Topology'}
    if value.get('type') != 'FeatureCollection':
        raise ValueError('Expected FeatureCollection or Topology')
    features = value.get('features', [])
    if len(features) < 1:
        raise ValueError('Map has no pieces')
    vertices = 0
    geometry_types = set()
    for index, feature in enumerate(features):
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
                    if len(coordinate) < 2 or not all(isinstance(n, (int, float)) and math.isfinite(n) for n in coordinate[:2]):
                        raise ValueError(f'Feature {index} contains non-finite coordinates')
                    vertices += 1
    return {'features': len(features), 'singlePiece': len(features) == 1, 'vertices': vertices, 'format': 'FeatureCollection',
            'geometryTypes': sorted(geometry_types)}


def build_catalog():
    municipal = read_json(DATA / 'municipal/catalog.json')
    local_adm = {entry['iso']: entry for entry in read_json(DATA / 'adm1/manifest.json')}
    catalog = read_json(DATA / 'geoboundaries_adm1_catalog.json')
    maps = [
        {'id': 'russia-subjects', 'mode': 'russia-subjects', 'selection': None,
         'localPath': 'russia_subjects_89.topojson', 'expectedFeatures': 89},
        {'id': 'world-countries', 'mode': 'world-countries', 'selection': None,
         'localPath': 'world_countries_50m.geojson'},
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
        entry = {'id': f'adm1-{iso}', 'mode': 'country-regions', 'selection': iso, 'catalogMetadata': item}
        if iso == 'USA':
            entry.update(localPath='usa_states.geojson', expectedFeatures=51)
        elif iso in local_adm:
            entry.update(localPath=f'adm1/{iso}.geojson', expectedFeatures=local_adm[iso].get('features'))
        else:
            entry['apiUrl'] = f'https://www.geoboundaries.org/api/current/gbOpen/{iso}/ADM1/'
        maps.append(entry)
    return maps


def prepare(entry, output, timeout, refresh):
    started = time.monotonic()
    result = {**entry, 'checkedAt': datetime.now(timezone.utc).isoformat(), 'status': 'failed'}
    try:
        if entry.get('localPath'):
            path = DATA / entry['localPath']
            value = read_json(path)
            result.update(geometryPath=str(path), source='bundled', audit=audit_geometry(value),
                          sha256=hashlib.sha256(path.read_bytes()).hexdigest())
        else:
            fixture = output / 'fixtures' / f'{entry["selection"]}.geojson'
            metadata_path = output / 'fixtures' / f'{entry["selection"]}.metadata.json'
            evidence_path = output / 'fixtures' / f'{entry["selection"]}.evidence.json'
            if not refresh and fixture.exists() and metadata_path.exists() and evidence_path.exists():
                result.update(read_json(evidence_path), geometryPath=str(fixture), metadataPath=str(metadata_path),
                              audit=audit_geometry(read_json(fixture)), reused=True)
                return result
            metadata = entry['catalogMetadata']
            try:
                current, evidence = download_json(entry['apiUrl'], timeout)
                if not isinstance(current, dict) or current.get('boundaryISO') != entry['selection'] or current.get('boundaryType') != 'ADM1':
                    raise ValueError('Current API returned invalid ADM1 metadata')
                metadata = current
                result.update(api=evidence, source='current-api')
            except Exception as error:
                result.update(api={'url': entry['apiUrl'], 'error': str(error)}, source='pinned-catalog')
            candidates = [metadata.get('simplifiedGeometryGeoJSON'), metadata.get('gjDownloadURL')]
            if metadata != entry['catalogMetadata']:
                candidates += [entry['catalogMetadata'].get('simplifiedGeometryGeoJSON'), entry['catalogMetadata'].get('gjDownloadURL')]
            failures = []
            for url in dict.fromkeys(url for url in candidates if url):
                try:
                    value, evidence = download_json(url, timeout)
                    audit = audit_geometry(value)
                    result.update(geometry=evidence, audit=audit, geometryPath=str(fixture), metadataPath=str(metadata_path))
                    if url not in (metadata.get('simplifiedGeometryGeoJSON'), metadata.get('gjDownloadURL')):
                        metadata = entry['catalogMetadata']
                        result['source'] = 'pinned-catalog'
                    write_json(fixture, value)
                    write_json(metadata_path, metadata)
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
        result['error'] = str(error)
    result['seconds'] = round(time.monotonic() - started, 3)
    if not entry.get('localPath'):
        write_json(output / 'fixtures' / f'{entry["selection"]}.evidence.json', result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--workers', type=int, default=8)
    parser.add_argument('--timeout', type=float, default=20)
    parser.add_argument('--refresh', action='store_true', help='Recheck API and geometry even with valid fixtures')
    parser.add_argument('--only', help='Comma-separated map IDs for development; never reported as full coverage')
    args = parser.parse_args()
    args.output = args.output.resolve()
    if args.output.is_relative_to(ROOT):
        parser.error('QA fixtures must be outside the repository')
    args.output.mkdir(parents=True, exist_ok=True)
    maps = build_catalog()
    selected = set(args.only.split(',')) if args.only else None
    if selected:
        unknown = selected - {item['id'] for item in maps}
        if unknown:
            parser.error(f'Unknown map IDs: {sorted(unknown)}')
        maps = [item for item in maps if item['id'] in selected]
    results = []
    with ThreadPoolExecutor(max_workers=max(1, min(16, args.workers))) as pool:
        futures = {pool.submit(prepare, entry, args.output, args.timeout, args.refresh): entry for entry in maps}
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            print(f'{len(results):03d}/{len(maps)} {result["id"]} {result["status"]} {result.get("source", "")} {result.get("audit", {}).get("features", "")} {result.get("error", "")}', flush=True)
            report = {'schemaVersion': 1, 'partial': bool(selected), 'expectedMaps': len(maps),
                      'passed': sum(item['status'] == 'passed' for item in results),
                      'failed': sum(item['status'] != 'passed' for item in results),
                      'maps': sorted(results, key=lambda item: item['id'])}
            write_json(args.output / 'catalog-audit.json', report)
    return 1 if report['failed'] else 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
