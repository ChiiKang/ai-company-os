"""Role registry plus the workflow contracts loaded from `workflows/*.json`.

The registry is intentionally not a dependency graph. A role selection resolves to
exactly that role. Only a workflow selection returns more than one role, and every
composition is defined solely by its public `workflows/<name>.json` contract, which
is loaded and validated at runtime instead of being restated here.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .errors import ContractError
from .paths import public_repo_root

ROLES = ("research", "project-validation", "idea-validation", "builder")

DEFAULT_BUDGETS_MINUTES = {
    "research": 120,
    "project-validation": 240,
    "idea-validation": 120,
}


@dataclass(frozen=True)
class Workflow:
    name: str
    roles: tuple[str, ...]
    description: str
    requires_builder_plan: bool
    minimum_confidence: str
    minimum_claim_confidence: str
    preserved_fields: tuple[str, ...]
    never_approves: tuple[str, ...]


def workflows_directory() -> Path:
    return public_repo_root() / "workflows"


def load_workflows(directory: str | Path) -> dict[str, Workflow]:
    """Load and validate every public workflow contract in `directory`."""
    from .validator import validate_document

    paths = sorted(Path(directory).glob("*.json"))
    if not paths:
        raise ContractError(f"no workflow contracts found in {directory}")
    loaded: dict[str, Workflow] = {}
    for path in paths:
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ContractError(f"cannot load workflow contract {path.name}: {exc}") from exc
        validate_document("workflow", document)
        name = document["name"]
        if name != path.stem:
            raise ContractError(f"workflow contract {path.name} must be the file name of workflow {name!r}")
        roles = tuple(document["roles"])
        requires_builder_plan = document.get("builder_requires_approved_plan_and_budget", False)
        if ("builder" in roles) != requires_builder_plan:
            raise ContractError(
                f"workflow {name!r} must declare builder_requires_approved_plan_and_budget "
                "exactly when it routes Builder"
            )
        handoff = document["automatic_handoff"]
        loaded[name] = Workflow(
            name=name,
            roles=roles,
            description=document["description"],
            requires_builder_plan=requires_builder_plan,
            minimum_confidence=handoff["minimum_confidence"],
            minimum_claim_confidence=handoff["every_load_bearing_claim_minimum_confidence"],
            preserved_fields=tuple(handoff["preserve"]),
            never_approves=tuple(document["handoff_never_approves"]),
        )
    return loaded


_WORKFLOWS: dict[str, Workflow] | None = None


def workflows() -> dict[str, Workflow]:
    global _WORKFLOWS
    if _WORKFLOWS is None:
        _WORKFLOWS = load_workflows(workflows_directory())
    return _WORKFLOWS


def workflow_names() -> tuple[str, ...]:
    return tuple(sorted(workflows()))


def workflow(name: str) -> Workflow:
    try:
        return workflows()[name]
    except KeyError:
        raise ValueError(f"unknown workflow: {name!r}") from None


def selected_roles(selection: dict) -> tuple[str, ...]:
    """Resolve an internal CLI selection; never infer prerequisites."""
    kind = selection.get("type")
    name = selection.get("name")
    if kind == "role" and name in ROLES:
        return (name,)
    if kind == "workflow" and isinstance(name, str):
        return workflow(name).roles
    raise ValueError(f"unknown {kind or 'selection'}: {name!r}")


def assignment_roles(assignment: dict) -> tuple[str, ...]:
    """Resolve the versioned public assignment contract exactly as written."""
    selected = assignment.get("workflow")
    role = assignment.get("role")
    if selected:
        roles = workflow(selected).roles
        if role != roles[0]:
            raise ValueError("assignment role must be the workflow's first role")
        return roles
    if role not in ROLES:
        raise ValueError(f"unknown role: {role!r}")
    return (role,)
