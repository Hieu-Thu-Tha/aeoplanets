#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_TAG="${1:-}"
: "${STAGING_HOST:?STAGING_HOST is required}"
: "${STAGING_WEBHOOK_TOKEN:?STAGING_WEBHOOK_TOKEN is required}"
: "${STAGING_REGISTRY_USER:?STAGING_REGISTRY_USER is required}"
: "${STAGING_REGISTRY_TOKEN:?STAGING_REGISTRY_TOKEN is required}"
: "${STAGING_IMAGE_DIGEST:?STAGING_IMAGE_DIGEST is required}"
: "${STAGING_DATABASE_URL_SHA256:?STAGING_DATABASE_URL_SHA256 is required}"

if [[ ! "$DEPLOY_TAG" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "Invalid deployment tag '$DEPLOY_TAG'; expected X.Y.Z" >&2
  exit 1
fi
if [[ ! "$STAGING_HOST" =~ ^[a-zA-Z0-9.-]+$ ]]; then
  echo "STAGING_HOST must be a hostname or IPv4 address" >&2
  exit 1
fi
if [[ ! "$STAGING_IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "STAGING_IMAGE_DIGEST must be a sha256 digest" >&2
  exit 1
fi
if [[ ! "$STAGING_DATABASE_URL_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "STAGING_DATABASE_URL_SHA256 must be a sha256 digest" >&2
  exit 1
fi

endpoint="https://${STAGING_HOST}/_deploy"
response="$(mktemp)"
payload="$(mktemp)"
trap 'rm -f "$response" "$payload"' EXIT

DEPLOY_TAG="$DEPLOY_TAG" \
STAGING_IMAGE_DIGEST="$STAGING_IMAGE_DIGEST" \
STAGING_DATABASE_URL_SHA256="$STAGING_DATABASE_URL_SHA256" \
STAGING_REGISTRY_USER="$STAGING_REGISTRY_USER" \
STAGING_REGISTRY_TOKEN="$STAGING_REGISTRY_TOKEN" \
python3 - "$payload" <<'PY'
import json
import os
import sys

with open(sys.argv[1], "w", encoding="utf-8") as output:
    json.dump(
        {
            "version": os.environ["DEPLOY_TAG"],
            "image_tag": f"v{os.environ['DEPLOY_TAG']}",
            "image_digest": os.environ["STAGING_IMAGE_DIGEST"],
            "database_url_sha256": os.environ["STAGING_DATABASE_URL_SHA256"],
            "registry_user": os.environ["STAGING_REGISTRY_USER"],
            "registry_token": os.environ["STAGING_REGISTRY_TOKEN"],
        },
        output,
        separators=(",", ":"),
    )
PY
chmod 600 "$payload"

status="$(curl --silent --show-error --output "$response" --write-out '%{http_code}' \
  --request POST "${endpoint}/webhook" \
  --header "Authorization: Bearer ${STAGING_WEBHOOK_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data-binary "@${payload}")"

if [[ "$status" != 200 && "$status" != 202 ]]; then
  echo "Staging receiver rejected the deployment with HTTP $status" >&2
  exit 1
fi

python3 - "$response" <<'PY'
import json
import sys

status = json.load(open(sys.argv[1], encoding="utf-8")).get("status")
if status not in {"accepted", "already_running"}:
    raise SystemExit(f"unexpected receiver status: {status!r}")
PY

for _ in $(seq 1 90); do
  curl --fail --silent --show-error --max-time 15 \
    "${endpoint}/status" \
    --header "Authorization: Bearer ${STAGING_WEBHOOK_TOKEN}" \
    --output "$response"
  result="$(DEPLOY_TAG="$DEPLOY_TAG" STAGING_IMAGE_DIGEST="$STAGING_IMAGE_DIGEST" \
    python3 - "$response" <<'PY'
import json
import os
import sys

payload = json.load(open(sys.argv[1], encoding="utf-8"))
if (
    payload.get("status") == "healthy"
    and payload.get("version") == os.environ["DEPLOY_TAG"]
    and payload.get("image_digest") == os.environ["STAGING_IMAGE_DIGEST"]
):
    print("healthy")
elif payload.get("status") == "failed":
    print(f"failed:{payload.get('error', 'deployment update failed')}")
else:
    print("pending")
PY
  )"
  if [[ "$result" == healthy ]]; then
    curl --fail --silent --show-error --max-time 15 \
      "https://${STAGING_HOST}/health" >/dev/null
    echo "Deployed tag $DEPLOY_TAG at image digest $STAGING_IMAGE_DIGEST"
    exit 0
  elif [[ "$result" == failed:* ]]; then
    echo "Staging deployment failed: ${result#failed:}" >&2
    exit 1
  fi
  sleep 5
done

echo "The exact staging image did not become healthy within 7.5 minutes" >&2
exit 1
