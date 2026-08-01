import tempfile
import unittest
from pathlib import Path

from ai_company_os.router import create_run
from ai_company_os.store import KnowledgeStore, PRIVATE_REPORT_MARKER

from helpers import assignment, decision_report, experiment


class KnowledgeRetrievalTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.external = tempfile.TemporaryDirectory()
        self.store = KnowledgeStore(self.temporary.name)

    def tearDown(self):
        self.external.cleanup()
        self.temporary.cleanup()

    def test_run_injects_bounded_lexical_prior_knowledge_and_adverse_warnings(self):
        technical = assignment({"type": "role", "name": "project-validation"})
        self.store.save_assignment(technical)
        technical_run = create_run(self.store, technical["id"])
        failed = experiment(technical["id"], technical_run["id"])
        failed["practical_assessment"]["usefulness"] = "Orbital cache benchmark for checkout latency"
        failed["verdict"] = "could not reproduce"
        self.store.store_artifact("experiment", failed)

        idea = assignment({"type": "role", "name": "idea-validation"})
        self.store.save_assignment(idea)
        idea_run = create_run(self.store, idea["id"])
        rejected = decision_report(idea["id"], idea_run["id"], role="idea-validation")
        rejected["title"] = "Orbital cache pricing decision"
        rejected["summary"] = "Checkout buyers rejected the proposed pricing"
        rejected["decision"] = "reject"
        rejected["demand_validation"] = "desk research only"
        report = Path(self.external.name) / "rejected.md"
        report.write_text(f"{PRIVATE_REPORT_MARKER}\n# Rejected decision\n\n```mermaid\nflowchart LR\nA --> B\n```\n", encoding="utf-8")
        self.store.store_artifact("decision-report", rejected, report)

        current = assignment({"type": "role", "name": "research"})
        current["prior_knowledge"]["query"] = "orbital cache checkout pricing"
        self.store.save_assignment(current)
        run = create_run(self.store, current["id"])

        block = run["what_we_already_know"]
        self.assertIn("## What we already know", block)
        self.assertIn("local://artifact/experiment/", block)
        self.assertIn("local://artifact/decision-report/", block)
        self.assertIn("failed reproduction", block)
        self.assertIn("decision was rejected", block)
        self.assertLessEqual(len(block), 4000)
        references = run["prior_knowledge_retrieval"]["references"]
        self.assertEqual(references, sorted(references, key=lambda item: (-item["score"], item["reference"])))

    def test_no_match_block_is_explicit_not_write_only(self):
        current = assignment({"type": "role", "name": "research"})
        current["prior_knowledge"]["query"] = "no-such-lexical-token"
        self.store.save_assignment(current)
        run = create_run(self.store, current["id"])
        self.assertIn("No related local metadata matched", run["what_we_already_know"])


if __name__ == "__main__":
    unittest.main()
