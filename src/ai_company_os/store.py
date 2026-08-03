"""Private, local persistence. No captain content is written to the source tree."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Iterable

from .errors import ContractError, PrivacyError
from .paths import (
    ensure_private_directory,
    private_root,
    reject_public_report_source,
    reject_raw_secrets,
)
from .validator import validate_document

MARKER = ".ai-company-os-private"
PRIVATE_REPORT_MARKER = "<!-- AI_COMPANY_OS_" + "PRIVATE_ARTIFACT -->"


class KnowledgeStore:
    def __init__(self, root: str | Path | None = None):
        self.root = private_root(root)

    def initialize(self) -> Path:
        if self.root.exists():
            if not self.root.is_dir():
                raise PrivacyError("knowledge root exists but is not a directory")
            if self.root.stat().st_mode & 0o077:
                raise PrivacyError("existing knowledge root is not private; set its permissions to 0700")
        else:
            ensure_private_directory(self.root)
        for name in ("assignments", "runs", "outputs"):
            ensure_private_directory(self.root / name)
        marker = self.root / MARKER
        if not marker.exists():
            self._atomic_write(marker, "private AI Company OS knowledge root\n")
        return self.root

    def _atomic_write(self, path: Path, content: str) -> None:
        # Re-check on every write so a caller cannot bypass the constructor with
        # a changed working directory or a relative path.
        private_root(self.root)
        ensure_private_directory(path.parent)
        reject_raw_secrets(content)
        descriptor, temporary = tempfile.mkstemp(prefix=".write-", dir=path.parent, text=True)
        try:
            os.fchmod(descriptor, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
            path.chmod(0o600)
        except Exception:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass
            raise

    def _json_write(self, path: Path, document: dict) -> None:
        self._atomic_write(path, json.dumps(document, indent=2, sort_keys=True) + "\n")

    @staticmethod
    def _safe_id(identifier: str) -> str:
        if not identifier or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for char in identifier):
            raise PrivacyError("unsafe record identifier")
        return identifier

    def save_assignment(self, assignment: dict) -> Path:
        self.initialize()
        validate_document("assignment", assignment)
        path = self.root / "assignments" / f"{self._safe_id(assignment['id'])}.json"
        if path.exists():
            raise ContractError(f"assignment {assignment['id']} already exists")
        self._json_write(path, assignment)
        ensure_private_directory(self.root / assignment["output_path"])
        return path

    def read_assignment(self, assignment_id: str) -> dict:
        """Return the stored record without re-validating it against live contracts."""
        path = self.root / "assignments" / f"{self._safe_id(assignment_id)}.json"
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ContractError(f"cannot load assignment {assignment_id}: {exc}") from exc

    def load_assignment(self, assignment_id: str) -> dict:
        return validate_document("assignment", self.read_assignment(assignment_id))

    def save_run(self, run: dict, *, overwrite: bool = False) -> Path:
        self.initialize()
        path = self.root / "runs" / f"{self._safe_id(run['id'])}.json"
        if path.exists() and not overwrite:
            raise ContractError(f"run {run['id']} already exists")
        self._json_write(path, run)
        return path

    def load_run(self, run_id: str) -> dict:
        path = self.root / "runs" / f"{self._safe_id(run_id)}.json"
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ContractError(f"cannot load run {run_id}: {exc}") from exc

    def store_artifact(self, kind: str, document: dict, report_source: str | Path | None = None) -> Path:
        self.initialize()
        validate_document(kind, document)
        assignment_id = document.get("assignment_id")
        if not assignment_id:
            raise ContractError("stored artifacts require an assignment id")
        assignment = self.load_assignment(assignment_id)
        run_id = document.get("run_id")
        if not run_id:
            raise ContractError("stored artifacts require a run id")
        run = self.load_run(run_id)
        if run.get("assignment_id") != assignment_id:
            raise ContractError("artifact run does not belong to its assignment")
        role = document.get("role") or document.get("created_by_role") or document.get("source_role")
        if role and role not in run.get("roles", []):
            raise ContractError("artifact role is outside the run's original assignment")
        artifact_id = self._safe_id(document["id"])
        destination = self.root / assignment["output_path"] / kind / artifact_id
        if destination.exists():
            raise ContractError(f"artifact {artifact_id} already exists")

        report_text: str | None = None
        if kind == "decision-report":
            if report_source is None:
                raise ContractError("decision-report storage requires --report with an external Markdown body")
            source = reject_public_report_source(report_source)
            try:
                report_text = source.read_text(encoding="utf-8")
            except OSError as exc:
                raise ContractError(f"cannot read report body: {exc}") from exc
            reject_raw_secrets(report_text)
            if PRIVATE_REPORT_MARKER not in report_text.splitlines()[:5]:
                raise ContractError("decision report must carry the private-artifact marker near the top")
            if not any(line.startswith("#") for line in report_text.splitlines()):
                raise ContractError("decision report must be readable Markdown with a heading")
            if "```mermaid" not in report_text:
                raise ContractError("decision report must include a Mermaid diagram")
            if document.get("role") == "research":
                required_sections = ("## What I could not find", "## What would change this conclusion")
                if any(section not in report_text for section in required_sections):
                    raise ContractError("Research reports require 'What I could not find' and 'What would change this conclusion' sections")
            if document.get("report_path") != "report.md":
                raise ContractError("decision report metadata report_path must be 'report.md'")
        elif report_source is not None:
            raise ContractError("--report is valid only for decision-report artifacts")

        ensure_private_directory(destination)
        self._json_write(destination / "metadata.json", document)
        if report_text is not None:
            self._atomic_write(destination / "report.md", report_text)
        return destination

    def iter_metadata(self, kind: str | None = None) -> Iterable[tuple[str, dict]]:
        self.initialize()
        allowed = {"claims-evidence", "experiment", "handoff", "decision-report"}
        if kind and kind not in allowed:
            raise ContractError("unknown searchable artifact type")
        for metadata in (self.root / "outputs").glob("*/**/metadata.json"):
            artifact_kind = metadata.parent.parent.name
            if artifact_kind not in allowed or (kind and artifact_kind != kind):
                continue
            try:
                document = json.loads(metadata.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            yield artifact_kind, document

    def search(self, *, assignment_id: str | None = None, kind: str | None = None) -> list[dict]:
        results: list[dict] = []
        for _, document in self.iter_metadata(kind):
            if assignment_id is None or document.get("assignment_id") == assignment_id:
                # Return searchable metadata only; never load report bodies.
                results.append(document)
        return sorted(results, key=lambda item: (item.get("created_at", ""), item.get("id", "")))
