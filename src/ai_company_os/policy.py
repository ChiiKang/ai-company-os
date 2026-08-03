"""Resource and safety policy shared by CLI and future execution adapters."""

from dataclasses import dataclass

from .definitions import DEFAULT_BUDGETS_MINUTES, selected_roles, workflow
from .errors import PolicyError

# The single approval vocabulary shared by the operation gate, the public artifact
# schemas, and every workflow contract's `handoff_never_approves` declaration.
APPROVAL_BOUNDARY_CATEGORIES = {
    "spending": ("paid-api", "cloud-resource"),
    "sensitive access": ("protected-credential", "security-sensitive", "experiment-network"),
    "large download": ("large-download",),
    "destructive behavior": ("destructive",),
    "production deployment": ("production-deployment",),
    "unrequested product construction": ("unrequested-product-construction",),
}

OPERATION_APPROVAL_CATEGORY = {
    operation: category
    for category, operations in APPROVAL_BOUNDARY_CATEGORIES.items()
    for operation in operations
}

APPROVAL_OPERATIONS = frozenset(OPERATION_APPROVAL_CATEGORY)

# These activities are deliberately outside this autonomous software system,
# even if someone supplies an approval identifier.
PROHIBITED_AUTONOMOUS_OPERATIONS = frozenset(
    {
        "hazardous-physical",
        "wet-lab",
        "chemical-execution",
        "biological-execution",
        "manufacturing-equipment-control",
        "industrial-control",
    }
)

SAFE_OPERATIONS = frozenset(
    {
        "public-research",
        "literature-review",
        "public-dataset",
        "local-compute",
        "simulation",
        "source-inspection",
        "docker-experiment",
        "virtual-environment",
        "project-local-build",
        "download",
    }
)

APPROVAL_BOUNDARIES = (
    "paid API use",
    "cloud resources",
    "downloads over 5 GB",
    "protected credential access through Automic Vault",
    "security-sensitive operations",
    "destructive actions",
    "hazardous physical procedures",
    "production deployment",
    "unrequested product construction",
    "network access during untrusted-code execution",
)


@dataclass(frozen=True)
class OperationDecision:
    status: str
    reason: str


def approval_category(operation: str | None, *, download_gb: float = 0) -> str | None:
    """Return the approval vocabulary term an operation belongs to, if any."""
    if operation == "download" and download_gb > 5:
        return OPERATION_APPROVAL_CATEGORY["large-download"]
    return OPERATION_APPROVAL_CATEGORY.get(operation)


def builder_plan_required(selection: dict, roles: tuple[str, ...]) -> bool:
    if selection.get("type") == "workflow":
        return workflow(selection["name"]).requires_builder_plan
    return "builder" in roles


def assess_operation(operation: str, *, download_gb: float = 0) -> OperationDecision:
    if not isinstance(download_gb, (int, float)) or isinstance(download_gb, bool) or download_gb < 0:
        return OperationDecision("prohibited", "download size must be a non-negative number")
    if operation in PROHIBITED_AUTONOMOUS_OPERATIONS:
        return OperationDecision(
            "prohibited",
            "AI Company OS does not autonomously execute hazardous physical, wet-lab, "
            "chemical, biological, manufacturing-equipment, or industrial-control work",
        )
    if operation == "download" and download_gb > 5:
        return OperationDecision("approval-required", "downloads over 5 GB require captain approval")
    if operation in APPROVAL_OPERATIONS:
        return OperationDecision("approval-required", f"{operation} requires captain approval")
    if operation in SAFE_OPERATIONS:
        return OperationDecision("allowed", "within the safe local/public-data operating envelope")
    return OperationDecision("prohibited", "unknown operations are denied by default")


def build_composite_budget(
    selection: dict,
    *,
    budget_minutes: int | None = None,
    builder_budget_minutes: int | None = None,
    approved_plan_id: str | None = None,
    max_cost_usd: float = 0,
    spending_approval_id: str | None = None,
    max_iterations: int = 8,
    max_model_tokens: int = 200_000,
    max_tool_calls: int = 100,
    max_download_bytes: int = 5 * 1024**3,
) -> dict:
    roles = selected_roles(selection)
    if max_iterations < 1:
        raise PolicyError("max iterations must be at least 1")
    if max_cost_usd < 0:
        raise PolicyError("maximum cost cannot be negative")
    if max_model_tokens < 1 or max_tool_calls < 1 or max_download_bytes < 0:
        raise PolicyError("token, tool-call, and download ceilings must be bounded non-negative values")
    if max_cost_usd > 0 and not spending_approval_id:
        raise PolicyError("a positive spending limit requires a captain spending approval id")

    requires_plan = builder_plan_required(selection, roles)
    budgets: dict[str, int] = {}
    for role in roles:
        if role == "builder":
            value = builder_budget_minutes if len(roles) > 1 else budget_minutes
            if not value or value < 1 or (requires_plan and not approved_plan_id):
                raise PolicyError(
                    "builder work requires a positive budget from an approved plan and --approved-plan-id"
                )
            budgets[role] = value
        else:
            value = budget_minutes if len(roles) == 1 and budget_minutes is not None else DEFAULT_BUDGETS_MINUTES[role]
            if value < 1:
                raise PolicyError("role budgets must be positive")
            budgets[role] = value

    budget = {
        "role_wall_clock_minutes": budgets,
        "wall_clock_minutes": sum(budgets.values()),
        "model_tokens": max_model_tokens,
        "monetary_cost_usd": max_cost_usd,
        "tool_calls": max_tool_calls,
        "download_bytes": max_download_bytes,
        "max_iterations_per_role": max_iterations,
        "unknown_usage_policy": "stop",
    }
    if approved_plan_id:
        budget["builder_plan_approval_id"] = approved_plan_id
    if spending_approval_id:
        budget["spending_approval_id"] = spending_approval_id
    return budget
