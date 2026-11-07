#!/usr/bin/env python3
"""Materialize exact packaged bytes on the dedicated data branch; no downloads."""
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tempfile

ROOT=Path.cwd().resolve()
MANIFEST=ROOT/'career-adaptive-materialization/manifest.json'

def check(condition,message):
    if not condition:raise ValueError(message)

def path(relative):
    part=PurePosixPath(relative)
    check(relative and not part.is_absolute() and '..' not in part.parts and str(part)==relative and '\\' not in relative,'unsafe path')
    p=ROOT
    for item in part.parts:
        p=p/item
        check(not p.is_symlink(),'symlink path')
    check(p.resolve().is_relative_to(ROOT),'outside worktree')
    return p

def sha(data):return hashlib.sha256(data).hexdigest()
def blob(data):return hashlib.sha1(b'blob '+str(len(data)).encode('ascii')+b'\0'+data).hexdigest()

def main():
    s=json.loads(MANIFEST.read_text())
    check(s['schemaVersion']==1 and s['branch']=='codex/career-adaptive-index-20261107','unexpected materialization contract')
    check(os.environ.get('GITHUB_REF')=='refs/heads/'+s['branch'],'dedicated data branch required')
    check(s['maximumChunkBytes']==1_500_000 and len(s['files'])==7,'unexpected package shape')
    outputs=[]
    for entry in s['files']:
        dest=entry['destination']
        check(bool(re.fullmatch(r'career-adaptive-index/(?:all|national/n[0-9]{4}|regions/ru-77)\.b64',dest)) or dest=='source-audit/adaptive-career/source-members.json.gz','unexpected destination')
        pieces=[]
        for chunk in entry['chunks']:
            check(bool(re.fullmatch(r'career-adaptive-materialization/chunks/f[0-9]{2}-[0-9]{4}\.txt',chunk['path'])),'unexpected chunk path')
            data=path(chunk['path']).read_bytes()
            check(0<len(data)<=s['maximumChunkBytes'] and len(data)==chunk['bytes'] and sha(data)==chunk['sha256'] and blob(data)==chunk['gitBlobSHA'],'chunk integrity mismatch')
            pieces.append(data)
        encoded=b''.join(pieces)
        check(len(encoded)==entry['inputBytes'] and sha(encoded)==entry['inputSHA256'],'concatenation integrity mismatch')
        decoded=base64.b64decode(b''.join(encoded.split()),validate=True)
        check(decoded[:3]==b'\x1f\x8b\x08' and len(decoded)==entry['gzipBytes'] and sha(decoded)==entry['gzipSHA256'],'gzip source-byte integrity mismatch')
        check(entry['destinationEncoding'] in ('raw-gzip','base64-gzip'),'unexpected destination encoding')
        result=decoded if entry['destinationEncoding']=='raw-gzip' else encoded
        check(len(result)==entry['bytes'] and blob(result)==entry['gitBlobSHA'],'output Git blob mismatch')
        destination=path(dest)
        if destination.exists():
            check(destination.is_file() and destination.read_bytes()==result,'refusing to replace unknown existing bytes')
            state='already-present'
        else:
            destination.parent.mkdir(parents=True,exist_ok=True)
            fd,temporary=tempfile.mkstemp(prefix='.materializing-',dir=destination.parent)
            try:
                with os.fdopen(fd,'wb') as stream:stream.write(result)
                os.replace(temporary,destination)
            finally:
                if os.path.exists(temporary):os.unlink(temporary)
            state='materialized'
        check(blob(destination.read_bytes())==entry['gitBlobSHA'],'written Git blob mismatch')
        outputs.append({'path':dest,'status':state,'bytes':len(result),'gitBlobSHA':entry['gitBlobSHA'],'gzipSHA256':entry['gzipSHA256']})
    print(json.dumps({'status':'complete','files':outputs},separators=(',',':')))

if __name__=='__main__':main()
