"""Automic Vault boundary.

This module discovers and invokes ``av`` without ever accepting a raw secret.
Secret bytes are owned by Automic Vault and the child process environment; AI
Company OS neither reads nor logs them.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Sequence

from .errors import PolicyError

NAMED_KEYS = frozenset({"OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GITHUB_TOKEN"})


def discover_av(explicit_path: str | Path | None = None) -> Path:
    candidates: list[str | Path | None] = [
        explicit_path,
        os.environ.get("AUTOMIC_VAULT_CLI"),
        shutil.which("av"),
        Path.home() / ".local" / "bin" / "av",
        Path.home() / ".automic" / "bin" / "av",
        "/opt/homebrew/bin/av",
        "/usr/local/bin/av",
    ]
    for candidate in candidates:
        if candidate:
            path = Path(candidate).expanduser().resolve()
            if path.is_file() and os.access(path, os.X_OK):
                return path
    raise PolicyError(
        "Automic Vault CLI not found; set AUTOMIC_VAULT_CLI to its executable path. "
        "Do not provide a secret value."
    )


def injection_command(key: str, command: Sequence[str], *, av_path: str | Path | None = None) -> list[str]:
    """Build the documented name-only ``av inject`` process boundary."""
    if key not in NAMED_KEYS:
        raise PolicyError(f"unsupported vault key name; allowed names: {', '.join(sorted(NAMED_KEYS))}")
    if not command or any(not isinstance(part, str) or not part for part in command):
        raise PolicyError("vault injection requires a non-empty argv command")
    av = discover_av(av_path)
    return [str(av), "inject", key, "--", *command]


def run_with_named_key(
    key: str,
    command: Sequence[str],
    *,
    approval_id: str,
    av_path: str | Path | None = None,
) -> int:
    """Run one approved process; do not capture or echo output or environment."""
    if not approval_id.strip():
        raise PolicyError("protected credential access requires a captain approval id")
    argv = injection_command(key, command, av_path=av_path)
    completed = subprocess.run(  # noqa: S603 - argv only, no shell
        argv,
        check=False,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return completed.returncode
