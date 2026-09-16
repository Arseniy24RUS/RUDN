#!/usr/bin/env python3
"""Fail closed when a full puzzle matrix is missing cases, shards, or real maps."""
import argparse
import json
from pathlib import Path
from prepare_puzzle_catalog import build_catalog, write_json

SMOKE = {'russia-subjects', 'world-countries', 'municipal-274048', 'municipal-144764', 'adm1-MCO', 'adm1-USA', 'adm1-IDN'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', required=True, type=Path)
    parser.add_argument('--coverage', choices=('full', 'smoke'), default='full')
    args = parser.parse_args()
    maps = {entry['id'] for entry in build_catalog()} if args.coverage == 'full' else SMOKE
    expected = {(browser, identifier, level) for browser in ('chromium', 'firefox', 'webkit')
                for identifier in maps for level in ('easy', 'medium', 'hard')}
    expected_layout = {(browser, identifier) for browser in ('chromium', 'firefox', 'webkit') for identifier in maps}
    completed, layouts, errors = set(), set(), []
    network_coverage = {'browser': 0, 'connection-loss': 0}
    for path in args.artifacts.rglob('all-*.json'):
        report = json.loads(path.read_text(encoding='utf-8'))
        if report.get('suite') != 'all':
            continue
        if report.get('failed') or report.get('passed') != report.get('expected'):
            errors.append(f'Incomplete or failed report: {path.name}')
        for result in report['results']:
            key = (result['browser'], result['id'])
            if result.get('status') != 'passed':
                errors.append(f'Failed case: {key} {result.get("error")}')
                continue
            if result['suite'] == 'completion':
                case = (*key, result['difficulty'])
                if case in completed:
                    errors.append(f'Duplicate completion case: {case}')
                completed.add(case)
                if not result.get('offlineResume') or not result.get('hintAndReturn') or result.get('inputPieces') != result.get('features'):
                    errors.append(f'Missing actual input/offline/hint coverage: {case}')
                simulation = result.get('offlineSimulation')
                if simulation not in network_coverage or (key[0] != 'webkit' and simulation != 'browser'):
                    errors.append(f'Unexpected or weaker network simulation: {case}: {simulation}')
                else:
                    network_coverage[simulation] += 1
                if simulation == 'connection-loss' and not result.get('connectionLossVerified'):
                    errors.append(f'Unverified transport failure: {case}')
                if simulation == 'connection-loss':
                    proof = result.get('connectionLossProof', [])
                    expected_probes = [('before-outage', False), ('outage', True),
                                       ('recovered', False), ('outage-for-game', True)]
                    valid = len(proof) == 4 and len({item.get('nonce') for item in proof}) == 4
                    for item, (label, failed) in zip(proof, expected_probes):
                        valid = valid and item.get('label') == label and item.get('failed') is failed
                        valid = valid and item.get('serverHits', 0) > 0 and bool(item.get('nonce'))
                        valid = valid and item.get('serverState') == ('connection-loss' if failed else 'online')
                        valid = valid and (item.get('status') is None if failed else item.get('status') == 200)
                    if not valid:
                        errors.append(f'Missing server-observed outage/recovery proof: {case}')
            elif result['suite'] == 'layout':
                if key in layouts:
                    errors.append(f'Duplicate layout case: {key}')
                layouts.add(key)
                if result.get('viewportCount') != 12 or len(result.get('layout', [])) != 12:
                    errors.append(f'Missing viewport cases: {key}')
    if completed != expected:
        errors.append(f'Completion coverage: {len(completed)}/{len(expected)}. Missing: {sorted(expected-completed)[:15]} Extra: {sorted(completed-expected)[:5]}')
    if layouts != expected_layout:
        errors.append(f'Layout coverage: {len(layouts)}/{len(expected_layout)}. Missing: {sorted(expected_layout-layouts)[:15]}')
    summary = {'coverage': args.coverage, 'maps': len(maps), 'completionCases': len(completed),
               'layoutCases': len(layouts) * 12, 'networkCoverage': network_coverage,
               'networkLimitation': 'WebKit socket-loss coverage does not establish browser-emulated or physical-device offline navigation; see independent offline probe.',
               'passed': not errors, 'errors': errors}
    write_json(args.artifacts / 'puzzle-matrix-summary.json', summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return int(bool(errors))


if __name__ == '__main__':
    raise SystemExit(main())
