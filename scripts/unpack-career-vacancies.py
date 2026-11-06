"""Reconstruct the public, lazy vacancy bank from its byte-checked source seed."""
import argparse
import hashlib
import io
import json
import pathlib
import shutil
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SEED = ROOT / 'source-audit/career-vacancies'
TARGET = ROOT / 'site/apps/career/data/vacancies/bank'

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def unpack(seed=SEED, target=TARGET):
    manifest = json.loads((seed / 'seed.json').read_bytes())
    if manifest.get('schemaVersion') != 1:
        raise ValueError('Unsupported vacancy seed version')
    parts = []
    for entry in manifest['parts']:
        name = entry['path']
        if pathlib.PurePosixPath(name).name != name:
            raise ValueError('Invalid seed part path')
        raw = (seed / name).read_bytes()
        if len(raw) != entry['bytes'] or digest(raw) != entry['sha256']:
            raise ValueError('Vacancy seed part integrity mismatch')
        parts.append(raw)
    raw = b''.join(parts)
    if len(raw) != manifest['archiveBytes'] or digest(raw) != manifest['archiveSha256']:
        raise ValueError('Vacancy seed archive integrity mismatch')
    staging = target.with_name(target.name + '.unpacking')
    if staging.exists():
        raise ValueError('An incomplete vacancy unpack already exists')
    staging.mkdir(parents=True)
    records = []
    try:
        with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
            members = archive.getmembers()
            if len(members) > 40000 or sum(m.size for m in members) > 128 * 1024 * 1024:
                raise ValueError('Public vacancy seed expansion limit exceeded')
            seen = set()
            for member in members:
                rel = pathlib.PurePosixPath(member.name)
                if (not member.isfile() or rel.is_absolute() or '..' in rel.parts
                        or member.name in seen or member.size > 2 * 1024 * 1024
                        or not (member.name == 'summary.json' or
                                member.name.endswith('.json.gz') and rel.parts[0] in ('employers', 'pages'))):
                    raise ValueError('Invalid public vacancy seed member: ' + member.name)
                seen.add(member.name)
                payload = archive.extractfile(member).read()
                if len(payload) != member.size:
                    raise ValueError('Incomplete public vacancy member')
                path = staging.joinpath(*rel.parts)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(payload)
                records.append((member.name, digest(payload), len(payload)))
        records.sort()
        tree = ''.join(f'{name}\0{sha}\0{size}\n' for name, sha, size in records).encode()
        if len(records) != manifest['fileCount'] or digest(tree) != manifest['treeSha256']:
            raise ValueError('Public vacancy dataset tree mismatch')
        # Only generated files in this one dataset directory can be replaced.
        if target.exists():
            shutil.rmtree(target)
        staging.rename(target)
    except BaseException:
        shutil.rmtree(staging)
        raise
    result = {'status': 'pass', 'files': len(records),
              'publicBytes': sum(n for _, _, n in records),
              'archiveBytes': len(raw), 'treeSha256': manifest['treeSha256'],
              'vacancies': manifest['vacancies'], 'wholeBankClientFetch': False}
    print(json.dumps(result))
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seed', type=pathlib.Path, default=SEED)
    parser.add_argument('--out', type=pathlib.Path, default=TARGET)
    args = parser.parse_args()
    unpack(args.seed.resolve(), args.out.resolve())
