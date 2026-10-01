#!/usr/bin/env python3
"""Mirror the published crickrida.com archive from R2 into /srv/crickrida/site.

The archive's publish workflow uploads every audited release to R2: files
stored by content hash, plus site/manifest.json mapping each path to its
hash, written last. This job compares that manifest with the last one it
applied and fetches only what changed. Assets and data go in before pages,
so a new page never points at a file that is not there yet. Run by the
crickrida-site-sync timer; safe to run by hand.
"""
import fcntl
import gzip
import hashlib
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE = 'https://pub-2deb6471d5df4274810ac4497fdf3ab2.r2.dev/site/'
ROOT = Path('/srv/crickrida')
SITE = ROOT / 'site'
STATE = ROOT / 'state.json'


def fetch(url, tries=4):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'crickrida-site-sync/1.0', 'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception:  # noqa: BLE001 - retried, then raised
            if attempt == tries - 1:
                raise
            time.sleep(2 * (attempt + 1))


STORE = {'name': 'objects'}   # 'objz' releases keep every object gzip-compressed


def place(item):
    rel, sha = item
    data = fetch(f'{BASE}{STORE["name"]}/{sha[:2]}/{sha}')
    if STORE['name'] == 'objz':
        data = gzip.decompress(data)
    if hashlib.sha256(data).hexdigest() != sha:
        raise ValueError(f'hash mismatch for {rel}')
    target = SITE / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name('.' + target.name + '.part')
    tmp.write_bytes(data)
    os.chmod(tmp, 0o644)
    os.replace(tmp, target)
    return len(data)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    SITE.mkdir(parents=True, exist_ok=True)
    with open(ROOT / '.lock', 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0
        manifest = json.loads(fetch(BASE + 'manifest.json?t=' + str(int(time.time()))))
        STORE['name'] = manifest.get('store', 'objects')
        state = json.loads(STATE.read_text()) if STATE.exists() else {'version': None, 'files': {}}
        force = '--force' in sys.argv
        if manifest['version'] == state.get('version') and not force:
            return 0
        files, done = manifest['files'], state.get('files') or {}
        todo = [(rel, sha) for rel, sha in files.items() if force or done.get(rel) != sha or not (SITE / rel).exists()]
        pages = [t for t in todo if t[0].endswith('.html')]
        rest = [t for t in todo if not t[0].endswith('.html')]
        sent = 0
        with ThreadPoolExecutor(16) as pool:
            for batch in (rest, pages):
                sent += sum(pool.map(place, batch))
        removed = 0
        for rel in set(done) - set(files):
            path = SITE / rel
            if path.is_file():
                path.unlink()
                removed += 1
        tmp = STATE.with_suffix('.tmp')
        tmp.write_text(json.dumps({'version': manifest['version'], 'files': files}))
        os.replace(tmp, STATE)
        print(json.dumps({'version': manifest['version'], 'fetched': len(todo), 'bytes': sent, 'removed': removed}))
        return 0


if __name__ == '__main__':
    sys.exit(main())
