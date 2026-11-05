"""Stage, validate and publish a complete statistical generation; retain the last valid one on failure.

Usage: NORTHWARD_REFRESH=1 python3 -I pipeline/refresh.py [--domains geo housing work immigration]
The normal weekly geo step refreshes population only; --full-geo includes fixed census/boundaries/climate.
IRCC Updates has a separate lightweight runner and is preserved by this publication path.
"""
from __future__ import annotations

import argparse
import ctypes
import fcntl
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORDER = ['geo', 'housing', 'work', 'immigration']
VOLATILE = {'builtAt', 'computedAt', 'retrievedAt', 'lastCheckedAt', 'lastSuccessfulCheckAt', 'checkedAt', 'runId'}


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def atomic_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.part')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=1) + '\n')
    temporary.replace(path)


def meaningful(value):
    if isinstance(value, dict):
        return {k: meaningful(v) for k, v in value.items() if k not in VOLATILE}
    if isinstance(value, list):
        return [meaningful(v) for v in value]
    return value


def fingerprint(directory: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(directory.rglob('*.json')):
        if path.name in {'manifest.json', 'refresh-status.json', 'freshness-checks.json', 'updates.json'}:
            continue
        digest.update(str(path.relative_to(directory)).encode())
        digest.update(json.dumps(meaningful(json.loads(path.read_text())), sort_keys=True).encode())
    return digest.hexdigest()


def exchange(left: Path, right: Path) -> None:
    """Linux atomic directory exchange: readers see a whole old or new generation, never a gap."""
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, 'renameat2', None)
    if renameat2 is None:
        raise RuntimeError('Atomic refresh publication requires Linux renameat2; previous snapshot retained')
    if renameat2(-100, os.fsencode(left), -100, os.fsencode(right), 2) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))


def promote(staged_processed: Path, staged_app: Path, processed: Path, app: Path) -> None:
    # The IRCC runner owns these files. They do not participate in statistical refresh.
    for name in ('updates.json',):
        if (app / name).exists():
            shutil.copy2(app / name, staged_app / name)
    if (processed / 'updates').exists():
        shutil.copytree(processed / 'updates', staged_processed / 'updates', dirs_exist_ok=True)
    exchange(staged_processed, processed)
    try:
        exchange(staged_app, app)
    except Exception:
        exchange(staged_processed, processed)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--domains', nargs='+', choices=ORDER, default=ORDER)
    parser.add_argument('--full-geo', action='store_true')
    args = parser.parse_args()
    raw = ROOT / 'data' / 'raw'
    raw.mkdir(parents=True, exist_ok=True)
    processed, app = ROOT / 'data' / 'processed', ROOT / 'public' / 'data'
    status_path = processed / 'refresh-status.json'
    previous = json.loads(status_path.read_text()) if status_path.exists() else {}
    started = now()
    errors = []
    status = {'startedAt': started, 'domains': args.domains,
              'lastSuccessfulUpdateAt': previous.get('lastSuccessfulUpdateAt')}
    with (raw / '.publication.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with tempfile.TemporaryDirectory(prefix='.refresh-', dir=raw) as temporary:
            staging = Path(temporary)
            staged_processed, staged_app = staging / 'processed', staging / 'app'
            shutil.copytree(processed, staged_processed)
            shutil.copytree(app, staged_app)
            env = {**os.environ, 'NORTHWARD_RUN_ID': uuid.uuid4().hex, 'NORTHWARD_PUBLICATION_LOCK_HELD': '1',
                   'NORTHWARD_PROCESSED': str(staged_processed), 'NORTHWARD_APP_DATA': str(staged_app)}
            def run(label, arguments):
                print(f'[{label}]', flush=True)
                code = subprocess.run([sys.executable, '-I', *arguments], cwd=ROOT, env=env).returncode
                if code:
                    errors.append({'step': label, 'exitCode': code})
                return code
            for domain in args.domains:
                arguments = [str(ROOT / 'pipeline' / domain / 'run.py')]
                if domain == 'geo' and not args.full_geo:
                    arguments.append('--pop-only')
                run(domain, arguments)
            # Check publisher availability separately; unknown checks are never reported as current.
            fresh = run('freshness', [str(ROOT / 'pipeline' / 'freshness.py')])
            if fresh:
                status['freshnessCheckFailed'] = True
            data_errors = [e for e in errors if e['step'] != 'freshness']
            if not data_errors:
                run('build', [str(ROOT / 'pipeline' / 'build_app_data.py')])
                if not any(e['step'] == 'build' for e in errors):
                    run('validate', [str(ROOT / 'pipeline' / 'check_app_data.py')])
            if any(e['step'] != 'freshness' for e in errors):
                status.update(status='error', errors=errors, finishedAt=now(),
                              note='Statistical snapshot retained; staged outputs were not published.')
            else:
                changed = fingerprint(app) != fingerprint(staged_app)
                status.update(status='updated' if changed else 'no_changes', errors=errors,
                              finishedAt=now(), lastSuccessfulUpdateAt=now())
                atomic_json(staged_processed / 'refresh-status.json', status)
                atomic_json(staged_app / 'refresh-status.json', status)
                try:
                    promote(staged_processed, staged_app, processed, app)
                except Exception as error:
                    status.update(status='error', errors=errors + [{'step': 'publish', 'error': str(error)}],
                                  lastSuccessfulUpdateAt=previous.get('lastSuccessfulUpdateAt'),
                                  note='Publication failed; previous statistical snapshot retained.')
            # Error/check reports may be published without promoting failed statistical outputs.
            if status['status'] == 'error':
                # Staged sources may contain a newer release that was never promoted.
                # Recompute against retained SourceRecords so "current" describes what users see.
                retained_env = {**env, 'NORTHWARD_PROCESSED': str(processed), 'NORTHWARD_APP_DATA': str(app)}
                check_code = subprocess.run([sys.executable, '-I', str(ROOT / 'pipeline' / 'freshness.py')],
                                            cwd=ROOT, env=retained_env).returncode
                if check_code and not any(error['step'] == 'freshness' for error in status['errors']):
                    status['errors'].append({'step': 'freshness-retained', 'exitCode': check_code})
                status['finishedAt'] = now()
                atomic_json(status_path, status)
                atomic_json(app / 'refresh-status.json', status)
            print(json.dumps(status, indent=2))
    return 2 if status['status'] == 'error' or errors else 0


if __name__ == '__main__':
    raise SystemExit(main())
