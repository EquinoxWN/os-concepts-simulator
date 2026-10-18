"""Write (or check) the expected outputs the TypeScript engine is tested against.

usage: python -m os_concepts_simulator.cli <traces dir> <expected dir> [--check]
For every traces/*.json and every algorithm, writes expected/<trace>.<algorithm>.json.
With --check, compares instead and exits 1 if any file is missing or different.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .schedulers import ALGORITHMS, DEFAULT_QUANTUM, parse_trace, result

MAX_FILE = 4 * 1024 * 1024


def render(doc: object) -> str:
    """Stable JSON text."""
    return json.dumps(doc, indent=1, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    """Generate or check every expected file."""
    p = argparse.ArgumentParser(prog="osim-ref", description=__doc__)
    p.add_argument("traces", type=Path)
    p.add_argument("expected", type=Path)
    p.add_argument("--check", action="store_true")
    args = p.parse_args(argv)
    files = sorted(args.traces.glob("*.json"))
    if not files:
        print(f"no traces in {args.traces}", file=sys.stderr)
        return 2
    args.expected.mkdir(parents=True, exist_ok=True)
    stale = written = 0
    for f in files:
        if f.stat().st_size > MAX_FILE:
            print(f"{f.name}: larger than {MAX_FILE} bytes", file=sys.stderr)
            return 2
        name, jobs = parse_trace(json.loads(f.read_text(encoding="utf-8")))
        for alg in ALGORITHMS:
            out = args.expected / f"{f.stem}.{alg}.json"
            text = render(result(name, jobs, alg, DEFAULT_QUANTUM))
            if args.check:
                if not out.exists() or out.read_text(encoding="utf-8") != text:
                    print(f"stale: {out}")
                    stale += 1
            else:
                out.write_text(text, encoding="utf-8", newline="\n")
                written += 1
    if args.check:
        print(f"{len(files) * len(ALGORITHMS) - stale} of {len(files) * len(ALGORITHMS)} expected files current")
        return 1 if stale else 0
    print(f"wrote {written} expected files for {len(files)} traces")
    return 0


if __name__ == "__main__":
    sys.exit(main())
