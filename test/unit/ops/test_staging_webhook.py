from __future__ import annotations

import importlib.util
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).parents[3] / "ops/staging/aeostars-staging-webhook.py"
SPEC = importlib.util.spec_from_file_location("aeostars_staging_webhook", MODULE_PATH)
assert SPEC and SPEC.loader
WEBHOOK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WEBHOOK)


class RunUpdateTests(unittest.TestCase):
    def setUp(self) -> None:
        WEBHOOK._set_deployment()

    def test_passes_registry_credentials_over_stdin(self) -> None:
        completed = subprocess.CompletedProcess([], 0, stdout="", stderr="")

        with patch.object(WEBHOOK.subprocess, "run", return_value=completed) as run:
            WEBHOOK._run_update(
                "1.2.3",
                "sha256:" + "a" * 64,
                "v1.2.3",
                "b" * 64,
                "deploy-user",
                "short-lived-token",
            )

        command = run.call_args.args[0]
        self.assertNotIn("deploy-user", command)
        self.assertNotIn("short-lived-token", command)
        self.assertEqual(run.call_args.kwargs["input"], "deploy-user\nshort-lived-token\n")
        self.assertEqual(WEBHOOK._deployment()["status"], "completed")

    def test_reports_sanitized_update_failure(self) -> None:
        completed = subprocess.CompletedProcess(
            [], 1, stdout="ignored", stderr="first line\npermission_denied: read_package\n"
        )

        with patch.object(WEBHOOK.subprocess, "run", return_value=completed):
            WEBHOOK._run_update(
                "1.2.3",
                "sha256:" + "a" * 64,
                "v1.2.3",
                "b" * 64,
                "deploy-user",
                "short-lived-token",
            )

        self.assertEqual(
            WEBHOOK._deployment(),
            {
                "status": "failed",
                "version": "1.2.3",
                "image_digest": "sha256:" + "a" * 64,
                "error": "permission_denied: read_package",
            },
        )


if __name__ == "__main__":
    unittest.main()
