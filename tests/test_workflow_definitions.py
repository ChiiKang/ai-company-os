import json
import tempfile
import unittest
from copy import deepcopy
from dataclasses import replace
from pathlib import Path

from ai_company_os import definitions
from ai_company_os.definitions import ROLES, load_workflows, workflow, workflow_names, workflows_directory
from ai_company_os.errors import AICompanyOSError, ApprovalRequired, ContractError, PolicyError
from ai_company_os.policy import APPROVAL_BOUNDARY_CATEGORIES, APPROVAL_OPERATIONS
from ai_company_os.router import add_loop_event, advance_handoff, create_run, inspect_run, resume_run
from ai_company_os.store import KnowledgeStore
from ai_company_os.validator import SCHEMAS, generated_enum_drift, load_schema, schemas_directory

from helpers import assignment, handoff
from test_handoffs import complete_current_role

ZERO_USAGE = {"model_tokens": 0, "monetary_cost_usd": 0, "tool_calls": 0, "download_bytes": 0}
WORKFLOW = "research-to-idea-validation"


def contract(name: str = "research-to-builder", roles=("research", "builder"), **overrides) -> dict:
    document = {
        "schema_version": "1.0",
        "name": name,
        "description": "Load a composition from its public contract only.",
        "explicit_selection_required": True,
        "roles": list(roles),
        "automatic_handoff": {
            "minimum_confidence": "medium",
            "every_load_bearing_claim_minimum_confidence": "medium",
            "observable_rubric": "procedures/confidence.md",
            "requires_current_role_success": True,
            "preserve": ["evidence_refs", "provenance", "uncertainty"],
            "stay_within_original_assignment": True,
        },
        "handoff_never_approves": ["spending"],
    }
    if "builder" in roles:
        document["builder_requires_approved_plan_and_budget"] = True
    document.update(overrides)
    return document


def write_contracts(directory: Path, *documents: dict) -> Path:
    for document in documents:
        (directory / f"{document['name']}.json").write_text(json.dumps(document), encoding="utf-8")
    return directory


class WorkflowContractTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def test_public_contract_files_are_the_runtime_registry(self):
        published = sorted(path.stem for path in workflows_directory().glob("*.json"))
        self.assertEqual(published, list(workflow_names()))
        for name in published:
            document = json.loads((workflows_directory() / f"{name}.json").read_text(encoding="utf-8"))
            loaded = workflow(name)
            self.assertEqual(tuple(document["roles"]), loaded.roles)
            self.assertEqual(document["description"], loaded.description)
            self.assertEqual(document["automatic_handoff"]["minimum_confidence"], loaded.minimum_confidence)
            self.assertEqual(tuple(document["handoff_never_approves"]), loaded.never_approves)

    def test_new_contract_file_defines_a_new_workflow(self):
        loaded = load_workflows(write_contracts(self.directory, contract()))
        self.assertEqual(("research", "builder"), loaded["research-to-builder"].roles)
        self.assertTrue(loaded["research-to-builder"].requires_builder_plan)

    def test_contract_file_name_must_match_the_workflow_name(self):
        (self.directory / "misnamed.json").write_text(json.dumps(contract()), encoding="utf-8")
        with self.assertRaises(ContractError):
            load_workflows(self.directory)

    def test_builder_route_must_declare_the_approved_plan_requirement(self):
        document = contract()
        del document["builder_requires_approved_plan_and_budget"]
        with self.assertRaises(ContractError):
            load_workflows(write_contracts(self.directory, document))

    def test_unknown_role_is_rejected(self):
        directory = self.directory / "unknown-role"
        directory.mkdir()
        with self.assertRaises(ContractError):
            load_workflows(write_contracts(directory, contract(roles=("research", "marketing"))))

    def test_single_role_composition_is_rejected(self):
        directory = self.directory / "single-role"
        directory.mkdir()
        with self.assertRaises(ContractError):
            load_workflows(write_contracts(directory, contract(roles=("research",))))

    def test_weakened_handoff_confidence_is_rejected_by_the_contract_schema(self):
        document = contract()
        document["automatic_handoff"]["minimum_confidence"] = "low"
        with self.assertRaises(ContractError):
            load_workflows(write_contracts(self.directory, document))

    def test_missing_contract_directory_fails_loudly(self):
        with self.assertRaises(ContractError):
            load_workflows(self.directory / "absent")

    def test_published_schema_enumerations_are_standard_and_current(self):
        self.assertEqual([], generated_enum_drift())
        assignment_schema = load_schema("assignment")
        self.assertEqual(list(ROLES), assignment_schema["properties"]["role"]["enum"])
        self.assertEqual(list(workflow_names()), assignment_schema["properties"]["workflow"]["enum"])
        handoff_schema = load_schema("handoff")
        self.assertEqual(list(workflow_names()), handoff_schema["properties"]["workflow"]["enum"])
        self.assertEqual(list(ROLES), load_schema("workflow")["properties"]["roles"]["items"]["enum"])
        self.assertEqual(
            sorted(APPROVAL_BOUNDARY_CATEGORIES),
            handoff_schema["properties"]["approval_boundaries_triggered"]["items"]["enum"],
        )
        for name in SCHEMAS.values():
            document = json.loads((schemas_directory() / name).read_text(encoding="utf-8"))
            self.assertNotIn("enumSource", json.dumps(document))

    def test_stale_published_enum_is_reported_as_drift(self):
        for name in SCHEMAS.values():
            (self.directory / name).write_text(
                (schemas_directory() / name).read_text(encoding="utf-8"), encoding="utf-8"
            )
        stale = json.loads((self.directory / SCHEMAS["assignment"]).read_text(encoding="utf-8"))
        stale["properties"]["role"]["enum"] = ["research", "marketing"]
        (self.directory / SCHEMAS["assignment"]).write_text(json.dumps(stale), encoding="utf-8")
        drift = generated_enum_drift(self.directory)
        self.assertEqual(1, len(drift))
        self.assertIn("role-names", drift[0])

    def test_every_approval_operation_has_exactly_one_category(self):
        categorized = [
            operation for operations in APPROVAL_BOUNDARY_CATEGORIES.values() for operation in operations
        ]
        self.assertEqual(sorted(APPROVAL_OPERATIONS), sorted(categorized))
        self.assertEqual(len(categorized), len(set(categorized)))


class ContractDrivenHandoffTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.store = KnowledgeStore(self.temporary.name)
        self.assignment = assignment({"type": "workflow", "name": WORKFLOW})
        self.store.save_assignment(self.assignment)
        self.run = complete_current_role(self.store, create_run(self.store, self.assignment["id"]))
        self.original = definitions.workflows()
        definitions._WORKFLOWS = deepcopy(self.original)

    def tearDown(self):
        definitions._WORKFLOWS = self.original
        self.temporary.cleanup()

    def declare(self, **overrides):
        definitions._WORKFLOWS[WORKFLOW] = replace(self.original[WORKFLOW], **overrides)

    def test_declared_minimum_confidence_gates_the_handoff(self):
        self.declare(minimum_confidence="high", minimum_claim_confidence="high")
        document = handoff(self.assignment["id"], self.run["id"], level="medium")
        with self.assertRaises(PolicyError):
            advance_handoff(self.store, self.run["id"], document)
        self.assertEqual("research", self.store.load_run(self.run["id"])["current_role"])

    def test_declared_never_approved_category_is_refused_by_name(self):
        document = handoff(self.assignment["id"], self.run["id"])
        document["approval_boundaries_triggered"] = ["spending"]
        with self.assertRaises(PolicyError) as raised:
            advance_handoff(self.store, self.run["id"], document)
        self.assertIn("never approves spending", str(raised.exception))

    def handoff_with_new_evidence(self) -> dict:
        document = handoff(self.assignment["id"], self.run["id"])
        document["evidence_refs"] = ["ev_source", "ev_handoff_only"]
        return document

    def test_declared_preserved_fields_enter_the_recovery_identity(self):
        document = self.handoff_with_new_evidence()
        advanced = advance_handoff(self.store, self.run["id"], document)
        identity = advanced["recovery_identity"]["artifact_refs"]
        self.assertIn("ev_handoff_only", identity)
        self.assertIn(document["provenance"][0]["artifact_id"], identity)
        self.assertEqual(document["uncertainty"], advanced["carried_uncertainty"])

    def test_undeclared_preservation_is_not_invented(self):
        self.declare(preserved_fields=("provenance",))
        document = self.handoff_with_new_evidence()
        advanced = advance_handoff(self.store, self.run["id"], document)
        self.assertNotIn("ev_handoff_only", advanced["recovery_identity"]["artifact_refs"])
        self.assertNotIn("carried_uncertainty", advanced)

    def test_declared_preservation_of_an_absent_field_is_refused(self):
        self.declare(preserved_fields=("evidence_refs", "provenance", "uncertainty", "approval_boundaries_triggered"))
        with self.assertRaises(PolicyError) as raised:
            advance_handoff(self.store, self.run["id"], handoff(self.assignment["id"], self.run["id"]))
        self.assertIn("approval_boundaries_triggered", str(raised.exception))


class HandoffApprovalInheritanceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.store = KnowledgeStore(self.temporary.name)
        self.assignment = assignment(
            {"type": "workflow", "name": WORKFLOW}, max_cost_usd=1, spending_approval_id="spending-approved"
        )
        self.assignment["approval_pregrants"] = [
            {
                "operation": "paid-api",
                "approval_id": "paid-api-approved",
                "scope": "only this assignment and the named operation",
            }
        ]
        self.store.save_assignment(self.assignment)
        self.run = complete_current_role(self.store, create_run(self.store, self.assignment["id"]))

    def tearDown(self):
        self.temporary.cleanup()

    def paid_event(self) -> dict:
        return {
            "phase": "act",
            "duration_minutes": 1,
            "summary": "paid lookup",
            "operation": "paid-api",
            "usage": {**ZERO_USAGE, "monetary_cost_usd": 0.25, "tool_calls": 1},
        }

    def test_pregrant_applies_before_any_handoff(self):
        run = create_run(self.store, self.assignment["id"])
        run = add_loop_event(
            self.store, run["id"], {"phase": "plan", "duration_minutes": 1, "summary": "plan", "usage": ZERO_USAGE}
        )
        run = add_loop_event(self.store, run["id"], self.paid_event())
        self.assertEqual("paid-api-approved", run["loop"]["events"][-1]["approval_id"])

    def test_handoff_never_substitutes_for_a_never_approved_category(self):
        run = advance_handoff(self.store, self.run["id"], handoff(self.assignment["id"], self.run["id"]))
        run = add_loop_event(
            self.store, run["id"], {"phase": "plan", "duration_minutes": 1, "summary": "plan", "usage": ZERO_USAGE}
        )
        with self.assertRaises(ApprovalRequired):
            add_loop_event(self.store, run["id"], self.paid_event())
        explicit = {**self.paid_event(), "approval_id": "paid-api-approved-again"}
        run = add_loop_event(self.store, run["id"], explicit)
        self.assertEqual("paid-api-approved-again", run["loop"]["events"][-1]["approval_id"])


class ContractIdentityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.store = KnowledgeStore(self.temporary.name)
        self.assignment = assignment({"type": "workflow", "name": WORKFLOW})
        self.store.save_assignment(self.assignment)
        self.run = create_run(self.store, self.assignment["id"])
        self.original = definitions.workflows()
        definitions._WORKFLOWS = deepcopy(self.original)

    def tearDown(self):
        definitions._WORKFLOWS = self.original
        self.temporary.cleanup()

    def change_contract(self, **overrides):
        definitions._WORKFLOWS[WORKFLOW] = replace(self.original[WORKFLOW], digest="f" * 64, **overrides)

    def attestation(self, **extra) -> dict:
        identity = self.run["recovery_identity"]
        return {
            "run_id": self.run["id"],
            "checkpoint_sha256": self.run["checkpoint"]["state_sha256"],
            "source_identity": identity["source_identity"],
            "environment_identity": identity["environment_identity"],
            "approval_ids": identity["approval_ids"],
            "artifact_refs": identity["artifact_refs"],
            **extra,
        }

    def test_contract_version_and_digest_are_bound_into_the_checkpoint(self):
        snapshot = self.run["recovery_identity"]["workflow_contract"]
        contract = self.original[WORKFLOW]
        self.assertEqual(contract.digest, snapshot["sha256"])
        self.assertEqual(contract.schema_version, snapshot["schema_version"])
        self.assertEqual(contract.minimum_confidence, snapshot["minimum_confidence"])

    def test_independent_role_run_records_no_workflow_contract(self):
        record = assignment({"type": "role", "name": "research"})
        self.store.save_assignment(record)
        run = create_run(self.store, record["id"])
        self.assertIsNone(run["recovery_identity"]["workflow_contract"])
        self.assertEqual(run["checkpoint"], inspect_run(self.store, run["id"])["checkpoint"])

    def test_changed_contract_stops_an_in_flight_run(self):
        self.change_contract()
        with self.assertRaises(PolicyError):
            inspect_run(self.store, self.run["id"])
        with self.assertRaises(PolicyError):
            add_loop_event(
                self.store,
                self.run["id"],
                {"phase": "plan", "duration_minutes": 1, "summary": "plan", "usage": ZERO_USAGE},
            )

    def test_resume_refuses_a_changed_contract_without_an_explicit_migration(self):
        self.change_contract()
        with self.assertRaises(PolicyError):
            resume_run(self.store, self.run["id"], self.attestation())

    def test_resume_accepts_an_explicit_safe_migration_and_rebinds_identity(self):
        self.change_contract()
        resumed = resume_run(
            self.store, self.run["id"], self.attestation(workflow_contract_migration_approval_id="captain-migration-1")
        )
        migration = resumed["workflow_contract_migrations"][0]
        self.assertEqual("captain-migration-1", migration["approval_id"])
        self.assertEqual(self.original[WORKFLOW].digest, migration["from_sha256"])
        self.assertEqual("f" * 64, resumed["recovery_identity"]["workflow_contract"]["sha256"])
        self.assertEqual(resumed["checkpoint"], inspect_run(self.store, self.run["id"])["checkpoint"])

    def test_migration_cannot_weaken_the_declared_confidence_floor(self):
        self.change_contract(minimum_claim_confidence="low")
        with self.assertRaises(PolicyError):
            resume_run(
                self.store, self.run["id"], self.attestation(workflow_contract_migration_approval_id="captain-migration-1")
            )

    def test_migration_cannot_change_the_declared_route(self):
        self.change_contract(roles=("research", "project-validation"))
        with self.assertRaises(AICompanyOSError):
            resume_run(
                self.store, self.run["id"], self.attestation(workflow_contract_migration_approval_id="captain-migration-1")
            )
        self.assertEqual(["research", "idea-validation"], self.store.load_run(self.run["id"])["roles"])

    def test_unknown_attestation_fields_are_still_refused(self):
        with self.assertRaises(ContractError):
            resume_run(self.store, self.run["id"], self.attestation(unexpected="value"))


if __name__ == "__main__":
    unittest.main()
