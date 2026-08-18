#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$ROOT_DIR/distribution-manifest.json"
COMPOSE_FILES=()
ENV_FILE="$ROOT_DIR/.env"
EXPECTED_VERSION=""
DOCKER_COMMAND="${BISIBILITY_DOCKER_COMMAND:-docker}"

usage() {
  echo "Usage: ./upgrade.sh --version vX.Y.Z [--manifest path] [--compose-file path]..."
  echo "Without --compose-file, uses compose.yaml next to this script."
  echo "Repeat --compose-file to layer overlays (compose.worker.yaml,"
  echo "compose.temporal.yaml) in order."
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --version)
      EXPECTED_VERSION="${2:-}"
      shift 2
      ;;
    --manifest)
      MANIFEST="${2:-}"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILES+=("${2:-}")
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$EXPECTED_VERSION" ]]; then
  echo "--version is required." >&2
  usage >&2
  exit 1
fi
if [[ "${#COMPOSE_FILES[@]}" -eq 0 ]]; then
  COMPOSE_FILES=("$ROOT_DIR/compose.yaml")
fi
[[ -r "$MANIFEST" ]] || { echo "Distribution manifest is not readable: $MANIFEST" >&2; exit 1; }
for compose_file in "${COMPOSE_FILES[@]}"; do
  [[ -r "$compose_file" ]] || { echo "Compose file is not readable: $compose_file" >&2; exit 1; }
done
command -v node >/dev/null || { echo "Node.js is required to verify the distribution." >&2; exit 1; }
command -v "$DOCKER_COMMAND" >/dev/null || { echo "Docker is required to perform the upgrade." >&2; exit 1; }

VERIFY_SCRIPT="$ROOT_DIR/scripts/distribution/verify.mjs"
MANIFEST_VERSION="$(node "$VERIFY_SCRIPT" --manifest "$MANIFEST" --get release)"
if [[ "$MANIFEST_VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "Upgrade refused: manifest release $MANIFEST_VERSION does not match requested $EXPECTED_VERSION." >&2
  exit 1
fi

if [[ "$MANIFEST_VERSION" == "v0.5.0" ]]; then
  echo "Upgrade refused: v0.5.0 resets the Prisma migration history and supports fresh installations only. Existing v0.4.1 and earlier databases must remain on their current release." >&2
  exit 1
fi

node "$VERIFY_SCRIPT" --manifest "$MANIFEST"
WEB_IMAGE="$(node "$VERIFY_SCRIPT" --manifest "$MANIFEST" --get web)"
WORKER_IMAGE="$(node "$VERIFY_SCRIPT" --manifest "$MANIFEST" --get worker)"

compose() {
  local compose_args=()
  for compose_file in "${COMPOSE_FILES[@]}"; do
    compose_args+=(-f "$compose_file")
  done
  if [[ -r "$ENV_FILE" ]]; then
    compose_args+=(--env-file "$ENV_FILE")
  fi
  BISIBILITY_IMAGE="$WEB_IMAGE" \
  BISIBILITY_WORKER_IMAGE="$WORKER_IMAGE" \
  BISIBILITY_PULL_POLICY=always \
    "$DOCKER_COMMAND" compose "${compose_args[@]}" "$@"
}

# Migrations are forward-only (prisma migrate deploy); bisibility does not
# perform automatic rollback. A tested backup of the application database,
# required application secrets, and, when applicable, Temporal persistence is
# the rollback mechanism. A failed migration must stop the upgrade before the
# new services start, so the migration container's exit code is propagated.

# Determine the selected service set from the rendered Compose configuration
# rather than assuming a worker service exists.
SELECTED_SERVICES_OUTPUT="$(compose config --services)"
SELECTED_SERVICES=()
while IFS= read -r line; do
  [[ -n "$line" ]] && SELECTED_SERVICES+=("$line")
done <<< "$SELECTED_SERVICES_OUTPUT"

has_service() {
  local needle="$1"
  local svc
  for svc in "${SELECTED_SERVICES[@]}"; do
    [[ "$svc" == "$needle" ]] && return 0
  done
  return 1
}

PULL_SERVICES=()
RESTART_SERVICES=()
for svc in db-migrations app worker; do
  if has_service "$svc"; then
    PULL_SERVICES+=("$svc")
    if [[ "$svc" == "app" || "$svc" == "worker" ]]; then
      RESTART_SERVICES+=("$svc")
    fi
  fi
done

compose pull "${PULL_SERVICES[@]}"
if [[ "${#RESTART_SERVICES[@]}" -gt 0 ]]; then
  compose stop "${RESTART_SERVICES[@]}"
fi

set +e
compose up --no-build --no-deps --abort-on-container-exit --exit-code-from db-migrations db-migrations
migration_status=$?
set -e
if [[ "$migration_status" -ne 0 ]]; then
  echo "Migration failed. bisibility does not perform automatic rollback." >&2
  echo "A tested backup of the application database, required application" >&2
  echo "secrets, and, when applicable, Temporal persistence is the rollback" >&2
  echo "mechanism. Restore the backup before restarting the previous release." >&2
  exit "$migration_status"
fi

if [[ "${#RESTART_SERVICES[@]}" -gt 0 ]]; then
  compose up -d --no-build "${RESTART_SERVICES[@]}"
fi

echo "Upgrade to $EXPECTED_VERSION completed with verified web and worker images."
echo "bisibility does not perform automatic rollback. A tested backup of the"
echo "application database, required application secrets, and, when applicable,"
echo "Temporal persistence is the rollback mechanism."
