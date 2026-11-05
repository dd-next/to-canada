"""Fingerprint filtered outputs against both source bytes and transformation version."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .fetch import meta_for


def signature(source: Path, transformation: object) -> dict:
    meta = meta_for(source)
    stat = source.stat()
    checksum = meta.get('sha256') if meta.get('mtimeNs') == stat.st_mtime_ns and meta.get('bytes') == stat.st_size else None
    if not checksum:
        with source.open('rb') as stream:
            checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'sourceSha256': checksum, 'transformation': transformation}


def current(output: Path, expected: dict) -> bool:
    metadata = Path(str(output) + '.derived.json')
    try:
        return output.exists() and json.loads(metadata.read_text()) == expected
    except (OSError, ValueError):
        return False


def mark(output: Path, expected: dict) -> None:
    metadata = Path(str(output) + '.derived.json')
    temporary = Path(str(metadata) + '.part')
    temporary.write_text(json.dumps(expected, sort_keys=True))
    temporary.replace(metadata)
