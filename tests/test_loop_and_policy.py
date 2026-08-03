import unittest

from ai_company_os.errors import ApprovalRequired, PolicyError
from ai_company_os.loop import new_loop, record_event
from ai_company_os.policy import assess_operation, build_composite_budget


class LoopTests(unittest.TestCase):
    def test_enforces_plan_act_observe_evaluate_order(self):
        state = new_loop(budget_minutes=10, max_iterations=2)
        with self.assertRaises(PolicyError):
            record_event(state, {"phase": "act", "duration_minutes": 1, "summary": "too soon", "operation": "simulation"})
        self.assertEqual("plan", state["phase"])

    def test_measurable_success_requires_evidence(self):
        state = new_loop(budget_minutes=10, max_iterations=2)
        state = record_event(state, {"phase": "plan", "duration_minutes": 1, "summary": "bounded plan"})
        state = record_event(state, {"phase": "act", "duration_minutes": 1, "summary": "safe act", "operation": "simulation"})
        state = record_event(state, {"phase": "observe", "duration_minutes": 1, "summary": "raw observation", "evidence_refs": []})
        with self.assertRaises(PolicyError):
            record_event(state, {"phase": "evaluate", "duration_minutes": 1, "summary": "unsupported claim", "outcome": "success", "goal_met": True})
        ended = record_event(state, {"phase": "evaluate", "duration_minutes": 1, "summary": "supported result", "outcome": "success", "goal_met": True, "evidence_refs": ["ev_1"]})
        self.assertEqual("success", ended["terminal_reason"])

    def test_budget_and_iteration_bound_the_loop(self):
        state = new_loop(budget_minutes=4, max_iterations=1)
        state = record_event(state, {"phase": "plan", "duration_minutes": 1, "summary": "plan"})
        state = record_event(state, {"phase": "act", "duration_minutes": 1, "summary": "act", "operation": "local-compute"})
        state = record_event(state, {"phase": "observe", "duration_minutes": 1, "summary": "observe"})
        state = record_event(state, {"phase": "evaluate", "duration_minutes": 1, "summary": "not done", "outcome": "continue", "goal_met": False})
        self.assertEqual("resource-boundary", state["terminal_reason"])
        with self.assertRaises(PolicyError):
            record_event(state, {"phase": "plan", "duration_minutes": 0, "summary": "extra"})

    def test_event_cannot_exceed_budget(self):
        state = new_loop(budget_minutes=2, max_iterations=2)
        with self.assertRaises(PolicyError):
            record_event(state, {"phase": "plan", "duration_minutes": 3, "summary": "too long"})


class CompositeBudgetPolicyTests(unittest.TestCase):
    def test_default_budgets(self):
        expected = {"research": 120, "project-validation": 240, "idea-validation": 120}
        for role, minutes in expected.items():
            policy = build_composite_budget({"type": "role", "name": role})
            self.assertEqual(minutes, policy["role_wall_clock_minutes"][role])

    def test_builder_budget_must_come_from_approved_plan(self):
        selection = {"type": "role", "name": "builder"}
        with self.assertRaises(PolicyError):
            build_composite_budget(selection)
        with self.assertRaises(PolicyError):
            build_composite_budget(selection, budget_minutes=60)
        policy = build_composite_budget(selection, budget_minutes=60, approved_plan_id="plan-approved")
        self.assertEqual(60, policy["role_wall_clock_minutes"]["builder"])

    def test_positive_spending_limit_needs_approval(self):
        selection = {"type": "role", "name": "research"}
        with self.assertRaises(PolicyError):
            build_composite_budget(selection, max_cost_usd=1)
        policy = build_composite_budget(selection, max_cost_usd=1, spending_approval_id="captain-approval")
        self.assertEqual(1, policy["monetary_cost_usd"])


class ApprovalBoundaryTests(unittest.TestCase):
    def test_required_approval_boundaries(self):
        for operation in ("paid-api", "cloud-resource", "protected-credential", "security-sensitive", "destructive", "production-deployment", "unrequested-product-construction", "experiment-network"):
            self.assertEqual("approval-required", assess_operation(operation).status)
        self.assertEqual("approval-required", assess_operation("download", download_gb=5.01).status)
        self.assertEqual("allowed", assess_operation("download", download_gb=5).status)

    def test_hazardous_and_physical_execution_is_never_autonomous(self):
        for operation in ("hazardous-physical", "wet-lab", "chemical-execution", "biological-execution", "manufacturing-equipment-control", "industrial-control"):
            self.assertEqual("prohibited", assess_operation(operation).status)

    def test_loop_stops_before_unapproved_boundary(self):
        state = new_loop(budget_minutes=10, max_iterations=1)
        state = record_event(state, {"phase": "plan", "duration_minutes": 1, "summary": "plan"})
        with self.assertRaises(ApprovalRequired):
            record_event(state, {"phase": "act", "duration_minutes": 1, "summary": "paid call", "operation": "paid-api"})
        approved = record_event(state, {"phase": "act", "duration_minutes": 1, "summary": "approved paid call", "operation": "paid-api", "approval_id": "captain-approved"})
        self.assertEqual("observe", approved["phase"])

    def test_approval_id_cannot_enable_prohibited_physical_work(self):
        state = new_loop(budget_minutes=10, max_iterations=1)
        state = record_event(state, {"phase": "plan", "duration_minutes": 1, "summary": "plan"})
        with self.assertRaises(PolicyError):
            record_event(state, {"phase": "act", "duration_minutes": 1, "summary": "unsafe", "operation": "wet-lab", "approval_id": "not-enough"})


if __name__ == "__main__":
    unittest.main()
