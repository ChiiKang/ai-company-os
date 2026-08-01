import tempfile
import unittest

from ai_company_os.errors import PolicyError
from ai_company_os.router import add_loop_event, advance_handoff, create_run
from ai_company_os.store import KnowledgeStore

from helpers import assignment, handoff


def complete_current_role(store: KnowledgeStore, run: dict) -> dict:
    zero_usage = {"model_tokens": 0, "monetary_cost_usd": 0, "tool_calls": 0, "download_bytes": 0}
    for event in (
        {"phase": "plan", "duration_minutes": 1, "summary": "bounded plan", "usage": zero_usage},
        {"phase": "act", "duration_minutes": 1, "summary": "safe research", "operation": "public-research", "usage": {**zero_usage, "tool_calls": 1}},
        {"phase": "observe", "duration_minutes": 1, "summary": "captured evidence", "evidence_refs": ["ev_source"], "usage": zero_usage},
        {"phase": "evaluate", "duration_minutes": 1, "summary": "goal met", "outcome": "success", "goal_met": True, "evidence_refs": ["ev_source"], "usage": zero_usage},
    ):
        run = add_loop_event(store, run["id"], event)
    return run


class HandoffTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.store = KnowledgeStore(self.temporary.name)
        self.assignment = assignment({"type": "workflow", "name": "research-to-idea-validation"})
        self.store.save_assignment(self.assignment)
        self.run = complete_current_role(self.store, create_run(self.store, self.assignment["id"]))
        self.assertEqual("awaiting-handoff", self.run["status"])

    def tearDown(self):
        self.temporary.cleanup()

    def test_low_confidence_cannot_advance_automatically(self):
        document = handoff(self.assignment["id"], self.run["id"], level="low")
        with self.assertRaises(PolicyError):
            advance_handoff(self.store, self.run["id"], document)
        self.assertEqual("research", self.store.load_run(self.run["id"])["current_role"])

    def test_medium_confidence_advances_declared_route_and_preserves_artifact(self):
        document = handoff(self.assignment["id"], self.run["id"], level="medium")
        advanced = advance_handoff(self.store, self.run["id"], document)
        self.assertEqual("idea-validation", advanced["current_role"])
        self.assertEqual("awaiting-adapter", advanced["status"])
        self.assertEqual([document["id"]], advanced["handoff_ids"])
        stored = self.store.search(assignment_id=self.assignment["id"], kind="handoff")
        self.assertEqual(document["provenance"], stored[0]["provenance"])
        self.assertEqual(document["uncertainty"], stored[0]["uncertainty"])

    def test_load_bearing_claims_cannot_self_score_below_medium(self):
        document = handoff(self.assignment["id"], self.run["id"], level="medium")
        document["load_bearing_claims"][0]["confidence"] = "low"
        with self.assertRaises(PolicyError):
            advance_handoff(self.store, self.run["id"], document)

    def test_handoff_cannot_escape_original_assignment(self):
        document = handoff(self.assignment["id"], self.run["id"])
        document["workflow"] = "research-to-project-validation"
        document["target_role"] = "project-validation"
        with self.assertRaises(PolicyError):
            advance_handoff(self.store, self.run["id"], document)

    def test_handoff_cannot_authorize_approval_boundary(self):
        document = handoff(self.assignment["id"], self.run["id"])
        document["approval_boundaries_triggered"] = ["paid API"]
        with self.assertRaises(PolicyError):
            advance_handoff(self.store, self.run["id"], document)


if __name__ == "__main__":
    unittest.main()
