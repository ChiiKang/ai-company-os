import tempfile
import unittest
from pathlib import Path

from ai_company_os.errors import PolicyError
from ai_company_os.vault import discover_av, injection_command


class VaultBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.av = Path(self.temporary.name) / "Automic Vault.app" / "Contents" / "MacOS" / "av"
        self.av.parent.mkdir(parents=True)
        self.av.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        self.av.chmod(0o700)

    def tearDown(self):
        self.temporary.cleanup()

    def test_discovers_explicit_app_path_when_av_is_not_on_path(self):
        self.assertEqual(self.av.resolve(), discover_av(self.av))

    def test_boundary_accepts_only_named_keys_and_never_a_value(self):
        command = injection_command("OPENAI_API_KEY", ["adapter", "run"], av_path=self.av)
        self.assertEqual([str(self.av.resolve()), "inject", "OPENAI_API_KEY", "--", "adapter", "run"], command)
        with self.assertRaises(PolicyError):
            injection_command("RAW_VALUE", ["adapter"], av_path=self.av)


if __name__ == "__main__":
    unittest.main()
