import tempfile
import unittest

from ai_company_os.errors import PolicyError
from ai_company_os.loop import new_loop, record_event
from ai_company_os.router import add_loop_event, create_run, inspect_run, resume_run
from ai_company_os.store import KnowledgeStore

from helpers import assignment


BASE_BUDGET = {
    "wall_clock_minutes": 60,
    "model_tokens": 100,
    "monetary_cost_usd": 0,
    "tool_calls": 10,
    "download_bytes": 1000,
}
ZERO_USAGE = {"model_tokens": 0, "monetary_cost_usd": 0, "tool_calls": 0, "download_bytes": 0}


class CompositeBudgetTests(unittest.TestCase):
    def test_unknown_usage_is_recorded_as_unknown_and_stops(self):
        state = new_loop(budget_minutes=60, max_iterations=2, composite_budget=BASE_BUDGET)
        ended = record_event(state, {"phase": "plan", "duration_minutes": 1, "summary": "usage unavailable"})
        self.assertEqual("resource-boundary", ended["terminal_reason"])
        self.assertEqual(["download_bytes", "model_tokens", "monetary_cost_usd", "tool_calls"], ended["unknown_usage"])

    def test_first_composite_ceiling_stops_work(self):
        cases = {
            "model_tokens": 100,
            "monetary_cost_usd": 0.01,
            "tool_calls": 10,
            "download_bytes": 1000,
        }
        for key, value in cases.items():
            with self.subTest(key=key):
                state = new_loop(budget_minutes=60, max_iterations=2, composite_budget=BASE_BUDGET)
                usage = dict(ZERO_USAGE)
                usage[key] = value
                ended = record_event(state, {"phase": "plan", "duration_minutes": 1, "summary": "bounded usage", "usage": usage})
                self.assertEqual("resource-boundary", ended["terminal_reason"])

    def test_wall_clock_is_one_of_the_composite_ceilings(self):
        budget = {**BASE_BUDGET, "wall_clock_minutes": 2}
        state = new_loop(budget_minutes=10, max_iterations=2, composite_budget=budget)
        ended = record_event(state, {"phase": "plan", "duration_minutes": 2, "summary": "wall limit", "usage": ZERO_USAGE})
        self.assertEqual("resource-boundary", ended["terminal_reason"])


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.store = KnowledgeStore(self.temporary.name)
        self.assignment = assignment({"type": "role", "name": "research"})
        self.store.save_assignment(self.assignment)
        self.run = create_run(self.store, self.assignment["id"])

    def tearDown(self):
        self.temporary.cleanup()

    def attestation(self, run: dict) -> dict:
        identity = run["recovery_identity"]
        return {
            "run_id": run["id"],
            "checkpoint_sha256": run["checkpoint"]["state_sha256"],
            "source_identity": identity["source_identity"],
            "environment_identity": identity["environment_identity"],
            "approval_ids": identity["approval_ids"],
            "artifact_refs": identity["artifact_refs"],
        }

    def test_narrow_assignment_pregrant_is_applied_only_to_named_operation(self):
        pregranted = assignment(
            {"type": "role", "name": "research"},
            max_cost_usd=1,
            spending_approval_id="spending-ceiling-approved",
        )
        pregranted["approval_pregrants"] = [{
            "operation": "paid-api",
            "approval_id": "paid-api-approved",
            "scope": "only this assignment and the named operation",
        }]
        self.store.save_assignment(pregranted)
        run = create_run(self.store, pregranted["id"])
        run = add_loop_event(
            self.store,
            run["id"],
            {"phase": "plan", "duration_minutes": 1, "summary": "plan paid test", "usage": ZERO_USAGE},
        )
        run = add_loop_event(
            self.store,
            run["id"],
            {
                "phase": "act",
                "duration_minutes": 1,
                "summary": "bounded paid test",
                "operation": "paid-api",
                "usage": {**ZERO_USAGE, "monetary_cost_usd": 0.25, "tool_calls": 1},
            },
        )
        self.assertEqual("paid-api-approved", run["loop"]["events"][-1]["approval_id"])

    def test_each_phase_is_atomically_checkpointed_and_inspectable(self):
        before = self.run["checkpoint"]
        updated = add_loop_event(
            self.store,
            self.run["id"],
            {"phase": "plan", "duration_minutes": 1, "summary": "checkpoint plan", "usage": ZERO_USAGE},
        )
        inspected = inspect_run(self.store, self.run["id"])
        self.assertEqual(before["sequence"] + 1, updated["checkpoint"]["sequence"])
        self.assertEqual(updated["checkpoint"], inspected["checkpoint"])
        self.assertEqual("act", inspected["loop"]["phase"])

    def test_resume_revalidates_checkpoint_source_environment_approval_and_artifacts(self):
        attestation = self.attestation(self.run)
        bad = dict(attestation)
        bad["source_identity"] = "changed-source"
        with self.assertRaises(PolicyError):
            resume_run(self.store, self.run["id"], bad)
        resumed = resume_run(self.store, self.run["id"], attestation)
        self.assertEqual("awaiting-adapter", resumed["status"])
        self.assertGreater(resumed["checkpoint"]["sequence"], self.run["checkpoint"]["sequence"])
        with self.assertRaises(PolicyError):
            resume_run(self.store, self.run["id"], attestation)


if __name__ == "__main__":
    unittest.main()
