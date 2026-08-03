import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from ai_company_os.paths import public_repo_root
from ai_company_os.store import KnowledgeStore, PRIVATE_REPORT_MARKER

from helpers import decision_report


class CLIIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.external = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / "knowledge"
        self.cli = public_repo_root() / "bin" / "ai-company-os"

    def tearDown(self):
        self.external.cleanup()
        self.temporary.cleanup()

    def call(self, *args: str, expected: int = 0) -> dict:
        result = subprocess.run(
            [str(self.cli), "--root", str(self.root), *args],
            cwd=public_repo_root(),
            text=True,
            capture_output=True,
        )
        self.assertEqual(expected, result.returncode, result.stderr)
        return json.loads(result.stdout)

    def create_research_assignment(self) -> str:
        result = self.call(
            "assignment", "create",
            "--role", "research",
            "--title", "Bounded request",
            "--outcome", "A cited teaching answer",
            "--goal", "Answer one bounded question",
            "--metric", "required sections",
            "--target", "all sections present",
            "--criterion", "dated primary citation",
            "--criterion", "Mermaid explanation",
        )
        return result["assignment_id"]

    def test_standalone_cli_initializes_creates_and_routes_one_role(self):
        initialized = self.call("init")
        self.assertEqual("initialized", initialized["status"])
        assignment_id = self.create_research_assignment()
        stored_assignment = KnowledgeStore(self.root).load_assignment(assignment_id)
        self.assertEqual("ai-company.assignment.v1", stored_assignment["schema_version"])
        self.assertEqual("research", stored_assignment["role"])
        self.assertNotIn("workflow", stored_assignment)
        self.assertEqual(0, stored_assignment["composite_budget"]["monetary_cost_usd"])
        self.assertEqual(f"outputs/{assignment_id}", stored_assignment["output_path"])
        started = self.call("run", "start", "--assignment", assignment_id)
        self.assertEqual("research", started["current_role"])
        self.assertEqual("roles/research.md", started["role_definition_path"])
        self.assertEqual("awaiting-adapter", started["status"])
        self.assertIn("## What we already know", started["what_we_already_know"])
        run = KnowledgeStore(self.root).load_run(started["run_id"])
        self.assertEqual(["research"], run["roles"])

    def test_explicit_composition_is_the_only_multi_role_route(self):
        created = self.call(
            "assignment", "create",
            "--workflow", "research-to-idea-validation",
            "--title", "Explicit combined request",
            "--outcome", "Teach the domain then critique the idea",
            "--goal", "Reach a cited decision",
            "--metric", "workflow criteria",
            "--target", "both role criteria met",
            "--criterion", "research evidence",
            "--criterion", "idea recommendation",
        )
        started = self.call("run", "start", "--assignment", created["assignment_id"])
        run = KnowledgeStore(self.root).load_run(started["run_id"])
        self.assertEqual(["research", "idea-validation"], run["roles"])
        self.assertEqual("research", run["current_role"])

    def test_report_storage_returns_private_local_report_path_without_body(self):
        assignment_id = self.create_research_assignment()
        started = self.call("run", "start", "--assignment", assignment_id)
        metadata = decision_report(assignment_id, started["run_id"])
        metadata_path = Path(self.external.name) / "metadata.json"
        metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
        report_body = (
            f"{PRIVATE_REPORT_MARKER}\n# Private result\n\nA concise answer.\n\n"
            "## What I could not find\nNo contradictory primary source.\n\n"
            "## What would change this conclusion\nA dated contradiction.\n\n"
            "```mermaid\nflowchart LR\nA --> B\n```\n"
        )
        report_path = Path(self.external.name) / "report.md"
        report_path.write_text(report_body, encoding="utf-8")

        stored = self.call(
            "artifact", "store",
            "--type", "decision-report",
            "--file", str(metadata_path),
            "--report", str(report_path),
        )
        local_report = Path(stored["local_report_path"])
        self.assertTrue(local_report.is_file())
        self.assertTrue(local_report.resolve().is_relative_to(self.root.resolve()))
        self.assertEqual(report_body, local_report.read_text(encoding="utf-8"))
        self.assertNotIn("Private result", json.dumps(stored))

    def test_policy_boundary_has_distinct_exit_code(self):
        result = self.call("policy", "check", "--operation", "paid-api", expected=3)
        self.assertEqual("approval-required", result["status"])


if __name__ == "__main__":
    unittest.main()
