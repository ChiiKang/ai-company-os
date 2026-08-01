"""Command-line interface for private assignments and validated run artifacts."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .definitions import ROLES, selected_roles, workflow as workflow_contract, workflow_names
from .errors import AICompanyOSError, ContractError
from .paths import reject_public_report_source, reject_raw_secrets
from .policy import APPROVAL_OPERATIONS, assess_operation, build_composite_budget
from .router import add_loop_event, advance_handoff, create_run, inspect_run, resume_run
from .sandbox import validate_untrusted_execution
from .store import KnowledgeStore, PRIVATE_REPORT_MARKER
from .validator import SCHEMAS, validate_document
from .vault import discover_av


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def emit(document: dict | list) -> None:
    print(json.dumps(document, indent=2, sort_keys=True))


def load_json(path: str, *, must_be_private_source: bool = False) -> dict:
    source = reject_public_report_source(path) if must_be_private_source else Path(path)
    try:
        text = source.read_text(encoding="utf-8")
        reject_raw_secrets(text)
        document = json.loads(text)
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError(f"cannot read JSON document: {exc}") from exc
    if not isinstance(document, dict):
        raise ContractError("JSON document must be an object")
    return document


def command_init(args: argparse.Namespace) -> int:
    root = KnowledgeStore(args.root).initialize()
    emit({"status": "initialized", "knowledge_root": str(root), "permissions": "0700"})
    return 0


def _parse_pregrants(values: list[str]) -> list[dict]:
    pregrants: list[dict] = []
    for value in values:
        try:
            operation, approval_id = value.split("=", 1)
        except ValueError as exc:
            raise ContractError("approval pre-grants use OPERATION=APPROVAL_ID") from exc
        if operation not in APPROVAL_OPERATIONS or not approval_id.strip():
            raise ContractError("approval pre-grant must name a boundary operation and opaque approval id")
        pregrants.append(
            {
                "operation": operation,
                "approval_id": approval_id.strip(),
                "scope": "only this assignment and the named operation",
            }
        )
    return pregrants


def command_assignment_create(args: argparse.Namespace) -> int:
    selection = {"type": "role", "name": args.role} if args.role else {"type": "workflow", "name": args.workflow}
    budget = build_composite_budget(
        selection,
        budget_minutes=args.budget_minutes,
        builder_budget_minutes=args.builder_budget_minutes,
        approved_plan_id=args.approved_plan_id,
        max_cost_usd=args.max_cost_usd,
        spending_approval_id=args.spending_approval_id,
        max_iterations=args.max_iterations,
        max_model_tokens=args.max_model_tokens,
        max_tool_calls=args.max_tool_calls,
        max_download_bytes=args.max_download_bytes,
    )
    routed_roles = selected_roles(selection)
    if "project-validation" in routed_roles and (
        args.source_identity == "not-applicable" or args.environment_identity == "not-established"
    ):
        raise ContractError("Project Validation assignments require explicit source and isolated-environment identities")
    assignment_id = f"asn_{uuid4().hex[:16]}"
    role = args.role or workflow_contract(args.workflow).roles[0]
    assignment = {
        "schema_version": "ai-company.assignment.v1",
        "id": assignment_id,
        "created_at": now_utc(),
        "title": args.title,
        "requested_outcome": args.outcome,
        "role": role,
        "measurable_goal": {
            "statement": args.goal,
            "metric": args.metric,
            "target": args.target,
            "success_criteria": args.criterion,
        },
        "constraints": args.constraint
        or [
            "stay within the captain's requested outcome",
            "use literature, simulation, public data, and safe isolated software by default",
        ],
        "composite_budget": budget,
        "prior_knowledge": {
            "query": args.prior_query or args.goal,
            "references": args.prior_reference,
            "max_results": args.prior_max_results,
        },
        "approval_pregrants": _parse_pregrants(args.approval_pregrant),
        "output_path": f"outputs/{assignment_id}",
        "recovery_guards": {
            "source_identity": args.source_identity,
            "environment_identity": args.environment_identity,
            "artifact_refs": list(args.prior_reference),
        },
    }
    if args.workflow:
        assignment["workflow"] = args.workflow
    path = KnowledgeStore(args.root).save_assignment(assignment)
    emit({"assignment_id": assignment["id"], "role": role, "workflow": args.workflow, "stored_at": str(path)})
    return 0


def command_run_start(args: argparse.Namespace) -> int:
    run = create_run(KnowledgeStore(args.root), args.assignment)
    emit(
        {
            "run_id": run["id"],
            "current_role": run["current_role"],
            "role_definition_path": run["role_definition_path"],
            "status": run["status"],
            "adapter_boundary": run["adapter_boundary"],
            "what_we_already_know": run["what_we_already_know"],
            "checkpoint": run["checkpoint"],
        }
    )
    return 0


def command_run_event(args: argparse.Namespace) -> int:
    event: dict = {
        "phase": args.phase,
        "duration_minutes": args.duration_minutes,
        "summary": args.summary,
    }
    event["usage"] = {
        "model_tokens": args.model_tokens if args.model_tokens is not None else "unknown",
        "monetary_cost_usd": args.cost_usd if args.cost_usd is not None else "unknown",
        "tool_calls": args.tool_calls if args.tool_calls is not None else "unknown",
        "download_bytes": args.download_bytes if args.download_bytes is not None else "unknown",
    }
    if args.operation:
        event["operation"] = args.operation
    if args.download_gb is not None:
        event["download_gb"] = args.download_gb
    if args.approval_id:
        event["approval_id"] = args.approval_id
    if args.evidence_ref:
        event["evidence_refs"] = args.evidence_ref
    if args.outcome:
        event["outcome"] = args.outcome
        event["goal_met"] = args.goal_met
    run = add_loop_event(KnowledgeStore(args.root), args.run, event)
    emit(
        {
            "run_id": run["id"],
            "current_role": run["current_role"],
            "status": run["status"],
            "phase": run["loop"]["phase"],
            "iteration": run["loop"]["iteration"],
            "used_minutes": run["loop"]["used_minutes"],
            "composite_usage": run["loop"]["usage"],
            "unknown_usage": run["loop"]["unknown_usage"],
            "terminal_reason": run["loop"]["terminal_reason"],
            "checkpoint": run["checkpoint"],
        }
    )
    return 0


def command_run_inspect(args: argparse.Namespace) -> int:
    run = inspect_run(KnowledgeStore(args.root), args.run)
    emit(
        {
            "run_id": run["id"],
            "status": run["status"],
            "current_role": run["current_role"],
            "phase": run["loop"]["phase"],
            "iteration": run["loop"]["iteration"],
            "composite_usage": run["loop"]["usage"],
            "unknown_usage": run["loop"]["unknown_usage"],
            "checkpoint": run["checkpoint"],
            "recovery_identity": run["recovery_identity"],
        }
    )
    return 0


def command_run_resume(args: argparse.Namespace) -> int:
    attestation = load_json(args.attestation, must_be_private_source=True)
    run = resume_run(KnowledgeStore(args.root), args.run, attestation)
    emit({"run_id": run["id"], "status": run["status"], "phase": run["loop"]["phase"], "checkpoint": run["checkpoint"]})
    return 0


def command_run_handoff(args: argparse.Namespace) -> int:
    handoff = load_json(args.file, must_be_private_source=True)
    run = advance_handoff(KnowledgeStore(args.root), args.run, handoff)
    emit({"run_id": run["id"], "current_role": run["current_role"], "role_definition_path": run["role_definition_path"], "status": run["status"]})
    return 0


def command_artifact_marker(args: argparse.Namespace) -> int:
    emit({"private_report_marker": PRIVATE_REPORT_MARKER, "placement": "one of the first five lines"})
    return 0


def command_artifact_validate(args: argparse.Namespace) -> int:
    document = load_json(args.file)
    validate_document(args.type, document)
    emit({"status": "valid", "type": args.type, "id": document.get("id")})
    return 0


def command_artifact_store(args: argparse.Namespace) -> int:
    document = load_json(args.file, must_be_private_source=True)
    destination = KnowledgeStore(args.root).store_artifact(args.type, document, args.report)
    result = {"status": "stored", "type": args.type, "id": document["id"], "stored_at": str(destination)}
    if args.type == "decision-report":
        result["local_report_path"] = str(destination / "report.md")
    emit(result)
    return 0


def command_artifact_search(args: argparse.Namespace) -> int:
    results = KnowledgeStore(args.root).search(assignment_id=args.assignment, kind=args.type)
    emit(results)
    return 0


def command_policy_check(args: argparse.Namespace) -> int:
    decision = assess_operation(args.operation, download_gb=args.download_gb)
    emit({"operation": args.operation, "status": decision.status, "reason": decision.reason})
    return 0 if decision.status == "allowed" else 3


def command_sandbox_validate(args: argparse.Namespace) -> int:
    policy = load_json(args.file)
    validate_untrusted_execution(policy, allowed_staging_roots=args.allowed_staging_root)
    emit({"status": "valid", "network": policy["network"], "credentials": "none", "staging": "allowlisted"})
    return 0


def command_vault_locate(args: argparse.Namespace) -> int:
    path = discover_av(args.av_path)
    emit({"status": "available", "executable": str(path), "accepted_keys": ["ANTHROPIC_API_KEY", "GITHUB_TOKEN", "OPENAI_API_KEY"]})
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ai-company-os", description="Private local operations for AI Company OS")
    parser.add_argument("--root", help="private knowledge root (or set AI_COMPANY_OS_KNOWLEDGE_ROOT)")
    commands = parser.add_subparsers(dest="command", required=True)

    init = commands.add_parser("init", help="lazily create the private knowledge store")
    init.set_defaults(handler=command_init)

    assignment = commands.add_parser("assignment", help="create an explicit role/workflow assignment")
    assignment_commands = assignment.add_subparsers(dest="assignment_command", required=True)
    create = assignment_commands.add_parser("create")
    selection = create.add_mutually_exclusive_group(required=True)
    selection.add_argument("--role", choices=ROLES)
    selection.add_argument("--workflow", choices=list(workflow_names()))
    create.add_argument("--title", required=True)
    create.add_argument("--outcome", required=True, help="outcome requested by the captain")
    create.add_argument("--goal", required=True, help="measurable goal statement")
    create.add_argument("--metric", required=True)
    create.add_argument("--target", required=True)
    create.add_argument("--criterion", action="append", required=True, help="repeat for each acceptance criterion")
    create.add_argument("--constraint", action="append", help="repeat for assignment-specific constraints")
    create.add_argument("--prior-query", help="deterministic lexical query; defaults to the measurable goal")
    create.add_argument("--prior-reference", action="append", default=[], help="stable local:// reference explicitly supplied by the captain")
    create.add_argument("--prior-max-results", type=int, default=5, choices=range(1, 11))
    create.add_argument("--approval-pregrant", action="append", default=[], metavar="OPERATION=APPROVAL_ID", help="narrow captain-approved boundary for this assignment")
    create.add_argument("--source-identity", default="not-applicable", help="immutable source fingerprint used by recovery")
    create.add_argument("--environment-identity", default="not-established", help="environment fingerprint used by recovery")
    create.add_argument("--budget-minutes", type=int, help="single-role wall-clock budget; defaults apply except Builder")
    create.add_argument("--builder-budget-minutes", type=int, help="Builder step budget in a composed workflow")
    create.add_argument("--approved-plan-id", help="captain-approved plan that supplied the Builder budget")
    create.add_argument("--max-cost-usd", type=float, default=0)
    create.add_argument("--spending-approval-id")
    create.add_argument("--max-model-tokens", type=int, default=200000)
    create.add_argument("--max-tool-calls", type=int, default=100)
    create.add_argument("--max-download-bytes", type=int, default=5 * 1024**3)
    create.add_argument("--max-iterations", type=int, default=8)
    create.set_defaults(handler=command_assignment_create)

    run = commands.add_parser("run", help="record a bounded run at the model adapter boundary")
    run_commands = run.add_subparsers(dest="run_command", required=True)
    start = run_commands.add_parser("start")
    start.add_argument("--assignment", required=True)
    start.set_defaults(handler=command_run_start)
    event = run_commands.add_parser("event")
    event.add_argument("--run", required=True)
    event.add_argument("--phase", required=True, choices=["plan", "act", "observe", "evaluate"])
    event.add_argument("--duration-minutes", required=True, type=int)
    event.add_argument("--summary", required=True)
    event.add_argument("--model-tokens", type=int, help="omit only when usage is genuinely unknown, which stops the run")
    event.add_argument("--cost-usd", type=float, help="known incremental monetary usage")
    event.add_argument("--tool-calls", type=int, help="known incremental tool-call usage")
    event.add_argument("--download-bytes", type=int, help="known incremental download usage")
    event.add_argument("--operation")
    event.add_argument("--download-gb", type=float)
    event.add_argument("--approval-id")
    event.add_argument("--evidence-ref", action="append")
    event.add_argument("--outcome", choices=["success", "continue", "proven-blocker", "exhausted-useful-hypotheses", "resource-boundary", "approval-boundary"])
    goal = event.add_mutually_exclusive_group()
    goal.add_argument("--goal-met", action="store_true", dest="goal_met")
    goal.add_argument("--goal-not-met", action="store_false", dest="goal_met")
    event.set_defaults(goal_met=None, handler=command_run_event)
    inspect = run_commands.add_parser("inspect", help="verify and show the latest atomic checkpoint")
    inspect.add_argument("--run", required=True)
    inspect.set_defaults(handler=command_run_inspect)
    resume = run_commands.add_parser("resume", help="resume only after recovery identities are re-attested")
    resume.add_argument("--run", required=True)
    resume.add_argument("--attestation", required=True)
    resume.set_defaults(handler=command_run_resume)
    handoff = run_commands.add_parser("handoff")
    handoff.add_argument("--run", required=True)
    handoff.add_argument("--file", required=True)
    handoff.set_defaults(handler=command_run_handoff)

    artifact = commands.add_parser("artifact", help="validate, privately store, or search structured artifacts")
    artifact_commands = artifact.add_subparsers(dest="artifact_command", required=True)
    marker = artifact_commands.add_parser("marker", help="return the mandatory private-report marker")
    marker.set_defaults(handler=command_artifact_marker)
    validate = artifact_commands.add_parser("validate")
    validate.add_argument("--type", required=True, choices=sorted(SCHEMAS))
    validate.add_argument("--file", required=True)
    validate.set_defaults(handler=command_artifact_validate)
    store = artifact_commands.add_parser("store")
    store.add_argument("--type", required=True, choices=["claims-evidence", "experiment", "handoff", "decision-report"])
    store.add_argument("--file", required=True)
    store.add_argument("--report", help="external Markdown body required for decision-report")
    store.set_defaults(handler=command_artifact_store)
    search = artifact_commands.add_parser("search")
    search.add_argument("--assignment")
    search.add_argument("--type", choices=["claims-evidence", "experiment", "handoff", "decision-report"])
    search.set_defaults(handler=command_artifact_search)

    policy = commands.add_parser("policy", help="inspect approval boundaries")
    policy_commands = policy.add_subparsers(dest="policy_command", required=True)
    check = policy_commands.add_parser("check")
    check.add_argument("--operation", required=True)
    check.add_argument("--download-gb", type=float, default=0)
    check.set_defaults(handler=command_policy_check)

    sandbox = commands.add_parser("sandbox", help="validate a hostile-code execution envelope without executing it")
    sandbox_commands = sandbox.add_subparsers(dest="sandbox_command", required=True)
    sandbox_validate = sandbox_commands.add_parser("validate")
    sandbox_validate.add_argument("--file", required=True)
    sandbox_validate.add_argument("--allowed-staging-root", action="append", required=True)
    sandbox_validate.set_defaults(handler=command_sandbox_validate)

    vault = commands.add_parser("vault", help="discover the name-only Automic Vault boundary")
    vault_commands = vault.add_subparsers(dest="vault_command", required=True)
    locate = vault_commands.add_parser("locate")
    locate.add_argument("--av-path")
    locate.set_defaults(handler=command_vault_locate)
    return parser


def main(argv: list[str] | None = None) -> int:
    try:
        args = build_parser().parse_args(argv)
        return args.handler(args)
    except AICompanyOSError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
