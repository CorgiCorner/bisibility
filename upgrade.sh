#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$ROOT_DIR/distribution-manifest.json"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
EXPECTED_VERSION=""
DOCKER_COMMAND="${BISIBILITY_DOCKER_COMMAND:-docker}"

usage() {
  echo "Usage: ./upgrade.sh --version vX.Y.Z [--manifest path] [--compose-file path]"
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
      COMPOSE_FILE="${2:-}"
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
[[ -r "$MANIFEST" ]] || { echo "Distribution manifest is not readable: $MANIFEST" >&2; exit 1; }
[[ -r "$COMPOSE_FILE" ]] || { echo "Compose file is not readable: $COMPOSE_FILE" >&2; exit 1; }
command -v node >/dev/null || { echo "Node.js is required to verify the distribution." >&2; exit 1; }
command -v "$DOCKER_COMMAND" >/dev/null || { echo "Docker is required to perform the upgrade." >&2; exit 1; }

VERIFY_SCRIPT="$ROOT_DIR/scripts/distribution/verify.mjs"
MANIFEST_VERSION="$(node "$VERIFY_SCRIPT" --manifest "$MANIFEST" --get release)"
if [[ "$MANIFEST_VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "Upgrade refused: manifest release $MANIFEST_VERSION does not match requested $EXPECTED_VERSION." >&2
  exit 1
fi

node "$VERIFY_SCRIPT" --manifest "$MANIFEST"
WEB_IMAGE="$(node "$VERIFY_SCRIPT" --manifest "$MANIFEST" --get web)"
WORKER_IMAGE="$(node "$VERIFY_SCRIPT" --manifest "$MANIFEST" --get worker)"

compose() {
  BISIBILITY_IMAGE="$WEB_IMAGE" \
  BISIBILITY_WORKER_IMAGE="$WORKER_IMAGE" \
  BISIBILITY_PULL_POLICY=always \
    "$DOCKER_COMMAND" compose -f "$COMPOSE_FILE" "$@"
}

compose pull db-migrations app worker
compose stop app worker
compose up --no-build --no-deps db-migrations
compose up -d --no-build app worker

echo "Upgrade to $EXPECTED_VERSION completed with verified web and worker images."
