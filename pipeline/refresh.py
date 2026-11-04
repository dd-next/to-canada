"""Refresh every data workstream, then rebuild the app snapshot.

Usage (from repo root):
    python3 -I pipeline/refresh.py            # reuse cached downloads where present
    NORTHWARD_REFRESH=1 python3 -I pipeline/refresh.py   # force re-download

Each domain exposes pipeline/<domain>/run.py. A failing domain is reported and
skipped; its previously committed outputs in data/processed/<domain>/ are kept,
so a broken upstream never replaces good data with zeros.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORDER = ["geo", "housing", "cost", "work", "immigration"]


def main() -> int:
    failed = []
    for d in ORDER:
        script = ROOT / "pipeline" / d / "run.py"
        if not script.exists():
            continue
        print(f"\n=== {d} ===", flush=True)
        r = subprocess.run([sys.executable, "-I", str(script)], cwd=ROOT)
        if r.returncode != 0:
            failed.append(d)
            print(f"!!! {d} failed (exit {r.returncode}); keeping previous outputs", flush=True)
    print("\n=== build app data ===", flush=True)
    r = subprocess.run([sys.executable, "-I", str(ROOT / "pipeline" / "build_app_data.py")], cwd=ROOT)
    if failed:
        print(f"Domains that failed: {failed}")
    return r.returncode or (2 if failed else 0)


if __name__ == "__main__":
    raise SystemExit(main())
