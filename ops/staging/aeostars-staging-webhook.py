#!/usr/bin/env python3
"""Authenticated receiver for immutable Aeostars staging images."""

from __future__ import annotations

import hmac
import json
import os
import re
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


TOKEN = os.environ.get("AEOSTARS_STAGING_WEBHOOK_TOKEN", "")
VERSION = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$")
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
DATABASE_HASH = re.compile(r"^[0-9a-f]{64}$")
REGISTRY_USER = re.compile(r"^[A-Za-z0-9-]{1,39}$")
CONTAINER = "aeostars-staging-app-1"
IMAGE_NAME = "ghcr.io/aeostars/aeostarsinsight"
DEPLOYMENT_LOCK = threading.Lock()
DEPLOYMENT: dict[str, str] = {}


def _set_deployment(**values: str) -> None:
    with DEPLOYMENT_LOCK:
        DEPLOYMENT.clear()
        DEPLOYMENT.update(values)


def _deployment() -> dict[str, str]:
    with DEPLOYMENT_LOCK:
        return dict(DEPLOYMENT)


def _run_update(
    version: str,
    image_digest: str,
    image_tag: str,
    database_hash: str,
    registry_user: str,
    registry_token: str,
) -> None:
    try:
        completed = subprocess.run(
            [
                "sudo",
                "/usr/local/sbin/aeostars-staging-update",
                version,
                image_digest,
                image_tag,
                database_hash,
            ],
            input=f"{registry_user}\n{registry_token}\n",
            text=True,
            capture_output=True,
            timeout=600,
            check=False,
        )
    except subprocess.TimeoutExpired:
        _set_deployment(
            status="failed",
            version=version,
            image_digest=image_digest,
            error="deployment update timed out",
        )
        return
    except OSError:
        _set_deployment(
            status="failed",
            version=version,
            image_digest=image_digest,
            error="deployment update could not start",
        )
        return
    if completed.returncode == 0:
        _set_deployment(status="completed", version=version, image_digest=image_digest)
        return
    error = (completed.stderr.strip().splitlines() or ["deployment update failed"])[-1]
    _set_deployment(
        status="failed",
        version=version,
        image_digest=image_digest,
        error=error[:500],
    )


def _inspect() -> dict[str, str]:
    container = subprocess.run(
        [
            "sudo",
            "docker",
            "inspect",
            CONTAINER,
            "--format",
            "{{.Image}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}",
        ],
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )
    if container.returncode != 0:
        return {"status": "absent", "version": "", "image_digest": ""}
    image_id, state, health = (container.stdout.strip().split("|", 2) + ["", ""])[:3]
    image = subprocess.run(
        [
            "sudo",
            "docker",
            "image",
            "inspect",
            image_id,
            "--format",
            '{{index .Config.Labels "org.opencontainers.image.revision"}}|{{join .RepoDigests "\\n"}}',
        ],
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )
    if image.returncode != 0:
        return {"status": "unverifiable", "version": "", "image_digest": ""}
    version, repo_digests = (image.stdout.strip().split("|", 1) + [""])[:2]
    repo_digest = next(
        (value for value in repo_digests.splitlines() if value.startswith(f"{IMAGE_NAME}@sha256:")),
        "",
    )
    digest = repo_digest.rsplit("@", 1)[-1] if "@" in repo_digest else ""
    status = health or state
    return {"status": status, "version": version, "image_digest": digest}


class Handler(BaseHTTPRequestHandler):
    def _authorized(self) -> bool:
        auth = self.headers.get("Authorization", "")
        supplied = auth[7:] if auth.startswith("Bearer ") else ""
        return bool(TOKEN) and hmac.compare_digest(supplied, TOKEN)

    def _json(self, status: int, payload: dict[str, str]) -> None:
        body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/_deploy/status":
            self._json(404, {"error": "not_found"})
        elif not self._authorized():
            self._json(401, {"error": "unauthorized"})
        else:
            observed = _inspect()
            deployment = _deployment()
            if observed.get("status") == "healthy" and (
                not deployment
                or (
                    observed.get("version") == deployment.get("version")
                    and observed.get("image_digest") == deployment.get("image_digest")
                )
            ):
                self._json(200, observed)
            elif deployment:
                self._json(200, deployment)
            else:
                self._json(200, observed)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/_deploy/webhook":
            self._json(404, {"error": "not_found"})
            return
        if not self._authorized():
            self._json(401, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._json(400, {"error": "invalid_content_length"})
            return
        if length <= 0 or length > 4096:
            self._json(413, {"error": "invalid_body_size"})
            return
        try:
            payload = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json(400, {"error": "invalid_json"})
            return
        version = payload.get("version", "") if isinstance(payload, dict) else ""
        image_tag = payload.get("image_tag", "") if isinstance(payload, dict) else ""
        image_digest = payload.get("image_digest", "") if isinstance(payload, dict) else ""
        database_hash = payload.get("database_url_sha256", "") if isinstance(payload, dict) else ""
        registry_user = payload.get("registry_user", "") if isinstance(payload, dict) else ""
        registry_token = payload.get("registry_token", "") if isinstance(payload, dict) else ""
        if (
            not VERSION.fullmatch(version)
            or image_tag != f"v{version}"
            or not DIGEST.fullmatch(image_digest)
            or not DATABASE_HASH.fullmatch(database_hash)
            or not isinstance(registry_user, str)
            or not REGISTRY_USER.fullmatch(registry_user)
            or not isinstance(registry_token, str)
            or not registry_token
            or len(registry_token) > 1024
        ):
            self._json(400, {"error": "invalid_deployment_identity"})
            return
        observed = _inspect()
        if (
            observed.get("status") == "healthy"
            and observed.get("version") == version
            and observed.get("image_digest") == image_digest
        ):
            self._json(200, {"status": "already_running"})
            return
        deployment = _deployment()
        if (
            deployment.get("status") == "running"
            and deployment.get("version") == version
            and deployment.get("image_digest") == image_digest
        ):
            self._json(202, {"status": "accepted"})
            return
        _set_deployment(status="running", version=version, image_digest=image_digest)
        worker = threading.Thread(
            target=_run_update,
            args=(version, image_digest, image_tag, database_hash, registry_user, registry_token),
            daemon=True,
        )
        worker.start()
        self._json(202, {"status": "accepted"})

    def log_message(self, _format: str, *_args: object) -> None:
        return


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("AEOSTARS_STAGING_WEBHOOK_TOKEN is required")
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4126
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
