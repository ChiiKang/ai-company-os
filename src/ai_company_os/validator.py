"""Dependency-free validator for the JSON Schema subset used by this project."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from .definitions import ROLES, assignment_roles, workflow_names
from .errors import ContractError
from .paths import public_repo_root

SCHEMAS = {
    "assignment": "assignment.schema.json",
    "claims-evidence": "claims-evidence.schema.json",
    "experiment": "experiment.schema.json",
    "handoff": "handoff.schema.json",
    "decision-report": "decision-report.schema.json",
    "workflow": "workflow.schema.json",
}

# Enumerations whose members are owned by a registry rather than by the schema file,
# so a contract never carries a second copy of the runtime authority.
DYNAMIC_ENUM_SOURCES = {
    "role-names": lambda: list(ROLES),
    "workflow-names": lambda: list(workflow_names()),
}


def _matches_type(value: Any, expected: str) -> bool:
    return {
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool),
        "boolean": isinstance(value, bool),
        "null": value is None,
    }.get(expected, False)


def _validate_format(value: str, format_name: str, path: str, errors: list[str]) -> None:
    try:
        if format_name == "date-time":
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                raise ValueError
        elif format_name == "date":
            datetime.strptime(value, "%Y-%m-%d")
        elif format_name == "uri":
            if not re.match(r"^(?:https?|file|doi|git\+https)://|^urn:", value):
                raise ValueError
    except ValueError:
        errors.append(f"{path}: invalid {format_name}")


def _validate(schema: dict, value: Any, path: str, errors: list[str]) -> None:
    if "oneOf" in schema:
        matches = 0
        for candidate in schema["oneOf"]:
            candidate_errors: list[str] = []
            _validate(candidate, value, path, candidate_errors)
            if not candidate_errors:
                matches += 1
        if matches != 1:
            errors.append(f"{path}: must match exactly one allowed shape")
        return

    if "const" in schema and value != schema["const"]:
        errors.append(f"{path}: must equal {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: must be one of {schema['enum']!r}")

    expected = schema.get("type")
    if expected:
        expected_types = [expected] if isinstance(expected, str) else expected
        if not any(_matches_type(value, item) for item in expected_types):
            errors.append(f"{path}: expected {' or '.join(expected_types)}")
            return

    if isinstance(value, dict):
        required = schema.get("required", [])
        for name in required:
            if name not in value:
                errors.append(f"{path}: missing required property {name!r}")
        properties = schema.get("properties", {})
        for name, item in value.items():
            if name in properties:
                _validate(properties[name], item, f"{path}.{name}", errors)
            elif schema.get("additionalProperties") is False:
                errors.append(f"{path}: unexpected property {name!r}")
        if len(value) < schema.get("minProperties", 0):
            errors.append(f"{path}: too few properties")

    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            errors.append(f"{path}: too few items")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{path}: too many items")
        if schema.get("uniqueItems"):
            serialized = [json.dumps(item, sort_keys=True) for item in value]
            if len(serialized) != len(set(serialized)):
                errors.append(f"{path}: items must be unique")
        if "items" in schema:
            for index, item in enumerate(value):
                _validate(schema["items"], item, f"{path}[{index}]", errors)

    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            errors.append(f"{path}: string is too short")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append(f"{path}: does not match required pattern")
        if "format" in schema:
            _validate_format(value, schema["format"], path, errors)

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: must be at least {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: must be at most {schema['maximum']}")


def _resolve_dynamic_enums(node: Any, kind: str) -> Any:
    if isinstance(node, dict):
        source = node.get("enumSource")
        if source is None:
            return {name: _resolve_dynamic_enums(item, kind) for name, item in node.items()}
        if source not in DYNAMIC_ENUM_SOURCES:
            raise ContractError(f"{kind} schema names unknown enum source {source!r}")
        if kind == "workflow" and source == "workflow-names":
            raise ContractError("the workflow contract cannot depend on the registry it defines")
        return {"type": "string", "enum": DYNAMIC_ENUM_SOURCES[source]()}
    if isinstance(node, list):
        return [_resolve_dynamic_enums(item, kind) for item in node]
    return node


def load_schema(kind: str, schemas_dir: str | Path | None = None) -> dict:
    if kind not in SCHEMAS:
        raise ContractError(f"unknown artifact type {kind!r}; choose from {', '.join(SCHEMAS)}")
    root = Path(schemas_dir) if schemas_dir else public_repo_root() / "schemas"
    try:
        schema = json.loads((root / SCHEMAS[kind]).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError(f"cannot load schema for {kind}: {exc}") from exc
    return _resolve_dynamic_enums(schema, kind)


def _check_confidence(document: dict, errors: list[str]) -> None:
    confidence = document.get("confidence", {})
    level = confidence.get("level")
    score = confidence.get("score")
    if not isinstance(score, (int, float)) or isinstance(score, bool):
        return
    if level == "low" and score >= 0.5:
        errors.append("$.confidence: low confidence score must be below 0.5")
    elif level == "medium" and not 0.5 <= score < 0.8:
        errors.append("$.confidence: medium confidence score must be from 0.5 up to 0.8")
    elif level == "high" and score < 0.8:
        errors.append("$.confidence: high confidence score must be at least 0.8")
    basis = confidence.get("evidence_basis")
    contradictions = confidence.get("contradictions", [])
    unresolved_reversing = any(
        item.get("outcome_reversing") is True and item.get("resolved") is not True
        for item in contradictions
        if isinstance(item, dict)
    )
    weak_basis = basis in {"material-evidence-missing", "indirect"}
    if level == "low" and not (weak_basis or unresolved_reversing or confidence.get("reversal_risk") != "unlikely"):
        errors.append("$.confidence: low confidence requires an observable missing/indirect/reversal-risk condition")
    if level in {"medium", "high"} and (weak_basis or unresolved_reversing):
        errors.append("$.confidence: medium/high confidence cannot have weak evidence or unresolved outcome-reversing contradictions")
    if level == "high":
        if basis not in {"multiple-independent", "faithful-reproduction"}:
            errors.append("$.confidence: high requires multiple independent paths or faithful reproduction")
        if confidence.get("alternatives_tested") is not True or confidence.get("reversal_risk") != "unlikely":
            errors.append("$.confidence: high requires tested alternatives and unlikely conclusion reversal")


def _semantic_checks(kind: str, document: dict, errors: list[str]) -> None:
    if kind in {"handoff", "decision-report"}:
        _check_confidence(document, errors)

    if kind == "assignment":
        try:
            roles = assignment_roles(document)
        except ValueError as exc:
            errors.append(f"$.role: {exc}")
            roles = ()
        budget = document.get("composite_budget", {})
        budgets = budget.get("role_wall_clock_minutes", {})
        if roles and set(budgets) != set(roles):
            errors.append("$.composite_budget.role_wall_clock_minutes: must cover exactly the selected roles")
        if budgets and budget.get("wall_clock_minutes") != sum(budgets.values()):
            errors.append("$.composite_budget.wall_clock_minutes: must equal the selected role ceilings")
        if "builder" in roles and not budget.get("builder_plan_approval_id"):
            errors.append("$.composite_budget: Builder budget must come from an approved plan")
        recovery = document.get("recovery_guards", {})
        if "project-validation" in roles and (
            recovery.get("source_identity") in {None, "not-applicable"}
            or recovery.get("environment_identity") in {None, "not-established"}
        ):
            errors.append("$.recovery_guards: Project Validation requires source and isolated-environment identities")
        if budget.get("monetary_cost_usd", 0) > 0 and not budget.get("spending_approval_id"):
            errors.append("$.composite_budget: positive spending requires a captain approval id")
        if document.get("output_path") != f"outputs/{document.get('id', '')}":
            errors.append("$.output_path: must be the assignment-specific path beneath the knowledge root")
        pregrants = document.get("approval_pregrants", [])
        pairs = [(item.get("operation"), item.get("approval_id")) for item in pregrants]
        if len(pairs) != len(set(pairs)):
            errors.append("$.approval_pregrants: operation/approval pairs must be unique")

    elif kind == "claims-evidence":
        ranks = [claim.get("rank") for claim in document.get("claims", [])]
        if len(ranks) != len(set(ranks)):
            errors.append("$.claims: claim ranks must be unique")

    elif kind == "experiment":
        if document.get("environment", {}).get("original_source_unchanged") is not True:
            errors.append("$.environment.original_source_unchanged: supplied source must remain unchanged")
        feasibility = document.get("feasibility_precheck", {}).get("status")
        attempted = document.get("attempted")
        verdict = document.get("verdict")
        if feasibility != "feasible" and verdict != "could not attempt":
            errors.append("$.verdict: an infeasible or approval-blocked experiment is 'could not attempt'")
        if verdict == "could not attempt" and attempted is not False:
            errors.append("$.attempted: 'could not attempt' requires attempted=false")
        if verdict == "could not reproduce" and attempted is not True:
            errors.append("$.attempted: 'could not reproduce' requires an actual attempt")

    elif kind == "handoff":
        if document.get("source_role") == document.get("target_role"):
            errors.append("$.target_role: handoff target must differ from source")
        overall_refs = set(document.get("evidence_refs", []))
        for index, claim in enumerate(document.get("load_bearing_claims", [])):
            if not set(claim.get("evidence_refs", [])).issubset(overall_refs):
                errors.append(f"$.load_bearing_claims[{index}]: evidence must be preserved in the overall handoff ledger")

    elif kind == "decision-report":
        decisions_by_role = {
            "research": {"research complete"},
            "project-validation": {
                "confirmed",
                "partially confirmed",
                "contradicted",
                "could not attempt",
                "could not reproduce",
                "works but impractical",
                "promising but more evidence required",
            },
            "idea-validation": {"proceed", "modify", "test further", "reject"},
            "builder": {"acceptance met", "unmet criteria"},
        }
        role = document.get("role")
        if role in decisions_by_role and document.get("decision") not in decisions_by_role[role]:
            errors.append(f"$.decision: not a valid {role} decision")
        criteria = document.get("criteria", [])
        unmet = any(item.get("status") != "met" for item in criteria)
        if role == "builder":
            if document.get("decision") == "acceptance met" and unmet:
                errors.append("$.decision: Builder cannot claim acceptance while criteria are unmet or untested")
            if document.get("decision") == "unmet criteria" and not unmet:
                errors.append("$.decision: unmet criteria decision requires an unmet or untested criterion")
        if role == "idea-validation" and "demand_validation" not in document:
            errors.append("$.demand_validation: Idea Validation must distinguish desk research from behavioral demand evidence")


def validate_document(kind: str, document: Any, schemas_dir: str | Path | None = None) -> dict:
    if not isinstance(document, dict):
        raise ContractError("document must be a JSON object")
    errors: list[str] = []
    _validate(load_schema(kind, schemas_dir), document, "$", errors)
    _semantic_checks(kind, document, errors)
    if errors:
        shown = "; ".join(errors[:12])
        suffix = f"; plus {len(errors) - 12} more" if len(errors) > 12 else ""
        raise ContractError(f"{kind} validation failed: {shown}{suffix}")
    return document
