"""Deterministic, bounded lexical retrieval over private artifact metadata."""

from __future__ import annotations

import re
from typing import Any

from .store import KnowledgeStore

TOKEN = re.compile(r"[a-z0-9][a-z0-9_-]+")
FAILED_REPRODUCTIONS = {"could not reproduce", "contradicted"}
UNATTEMPTED = {"could not attempt"}
REJECTED_DECISIONS = {"reject"}


def _tokens(value: str) -> set[str]:
    return set(TOKEN.findall(value.lower()))


def _strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        result: list[str] = []
        for item in value:
            result.extend(_strings(item))
        return result
    if isinstance(value, dict):
        result = []
        for item in value.values():
            result.extend(_strings(item))
        return result
    return []


def stable_reference(kind: str, artifact_id: str) -> str:
    return f"local://artifact/{kind}/{artifact_id}#metadata"


def _search_text(document: dict) -> str:
    # Metadata only: report bodies and raw evidence are never loaded.
    fields: list[Any] = [
        document.get("title", ""),
        document.get("summary", ""),
        document.get("tags", []),
        document.get("decision", ""),
        document.get("verdict", ""),
        document.get("claims", []),
        document.get("baseline", {}),
        document.get("disconfirming_tests", []),
        document.get("practical_assessment", {}),
    ]
    return " ".join(_strings(fields))


def lexical_lookup(
    store: KnowledgeStore,
    query: str,
    *,
    explicit_references: list[str] | None = None,
    limit: int = 5,
) -> dict:
    """Return ranked metadata matches with stable refs and adverse-result warnings."""
    query_tokens = _tokens(query)
    explicit = set(explicit_references or [])
    candidates: list[dict] = []
    for kind, document in store.iter_metadata():
        reference = stable_reference(kind, document.get("id", "unknown"))
        searchable = _search_text(document)
        overlap = query_tokens & _tokens(searchable)
        if not overlap and reference not in explicit:
            continue
        verdict = str(document.get("verdict", "")).lower()
        decision = str(document.get("decision", "")).lower()
        warning = None
        if verdict in FAILED_REPRODUCTIONS or decision in FAILED_REPRODUCTIONS:
            warning = f"related failed reproduction or contradiction: {verdict or decision}"
        elif verdict in UNATTEMPTED or decision in UNATTEMPTED:
            warning = "related validation could not be attempted"
        elif decision in REJECTED_DECISIONS:
            warning = "related decision was rejected"
        title = document.get("title") or next(
            (claim.get("statement") for claim in document.get("claims", []) if claim.get("statement")),
            document.get("id", "untitled artifact"),
        )
        summary = document.get("summary") or document.get("verdict") or document.get("decision") or "metadata match"
        candidates.append(
            {
                "reference": reference,
                "artifact_type": kind,
                "artifact_id": document.get("id"),
                "title": str(title)[:240],
                "summary": str(summary)[:320],
                "score": len(overlap),
                "matched_terms": sorted(overlap),
                "warning": warning,
            }
        )
    found = {item["reference"] for item in candidates}
    for reference in sorted(explicit - found):
        candidates.append(
            {
                "reference": reference,
                "artifact_type": "explicit-reference",
                "artifact_id": reference,
                "title": "Explicit prior-knowledge reference",
                "summary": "Referenced by the assignment but no matching local metadata was found",
                "score": 0,
                "matched_terms": [],
                "warning": "explicit local reference could not be resolved",
            }
        )
    candidates.sort(key=lambda item: (-item["score"], item["reference"]))
    selected = candidates[: max(1, min(limit, 10))]
    warnings = [item["warning"] for item in selected if item["warning"]]
    return {
        "method": "deterministic-lexical-v1",
        "query": query,
        "references": selected,
        "warnings": warnings,
    }


def knowledge_markdown(result: dict, *, max_characters: int = 4000) -> str:
    lines = ["## What we already know"]
    if not result["references"]:
        lines.append("No related local metadata matched this bounded lexical query.")
    for item in result["references"]:
        lines.append(f"- [{item['reference']}] {item['title']} — {item['summary']}")
        if item["warning"]:
            lines.append(f"  - WARNING: {item['warning']}")
    lines.append("Treat these as prior local evidence, preserve their references, and re-check applicability and uncertainty.")
    return "\n".join(lines)[:max_characters]
