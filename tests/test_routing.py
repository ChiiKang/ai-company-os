import tempfile
import unittest

from ai_company_os.definitions import ROLES
from ai_company_os.errors import PolicyError
from ai_company_os.router import add_loop_event, advance_handoff, create_run
from ai_company_os.store import KnowledgeStore

from helpers import assignment, handoff


class RoutingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.store = KnowledgeStore(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def test_each_role_routes_independently_without_prerequisites(self):
        for role in ROLES:
            kwargs = {"budget_minutes": 30, "approved_plan_id": "approved-plan-1"} if role == "builder" else {}
            record = assignment({"type": "role", "name": role}, **kwargs)
            self.store.save_assignment(record)
            run = create_run(self.store, record["id"])
            self.assertEqual([role], run["roles"])
            self.assertEqual(role, run["current_role"])

    def test_only_explicit_workflow_has_multiple_roles(self):
        record = assignment({"type": "workflow", "name": "research-to-idea-validation"})
        self.store.save_assignment(record)
        run = create_run(self.store, record["id"])
        self.assertEqual(["research", "idea-validation"], run["roles"])
        self.assertEqual("research", run["current_role"])
        self.assertEqual("awaiting-adapter", run["status"])

    def test_workflow_does_not_start_downstream_role_without_successful_handoff(self):
        record = assignment({"type": "workflow", "name": "research-to-idea-validation"})
        self.store.save_assignment(record)
        run = create_run(self.store, record["id"])
        with self.assertRaises(PolicyError):
            advance_handoff(self.store, run["id"], handoff(record["id"], run["id"]))
        unchanged = self.store.load_run(run["id"])
        self.assertEqual("research", unchanged["current_role"])

    def test_independent_completion_never_hands_off(self):
        record = assignment({"type": "role", "name": "research"})
        self.store.save_assignment(record)
        run = create_run(self.store, record["id"])
        zero_usage = {"model_tokens": 0, "monetary_cost_usd": 0, "tool_calls": 0, "download_bytes": 0}
        events = [
            {"phase": "plan", "duration_minutes": 1, "summary": "plan", "usage": zero_usage},
            {"phase": "act", "duration_minutes": 1, "summary": "act", "operation": "public-research", "usage": {**zero_usage, "tool_calls": 1}},
            {"phase": "observe", "duration_minutes": 1, "summary": "observe", "evidence_refs": ["ev_1"], "usage": zero_usage},
            {"phase": "evaluate", "duration_minutes": 1, "summary": "evaluate", "outcome": "success", "goal_met": True, "evidence_refs": ["ev_1"], "usage": zero_usage},
        ]
        for event in events:
            run = add_loop_event(self.store, run["id"], event)
        self.assertEqual("complete", run["status"])
        with self.assertRaises(PolicyError):
            advance_handoff(self.store, run["id"], handoff(record["id"], run["id"]))


if __name__ == "__main__":
    unittest.main()
