import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ai_company_os.errors import PrivacyError
from ai_company_os.paths import default_knowledge_root, public_repo_root
from ai_company_os.router import create_run
from ai_company_os.store import KnowledgeStore, PRIVATE_REPORT_MARKER

from helpers import assignment, decision_report


class PrivacyTests(unittest.TestCase):
    def test_configurable_root_is_lazy_and_private(self):
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent) / "not-created-yet"
            with patch.dict(os.environ, {"AI_COMPANY_OS_KNOWLEDGE_ROOT": str(root)}):
                store = KnowledgeStore()
                self.assertFalse(root.exists())
                store.initialize()
                self.assertTrue(root.is_dir())
                self.assertEqual(0o700, stat.S_IMODE(root.stat().st_mode))

                record = assignment({"type": "role", "name": "research"})
                path = store.save_assignment(record)
                self.assertEqual(0o600, stat.S_IMODE(path.stat().st_mode))

    def test_existing_broad_knowledge_root_is_rejected_not_silently_chmodded(self):
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent) / "broad"
            root.mkdir(mode=0o755)
            root.chmod(0o755)
            with self.assertRaises(PrivacyError):
                KnowledgeStore(root).initialize()
            self.assertEqual(0o755, stat.S_IMODE(root.stat().st_mode))

    def test_default_root_is_outside_public_repository(self):
        self.assertFalse(default_knowledge_root().expanduser().resolve().is_relative_to(public_repo_root()))

    def test_knowledge_root_inside_public_repository_is_rejected(self):
        inside = Path(tempfile.mkdtemp(prefix="private-root-", dir=public_repo_root()))
        try:
            with self.assertRaises(PrivacyError):
                KnowledgeStore(inside)
        finally:
            inside.rmdir()

    def test_report_source_inside_public_repository_is_rejected(self):
        with tempfile.TemporaryDirectory() as private:
            store = KnowledgeStore(private)
            record = assignment({"type": "role", "name": "research"})
            store.save_assignment(record)
            run = create_run(store, record["id"])
            metadata = decision_report(record["id"], run["id"])
            descriptor, name = tempfile.mkstemp(prefix="captain-report-", suffix=".tmpmd", dir=public_repo_root())
            os.close(descriptor)
            source = Path(name)
            source.write_text(f"{PRIVATE_REPORT_MARKER}\n# Report\n\n```mermaid\nflowchart LR\nA --> B\n```\n", encoding="utf-8")
            try:
                with self.assertRaises(PrivacyError):
                    store.store_artifact("decision-report", metadata, source)
            finally:
                source.unlink()

    def test_raw_secret_like_content_is_never_stored(self):
        with tempfile.TemporaryDirectory() as private, tempfile.TemporaryDirectory() as external:
            store = KnowledgeStore(private)
            record = assignment({"type": "role", "name": "research"})
            store.save_assignment(record)
            run = create_run(store, record["id"])
            metadata = decision_report(record["id"], run["id"])
            secret_line = "OPENAI_API_KEY" + "=" + "sk-" + ("x" * 20)
            report = Path(external) / "report.md"
            report.write_text(f"{PRIVATE_REPORT_MARKER}\n# Report\n\n{secret_line}\n\n```mermaid\nflowchart LR\nA --> B\n```\n", encoding="utf-8")
            with self.assertRaises(PrivacyError):
                store.store_artifact("decision-report", metadata, report)
            self.assertFalse((Path(private) / record["output_path"] / "decision-report" / metadata["id"] / "report.md").exists())

    def test_public_safety_check_passes_for_repository(self):
        result = subprocess.run(
            ["python3", "scripts/check-public-safety.py"],
            cwd=public_repo_root(),
            text=True,
            capture_output=True,
        )
        self.assertEqual(0, result.returncode, result.stderr)


if __name__ == "__main__":
    unittest.main()
