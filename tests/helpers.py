from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from ai_company_os.definitions import WORKFLOWS
from ai_company_os.policy import build_composite_budget


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def assignment(selection: dict, **policy_kwargs) -> dict:
    assignment_id = f"asn_{uuid4().hex[:12]}"
    roles = (selection["name"],) if selection["type"] == "role" else WORKFLOWS[selection["name"]].roles
    role = roles[0]
    document = {
        "schema_version": "ai-company.assignment.v1",
        "id": assignment_id,
        "created_at": now(),
        "title": "Private test assignment",
        "requested_outcome": "Produce measurable test evidence",
        "role": role,
        "measurable_goal": {
            "statement": "Answer the bounded question",
            "metric": "criteria met",
            "target": "all required criteria",
            "success_criteria": ["one cited answer"],
        },
        "constraints": ["stay within the requested outcome"],
        "composite_budget": build_composite_budget(selection, **policy_kwargs),
        "prior_knowledge": {"query": "bounded test evidence", "references": [], "max_results": 5},
        "approval_pregrants": [],
        "output_path": f"outputs/{assignment_id}",
        "recovery_guards": {
            "source_identity": "test-source-sha256" if "project-validation" in roles else "not-applicable",
            "environment_identity": "test-isolated-environment-v1" if "project-validation" in roles else "test-environment-v1",
            "artifact_refs": [],
        },
    }
    if selection["type"] == "workflow":
        document["workflow"] = selection["name"]
    return document


def handoff(assignment_id: str, run_id: str, *, level: str = "medium") -> dict:
    return {
        "schema_version": "1.0",
        "id": f"handoff_{uuid4().hex[:12]}",
        "assignment_id": assignment_id,
        "run_id": run_id,
        "created_at": now(),
        "workflow": "research-to-idea-validation",
        "source_role": "research",
        "target_role": "idea-validation",
        "automatic": True,
        "requested_by_original_assignment": True,
        "confidence": {
            "level": level,
            "score": 0.7 if level == "medium" else 0.3,
            "rationale": "Evidence quality assessed",
            "evidence_basis": "primary" if level == "medium" else "indirect",
            "major_assumptions": ["The cited source applies to this scope"],
            "contradictions": [],
            "alternatives_tested": False,
            "reversal_risk": "unknown",
        },
        "load_bearing_claims": [{
            "claim_id": "claim_core1",
            "statement": "The evidence supports downstream evaluation",
            "confidence": level,
            "evidence_refs": ["ev_source"],
            "rationale": "Directly linked evidence",
        }],
        "evidence_refs": ["ev_source"],
        "provenance": [{"artifact_id": "ce_source", "origin_role": "research", "content_sha256": "a" * 64}],
        "uncertainty": ["One source is preliminary"],
        "approval_boundaries_triggered": [],
    }


def claims_evidence(assignment_id: str, run_id: str) -> dict:
    return {
        "schema_version": "1.0",
        "id": f"ce_{uuid4().hex[:12]}",
        "assignment_id": assignment_id,
        "run_id": run_id,
        "created_at": now(),
        "created_by_role": "research",
        "claims": [{
            "id": "claim_core1",
            "rank": 1,
            "statement": "The bounded result is documented",
            "source_kind": "paper",
            "industry": "software",
            "measurable_test": "Find the statement in the primary source",
            "evidence_refs": ["ev_primary1"],
            "uncertainty": "Source may be revised",
        }],
        "evidence": [{
            "id": "ev_primary1",
            "evidence_type": "primary-source",
            "relationship": "supports",
            "source_uri": "https://example.com/source",
            "source_title": "Primary source",
            "publication_date": "2026-01-01",
            "retrieved_at": now(),
            "primary_source": True,
            "observation": "The source states the measured result",
            "provenance": {"collector": "research", "method": "direct retrieval", "content_sha256": "b" * 64},
            "uncertainty": "No independent replication",
        }],
        "tags": ["test"],
    }


def experiment(assignment_id: str, run_id: str) -> dict:
    return {
        "schema_version": "1.0",
        "id": f"exp_{uuid4().hex[:12]}",
        "assignment_id": assignment_id,
        "run_id": run_id,
        "created_at": now(),
        "claim_ids": ["claim_core1"],
        "goal": {"metric": "passing runs", "target": "1", "success_condition": "one clean isolated run"},
        "feasibility_precheck": {"status": "feasible", "rationale": "Safe project-local test", "blocking_evidence": []},
        "attempted": True,
        "environment": {
            "isolation": "virtual-environment",
            "runtime": "Python 3.12",
            "source_uri": "https://example.com/repository",
            "source_revision": "abc123",
            "source_sha256": "c" * 64,
            "original_source_unchanged": True,
            "setup_commands": ["python -m venv .venv"],
            "reproduction_commands": [".venv/bin/python -m unittest"],
        },
        "baseline": {"method": "empty implementation", "result": "test fails"},
        "disconfirming_tests": [{"hypothesis": "Result depends on fixture", "command": "run without fixture", "result": "fails as expected"}],
        "evidence_refs": ["ev_output1"],
        "raw_evidence_paths": ["raw/test-output.txt"],
        "cost": {"currency": "USD", "amount": 0, "compute_hours": 0.1, "reliability_notes": "Repeated once in an isolated environment"},
        "practical_assessment": {"usefulness": "Useful for the bounded case", "operational_complexity": "Low", "limitations": ["Small sample"]},
        "safety_mode": "safe-software",
        "verdict": "partially confirmed",
    }


def decision_report(assignment_id: str, run_id: str, *, role: str = "research") -> dict:
    return {
        "schema_version": "1.0",
        "id": f"decision_{uuid4().hex[:12]}",
        "assignment_id": assignment_id,
        "run_id": run_id,
        "created_at": now(),
        "role": role,
        "title": "Bounded decision",
        "summary": "The measurable criterion has supporting evidence.",
        "decision": "research complete",
        "confidence": {
            "level": "medium",
            "score": 0.7,
            "rationale": "One primary source and explicit uncertainty",
            "evidence_basis": "primary",
            "major_assumptions": ["The primary source applies to the bounded question"],
            "contradictions": [],
            "alternatives_tested": False,
            "reversal_risk": "unknown",
        },
        "evidence_refs": ["ev_primary1"],
        "citations": [{
            "source_uri": "https://example.com/source",
            "source_title": "Primary source",
            "publication_date": "2026-01-01",
            "retrieved_at": now(),
            "primary_source": True,
        }],
        "uncertainty": ["No independent replication"],
        "criteria": [{"criterion": "one cited answer", "status": "met", "evidence_refs": ["ev_primary1"]}],
        "demand_validation": "not applicable",
        "report_path": "report.md",
        "tags": ["test"],
    }
