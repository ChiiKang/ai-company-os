"""Small, explicit role and workflow registry.

The registry is intentionally not a dependency graph. A role selection resolves to
exactly that role. Only a workflow selection returns more than one role.
"""

from dataclasses import dataclass

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
    requires_builder_plan: bool = False


WORKFLOWS = {
    "research-to-idea-validation": Workflow(
        "research-to-idea-validation",
        ("research", "idea-validation"),
        "Teach the domain, then critique the explicitly assigned business idea.",
    ),
    "research-to-project-validation": Workflow(
        "research-to-project-validation",
        ("research", "project-validation"),
        "Establish current evidence, then test the assigned technical claims.",
    ),
    "project-validation-to-builder": Workflow(
        "project-validation-to-builder",
        ("project-validation", "builder"),
        "Validate assigned claims, then build only the approved validated scope.",
        requires_builder_plan=True,
    ),
}


def selected_roles(selection: dict) -> tuple[str, ...]:
    """Resolve an internal CLI selection; never infer prerequisites."""
    kind = selection.get("type")
    name = selection.get("name")
    if kind == "role" and name in ROLES:
        return (name,)
    if kind == "workflow" and name in WORKFLOWS:
        return WORKFLOWS[name].roles
    raise ValueError(f"unknown {kind or 'selection'}: {name!r}")


def assignment_roles(assignment: dict) -> tuple[str, ...]:
    """Resolve the versioned public assignment contract exactly as written."""
    workflow = assignment.get("workflow")
    role = assignment.get("role")
    if workflow:
        if workflow not in WORKFLOWS:
            raise ValueError(f"unknown workflow: {workflow!r}")
        roles = WORKFLOWS[workflow].roles
        if role != roles[0]:
            raise ValueError("assignment role must be the workflow's first role")
        return roles
    if role not in ROLES:
        raise ValueError(f"unknown role: {role!r}")
    return (role,)
