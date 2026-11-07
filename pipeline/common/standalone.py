"""Independent published feeds preserved across statistical app generations.

Callers hold data/raw/.publication.lock before reading or copying published state.
Each feed owns its own freshness/history; none contributes to statistical dates.
"""
from __future__ import annotations

import shutil
from pathlib import Path

FEEDS = ("updates.json", "services", "lmia")
REPORTS = ("freshness-checks.json", "refresh-status.json")


def is_standalone(relative: str | Path) -> bool:
    return Path(relative).parts[0] in FEEDS


def preserve(source: Path, destination: Path, *, reports: bool = False) -> None:
    for name in FEEDS + (REPORTS if reports else ()):
        original, copied = source / name, destination / name
        if not original.exists():
            continue
        if original.is_dir():
            # Replace the staged copy as a unit; do not retain obsolete chunks.
            if copied.exists():
                shutil.rmtree(copied)
            shutil.copytree(original, copied)
        else:
            destination.mkdir(parents=True, exist_ok=True)
            shutil.copy2(original, copied)


def validate(directory: Path) -> None:
    if (directory / "services").exists():
        from services.check import validate_directory
        validate_directory(directory / "services")
    if (directory / "lmia").exists():
        from lmia.check import validate_directory
        validate_directory(directory / "lmia")
