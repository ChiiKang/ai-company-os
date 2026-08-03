#!/usr/bin/env python3
"""Write registry-owned enum members into the published JSON Schemas.

The schemas stay standard JSON Schema for external consumers; this script is the
only way their `generated-enum:` members change, and `--check` fails when a
published enum has drifted from the registry that owns it.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_company_os.validator import SCHEMAS, generated_enum, generated_enum_drift, generated_enum_nodes  # noqa: E402

GENERATED_ENUM = re.compile(r'("\$comment":\s*"generated-enum:(?P<source>[a-z-]+)"[^}]*?"enum":\s*)\[[^\]]*\]')


def rewrite(path: Path) -> bool:
    original = path.read_text(encoding="utf-8")

    def replace(match: re.Match) -> str:
        members = json.dumps(generated_enum(match.group("source")))
        return f"{match.group(1)}{members}"

    updated = GENERATED_ENUM.sub(replace, original)
    if updated == original:
        return False
    json.loads(updated)
    path.write_text(updated, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="synchronize generated schema enums")
    parser.add_argument("--write", action="store_true", help="rewrite stale enums instead of only reporting them")
    arguments = parser.parse_args()

    schemas = ROOT / "schemas"
    if arguments.write:
        for name in sorted(SCHEMAS.values()):
            if rewrite(schemas / name):
                print(f"synchronized {name}")

    drift = generated_enum_drift(schemas)
    if drift:
        print("Generated schema enums are stale:", file=sys.stderr)
        for item in drift:
            print(f"- {item}", file=sys.stderr)
        print("Run scripts/sync-schema-enums.py --write", file=sys.stderr)
        return 1
    marked = sum(1 for name in SCHEMAS for _ in generated_enum_nodes(json.loads((schemas / SCHEMAS[name]).read_text(encoding="utf-8"))))
    print(f"Generated schema enums are current ({marked} checked)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
