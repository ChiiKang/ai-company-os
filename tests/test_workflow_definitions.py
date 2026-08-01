import json
import tempfile
import unittest
from copy import deepcopy
from dataclasses import replace
from pathlib import Path

from ai_company_os import definitions
from ai_company_os.definitions import ROLES, load_workflows, workflow, workflow_names, workflows_directory
from ai_company_os.errors import ContractError, PolicyError
from ai_company_os.router import advance_handoff, create_run
from ai_company_os.store import KnowledgeStore
from ai_company_os.validator import load_schema

from helpers import assignment, handoff
from test_handoffs import complete_current_role


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

    def test_artifact_schema_enumerations_track_the_registries(self):
        assignment_schema = load_schema("assignment")
        self.assertEqual(list(ROLES), assignment_schema["properties"]["role"]["enum"])
        self.assertEqual(list(workflow_names()), assignment_schema["properties"]["workflow"]["enum"])
        handoff_schema = load_schema("handoff")
        self.assertEqual(list(workflow_names()), handoff_schema["properties"]["workflow"]["enum"])
        self.assertEqual(list(ROLES), load_schema("workflow")["properties"]["roles"]["items"]["enum"])


class ContractDrivenHandoffTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.store = KnowledgeStore(self.temporary.name)
        self.assignment = assignment({"type": "workflow", "name": "research-to-idea-validation"})
        self.store.save_assignment(self.assignment)
        self.run = complete_current_role(self.store, create_run(self.store, self.assignment["id"]))
        self.original = definitions.workflows()
        definitions._WORKFLOWS = deepcopy(self.original)

    def tearDown(self):
        definitions._WORKFLOWS = self.original
        self.temporary.cleanup()

    def test_declared_minimum_confidence_gates_the_handoff(self):
        name = "research-to-idea-validation"
        definitions._WORKFLOWS[name] = replace(
            self.original[name], minimum_confidence="high", minimum_claim_confidence="high"
        )
        document = handoff(self.assignment["id"], self.run["id"], level="medium")
        with self.assertRaises(PolicyError):
            advance_handoff(self.store, self.run["id"], document)
        self.assertEqual("research", self.store.load_run(self.run["id"])["current_role"])


if __name__ == "__main__":
    unittest.main()
