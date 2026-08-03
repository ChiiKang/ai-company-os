"""Path and secret safeguards for the public/private repository split."""

import os
import re
from pathlib import Path

from .errors import PrivacyError

ROOT_ENV = "AI_COMPANY_OS_KNOWLEDGE_ROOT"
_SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,})\b"),
    re.compile(
        r"\b[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)\s*[:=]\s*[\"']?"
        r"(?!<|\$\{|REDACTED\b|EXAMPLE\b|name-only\b)[^\s\"']+",
        re.IGNORECASE,
    ),
)


def public_repo_root() -> Path:
    # This is intentionally not configurable: a caller must not be able to
    # redefine the public boundary and redirect private writes into the clone.
    return Path(__file__).resolve().parents[2]


def default_knowledge_root() -> Path:
    configured = os.environ.get(ROOT_ENV)
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".local" / "share" / "ai-company-os"


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def private_root(path: str | Path | None = None) -> Path:
    candidate = Path(path).expanduser() if path is not None else default_knowledge_root()
    candidate = candidate.resolve()
    public = public_repo_root().resolve()
    if _is_within(candidate, public):
        raise PrivacyError(
            f"knowledge root must be outside the public repository ({public}); refused {candidate}"
        )
    return candidate


def ensure_private_directory(path: Path) -> None:
    old_umask = os.umask(0o077)
    try:
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
        path.chmod(0o700)
    finally:
        os.umask(old_umask)


def contains_raw_secret(text: str) -> bool:
    return any(pattern.search(text) for pattern in _SECRET_PATTERNS)


def reject_raw_secrets(text: str) -> None:
    if contains_raw_secret(text):
        raise PrivacyError("raw secret-like content is forbidden; pass only a named Automic Vault key")


def reject_public_report_source(path: str | Path) -> Path:
    source = Path(path).expanduser().resolve()
    if _is_within(source, public_repo_root().resolve()):
        raise PrivacyError("captain-specific report bodies must not exist in the public repository")
    return source
