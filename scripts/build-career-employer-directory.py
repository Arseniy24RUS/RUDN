#!/usr/bin/env python3
"""Build a small employer directory from the saved public vacancy bank."""

import argparse
from collections import Counter, defaultdict
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import tempfile


ROOT = Path(__file__).resolve().parents[1]
VACANCIES = ROOT / 'site/apps/career/data/vacancies'
ID = re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,246}')
PAGE = re.compile(r'pages/[a-f0-9]{2}/[a-f0-9]{24}/p[0-9]{4}-[a-f0-9]{16}\.json\.gz')
UUID = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}')
ARCHIVE_KEYS = ('archiveCount', 'nonArchiveCount', 'unknownArchiveCount')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_head(path):
    head = json.loads(gzip.decompress(path.read_bytes()))
    authority = path.name.removesuffix('.json.gz')
    require(ID.fullmatch(authority) and head['authorityId'] == authority, f'Invalid head ID: {path}')
    require(head['schemaVersion'] == 2, f'Invalid head schema: {path}')
    require(isinstance(head['pages'], list) and all(PAGE.fullmatch(ref['path']) for ref in head['pages']), f'Invalid page path: {path}')
    paths = tuple(sorted(ref['path'] for ref in head['pages']))
    require(len(paths) == len(set(paths)), f'Duplicate page references: {path}')
    require(sum(ref['count'] for ref in head['pages']) == head['jobCount'], f'Head count mismatch: {path}')
    if paths:
        require(isinstance(head['employerId'], str) and ID.fullmatch(head['employerId']), f'Invalid employer ID: {path}')
        require(isinstance(head['name'], str) and head['name'].strip(), f'Invalid published name: {path}')
    return head, paths


def read_page(bank, ref, employer, columns, known_ids):
    path = ref['path']
    packed = (bank / path).read_bytes()
    require(len(packed) == ref['bytes'] and sha256(packed) == ref['sha256'], f'Packed page differs: {path}')
    raw = gzip.decompress(packed)
    require(len(raw) == ref['uncompressedBytes'] and sha256(raw) == ref['uncompressedSHA256'], f'Unpacked page differs: {path}')
    page = json.loads(raw)
    require(page['schemaVersion'] == 2 and page['employerId'] == employer and page['columns'] == columns, f'Page identity differs: {path}')
    require(1 <= len(page['rows']) == ref['count'] <= 250, f'Page count differs: {path}')
    archive = Counter()
    scopes = Counter()
    for row in page['rows']:
        require(isinstance(row, list) and len(row) == len(columns), f'Invalid row: {path}')
        vacancy = row[0]
        require(UUID.fullmatch(vacancy) and vacancy not in known_ids, f'Duplicate or invalid vacancy ID: {vacancy}')
        known_ids.add(vacancy)
        flag = row[10]
        require(flag is None or type(flag) is bool, f'Invalid archive flag: {vacancy}')
        archive[flag] += 1
        scopes[row[2]] += 1
    require(archive[True] == ref['archiveCount'] and archive[False] == ref['nonArchiveCount'], f'Page archive counts differ: {path}')
    return archive, scopes


def build(bank):
    summary = json.loads((bank / 'summary.json').read_bytes())
    columns = summary['columns']
    require(summary['schemaVersion'] == 2 and columns[0] == 'id' and columns[2] == 'scope' and columns[10] == 'archive', 'Unexpected bank schema')
    heads = sorted((bank / 'employers').glob('*.json.gz'))
    require(len(heads) == summary['descriptorCount'], 'Head inventory differs from bank summary')
    groups = defaultdict(list)
    for path in heads:
        head, pages = read_head(path)
        if pages:
            groups[pages].append(head)

    employers = []
    known_ids = set()
    known_pages = set()
    known_employers = set()
    all_archive = Counter()
    all_scopes = Counter()
    alias_count = 0
    for pages, group in groups.items():
        canonical = [head for head in group if head['authorityId'] == head['employerId']]
        require(len(canonical) == 1, 'A page group needs exactly one canonical employer head')
        head = canonical[0]
        employer = head['employerId']
        require(employer not in known_employers and known_pages.isdisjoint(pages), f'Employer or page counted twice: {employer}')
        known_employers.add(employer)
        known_pages.update(pages)

        aliases = []
        for alias in group:
            if alias is head:
                continue
            for key in ('employerId', 'name', 'jobCount', 'pages', *ARCHIVE_KEYS):
                require(alias[key] == head[key], f'Alias differs from canonical head: {alias["authorityId"]} ({key})')
            aliases.append(alias['authorityId'])
        alias_count += len(aliases)

        archive = Counter()
        scopes = Counter()
        for ref in head['pages']:
            flags, types = read_page(bank, ref, employer, columns, known_ids)
            archive.update(flags)
            scopes.update(types)
        flags = [archive[True], archive[False], archive[None]]
        require(flags == [head[key] for key in ARCHIVE_KEYS] and dict(scopes) == head['scopeCounts'], f'Head status counts differ: {employer}')
        all_archive.update(archive)
        all_scopes.update(scopes)
        employers.append([employer, head['name'], head['jobCount'], *flags, len(pages), head.get('identityStatus'), sorted(aliases)])

    physical_pages = {p.relative_to(bank).as_posix() for p in (bank / 'pages').rglob('*.json.gz')}
    require(physical_pages == known_pages and len(known_pages) == summary['gzipPageCount'], 'Page inventory differs from bank summary')
    require(len(known_ids) == summary['jobCount'] == summary['uniqueUUIDCount'], 'Vacancy UUID inventory differs from bank summary')
    require(len(employers) == summary['employersWithJobs'], 'Canonical employer count differs from bank summary')
    require([all_archive[True], all_archive[False], all_archive[None]] == [summary[key] for key in ARCHIVE_KEYS], 'Archive totals differ from bank summary')
    require(dict(all_scopes) == summary['scopeCounts'], 'Source scope totals differ from bank summary')
    employers.sort(key=lambda row: (row[1].strip().casefold(), row[0]))
    return {
        'schemaVersion': 1,
        'kind': 'public-vacancy-employer-directory',
        'jobCount': len(known_ids),
        'pageCount': len(known_pages),
        'employerCount': len(employers),
        'aliasCount': alias_count,
        'snapshotAt': summary['snapshotAt'],
        'sourceDatasetSHA256': summary['sourceDatasetSHA256'],
        'employerMapSHA256': summary['employerMapSHA256'],
        'employers': employers,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bank', type=Path, default=VACANCIES / 'bank')
    parser.add_argument('--output', type=Path, default=VACANCIES / 'employer-directory.json.gz')
    args = parser.parse_args()
    value = build(args.bank.resolve())
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8') + b'\n'
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode='wb', filename='', compresslevel=9, mtime=0) as file:
        file.write(raw)
    packed = buffer.getvalue()
    require(len(raw) <= 4 * 1024 * 1024 and len(packed) <= 1024 * 1024, 'Directory exceeds the browser budget')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=args.output.parent, delete=False) as temp:
        temp.write(packed)
    try:
        os.chmod(temp.name, 0o644)
        os.replace(temp.name, args.output)
    finally:
        Path(temp.name).unlink(missing_ok=True)
    print(json.dumps({
        **{key: value[key] for key in ('jobCount', 'pageCount', 'employerCount', 'aliasCount')},
        'bytes': len(packed), 'uncompressedBytes': len(raw), 'sha256': sha256(packed),
        'file': str(args.output),
    }))


if __name__ == '__main__':
    main()
