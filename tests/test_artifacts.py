import copy
import tempfile
import unittest

from ai_company_os.errors import ContractError
from ai_company_os.router import create_run
from ai_company_os.store import KnowledgeStore, PRIVATE_REPORT_MARKER
from ai_company_os.validator import validate_document

from helpers import assignment, claims_evidence, decision_report, experiment, handoff


class StructuredArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.store = KnowledgeStore(self.temporary.name)
        self.assignment = assignment({"type": "role", "name": "research"})
        self.store.save_assignment(self.assignment)
        self.run = create_run(self.store, self.assignment["id"])

    def tearDown(self):
        self.temporary.cleanup()

    def test_valid_contracts(self):
        documents = {
            "assignment": self.assignment,
            "claims-evidence": claims_evidence(self.assignment["id"], self.run["id"]),
            "experiment": experiment(self.assignment["id"], self.run["id"]),
            "handoff": handoff(self.assignment["id"], self.run["id"]),
            "decision-report": decision_report(self.assignment["id"], self.run["id"]),
        }
        for kind, document in documents.items():
            with self.subTest(kind=kind):
                self.assertIs(document, validate_document(kind, document))

    def test_assignment_uses_stable_v1_contract_and_safe_output_path(self):
        self.assertEqual("ai-company.assignment.v1", self.assignment["schema_version"])
        invalid = copy.deepcopy(self.assignment)
        invalid["output_path"] = "../public-report"
        with self.assertRaises(ContractError):
            validate_document("assignment", invalid)

    def test_contracts_reject_unknown_fields(self):
        document = claims_evidence(self.assignment["id"], self.run["id"])
        document["private_guess"] = "not in contract"
        with self.assertRaises(ContractError):
            validate_document("claims-evidence", document)

    def test_claim_contract_limits_one_to_five_and_unique_ranks(self):
        document = claims_evidence(self.assignment["id"], self.run["id"])
        base = document["claims"][0]
        document["claims"] = []
        for index in range(6):
            claim = copy.deepcopy(base)
            claim["id"] = f"claim_{index:04d}"
            claim["rank"] = min(index + 1, 5)
            document["claims"].append(claim)
        with self.assertRaises(ContractError):
            validate_document("claims-evidence", document)

        document = claims_evidence(self.assignment["id"], self.run["id"])
        second = copy.deepcopy(document["claims"][0])
        second["id"] = "claim_other"
        document["claims"].append(second)
        with self.assertRaises(ContractError):
            validate_document("claims-evidence", document)

    def test_experiment_requires_immutable_original_and_disconfirming_test(self):
        document = experiment(self.assignment["id"], self.run["id"])
        document["environment"]["original_source_unchanged"] = False
        with self.assertRaises(ContractError):
            validate_document("experiment", document)
        document = experiment(self.assignment["id"], self.run["id"])
        document["disconfirming_tests"] = []
        with self.assertRaises(ContractError):
            validate_document("experiment", document)

    def test_experiment_distinguishes_could_not_attempt_from_failed_reproduction(self):
        blocked = experiment(self.assignment["id"], self.run["id"])
        blocked["feasibility_precheck"] = {
            "status": "approval required",
            "rationale": "Network behavior needs captain approval",
            "blocking_evidence": ["policy boundary"],
        }
        blocked["attempted"] = False
        blocked["verdict"] = "could not attempt"
        validate_document("experiment", blocked)

        invalid = copy.deepcopy(blocked)
        invalid["verdict"] = "could not reproduce"
        with self.assertRaises(ContractError):
            validate_document("experiment", invalid)

    def test_confidence_rejects_unsupported_self_scoring(self):
        document = handoff(self.assignment["id"], self.run["id"], level="medium")
        document["confidence"]["evidence_basis"] = "indirect"
        with self.assertRaises(ContractError):
            validate_document("handoff", document)

    def test_builder_cannot_claim_success_with_unmet_criteria(self):
        document = decision_report(self.assignment["id"], self.run["id"], role="builder")
        document["decision"] = "acceptance met"
        document["criteria"][0]["status"] = "unmet"
        with self.assertRaises(ContractError):
            validate_document("decision-report", document)

    def test_artifact_storage_validates_and_is_searchable(self):
        document = claims_evidence(self.assignment["id"], self.run["id"])
        destination = self.store.store_artifact("claims-evidence", document)
        self.assertTrue((destination / "metadata.json").is_file())
        found = self.store.search(assignment_id=self.assignment["id"], kind="claims-evidence")
        self.assertEqual([document["id"]], [item["id"] for item in found])

    def test_decision_report_requires_markdown_and_mermaid(self):
        document = decision_report(self.assignment["id"], self.run["id"])
        with tempfile.TemporaryDirectory() as external:
            from pathlib import Path
            report = Path(external) / "report.md"
            report.write_text(f"{PRIVATE_REPORT_MARKER}\n# Decision\n\nNo diagram.\n", encoding="utf-8")
            with self.assertRaises(ContractError):
                self.store.store_artifact("decision-report", document, report)

            report.write_text(f"{PRIVATE_REPORT_MARKER}\n# Decision\n\n```mermaid\nflowchart LR\nA --> B\n```\n", encoding="utf-8")
            with self.assertRaises(ContractError):
                self.store.store_artifact("decision-report", document, report)

            report.write_text(
                f"{PRIVATE_REPORT_MARKER}\n# Decision\n\n## What I could not find\nNone in scope.\n\n"
                "## What would change this conclusion\nContradictory primary evidence.\n\n"
                "```mermaid\nflowchart LR\nA --> B\n```\n",
                encoding="utf-8",
            )
            destination = self.store.store_artifact("decision-report", document, report)
            self.assertTrue((destination / "report.md").is_file())
            self.assertNotIn("Decision\n", str(self.store.search(kind="decision-report")))


if __name__ == "__main__":
    unittest.main()
