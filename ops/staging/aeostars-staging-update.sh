#!/usr/bin/env bash
set -Eeuo pipefail

VERSION="${1:?version required}"
IMAGE_DIGEST="${2:?image digest required}"
IMAGE_TAG_NAME="${3:?image tag required}"
EXPECTED_DATABASE_URL_SHA256="${4:?database hash required}"
IMAGE_NAME="ghcr.io/aeostars/aeostarsinsight"
IMAGE_REF="${IMAGE_NAME}@${IMAGE_DIGEST}"
COMPOSE_DIR="/srv/alpon/compose/aeostars-staging"
COMPOSE_ENV="${COMPOSE_DIR}/.env"
APP_ENV="/srv/alpon/secrets/aeostars-staging.env"
LOCK_FILE="/run/lock/aeostars-staging-update.lock"
COMPOSE=(docker compose -f "${COMPOSE_DIR}/compose.yaml" -f "${COMPOSE_DIR}/compose.cutover.yaml")

IFS= read -r REGISTRY_USER
IFS= read -r REGISTRY_TOKEN

[[ "$VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]
[[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]
[[ "$IMAGE_TAG_NAME" == "v${VERSION}" ]]
[[ "$EXPECTED_DATABASE_URL_SHA256" =~ ^[0-9a-f]{64}$ ]]
[[ "$REGISTRY_USER" =~ ^[A-Za-z0-9-]{1,39}$ ]]
[[ -n "$REGISTRY_TOKEN" ]]

DOCKER_CONFIG="$(mktemp -d)"
trap 'rm -rf "$DOCKER_CONFIG"' EXIT

exec 9>"$LOCK_FILE"
flock -x 9

actual_database_hash="$(python3 - "$APP_ENV" <<'PY'
import hashlib
import sys

value = ""
for raw in open(sys.argv[1], encoding="utf-8"):
    line = raw.strip()
    if line.startswith("DATABASE_URL="):
        value = line.split("=", 1)[1]
        break
print(hashlib.sha256(value.encode()).hexdigest())
PY
)"
[[ "$actual_database_hash" == "$EXPECTED_DATABASE_URL_SHA256" ]] || {
  echo "staging DATABASE_URL does not match the migrated database" >&2
  exit 1
}

printf '%s' "$REGISTRY_TOKEN" \
  | docker --config "$DOCKER_CONFIG" login ghcr.io --username "$REGISTRY_USER" --password-stdin >/dev/null
docker --config "$DOCKER_CONFIG" pull "$IMAGE_REF"
observed_version="$(docker image inspect "$IMAGE_REF" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
observed_digests="$(docker image inspect "$IMAGE_REF" --format '{{join .RepoDigests "\n"}}')"
[[ "$observed_version" == "$VERSION" ]] || { echo "image version label mismatch" >&2; exit 1; }
grep -Fxq "$IMAGE_REF" <<< "$observed_digests" || { echo "image digest mismatch" >&2; exit 1; }

previous_image="$(docker inspect aeostars-staging-app-1 --format '{{.Config.Image}}')"
rollback_required=true
rollback() {
  status=$?
  trap - ERR
  if [[ "$rollback_required" == true ]]; then
    printf 'AEOSTARS_IMAGE=%s\n' "$previous_image" > "${COMPOSE_ENV}.tmp"
    chmod 600 "${COMPOSE_ENV}.tmp"
    mv "${COMPOSE_ENV}.tmp" "$COMPOSE_ENV"
    "${COMPOSE[@]}" up -d --no-deps app || true
  fi
  exit "$status"
}
trap rollback ERR

printf 'AEOSTARS_IMAGE=%s\n' "$IMAGE_REF" > "${COMPOSE_ENV}.tmp"
chmod 600 "${COMPOSE_ENV}.tmp"
mv "${COMPOSE_ENV}.tmp" "$COMPOSE_ENV"
"${COMPOSE[@]}" up -d --no-deps app

for _ in $(seq 1 90); do
  status="$(docker inspect aeostars-staging-app-1 --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
  running_image="$(docker inspect aeostars-staging-app-1 --format '{{.Config.Image}}' 2>/dev/null || true)"
  if [[ "$status" == healthy && "$running_image" == "$IMAGE_REF" ]] \
    && curl --fail --silent --show-error --max-time 5 http://127.0.0.1:11007/health >/dev/null; then
    printf '%s\n' "$previous_image" > /srv/alpon/data/aeostars-staging-rollback-image
    chmod 600 /srv/alpon/data/aeostars-staging-rollback-image
    rollback_required=false
    trap - ERR
    exit 0
  fi
  sleep 2
done

echo "new Aeostars staging image did not become healthy" >&2
false
