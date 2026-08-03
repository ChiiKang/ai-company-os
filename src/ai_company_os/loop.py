"""Bounded plan-act-observe-evaluate state machine with composite accounting."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone

from .errors import ApprovalRequired, PolicyError
from .policy import assess_operation

PHASES = ("plan", "act", "observe", "evaluate")
TERMINAL_OUTCOMES = {
    "success",
    "proven-blocker",
    "exhausted-useful-hypotheses",
    "resource-boundary",
    "approval-boundary",
}
EVALUATION_OUTCOMES = TERMINAL_OUTCOMES | {"continue"}
USAGE_KEYS = ("model_tokens", "monetary_cost_usd", "tool_calls", "download_bytes")
COMPOSITE_KEYS = ("wall_clock_minutes", *USAGE_KEYS)


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def new_loop(
    *,
    budget_minutes: int,
    max_iterations: int,
    composite_budget: dict | None = None,
    carried_usage: dict | None = None,
) -> dict:
    if budget_minutes < 1 or max_iterations < 1:
        raise PolicyError("loop budget and maximum iterations must be positive")
    usage = {key: 0 for key in COMPOSITE_KEYS}
    if carried_usage:
        for key in COMPOSITE_KEYS:
            value = carried_usage.get(key, 0)
            if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
                raise PolicyError("carried composite usage must be known and non-negative")
            usage[key] = value
    ceilings = None
    if composite_budget:
        ceilings = {key: composite_budget[key] for key in COMPOSITE_KEYS}
    return {
        "phase": "plan",
        "iteration": 1,
        "max_iterations": max_iterations,
        "budget_minutes": budget_minutes,
        "used_minutes": 0,
        "composite_ceilings": ceilings,
        "usage": usage,
        "unknown_usage": [],
        "events": [],
        "terminal_reason": None,
    }


def _normalize_usage(state: dict, event: dict, duration: int) -> tuple[dict, list[str]]:
    provided = event.get("usage")
    if state.get("composite_ceilings") is not None and not isinstance(provided, dict):
        provided = {key: "unknown" for key in USAGE_KEYS}
    elif provided is None:
        provided = {key: 0 for key in USAGE_KEYS}
    if set(provided) != set(USAGE_KEYS):
        raise PolicyError(f"event usage must contain exactly {list(USAGE_KEYS)}")
    normalized: dict = {"wall_clock_minutes": duration}
    unknown: list[str] = []
    for key in USAGE_KEYS:
        value = provided[key]
        if value == "unknown":
            normalized[key] = "unknown"
            unknown.append(key)
            continue
        if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
            raise PolicyError(f"usage {key} must be a non-negative number or 'unknown'")
        if key in {"model_tokens", "tool_calls", "download_bytes"} and not isinstance(value, int):
            raise PolicyError(f"usage {key} must be a whole number or 'unknown'")
        normalized[key] = value
    return normalized, unknown


def record_event(state: dict, event: dict) -> dict:
    """Return an updated loop state, or reject the event without mutation."""
    updated = deepcopy(state)
    if updated.get("terminal_reason"):
        raise PolicyError(f"loop already ended at {updated['terminal_reason']}")

    phase = event.get("phase")
    if phase != updated.get("phase") or phase not in PHASES:
        raise PolicyError(f"expected {updated.get('phase')!r} event, received {phase!r}")
    duration = event.get("duration_minutes", 0)
    if not isinstance(duration, int) or isinstance(duration, bool) or duration < 0:
        raise PolicyError("event duration must be a non-negative whole number of minutes")
    if updated["used_minutes"] + duration > updated["budget_minutes"]:
        raise PolicyError("event would exceed the approved role wall-clock budget")
    usage, unknown_usage = _normalize_usage(updated, event, duration)

    normalized = {
        "phase": phase,
        "duration_minutes": duration,
        "usage": usage,
        "recorded_at": now_utc(),
        "summary": str(event.get("summary", "")).strip(),
    }
    if not normalized["summary"]:
        raise PolicyError("every loop event requires a concise summary")

    if phase == "act":
        operation = event.get("operation")
        decision = assess_operation(operation, download_gb=event.get("download_gb", 0))
        normalized["operation"] = operation
        if event.get("download_gb"):
            normalized["download_gb"] = event["download_gb"]
            minimum_bytes = int(event["download_gb"] * 1024**3)
            if usage["download_bytes"] != "unknown" and usage["download_bytes"] < minimum_bytes:
                raise PolicyError("recorded download bytes cannot be lower than the declared download size")
        if decision.status == "prohibited":
            raise PolicyError(decision.reason)
        if decision.status == "approval-required":
            approval_id = str(event.get("approval_id", "")).strip()
            if not approval_id:
                raise ApprovalRequired(decision.reason)
            normalized["approval_id"] = approval_id

    if phase == "observe":
        normalized["evidence_refs"] = list(event.get("evidence_refs", []))

    if phase == "evaluate":
        outcome = event.get("outcome")
        if outcome not in EVALUATION_OUTCOMES:
            raise PolicyError(f"evaluation outcome must be one of {sorted(EVALUATION_OUTCOMES)}")
        goal_met = event.get("goal_met")
        evidence_refs = list(event.get("evidence_refs", []))
        if outcome == "success" and (goal_met is not True or not evidence_refs):
            raise PolicyError("success requires goal_met=true and measurable evidence references")
        if outcome == "continue" and goal_met is not False:
            raise PolicyError("continue requires goal_met=false")
        normalized.update({"outcome": outcome, "goal_met": bool(goal_met), "evidence_refs": evidence_refs})

    updated["events"].append(normalized)
    updated["used_minutes"] += duration
    for key, value in usage.items():
        if value != "unknown":
            updated["usage"][key] += value
    updated["unknown_usage"] = sorted(set(updated["unknown_usage"]) | set(unknown_usage))

    if phase == "plan":
        updated["phase"] = "act"
    elif phase == "act":
        updated["phase"] = "observe"
    elif phase == "observe":
        updated["phase"] = "evaluate"
    else:
        outcome = normalized["outcome"]
        if outcome == "continue":
            if updated["iteration"] >= updated["max_iterations"]:
                updated["terminal_reason"] = "resource-boundary"
            else:
                updated["iteration"] += 1
                updated["phase"] = "plan"
        else:
            updated["terminal_reason"] = outcome

    if updated["unknown_usage"] and not updated["terminal_reason"]:
        updated["terminal_reason"] = "resource-boundary"
    ceilings = updated.get("composite_ceilings")
    if ceilings and not updated["terminal_reason"]:
        reached = any(
            updated["usage"][key] > 0 if ceilings[key] == 0 else updated["usage"][key] >= ceilings[key]
            for key in COMPOSITE_KEYS
        )
        if reached:
            updated["terminal_reason"] = "resource-boundary"
    if updated["used_minutes"] == updated["budget_minutes"] and not updated["terminal_reason"]:
        updated["terminal_reason"] = "resource-boundary"
    return updated
