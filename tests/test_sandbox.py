import copy
import tempfile
import unittest
from pathlib import Path

from ai_company_os.errors import PolicyError
from ai_company_os.sandbox import validate_untrusted_execution


class UntrustedExecutionPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.staging_root = Path(self.temporary.name) / "allowlisted-staging"
        self.staging_root.mkdir()
        self.policy = {
            "network": "none",
            "credentials": [],
            "privileged": False,
            "host_container_socket": False,
            "mounts": {"home": False, "knowledge": False, "scratch_output": "scratch-output"},
            "resources": {"cpus": 1, "memory_mb": 512, "pids": 64, "timeout_seconds": 300},
            "staging": {
                "separate_step": True,
                "credential_free": True,
                "destination": str(self.staging_root / "project-copy"),
            },
        }

    def tearDown(self):
        self.temporary.cleanup()

    def validate(self, policy: dict) -> dict:
        return validate_untrusted_execution(policy, allowed_staging_roots=[self.staging_root])

    def test_safe_envelope_is_offline_credentialless_unprivileged_and_bounded(self):
        self.assertIs(self.policy, self.validate(self.policy))

    def test_rejects_network_without_separate_measured_approval(self):
        policy = copy.deepcopy(self.policy)
        policy["network"] = "enabled"
        with self.assertRaises(PolicyError):
            self.validate(policy)

        policy["network"] = "approved-measured-only"
        policy["network_approval_id"] = "captain-network-approval"
        policy["measured_network_behavior"] = "one documented endpoint required by the claim"
        self.assertIs(policy, self.validate(policy))

    def test_rejects_credentials_home_knowledge_privilege_and_host_socket(self):
        mutations = [
            ("credentials", ["GITHUB_TOKEN"]),
            ("privileged", True),
            ("host_container_socket", True),
        ]
        for key, value in mutations:
            with self.subTest(key=key):
                policy = copy.deepcopy(self.policy)
                policy[key] = value
                with self.assertRaises(PolicyError):
                    self.validate(policy)
        for mount in ("home", "knowledge"):
            policy = copy.deepcopy(self.policy)
            policy["mounts"][mount] = True
            with self.assertRaises(PolicyError):
                self.validate(policy)

    def test_rejects_unbounded_resources_and_non_allowlisted_staging(self):
        policy = copy.deepcopy(self.policy)
        policy["resources"]["memory_mb"] = 0
        with self.assertRaises(PolicyError):
            self.validate(policy)
        policy = copy.deepcopy(self.policy)
        policy["staging"]["destination"] = str(Path(self.temporary.name) / "outside")
        with self.assertRaises(PolicyError):
            self.validate(policy)

    def test_staging_must_be_separate_and_credential_free(self):
        for key in ("separate_step", "credential_free"):
            policy = copy.deepcopy(self.policy)
            policy["staging"][key] = False
            with self.assertRaises(PolicyError):
                self.validate(policy)


if __name__ == "__main__":
    unittest.main()
