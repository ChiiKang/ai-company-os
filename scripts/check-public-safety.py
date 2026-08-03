#!/usr/bin/env python3
"""Fail if a committable file looks like private knowledge or a raw credential."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANNED_TOP_LEVEL = {"knowledge", "private", "reports", "assignments", "runs", "artifacts"}
BANNED_NAMES = {".env", ".ai-company-os-private"}
PRIVATE_MARKERS = ("AI_COMPANY_OS_" + "PRIVATE_ARTIFACT", '"captain_' + 'private": true')
SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,})\b"),
    re.compile(
        r"\b[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)\s*[:=]\s*[\"']?"
        r"(?!<|\$\{|REDACTED\b|EXAMPLE\b|name-only\b)[^\s\"']+",
        re.IGNORECASE,
    ),
)


def committable_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [ROOT / item.decode() for item in result.stdout.split(b"\0") if item]


def main() -> int:
    findings: list[str] = []
    for path in committable_files():
        relative = path.relative_to(ROOT)
        if relative.parts[0] in BANNED_TOP_LEVEL or path.name in BANNED_NAMES or path.name.endswith(".private.md"):
            findings.append(f"private path is committable: {relative}")
            continue
        if path.is_symlink() or not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if any(marker in text for marker in PRIVATE_MARKERS):
            findings.append(f"private artifact marker in {relative}")
        if any(pattern.search(text) for pattern in SECRET_PATTERNS):
            findings.append(f"raw secret-like value in {relative}")
        if path.suffix == ".json" and relative.parts[0] not in {"schemas", "workflows"}:
            if re.search(r'"assignment_id"\s*:\s*"asn_[A-Za-z0-9_-]+"', text):
                findings.append(f"captain assignment artifact in {relative}")
    if findings:
        print("Public safety check failed:", file=sys.stderr)
        for finding in findings:
            print(f"- {finding}", file=sys.stderr)
        return 1
    print("Public safety check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
