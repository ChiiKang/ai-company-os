"""Exact role routing, checkpoints, recovery, and confidence-gated handoffs."""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

from .definitions import assignment_roles, workflow as workflow_contract
from .errors import ContractError, PolicyError
from .knowledge import knowledge_markdown, lexical_lookup
from .loop import new_loop, record_event
from .policy import approval_category
from .store import KnowledgeStore
from .validator import validate_document

CONFIDENCE = {"low": 1, "medium": 2, "high": 3}
MIGRATION_KEY = "workflow_contract_migration"
MIGRATION_FIELDS = frozenset(
    {"approval_id", "stored_schema_version", "stored_sha256", "current_schema_version", "current_sha256"}
)


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _hash(document: dict) -> str:
    return hashlib.sha256(json.dumps(document, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _checkpoint(run: dict) -> None:
    previous = run.pop("checkpoint", None)
    sequence = 0 if previous is None else previous["sequence"] + 1
    run["checkpoint"] = {
        "sequence": sequence,
        "state_sha256": _hash(run),
        "created_at": now_utc(),
    }


def _verify_checkpoint(run: dict) -> None:
    checkpoint = run.get("checkpoint")
    if not checkpoint:
        raise PolicyError("run has no atomic checkpoint")
    state = deepcopy(run)
    state.pop("checkpoint", None)
    if _hash(state) != checkpoint.get("state_sha256"):
        raise PolicyError("run checkpoint identity mismatch; inspect and recover before continuing")


CONTRACT_DRIFT_WARNING = (
    "the workflow contract changed after this run was checkpointed; no further work is executed until "
    "run resume attests the stored and current contract identities with a captain migration approval"
)


def _workflow_identity(name: str | None) -> dict | None:
    if not name:
        return None
    try:
        return workflow_contract(name).identity()
    except (ValueError, ContractError) as exc:
        raise PolicyError(f"the workflow contract this run was checkpointed against is unusable: {exc}") from exc


def _loadable_workflow_identity(run: dict) -> dict | None:
    try:
        return _workflow_identity(run.get("workflow"))
    except PolicyError:
        return None


def workflow_contract_drift(run: dict) -> dict | None:
    """Report a stored/current workflow contract mismatch without changing anything."""
    stored = run["recovery_identity"].get("workflow_contract")
    current = _loadable_workflow_identity(run)
    if stored == current:
        return None
    return {"stored": stored, "current": current, "warning": CONTRACT_DRIFT_WARNING}


def _require_current_workflow_contract(run: dict) -> None:
    drift = workflow_contract_drift(run)
    if drift:
        raise PolicyError(drift["warning"])


def inspect_run(store: KnowledgeStore, run_id: str) -> dict:
    """Read-only verification; contract drift is reported by `workflow_contract_drift`."""
    run = store.load_run(run_id)
    _verify_checkpoint(run)
    assignment = store.load_assignment(run["assignment_id"])
    if _hash(assignment) != run["assignment_sha256"]:
        raise PolicyError("assignment identity changed after run creation")
    return run


def create_run(store: KnowledgeStore, assignment_id: str) -> dict:
    assignment = store.load_assignment(assignment_id)
    roles = assignment_roles(assignment)
    role = roles[0]
    budget = assignment["composite_budget"]
    prior = lexical_lookup(
        store,
        assignment["prior_knowledge"]["query"],
        explicit_references=assignment["prior_knowledge"]["references"],
        limit=assignment["prior_knowledge"]["max_results"],
    )
    initial_artifacts = set(assignment["recovery_guards"]["artifact_refs"])
    initial_artifacts.update(assignment["prior_knowledge"]["references"])
    run = {
        "id": f"run_{uuid4().hex[:16]}",
        "assignment_id": assignment_id,
        "assignment_sha256": _hash(assignment),
        "role": assignment["role"],
        "workflow": assignment.get("workflow"),
        "roles": list(roles),
        "role_index": 0,
        "current_role": role,
        "role_definition_path": f"roles/{role}.md",
        "status": "awaiting-adapter",
        "adapter_boundary": "No model is run by this foundation; invoke only the returned public role definition.",
        "what_we_already_know": knowledge_markdown(prior),
        "prior_knowledge_retrieval": prior,
        "created_at": now_utc(),
        "updated_at": now_utc(),
        "loop": new_loop(
            budget_minutes=budget["role_wall_clock_minutes"][role],
            max_iterations=budget["max_iterations_per_role"],
            composite_budget=budget,
        ),
        "recovery_identity": {
            "source_identity": assignment["recovery_guards"]["source_identity"],
            "environment_identity": assignment["recovery_guards"]["environment_identity"],
            "approval_ids": sorted(item["approval_id"] for item in assignment["approval_pregrants"]),
            "artifact_refs": sorted(initial_artifacts),
            "workflow_contract": _workflow_identity(assignment.get("workflow")),
        },
        "handoff_ids": [],
    }
    _checkpoint(run)
    store.save_run(run)
    return run


def _apply_pregrant(assignment: dict, run: dict, event: dict) -> dict:
    updated = deepcopy(event)
    if updated.get("approval_id"):
        return updated
    operation = updated.get("operation")
    category = approval_category(operation, download_gb=updated.get("download_gb") or 0)
    workflow_name = run.get("workflow")
    if workflow_name and run["role_index"] > 0 and category in workflow_contract(workflow_name).never_approves:
        return updated
    pregrant_operation = "large-download" if operation == "download" and category == "large download" else operation
    match = next(
        (item for item in assignment["approval_pregrants"] if item["operation"] == pregrant_operation),
        None,
    )
    if match:
        updated["approval_id"] = match["approval_id"]
    return updated


def add_loop_event(store: KnowledgeStore, run_id: str, event: dict) -> dict:
    run = inspect_run(store, run_id)
    _require_current_workflow_contract(run)
    if run["status"] in {"complete", "stopped", "awaiting-handoff"}:
        raise PolicyError(f"run status {run['status']!r} does not accept loop events")
    assignment = store.load_assignment(run["assignment_id"])
    event = _apply_pregrant(assignment, run, event)
    run["loop"] = record_event(run["loop"], event)
    run["status"] = "active"
    if event.get("approval_id"):
        approvals = set(run["recovery_identity"]["approval_ids"])
        approvals.add(event["approval_id"])
        run["recovery_identity"]["approval_ids"] = sorted(approvals)
    references = set(run["recovery_identity"]["artifact_refs"])
    references.update(event.get("evidence_refs", []))
    run["recovery_identity"]["artifact_refs"] = sorted(references)

    terminal = run["loop"].get("terminal_reason")
    if terminal:
        if terminal == "success":
            if run["role_index"] == len(run["roles"]) - 1:
                run["status"] = "complete"
            else:
                # Completion does not silently start the next conceptual role.
                run["status"] = "awaiting-handoff"
        else:
            run["status"] = "stopped"
    run["updated_at"] = now_utc()
    _checkpoint(run)
    store.save_run(run, overwrite=True)
    return run


def _migrate_workflow_contract(run: dict, attestation: dict) -> None:
    drift = workflow_contract_drift(run)
    migration = attestation.get(MIGRATION_KEY)
    if drift is None:
        if migration is not None:
            raise PolicyError("the attested workflow contract migration does not apply; the contract is unchanged")
        return
    if migration is None:
        raise PolicyError(CONTRACT_DRIFT_WARNING)
    if not isinstance(migration, dict) or set(migration) != MIGRATION_FIELDS:
        raise ContractError(
            "resuming a changed workflow contract requires a "
            f"{MIGRATION_KEY} attestation naming exactly {sorted(MIGRATION_FIELDS)}"
        )
    if any(not isinstance(migration[key], str) or not migration[key].strip() for key in MIGRATION_FIELDS):
        raise ContractError("workflow contract migration fields must be non-empty strings")
    stored, current = drift["stored"], drift["current"]
    if stored is None or current is None:
        raise PolicyError(
            "a workflow contract migration needs both the stored and the currently loadable contract identity"
        )
    if (migration["stored_schema_version"], migration["stored_sha256"]) != (stored["schema_version"], stored["sha256"]):
        raise PolicyError("the attested stored workflow contract identity does not match this run's checkpoint")
    if (migration["current_schema_version"], migration["current_sha256"]) != (
        current["schema_version"],
        current["sha256"],
    ):
        raise PolicyError("the attested current workflow contract identity does not match the loaded contract")
    if current["name"] != stored["name"] or current["roles"] != stored["roles"]:
        raise PolicyError("a workflow contract migration cannot change the run's workflow identity or declared route")
    for key in ("minimum_confidence", "minimum_claim_confidence"):
        if CONFIDENCE[current[key]] < CONFIDENCE[stored[key]]:
            raise PolicyError("a workflow contract migration cannot lower a declared handoff confidence floor")
    run["recovery_identity"]["workflow_contract"] = current
    run.setdefault("workflow_contract_migrations", []).append(
        {
            "approval_id": migration["approval_id"].strip(),
            "from_schema_version": stored["schema_version"],
            "from_sha256": stored["sha256"],
            "to_schema_version": current["schema_version"],
            "to_sha256": current["sha256"],
            "migrated_at": now_utc(),
        }
    )


def resume_run(store: KnowledgeStore, run_id: str, attestation: dict) -> dict:
    run = inspect_run(store, run_id)
    required = {
        "run_id",
        "checkpoint_sha256",
        "source_identity",
        "environment_identity",
        "approval_ids",
        "artifact_refs",
    }
    if not isinstance(attestation, dict) or not required <= set(attestation) or set(attestation) - required - {MIGRATION_KEY}:
        raise ContractError(
            "resume attestation must contain exactly the v1 recovery identity fields, "
            f"plus an optional {MIGRATION_KEY} object"
        )
    if any(not isinstance(attestation[key], str) or not attestation[key] for key in ("run_id", "checkpoint_sha256", "source_identity", "environment_identity")):
        raise ContractError("resume identity and checkpoint fields must be non-empty strings")
    for key in ("approval_ids", "artifact_refs"):
        value = attestation[key]
        if not isinstance(value, list) or any(not isinstance(item, str) or not item for item in value) or len(value) != len(set(value)):
            raise ContractError(f"resume {key} must be a unique string list")
    if attestation["run_id"] != run_id or attestation["checkpoint_sha256"] != run["checkpoint"]["state_sha256"]:
        raise PolicyError("resume checkpoint identity does not match")
    expected = run["recovery_identity"]
    for key in ("source_identity", "environment_identity"):
        if attestation[key] != expected[key]:
            raise PolicyError(f"resume {key.replace('_', ' ')} changed")
    if sorted(attestation["approval_ids"]) != expected["approval_ids"]:
        raise PolicyError("resume approval identity changed")
    if sorted(attestation["artifact_refs"]) != expected["artifact_refs"]:
        raise PolicyError("resume artifact identity changed")
    if run["status"] in {"complete", "stopped", "awaiting-handoff"}:
        raise PolicyError(f"run status {run['status']!r} cannot resume")
    _migrate_workflow_contract(run, attestation)
    run["last_resumed_at"] = now_utc()
    run["updated_at"] = now_utc()
    _checkpoint(run)
    store.save_run(run, overwrite=True)
    return run


def advance_handoff(store: KnowledgeStore, run_id: str, handoff: dict) -> dict:
    validate_document("handoff", handoff)
    run = inspect_run(store, run_id)
    _require_current_workflow_contract(run)
    assignment = store.load_assignment(run["assignment_id"])
    if not assignment.get("workflow"):
        raise PolicyError("independent role assignments never hand off automatically")
    contract = workflow_contract(assignment["workflow"])
    if run["status"] != "awaiting-handoff":
        raise PolicyError("handoff requires measurable success from the current role")
    if handoff["assignment_id"] != assignment["id"] or handoff["run_id"] != run["id"]:
        raise PolicyError("handoff does not belong to this original assignment and run")
    if handoff["workflow"] != assignment["workflow"]:
        raise PolicyError("handoff workflow is outside the captain's original assignment")
    if handoff["automatic"] is not True or handoff["requested_by_original_assignment"] is not True:
        raise PolicyError("automatic handoff must be explicitly authorized by the original workflow assignment")
    if CONFIDENCE[handoff["confidence"]["level"]] < CONFIDENCE[contract.minimum_confidence]:
        raise PolicyError(f"automatic handoff requires {contract.minimum_confidence} confidence or higher")
    if any(
        CONFIDENCE[item["confidence"]] < CONFIDENCE[contract.minimum_claim_confidence]
        for item in handoff["load_bearing_claims"]
    ):
        raise PolicyError(
            f"every load-bearing handoff claim requires {contract.minimum_claim_confidence} confidence and evidence"
        )
    never_approved = sorted(set(handoff["approval_boundaries_triggered"]) & set(contract.never_approves))
    if never_approved:
        raise PolicyError(f"this workflow never approves {', '.join(never_approved)} through a handoff")
    if handoff["approval_boundaries_triggered"]:
        raise PolicyError("approval-boundary work cannot be authorized by a handoff")
    unpreserved = [field for field in contract.preserved_fields if not handoff.get(field)]
    if unpreserved:
        raise PolicyError(f"handoff must preserve {', '.join(unpreserved)} declared by this workflow")

    expected_source = run["current_role"]
    next_index = run["role_index"] + 1
    if next_index >= len(run["roles"]):
        raise PolicyError("workflow has no downstream role")
    expected_target = run["roles"][next_index]
    if handoff["source_role"] != expected_source or handoff["target_role"] != expected_target:
        raise PolicyError(f"handoff must follow declared route {expected_source} -> {expected_target}")

    store.store_artifact("handoff", handoff)
    budget = assignment["composite_budget"]
    run["role_index"] = next_index
    run["current_role"] = expected_target
    run["role_definition_path"] = f"roles/{expected_target}.md"
    run["status"] = "awaiting-adapter"
    run["loop"] = new_loop(
        budget_minutes=budget["role_wall_clock_minutes"][expected_target],
        max_iterations=budget["max_iterations_per_role"],
        composite_budget=budget,
        carried_usage=run["loop"]["usage"],
    )
    run["handoff_ids"].append(handoff["id"])
    preserved = set(contract.preserved_fields)
    artifact_refs = set(run["recovery_identity"]["artifact_refs"])
    artifact_refs.add(handoff["id"])
    if "provenance" in preserved:
        artifact_refs.update(item["artifact_id"] for item in handoff["provenance"])
    if "evidence_refs" in preserved:
        artifact_refs.update(handoff["evidence_refs"])
    if "uncertainty" in preserved:
        run["carried_uncertainty"] = sorted(set(run.get("carried_uncertainty", [])) | set(handoff["uncertainty"]))
    run["recovery_identity"]["artifact_refs"] = sorted(artifact_refs)
    run["updated_at"] = now_utc()
    _checkpoint(run)
    store.save_run(run, overwrite=True)
    return run
